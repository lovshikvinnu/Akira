/**
 * The batch primitive in isolation.
 *
 * Deliberately a separate file from `genesis-batching.test.ts`, and deliberately
 * importing nothing from `@/genesis`. These tests install their own flushers to
 * observe ordering and coalescing, and a flusher registration is a single slot
 * per phase -- registering here inside a process where GENESIS had composed
 * would overwrite the real consumers' registrations and silently disable them
 * for every later test in the file. That is not hypothetical: it is what the
 * first draft of these tests did, and the equivalence assertions downstream went
 * green against a pipeline that was no longer flushing anything.
 *
 * Importing only `batch.ts` keeps the registry empty and the tests honest.
 */
import { describe, it, expect, beforeEach } from "vitest";

import * as batch from "../src/genesis/batch";

describe("batch primitive", () => {
  beforeEach(() => {
    expect(batch.hasPendingWork()).toBe(false);
  });

  it("runs fn synchronously and returns its value", () => {
    let ran = false;
    const out = batch.runBatched(() => {
      ran = true;
      return 42;
    });
    expect(ran).toBe(true);
    expect(out).toBe(42);
  });

  it("flushes only at the outermost batch", () => {
    let flushes = 0;
    batch.registerFlusher("context", () => flushes++);

    batch.runBatched(() => {
      batch.runBatched(() => {
        batch.runBatched(() => {
          batch.markDirty("context");
        });
        // Inner batches have closed; nothing may have settled yet.
        expect(flushes).toBe(0);
      });
      expect(flushes).toBe(0);
    });

    expect(flushes).toBe(1);
    batch.unregisterFlusher("context");
  });

  it("coalesces repeated dirty signals into one flush", () => {
    let flushes = 0;
    batch.registerFlusher("recall", () => flushes++);

    batch.runBatched(() => {
      for (let i = 0; i < 500; i++) batch.markDirty("recall");
    });

    expect(flushes).toBe(1);
    batch.unregisterFlusher("recall");
  });

  it("leaves no pending work after the outermost batch returns", () => {
    batch.registerFlusher("context", () => {});
    batch.runBatched(() => {
      batch.markDirty("context");
      expect(batch.hasPendingWork()).toBe(true);
    });
    expect(batch.hasPendingWork()).toBe(false);
    batch.unregisterFlusher("context");
  });

  it("flushes phases in dependency order", () => {
    const phases = [
      "stories",
      "importance",
      "understanding",
      "identity",
      "recall",
      "context",
    ] as const;
    const order: string[] = [];
    for (const p of phases) batch.registerFlusher(p, () => order.push(p));

    batch.runBatched(() => {
      // Marked in deliberately reversed order; the flush must not honour it.
      for (const p of [...phases].reverse()) batch.markDirty(p);
    });

    // stories first because it is the only phase that mutates a store the
    // others read; context last because it reads recall, stories and identity.
    expect(order).toEqual([
      "stories",
      "importance",
      "understanding",
      "identity",
      "recall",
      "context",
    ]);
    for (const p of phases) batch.unregisterFlusher(p);
  });

  it("settles a story-driven chain in one pass", () => {
    // The real shape: the stories phase emits the coalesced event, which marks
    // every downstream phase dirty from inside the flush. All of them must run
    // in the same pass, in order, without a second sweep.
    const order: string[] = [];
    batch.registerFlusher("stories", () => {
      order.push("stories");
      batch.markDirty("importance");
      batch.markDirty("identity");
      batch.markDirty("context");
    });
    batch.registerFlusher("importance", () => {
      order.push("importance");
      batch.markDirty("recall");
    });
    batch.registerFlusher("identity", () => order.push("identity"));
    batch.registerFlusher("recall", () => order.push("recall"));
    batch.registerFlusher("context", () => order.push("context"));

    batch.runBatched(() => batch.markDirty("stories"));

    expect(order).toEqual(["stories", "importance", "identity", "recall", "context"]);
    expect(batch.hasPendingWork()).toBe(false);
    for (const p of ["stories", "importance", "identity", "recall", "context"] as const) {
      batch.unregisterFlusher(p);
    }
  });

  it("lets an earlier phase dirty a later one within the same flush", () => {
    const order: string[] = [];
    batch.registerFlusher("importance", () => {
      order.push("importance");
      batch.markDirty("recall");
    });
    batch.registerFlusher("recall", () => order.push("recall"));

    batch.runBatched(() => batch.markDirty("importance"));

    expect(order).toEqual(["importance", "recall"]);
    expect(batch.hasPendingWork()).toBe(false);
    batch.unregisterFlusher("importance");
    batch.unregisterFlusher("recall");
  });

  it("converges when a later phase dirties an earlier one", () => {
    let importanceRuns = 0;
    let contextRuns = 0;
    batch.registerFlusher("importance", () => importanceRuns++);
    batch.registerFlusher("context", () => {
      contextRuns++;
      if (contextRuns === 1) batch.markDirty("importance");
    });

    batch.runBatched(() => batch.markDirty("context"));

    // Second pass picks the earlier phase back up rather than dropping it.
    expect(importanceRuns).toBe(1);
    expect(contextRuns).toBe(1);
    expect(batch.hasPendingWork()).toBe(false);
    batch.unregisterFlusher("importance");
    batch.unregisterFlusher("context");
  });

  it("contains a throwing flusher and still settles the rest", () => {
    const ran: string[] = [];
    batch.registerFlusher("importance", () => {
      throw new Error("importance exploded");
    });
    batch.registerFlusher("context", () => ran.push("context"));

    expect(() =>
      batch.runBatched(() => {
        batch.markDirty("importance");
        batch.markDirty("context");
      }),
    ).not.toThrow();

    expect(ran).toEqual(["context"]);
    expect(batch.hasPendingWork()).toBe(false);
    batch.unregisterFlusher("importance");
    batch.unregisterFlusher("context");
  });

  it("still settles derived work when the transaction body throws", () => {
    let flushes = 0;
    batch.registerFlusher("context", () => flushes++);

    expect(() =>
      batch.runBatched(() => {
        batch.markDirty("context");
        throw new Error("mutation failed");
      }),
    ).toThrow("mutation failed");

    expect(flushes).toBe(1);
    expect(batch.hasPendingWork()).toBe(false);
    batch.unregisterFlusher("context");
  });

  it("is inert outside a transaction, so direct calls still run immediately", () => {
    let flushes = 0;
    batch.registerFlusher("context", () => flushes++);
    batch.markDirty("context");
    expect(batch.hasPendingWork()).toBe(false);
    expect(flushes).toBe(0);
    batch.unregisterFlusher("context");
  });
});
