/**
 * A past session's record must survive a restart.
 *
 * `selectSessionOutcomes` attributes stories and identity observations by
 * `createdAt`, on the stated grounds that it "never moves". That holds for a
 * row the user created. It does not hold for DERIVED state: stories and
 * identity observations are not persisted, they are re-derived from the durable
 * memory stream on every startup, and the rebuild stamps them with the instant
 * of the rebuild.
 *
 * So `createdAt` on a story is a replay instant, not a creation instant, and
 * after the first restart every past session reports zero stories and zero
 * observations -- the same erosion the move from `updatedAt` was meant to end,
 * arriving by a different route and all at once instead of gradually.
 *
 * Measured against this fixture before the fix:
 *
 *     immediately after the session   createdAt-in-window  stories 1/2  identity 1/1
 *     after later unrelated activity  createdAt-in-window  stories 1/2  identity 1/2
 *     after a restart                 createdAt-in-window  stories 0/2  identity 0/2
 *
 * What does survive is the evidence. A story cites `relatedMemoryIds` and an
 * observation cites `supportingMemoryIds`; those memories carry `timestamp`
 * off the durable stream, which replay reproduces exactly. Attributing a
 * derived artifact by the instant of the evidence it rests on is stable in all
 * three conditions above -- 2/2 and 2/2 throughout.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeAll } from "vitest";

const { initializeDatabase } = await import("../src/persistence/initializer");
initializeDatabase();

const genesis = await import("../src/genesis/index");
const { akira, settlePendingPersistence } = await import("../src/persistence/akira-store");
const { settingsRepository } = await import("../src/persistence/repositories");
const { presenceService } = await import("../src/akira-os/presence/service");
const { companionStateService } = await import("../src/genesis/context/state/service");
const { candidateService } = await import("../src/genesis/candidate/candidate-service");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { identityService } = await import("../src/genesis/understanding/identity-service");
const { selectSessionOutcomes } = await import("../src/akira-os/sessions/session-outcomes");

void genesis;

const spin = (n: number) => {
  const t0 = Date.now();
  while (Date.now() < t0 + n) {
    /* advance the clock so the window has width */
  }
};

let session: { startedAt: string; endedAt: string };

function outcomes() {
  return selectSessionOutcomes(session, {
    events: akira.getState().memories,
    candidates: candidateService.getCandidates(),
    promoted: memoryService.getMemories(),
    stories: storyService.getStories(),
    identity: identityService.getObservations(),
  });
}

describe("a finished session's record survives a restart", () => {
  beforeAll(async () => {
    akira.initializeState({ ...akira.getState() } as never);
    presenceService.initialize();
    akira.addProject({ name: "RISC-V decoder", tag: "RVD", description: "pipeline" } as never);
    const pid = akira.getState().projects[0].id;
    companionStateService.bootstrap();

    akira.startSession(pid, "Implement hazard forwarding");
    spin(4);
    akira.addTask("Implement hazard forwarding");
    akira
      .getState()
      .tasks.forEach((t) =>
        akira.updateTaskDetails(t.id, { completed: true, done: true } as never),
      );
    akira.addNote({
      title: "Hazard forwarding",
      content: "Forwarding resolves most data hazards.",
      projectId: pid,
    });
    akira.addNote({
      title: "Career",
      content: "I want to become a chip architect.",
      projectId: null,
    });
    spin(4);
    akira.endSession("productive");
    await settlePendingPersistence();

    session = akira.getState().sessions[0];
  });

  it("attributes the work done inside the window", () => {
    const o = outcomes();
    // Control: the fixture actually produced cognition, so the assertions
    // below are about attribution rather than about an inert workload.
    expect(storyService.getStories().length).toBeGreaterThan(0);
    expect(identityService.getObservations().length).toBeGreaterThan(0);

    expect(o.events.length).toBeGreaterThan(0);
    expect(o.promoted.length).toBeGreaterThan(0);
    expect(o.stories.length).toBeGreaterThan(0);
    expect(o.identity.length).toBeGreaterThan(0);
  });

  it("never loses an outcome when unrelated later work happens", async () => {
    // Asserted as "does not shrink" rather than "does not change", which is a
    // deliberate and narrower claim than it first looks.
    //
    // Losing an entry is always wrong: the work happened inside the window and
    // nothing later can undo that. Gaining one is not, and the fixture produces
    // a real instance -- the computed trait "Deep Work Focus" does not exist at
    // `endSession` because its evidence threshold is not yet met, and appears
    // once a later note crosses it. Three of its supporting memories are from
    // inside this session, so crediting the session with it is defensible.
    //
    // Whether a finished session's record may grow is a product decision and is
    // recorded as one; freezing it would need the outcome list persisted at
    // `endSession`, which is a durable structure that does not exist today.
    // This test pins the half that is not in question.
    const before = outcomes();
    spin(4);
    akira.addNote({ title: "Later", content: "Unrelated later note.", projectId: null });
    await settlePendingPersistence();
    const after = outcomes();

    expect(after.stories.length).toBeGreaterThanOrEqual(before.stories.length);
    expect(after.identity.length).toBeGreaterThanOrEqual(before.identity.length);
    expect(after.promoted.length).toBe(before.promoted.length);
  });

  it("still reports the same outcomes after a restart", async () => {
    const before = outcomes();
    expect(before.stories.length).toBeGreaterThan(0);
    expect(before.identity.length).toBeGreaterThan(0);

    // Exactly what `__root.tsx` does on startup: hydrate from the durable
    // stream, then clear-and-replay. Derived state is rebuilt, not restored.
    const durable = settingsRepository.get("genesis_memories");
    const persisted = durable ? (JSON.parse(durable) as unknown[]) : [];
    akira.initializeState({ ...akira.getState(), memories: persisted } as never);
    memoryService.initialize();
    await settlePendingPersistence();

    // Control: the restart really did rebuild derived state, so a pass below
    // cannot come from nothing having happened.
    expect(storyService.getStories().length).toBeGreaterThan(0);
    expect(identityService.getObservations().length).toBeGreaterThan(0);

    const after = outcomes();
    expect(after.stories.length, "stories lost across a restart").toBeGreaterThan(0);
    expect(after.identity.length, "identity observations lost across a restart").toBeGreaterThan(0);
  });
});
