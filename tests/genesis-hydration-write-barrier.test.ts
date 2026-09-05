/**
 * A durable write must not happen before the database has answered.
 *
 * `settings.updateMemories` replaces the whole blob, so what it writes is
 * whatever `s.memories` holds at the time. On a cold start that array is empty
 * until hydration resolves, and `__root.tsx` records an event before it does:
 * effect 1 awaits `getInitialState()`, effect 2 calls
 * `companionStateService.bootstrap()` synchronously, and bootstrap records a
 * `note_created`. The write then puts `[bootstrapEvent]` over the user's
 * history.
 *
 * Reproduced against the real repository before the fix: seven events seeded on
 * disk, hydration withheld, one bootstrap event recorded, disk 7 -> 1 holding
 * only "Companion State Bootstrapped".
 *
 * It does not self-heal. A later write rewrites the blob from the store, which
 * by then holds the damaged stream -- measured 1 -> 2 with none of the seven
 * recovered. The loss is permanent from the instant the bad write lands.
 *
 * WHY THIS FILE'S ORDER MATTERS
 *
 * `initializeState` is the only way to set the store's contents and it is also
 * the call that sets `hydrated = true`. Emptying the store with it therefore
 * models a store hydrated with nothing, not an unhydrated one -- and a bad
 * fixture here reproduces the overwrite for the wrong reason and keeps
 * reproducing it after the fix. Production reaches the dangerous state by never
 * having called it, so the first case does the same and asserts the flag rather
 * than assuming it. Everything that hydrates runs after.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

import type { AkiraState } from "../src/shared/types/store-types";
import type { MemoryEvent } from "../src/shared/types/event-types";

await import("../src/genesis/index");
const { akira, settlePendingPersistence } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { eventService } = await import("../src/genesis/events/event-service");
const { settingsRepository } = await import("../src/persistence/repositories");

/** The durable record, read back from SQLite rather than from the store. */
function disk(): MemoryEvent[] {
  const raw = settingsRepository.get("genesis_memories");
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as MemoryEvent[]) : [];
}

/** A prior history, written the way production writes it. */
function seedDisk(n: number): MemoryEvent[] {
  const events: MemoryEvent[] = Array.from({ length: n }, (_, i) => ({
    id: `seed-${i}`,
    timestamp: new Date(Date.now() - (n - i) * 86400000).toISOString(),
    eventType: "note_created",
    title: "Note Created",
    description: `A reflection the user wrote, number ${i}.`,
    relatedProjectId: null,
    relatedNoteId: `note-${i}`,
    metadata: {},
  }));
  settingsRepository.set("genesis_memories", JSON.stringify(events));
  return events;
}

/** Exactly what `context/state/service.ts` records during bootstrap. */
function recordBootstrapEvent(): void {
  eventService.record(
    "note_created",
    "Companion State Bootstrapped",
    "Handoff complete. Sole ownership transitioned to Companion State. Intent: none",
    null,
    null,
    { state: {} },
  );
}

describe("the window before hydration", () => {
  it("does not let a bootstrap event overwrite the persisted stream", async () => {
    const seeded = seedDisk(7);
    await settlePendingPersistence();
    expect(disk().length).toBe(seeded.length);

    // The state production is in when effect 2 runs: `initializeState` has
    // never been called. Asserted, because the whole case depends on it and a
    // fixture that hydrates first would pass against the broken build.
    expect(akira.isHydrated()).toBe(false);
    expect(akira.getState().memories.length).toBe(0);

    recordBootstrapEvent();
    await settlePendingPersistence();

    // Before the barrier this was 1, holding only the bootstrap event.
    expect(disk().length).toBe(seeded.length);
    expect(disk().filter((e) => e.relatedNoteId?.startsWith("note-")).length).toBe(7);
  });

  it("leaves the history intact for the next cold start", async () => {
    // The dangerous case: nothing else happens before the process ends, so
    // there is no later write to rewrite the blob from.
    expect(akira.isHydrated()).toBe(false);

    recordBootstrapEvent();
    await settlePendingPersistence();

    const survived = disk();
    expect(survived.length).toBe(7);
    expect(survived.every((e) => e.title === "Note Created")).toBe(true);
  });
});

describe("once hydration has resolved", () => {
  it("writes normally, and bootstrap is no longer destructive", async () => {
    const seeded = seedDisk(7);
    await settlePendingPersistence();

    const s = akira.getState() as AkiraState;
    akira.initializeState({ ...s, memories: seeded, tasks: [], notes: [], projects: [], chat: [] });
    memoryService.clearHistory();
    expect(akira.isHydrated()).toBe(true);

    recordBootstrapEvent();
    await settlePendingPersistence();

    // The barrier must not suppress writes generally -- only before hydration.
    expect(disk().length).toBe(seeded.length + 1);
  });

  it("keeps persisting subsequent memory events", async () => {
    const before = disk().length;

    eventService.record("note_created", "Note Created", "A later note.", null, "n-later");
    await settlePendingPersistence();

    expect(disk().length).toBe(before + 1);
  });

  it("survives reconstruction and repeated reconstruction", async () => {
    const before = disk().length;

    memoryService.reconstructRuntimeMemory();
    await settlePendingPersistence();
    expect(disk().length).toBe(before);

    memoryService.reconstructRuntimeMemory();
    await settlePendingPersistence();
    expect(disk().length).toBe(before);
  });
});
