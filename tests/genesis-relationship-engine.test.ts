/**
 * The relationship engine records people the user names, and nothing else.
 *
 * It scanned every chat turn with two patterns and called `recordObservation`
 * for each capture. Measured over twenty ordinary work sentences, five of which
 * named a real person:
 *
 *     @Name mention               100% precision, 0 non-people
 *     preposition + Capitalised    21% precision, 15 non-people
 *
 * The fifteen were Marketing, Claude, London, Slack, Python, Done, Gmail,
 * Option, Main, Vitest, Production, Learn, Finance, Friday and Spotify. Three
 * of every four "contacts" were not people, and one of them was AKIRA --
 * "asked Claude to summarise the doc" recorded Claude as someone the user knows.
 * They reached the model as `• Contact: Marketing (Unspecified)`.
 *
 * Writing "@Sarah" is the user naming a person on purpose. A capital letter
 * after a preposition is grammar. The recall lost is real -- "met Daniel" no
 * longer records Daniel -- and is the correct trade: a contact list that is
 * three-quarters wrong is worse than a shorter one that is right, because the
 * model cannot tell which quarter to believe.
 *
 * Three things were coupled to that precision and only safe once it was fixed:
 * the same-millisecond loss below, the relevance gate, and how much an inferred
 * link is worth. They are tested together because fixing any one alone would
 * have spread or hidden the others.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import type { AkiraState } from "../src/shared/types/store-types";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { relationshipService } = await import("../src/genesis/context/relationships/service");
const { contextResolutionService } =
  await import("../src/genesis/context/context-resolution/service");
const { contextRelevanceSelector } =
  await import("../src/genesis/context/context-relevance-selector");
const { contextService } = await import("../src/genesis/context/context-service");
const { resolveUnifiedContext } = await import("../src/genesis/context/context-resolution/rules");

type Person = { name: string; sharedProjectIds: string[] };

const recorded = (): string[] => {
  const ctx = relationshipService.getContext() as { importantPeople?: Person[] } | null;
  return (ctx?.importantPeople ?? []).map((p) => p.name);
};

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, chat: [], projects: [], tasks: [], notes: [] });
  relationshipService.initialize();
}

beforeEach(() => {
  freshWorkspace();
});

describe("only a person the user actually named", () => {
  it("records an @mention", () => {
    akira.addChatMessage("user", "@Sarah reviewed the design today");
    expect(recorded(), "an explicit mention was not recorded").toContain("Sarah");
  });

  it("records nothing from a capital letter after a preposition", () => {
    // Every one of these produced a "contact" before. They are a department, an
    // AI assistant, a city, four tools, a branch, an environment, a verb, a day
    // and a music service.
    akira.addChatMessage(
      "user",
      "I talked to Marketing, asked Claude to summarise, flew to London, " +
        "told Slack to quieten, compared it with Python, pushed to Main, " +
        "deployed to Production, want to Learn Verilog, and listened to Spotify on Friday",
    );
    expect(recorded(), "grammar was read as a person").toEqual([]);
  });

  it("keeps the person when both forms appear in one sentence", () => {
    // The trade, stated exactly: Daniel is lost, Sarah is kept, and nothing
    // false is added.
    akira.addChatMessage("user", "met Daniel about the launch, then @Sarah signed it off");
    expect(recorded()).toEqual(["Sarah"]);
  });
});

describe("no message is skipped for sharing a millisecond", () => {
  it("scans every message, not one per instant", () => {
    // The watermark was `msgTime > lastProcessedChatTime`, so a burst arriving
    // inside one millisecond was scanned once and the rest dropped. It faked a
    // good precision result during this investigation: a corpus of ten appeared
    // to record two people until it turned out eight were never read.
    for (const name of ["Alice", "Bob", "Chen", "Dara", "Eve"]) {
      akira.addChatMessage("user", `@${name} joined the review`);
    }
    expect(recorded().sort(), "messages sharing an instant were dropped").toEqual([
      "Alice",
      "Bob",
      "Chen",
      "Dara",
      "Eve",
    ]);
  });
});

describe("the relevance gate keeps people for the questions about people", () => {
  function keptFor(query: string): number {
    contextResolutionService.rebuildResolvedContext();
    const selection = contextRelevanceSelector.selectContext(
      query,
      contextService.getActiveContext() ?? undefined,
      contextResolutionService.getContext(),
    );
    const resolved = selection.resolvedContext as { importantRelationships?: unknown[] } | null;
    return resolved?.importantRelationships?.length ?? 0;
  }

  it("keeps them whether or not the question is about a project", () => {
    akira.addProject({ name: "Pilot Licence" });
    akira.addChatMessage("user", "@Sarah reviewed Pilot Licence");
    expect(recorded(), "nothing recorded, so the gate cannot be tested").toContain("Sarah");

    // The gate stripped relationships whenever the query was NOT
    // workspace-relevant, on the reasoning that they were "relevant only to
    // projects" -- so the one question where contacts matter was the one that
    // removed them. Measured before: 2 kept for the project question, 0 for
    // "who did I meet recently".
    expect(keptFor("how is Pilot Licence going"), "lost for a project question").toBeGreaterThan(0);
    expect(keptFor("who did I meet recently"), "lost for a question about people").toBeGreaterThan(
      0,
    );
  });
});

describe("an inferred link is worth less than a stated one", () => {
  it("ranks a memory linked by fact above one linked by inference", async () => {
    const { importanceRules } = await import("../src/genesis/importance/importance-rules");
    const { relationshipService: memoryRelationships } =
      await import("../src/genesis/memory/relationships/relationship-service");

    const rule = importanceRules.find((r) => r.name === "Relationships Density Signal Rule");
    expect(rule, "the density rule is gone").toBeDefined();

    const original = memoryRelationships.getRelationshipsForMemory;
    const withBasis = (basis: string, n: number) =>
      Array.from({ length: n }, () => ({ basis }) as never);

    try {
      (memoryRelationships as { getRelationshipsForMemory: unknown }).getRelationshipsForMemory =
        () => withBasis("Fact", 2);
      const stated = rule!.evaluate({ id: "m1" } as never);

      (memoryRelationships as { getRelationshipsForMemory: unknown }).getRelationshipsForMemory =
        () => withBasis("Inference", 2);
      const inferred = rule!.evaluate({ id: "m1" } as never);

      expect(stated, "the rule produced no signal for stated links").not.toBeNull();
      expect(inferred, "the rule produced no signal for inferred links").not.toBeNull();
      expect(inferred!.strength, "an inferred link counted the same as a stated one").toBeLessThan(
        stated!.strength,
      );
      // Inference still counts. Discounted, not discarded.
      expect(inferred!.strength).toBeGreaterThan(0.4);
    } finally {
      (memoryRelationships as { getRelationshipsForMemory: unknown }).getRelationshipsForMemory =
        original;
    }
  });
});

describe("an active project does not hide the user's contacts", () => {
  /**
   * `resolveUnifiedContext` narrows `importantRelationships` to people whose
   * `sharedProjectIds` contains the active project. Nothing populates that
   * field -- it is initialised to `[]` and written only by
   * `correctRelationship`, which has no production caller -- so the moment an
   * active project existed, and it is set automatically from `lastProjectId`
   * as soon as the user touches a project, every contact disappeared from the
   * resolved context and from the prompt.
   *
   * The narrowing is kept for the day the field is populated. What changed is
   * the reading of an empty result: nobody linked to this project is evidence
   * that the link data does not exist, not that nobody matters.
   *
   * These drive `resolveUnifiedContext` directly, with a real
   * `RelationshipContext` built by the engine, because the defect lives in that
   * function rather than in anything the engine does.
   */
  function resolvedWith(activeProject: { id: string; name: string } | null) {
    const relationships = relationshipService.getContext();
    return resolveUnifiedContext(
      null,
      { activeProject, evidence: { evidenceLog: [], snapshot: {} } } as never,
      relationships as never,
      null,
      null,
    ).importantRelationships;
  }

  function mention(name: string) {
    akira.addChatMessage("user", `@${name} looked at it today`);
  }

  it("keeps a mentioned person while a project is active", () => {
    akira.addProject({ name: "Pilot Licence" });
    const projectId = akira.getState().lastProjectId as string;
    mention("Sarah");
    expect(recorded(), "nothing recorded, so nothing is being tested").toContain("Sarah");

    expect(
      resolvedWith({ id: projectId, name: "Pilot Licence" }).length,
      "an active project hid every contact",
    ).toBe(1);
  });

  it("keeps them when no project is active", () => {
    mention("Sarah");
    expect(resolvedWith(null).length).toBe(1);
  });

  it("keeps them across several projects, whichever is active", () => {
    akira.addProject({ name: "Pilot Licence" });
    const first = akira.getState().lastProjectId as string;
    akira.addProject({ name: "Kitchen Remodel" });
    const second = akira.getState().lastProjectId as string;
    mention("Sarah");
    mention("Daniel");

    expect(resolvedWith({ id: first, name: "Pilot Licence" }).length).toBe(2);
    expect(resolvedWith({ id: second, name: "Kitchen Remodel" }).length).toBe(2);
  });

  it("keeps a person who has no project association at all", () => {
    akira.addProject({ name: "Pilot Licence" });
    const projectId = akira.getState().lastProjectId as string;
    mention("Sarah");

    const person = relationshipService
      .getContext()!
      .importantPeople.find((p) => p.name === "Sarah")!;
    expect(
      person.sharedProjectIds,
      "the fixture already has a link, so this proves nothing",
    ).toEqual([]);
    expect(resolvedWith({ id: projectId, name: "Pilot Licence" }).length).toBe(1);
  });

  it("does narrow once someone is explicitly associated with the project", () => {
    // The positive control, and the reason the filter is kept rather than
    // deleted. `correctRelationship` is the deliberate act -- the only way a
    // person gains a project link -- and when one exists the narrowing is
    // meaningful again and the unlinked person drops out.
    akira.addProject({ name: "Pilot Licence" });
    const projectId = akira.getState().lastProjectId as string;
    mention("Sarah");
    mention("Daniel");
    expect(resolvedWith({ id: projectId, name: "Pilot Licence" }).length).toBe(2);

    const sarah = relationshipService
      .getContext()!
      .importantPeople.find((p) => p.name === "Sarah")!;
    relationshipService.correctRelationship(
      sarah.id,
      "sharedProjectIds",
      JSON.stringify([projectId]),
    );

    const narrowed = resolvedWith({ id: projectId, name: "Pilot Licence" });
    expect(narrowed.length, "an explicit association did not narrow anything").toBe(1);
    expect(narrowed[0].name).toBe("Sarah");
  });

  it("associates nobody with a project on its own", () => {
    // The boundary that stays. Deciding a person mentioned while a project is
    // open belongs to it is the proximity inference the project/aspiration rule
    // was removed for.
    akira.addProject({ name: "Pilot Licence" });
    mention("Sarah");

    const person = relationshipService
      .getContext()!
      .importantPeople.find((p) => p.name === "Sarah")!;
    expect(person.sharedProjectIds, "a project association was invented").toEqual([]);
  });
});
