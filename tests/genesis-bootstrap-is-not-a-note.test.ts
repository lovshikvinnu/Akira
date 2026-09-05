/**
 * The Companion State handoff is not something the user wrote.
 *
 * `bootstrap()` published its event as `note_created`. Durability is decided by
 * event type, so an internal handoff inherited the Core tier that exists to
 * protect the user's own notes -- and, being typed as a note, was
 * indistinguishable from one everywhere downstream.
 *
 * Measured before the fix, over 100 new-chat sessions each writing one real
 * note (`bootstrap()` runs from `chat.tsx`'s `handleNewChat`, not once per
 * install):
 *
 *   durable events            201, of which 101 were the handoff   (50.2%)
 *   Memories                  201, of which 101 were the handoff
 *   classified as             reason: "Reflection Worthy"
 *   stories containing one    1 of 1
 *
 * So AKIRA was building narrative about the user out of its own plumbing. The
 * fix gives the event its own type, Transient, exactly as `chat_message` was
 * separated from `note_created` for the same reason.
 *
 * WHAT MAKES THESE TESTS ABLE TO FAIL
 * -----------------------------------
 * Every "absent" assertion is paired with a positive control in the same
 * workload: a real note written through the same store must be present in the
 * same structure. An inert harness would fail those, so "the handoff is absent"
 * cannot pass by the pipeline simply not running.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeAll } from "vitest";

const { initializeDatabase } = await import("../src/persistence/initializer");
initializeDatabase();

const genesis = await import("../src/genesis/index");
const { akira, settlePendingPersistence } = await import("../src/persistence/akira-store");
const { settingsRepository } = await import("../src/persistence/repositories");
const { companionStateService } = await import("../src/genesis/context/state/service");
const { presenceService } = await import("../src/akira-os/presence/service");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { eventService } = await import("../src/genesis/events/event-service");
const { classifyDurability } = await import("../src/genesis/retention/policy");

void genesis;

const HANDOFF = "Companion State Bootstrapped";

function durableStream(): { title: string; eventType: string }[] {
  const raw = settingsRepository.get("genesis_memories");
  return raw ? (JSON.parse(raw) as { title: string; eventType: string }[]) : [];
}

describe("the Companion State handoff is not a user note", () => {
  let published: string[] = [];

  beforeAll(async () => {
    // Hydrate first: since 14f29e8 the durable write is refused while the store
    // has not loaded, so a fixture that never hydrates would persist nothing and
    // every "absent" assertion below would pass vacuously.
    akira.initializeState({ ...akira.getState() } as never);
    expect(akira.isHydrated(), "fixture must be hydrated or nothing persists").toBe(true);

    published = [];
    eventService.onRecord((e) => published.push(e.eventType));

    presenceService.initialize();

    // Three new-chat cycles, each writing one real note, as `handleNewChat` does.
    companionStateService.bootstrap();
    for (let i = 0; i < 3; i++) {
      akira.addNote({
        title: `Idea ${i}`,
        content: `a thought worth keeping ${i}`,
        projectId: null,
      });
      companionStateService.closeSession();
      companionStateService.bootstrap();
    }
    await settlePendingPersistence();
  });

  it("is classified Transient, unlike a note", () => {
    expect(classifyDurability("companion_bootstrapped")).toBe("Transient");
    // Control: the type it used to borrow is still Core, so this test would
    // catch the fix being made by demoting notes instead.
    expect(classifyDurability("note_created")).toBe("Core");
  });

  it("never reaches the durable stream", () => {
    const stream = durableStream();
    expect(stream.filter((e) => e.title === HANDOFF)).toHaveLength(0);
    // POSITIVE CONTROL: the real notes from the same workload are present.
    expect(stream.filter((e) => e.eventType === "note_created").length).toBeGreaterThanOrEqual(3);
  });

  it("never becomes a Memory the cognitive layer can reason about", () => {
    const memories = memoryService.getMemories();
    expect(memories.filter((m) => m.title === HANDOFF)).toHaveLength(0);
    // POSITIVE CONTROL: real notes did promote, so the pipeline ran.
    expect(memories.filter((m) => m.eventType === "note_created").length).toBeGreaterThanOrEqual(3);
  });

  it("is still published live, because Transient does not mean ignored", () => {
    // The distinction that makes Transient the right class rather than deleting
    // the call: subscribers still see it, it simply is not written down.
    expect(published).toContain("companion_bootstrapped");
    expect(published).not.toContain("note_created_bootstrap_placeholder");
  });
});
