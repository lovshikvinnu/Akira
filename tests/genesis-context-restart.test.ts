/**
 * The contact engine's state is a function of the chat log, not of when it
 * happened to be listening.
 *
 * `relationships/service.ts` derives contacts by scanning chat for @mentions
 * and deduplicating on message id. `initialize()` clears the derived output --
 * `relationships` and `evidenceLog` -- and subscribes to the workspace store.
 * Two things about that pairing are load-bearing and neither was pinned:
 *
 *   1. The chat log outlives the process; the contacts derived from it do not.
 *      A restart must therefore rebuild them by reading the log again, which
 *      only happens if something scans what is already in the store. Boot
 *      subscribes before the database answers, so hydration's emit does that
 *      scan -- but the engine must not depend on that ordering, because
 *      nothing in the engine enforces it.
 *
 *   2. `processedChatKeys` is the ledger that makes the scan idempotent, and
 *      it must be cleared whenever the output it guards is cleared. If
 *      `initialize()` empties the contacts but keeps the ledger, every message
 *      is already marked read, and the contacts never come back for the life
 *      of the process -- silently, because the engine looks initialized.
 *
 * The second is reachable in the shipped app: `__root.tsx` calls `initialize()`
 * in an effect and `shutdown()` in its cleanup, so any remount of the root --
 * React StrictMode's double-invoke in development among them -- runs the pair.
 *
 * Both tests below state the same property from two directions: after
 * `initialize()` returns, the contacts match the log.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import type { AkiraState, ChatMessage } from "../src/shared/types/store-types";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { relationshipService } = await import("../src/genesis/context/relationships/service");

/** A conversation naming two people on purpose, as the user would. */
function chatLog(): ChatMessage[] {
  const base = Date.now() - 60_000;
  return [
    {
      id: "c-1",
      role: "user",
      text: "paired with @Sarah on the importer",
      createdAt: new Date(base).toISOString(),
    },
    { id: "c-2", role: "akira", text: "noted", createdAt: new Date(base + 1_000).toISOString() },
    {
      id: "c-3",
      role: "user",
      text: "@Daniel is reviewing it, @Sarah is on the tests",
      createdAt: new Date(base + 2_000).toISOString(),
    },
  ];
}

/** Put a chat log in the store, as hydration from SQLite does at boot. */
function hydrateWith(chat: ChatMessage[]): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, chat });
}

/** Every contact the engine holds, not just the significant ones. */
function contacts() {
  return relationshipService.getContext()?.evidence.relationshipsSnapshot ?? [];
}

function contactNames(): string[] {
  return contacts()
    .map((r) => r.name)
    .sort();
}

beforeEach(() => {
  relationshipService.shutdown();
  hydrateWith([]);
});

describe("contacts survive a restart", () => {
  it("rebuilds contacts from a chat log that was already in the store", () => {
    // A restart: the database answers first, then the engine starts. Nothing
    // emits afterwards, so an engine that only ever reacts to changes sees a
    // conversation it never reads.
    hydrateWith(chatLog());
    relationshipService.initialize();

    expect(contactNames()).toEqual(["Daniel", "Sarah"]);
  });

  it("rebuilds contacts when the engine is restarted inside one process", () => {
    // The shipped remount path: initialize, observe, shutdown, initialize.
    relationshipService.initialize();
    hydrateWith(chatLog());
    expect(contactNames(), "the first session did not observe the mentions").toEqual([
      "Daniel",
      "Sarah",
    ]);

    relationshipService.shutdown();
    relationshipService.initialize();

    // `shutdown` emptied the contacts. If the read-ledger was not emptied with
    // them, every message is already marked seen and they never return.
    expect(contactNames()).toEqual(["Daniel", "Sarah"]);
  });

  it("does not double-count a mention it has already read", () => {
    hydrateWith(chatLog());
    relationshipService.initialize();
    // A store change that adds no chat must not re-observe anything.
    hydrateWith(chatLog());

    const sarah = contacts().find((r) => r.name === "Sarah");
    expect(sarah, "Sarah was not observed").toBeDefined();
    // Two mentions in the log, so two interactions -- not four.
    expect(sarah!.interactionFrequency).toBe(2);
  });
});
