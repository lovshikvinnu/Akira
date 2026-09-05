/**
 * When a piece of identity evidence happened, across reloads.
 *
 * THE ARCHITECTURE THAT MAKES THIS A BUG AT ALL
 * ---------------------------------------------
 * Identity is never persisted. `InMemoryIdentityRepository` is the only
 * implementation of `IdentityRepository`; nothing in `store-init` or the
 * settings service touches identity. So a reload does not *restore* the graph,
 * it *re-derives* it: `reconstructRuntimeMemory` replays the durable memory
 * stream, `PersonalDeclarationRule` sees the declarations again, and every
 * aspect and evidence record is created fresh.
 *
 * That is why a wall-clock stamp inside `addEvidence` was wrong rather than
 * merely imprecise. Each re-derivation became the evidence's birthday. Measured
 * before the fix, on a declaration the user made ninety days ago:
 *
 *     memory.timestamp     2026-06-07
 *     evidence.createdAt   2026-09-05      apparent age 0 days
 *     second reconstruct   2026-09-05      restamped again
 *
 * `addEvidence` now reads `createdAt` off `metadata`, exactly as it already
 * reads `weight`, `status` and `originEngine`, and the declaration rule passes
 * `memory.timestamp`.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a decay policy and not a change to the confidence formula. Confidence
 * already has a recency factor; these tests assert only that the age it reads
 * is the real one. Whether an old aspect *should* score lower is a separate
 * product question and nothing here answers it.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import type { AkiraState } from "../src/shared/types/store-types";
import type { MemoryEvent } from "../src/shared/types/event-types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { identityService, InMemoryIdentityRepository } = await import("../src/genesis/identity");
const { candidateService } = genesis;

const DAY = 86400000;
const ninetyDaysAgo = new Date(Date.now() - 90 * DAY).toISOString();
const yearAgo = new Date(Date.now() - 365 * DAY).toISOString();

/** One declaration per category the parser recognises. */
const DECLARATIONS = [
  { category: "Goal", text: "I want to become a pilot", value: "become a pilot" },
  { category: "Interest", text: "I love long flights at night", value: "long flights at night" },
  { category: "Preference", text: "I prefer dark roast", value: "dark roast" },
  { category: "Value", text: "I care deeply about privacy", value: "privacy" },
  { category: "Habit", text: "I run every morning", value: "run" },
] as const;

function noteEvent(id: string, description: string, timestamp: string): MemoryEvent {
  return {
    id,
    timestamp,
    eventType: "note_created",
    title: "Note Created",
    description,
    relatedProjectId: null,
    relatedNoteId: `note-${id}`,
    metadata: {},
  };
}

/**
 * Seeds the durable stream and re-derives everything from it.
 *
 * A fresh `InMemoryIdentityRepository` is what makes this a real reload rather
 * than a no-op. The identity graph is a module singleton, so without it the
 * rule's `exists` guard holds, no aspect is recreated, and nothing under test
 * runs -- the test would pass against any implementation.
 */
function reloadFrom(stream: MemoryEvent[]): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({
    ...s,
    memories: stream,
    tasks: [],
    notes: [],
    projects: [],
    chat: [],
  });
  identityService.setRepository(new InMemoryIdentityRepository());
  memoryService.reconstructRuntimeMemory();
}

function allEvidence() {
  return identityService
    .getIdentityNodes()
    .flatMap((node) => identityService.getEvidenceByNode(node.id));
}

const nodeFor = (value: string) =>
  identityService
    .getIdentityNodes()
    .find((n) => (n.value ?? "").toLowerCase() === value.toLowerCase());

beforeEach(() => {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  identityService.setRepository(new InMemoryIdentityRepository());
});

describe("evidence keeps the instant it came from", () => {
  it("a ninety-day-old declaration is ninety days old after a reload", () => {
    reloadFrom([noteEvent("d1", "I want to become a pilot", ninetyDaysAgo)]);

    const memory = memoryService.getMemories()[0];
    expect(memory.timestamp).toBe(ninetyDaysAgo);

    const evidence = allEvidence();
    expect(evidence.length, "the declaration produced no evidence").toBeGreaterThan(0);
    for (const e of evidence) {
      expect(e.createdAt, "evidence was restamped with the clock").toBe(ninetyDaysAgo);
    }
  });

  it("preserves it for every category, not just Goal", () => {
    reloadFrom(DECLARATIONS.map((d, i) => noteEvent(`c${i}`, d.text, ninetyDaysAgo)));

    for (const decl of DECLARATIONS) {
      const node = nodeFor(decl.value);
      expect(node, `${decl.category} did not survive the reload`).toBeDefined();
      const evidence = identityService.getEvidenceByNode(node!.id);
      expect(evidence.length, `${decl.category} came back with no evidence`).toBeGreaterThan(0);
      for (const e of evidence) {
        expect(e.createdAt, `${decl.category} evidence was restamped`).toBe(ninetyDaysAgo);
      }
    }
  });

  it("keeps each declaration's own instant when they differ", () => {
    // A single shared timestamp would pass even if the code used the newest or
    // the oldest event rather than each memory's own.
    reloadFrom([
      noteEvent("old", "I want to become a pilot", yearAgo),
      noteEvent("newer", "I prefer dark roast", ninetyDaysAgo),
    ]);

    expect(identityService.getEvidenceByNode(nodeFor("become a pilot")!.id)[0].createdAt).toBe(
      yearAgo,
    );
    expect(identityService.getEvidenceByNode(nodeFor("dark roast")!.id)[0].createdAt).toBe(
      ninetyDaysAgo,
    );
  });

  it("does not rejuvenate across repeated reloads", () => {
    const stream = [noteEvent("d1", "I want to become a pilot", ninetyDaysAgo)];

    reloadFrom(stream);
    const first = allEvidence().map((e) => e.createdAt);
    expect(first.length).toBeGreaterThan(0);

    reloadFrom(stream);
    const second = allEvidence().map((e) => e.createdAt);
    reloadFrom(stream);
    const third = allEvidence().map((e) => e.createdAt);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
    for (const t of third) expect(t).toBe(ninetyDaysAgo);
  });

  it("reports the real age to the confidence recency factor", () => {
    // The consequence, stated without asserting what the score should be.
    // Confidence already has a recency factor; this only pins that the age it
    // reads is the true one rather than zero.
    reloadFrom([noteEvent("d1", "I want to become a pilot", yearAgo)]);
    const evidence = allEvidence()[0];
    const ageDays = Math.round((Date.now() - new Date(evidence.createdAt).getTime()) / DAY);
    expect(ageDays).toBeGreaterThanOrEqual(364);
  });
});

describe("nothing about live evidence changed", () => {
  it("a caller that supplies no instant still gets now", () => {
    // The compatibility case. `createdAt` is an optional metadata field, so
    // every existing caller behaves exactly as before.
    const node = identityService.addIdentityNode("Goal", "manual aspiration", {});
    const before = Date.now();
    const evidence = identityService.addEvidence(node.id, "UserDirect", "manual-source");
    const stamped = new Date(evidence.createdAt).getTime();

    expect(stamped).toBeGreaterThanOrEqual(before - 1000);
    expect(stamped).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("updateEvidence still cannot overwrite the instant", () => {
    // Asserted because the brief suspected this contract of *destroying*
    // provenance. It does the opposite: `createdAt` is excluded from the patch
    // type, so `{...evidence, ...patch}` keeps the original. That exclusion is
    // the one part of this lifecycle that was already correct, and it is pinned
    // here so a later widening of the patch type is noticed.
    const node = identityService.addIdentityNode("Goal", "patch target", {});
    const evidence = identityService.addEvidence(node.id, "Memory", "src-1", "ref", {
      createdAt: ninetyDaysAgo,
    });
    expect(evidence.createdAt).toBe(ninetyDaysAgo);

    const updated = identityService.updateEvidence(evidence.id, { weight: 0.5, status: "Stale" });
    expect(updated, "the update did not apply").toBeDefined();
    expect(updated!.weight).toBe(0.5);
    expect(updated!.status).toBe("Stale");
    expect(updated!.createdAt, "an update moved the evidence's instant").toBe(ninetyDaysAgo);
  });

  it("still records a real declaration made now as now", () => {
    // The live path, through the store rather than a seeded stream. A fix that
    // preserved history by freezing new evidence would pass everything above.
    const before = Date.now();
    akira.addNote({ content: "I want to become a marathon runner" });

    const node = nodeFor("become a marathon runner");
    expect(node, "a live declaration produced no aspect").toBeDefined();
    const evidence = identityService.getEvidenceByNode(node!.id);
    expect(evidence.length).toBeGreaterThan(0);

    const stamped = new Date(evidence[0].createdAt).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before - 5000);
    expect(stamped).toBeLessThanOrEqual(Date.now() + 5000);
  });
});

describe("the invariant, stated without naming a producer", () => {
  /**
   * The residual risk in this fix is that `createdAt` defaults to the clock, so
   * a future producer that calls `addEvidence` without supplying the origin
   * instant reintroduces the bug silently. The cases above would not catch it:
   * they seed declarations, so they only exercise the one producer that exists
   * today.
   *
   * This asserts the property rather than the call site. After a replay -- with
   * no live activity to legitimately stamp anything "now" -- every piece of
   * Memory-sourced evidence must carry exactly its source memory's instant,
   * whoever created it and whatever event type it came from.
   *
   * Exact equality rather than a tolerance, which is what makes it usable: a
   * replay creates nothing concurrently, so there is no drift to allow for, and
   * a producer stamping the clock fails by ninety days rather than by
   * milliseconds.
   */
  it("no Memory-sourced evidence is newer than the memory it points at", () => {
    reloadFrom([
      noteEvent("inv1", "I want to become a pilot", yearAgo),
      noteEvent("inv2", "I prefer dark roast", ninetyDaysAgo),
      noteEvent("inv3", "I run every morning", ninetyDaysAgo),
    ]);

    const memoryById = new Map(memoryService.getMemories().map((m) => [m.id, m]));
    const memoryEvidence = allEvidence().filter((e) => e.sourceType === "Memory");
    expect(memoryEvidence.length, "no Memory-sourced evidence to check").toBeGreaterThan(0);

    for (const e of memoryEvidence) {
      const source = memoryById.get(e.sourceId);
      expect(source, `evidence ${e.id} points at a memory that does not exist`).toBeDefined();
      expect(
        e.createdAt,
        `evidence for "${source!.description}" was stamped ${e.createdAt} ` +
          `but its memory happened at ${source!.timestamp}`,
      ).toBe(source!.timestamp);
    }
  });

  it("survives the fallback one layer below this fix", () => {
    // `memory-service.ts:65` rebuilds a memory as
    // `candidate.timestamp || new Date().toISOString()`. If that fallback fired
    // on the reconstruction path it would restamp the memories themselves and
    // this whole fix would be resting on nothing -- the evidence would faithfully
    // copy an instant that had already been rewritten. It does not fire:
    // `candidate.timestamp` survives replay.
    reloadFrom([noteEvent("fb1", "I want to become a pilot", yearAgo)]);
    expect(memoryService.getMemories()[0].timestamp).toBe(yearAgo);
    reloadFrom([noteEvent("fb1", "I want to become a pilot", yearAgo)]);
    expect(memoryService.getMemories()[0].timestamp).toBe(yearAgo);
  });
});
