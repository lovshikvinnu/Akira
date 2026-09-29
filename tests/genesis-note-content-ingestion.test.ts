/**
 * Brain Dump -> cognitive memory: the user's own words, end to end.
 *
 * A note's body never reached GENESIS. `addNote` published
 * `{ id, title, tags, projectId }`, `NotePayload` had no content field, and the
 * translator built the description from the title:
 * `Captured thought: "<title>"`. Measured before this change, a titled note
 * contributed its title and nothing else, and an untitled quick capture
 * contributed nothing at all -- its description was the fixed string
 * "Captured raw thought", which the reflection validator held rather than
 * promoted, so no memory existed and therefore no story, understanding, recall
 * candidate or prompt line.
 *
 * That mattered beyond the missing text. Every rule that reads a note reads
 * `description`: the recall classifier, the semantic relevance score, and
 * `personalDeclarationRule`, whose patterns are all first-person prefixes
 * ("my goal is ", "i want to become "). A wrapper in front of the words
 * defeated all three.
 *
 * These tests drive the real product journey -- the store action a capture
 * surface actually calls -- rather than the pieces. Four of the five surfaces
 * (Topbar, CommandPalette, search, CaptureThoughtDialog) call
 * `addNote(string)`, which sets no title, so the untitled path is the common
 * one and is tested first.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { AkiraState } from "../src/shared/types/store-types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { translatePlatformEvent } = await import("../src/genesis/events/event-translation");
const { personalDeclarationRule } = await import("../src/genesis/understanding/rules");
const { validationRules } = await import("../src/genesis/validation/validation-rules");
const { Events } = await import("../src/contracts/events");
const { resetRetentionPolicy } = await import("../src/genesis/retention/policy");

/** The acceptance scenario's exact words. */
const DECLARATION = "I want to become a pilot and build an aviation company.";

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
}

const noteMemories = () => memoryService.getMemories().filter((m) => m.relatedNoteId);

/** Everything derived, as one searchable blob. */
function cognitiveState(): string {
  return JSON.stringify({
    events: akira.getState().memories,
    memories: memoryService.getMemories(),
    stories: storyService.getStories(),
  });
}

describe("a quick capture reaches cognition", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("carries the user's words from addNote through to a Memory", () => {
    // The Topbar / CommandPalette / search / CaptureThoughtDialog shape.
    akira.addNote(DECLARATION);

    // 1. The platform event carries the body, not just an id and a title.
    const event = akira.getState().memories.find((e) => e.eventType === "note_created");
    expect(event).toBeDefined();
    expect(event!.description).toBe(DECLARATION);
    expect((event!.metadata as { content?: string }).content).toBe(DECLARATION);

    // 2. A memory exists at all -- this is what used to be held.
    const memories = noteMemories();
    expect(memories.length).toBe(1);

    // 3. The stored cognitive evidence is the user's actual words, with no
    //    generated wrapper standing in front of them.
    expect(memories[0].description).toBe(DECLARATION);
    expect(memories[0].description).not.toContain("Captured thought");
    expect(memories[0].description).not.toContain("raw thought");
  });

  it("makes the declaration parseable, which is what the words are for", () => {
    akira.addNote(DECLARATION);

    // `personalDeclarationRule` matches first-person prefixes, so it can only
    // fire if the description begins with the user's own sentence. Before the
    // fix this produced nothing for every capture surface.
    const fragments = personalDeclarationRule.evaluate(
      memoryService.getMemories(),
      storyService.getStories(),
    );
    expect(fragments.length).toBeGreaterThan(0);
    expect(fragments.some((f) => f.canonicalKey.startsWith("goal:"))).toBe(true);
  });

  it("keeps the body for a titled note, and the title as structured metadata", () => {
    akira.addNote({ title: "Aviation plan", content: DECLARATION });

    const memory = noteMemories()[0];
    expect(memory.description).toBe(DECLARATION);

    // The title is not prepended -- doing so would put a token in front of the
    // declaration patterns again -- but it is not lost either.
    const event = akira.getState().memories.find((e) => e.eventType === "note_created")!;
    expect((event.metadata as { title?: string }).title).toBe("Aviation plan");
  });

  it("reaches every derived store, not just the memory", () => {
    akira.addNote(DECLARATION);

    const blob = cognitiveState();
    expect(blob).toContain("aviation company");

    // A reflection joins the reflections arc, which is how it becomes visible
    // to identity and recall.
    const memory = noteMemories()[0];
    const story = storyService.findStoryContainingMemory(memory.id);
    expect(story).toBeDefined();
  });

  it("does not invent content when there is none", () => {
    // `addNote` rejects an empty body outright, so nothing is published.
    const id = akira.addNote("   ");
    expect(id).toBe("");
    expect(noteMemories().length).toBe(0);
  });
});

describe("the translator, at its contract boundary", () => {
  it("returns the body verbatim when the payload carries one", () => {
    const translated = translatePlatformEvent(Events.NOTE_CREATED, {
      id: "n1",
      title: "a title",
      content: DECLARATION,
      projectId: null,
    });
    expect(translated?.description).toBe(DECLARATION);
  });

  it("falls back to the previous wrapper for a payload with no content", () => {
    // Backward compatibility: events recorded before `content` existed are
    // replayed from the durable stream without it, and must translate exactly
    // as they did.
    const titled = translatePlatformEvent(Events.NOTE_CREATED, {
      id: "n2",
      title: "legacy",
      projectId: null,
    });
    expect(titled?.description).toBe('Captured thought: "legacy"');

    const untitled = translatePlatformEvent(Events.NOTE_CREATED, {
      id: "n3",
      projectId: null,
    });
    expect(untitled?.description).toBe("Captured raw thought");

    const edited = translatePlatformEvent(Events.NOTE_EDITED, {
      id: "n4",
      title: "legacy",
      projectId: null,
    });
    expect(edited?.description).toBe('Updated thought: "legacy"');
  });

  it("treats a whitespace-only body as absent rather than as content", () => {
    const translated = translatePlatformEvent(Events.NOTE_CREATED, {
      id: "n5",
      title: "has a title",
      content: "   ",
      projectId: null,
    });
    expect(translated?.description).toBe('Captured thought: "has a title"');
  });
});

describe("the reflection validator decides on substance, not on wording", () => {
  const rule = () => validationRules.find((r) => r.name === "Reflection Validation Rule")!;

  const candidate = (over: Record<string, unknown>) =>
    ({
      id: "c",
      sourceEventId: "e",
      eventType: "note_created",
      timestamp: new Date().toISOString(),
      reason: "Reflection Worthy",
      explanation: "",
      title: "Note Created",
      description: "",
      relatedProjectId: null,
      relatedNoteId: "n",
      metadata: {},
      ...over,
    }) as never;

  it("promotes an untitled note that has a body", () => {
    expect(
      rule().evaluate(candidate({ description: DECLARATION, metadata: { content: DECLARATION } }))
        .outcome,
    ).toBe("Promote");
  });

  it("does not hold a note for containing the words 'raw thought'", () => {
    // The old test was `description.includes("raw thought")`, which was safe
    // only while the description was our own generated wrapper. Now that it is
    // the user's text, that check would read what they wrote.
    const text = "just a raw thought about landing gear";
    expect(
      rule().evaluate(candidate({ description: text, metadata: { content: text } })).outcome,
    ).toBe("Promote");
  });

  it("still holds a legacy untitled capture with no body and no title", () => {
    expect(
      rule().evaluate(candidate({ description: "Captured raw thought", metadata: {} })).outcome,
    ).toBe("Hold");
  });

  it("still promotes a candidate recorded directly with no metadata", () => {
    // `eventService.record` is called by several callers with no metadata; the
    // declaration suite depends on this path.
    expect(
      rule().evaluate(
        candidate({
          description: "User query: My dream is to become a pilot.",
          metadata: undefined,
        }),
      ).outcome,
    ).toBe("Promote");
  });

  it("holds a candidate with no description at all", () => {
    expect(rule().evaluate(candidate({ description: "" })).outcome).toBe("Hold");
  });
});

describe("reconstruction preserves the captured words", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    freshWorkspace();
  });
  afterEach(() => resetRetentionPolicy());

  it("rebuilds the same memory from the durable stream, repeatedly", () => {
    akira.addNote(DECLARATION);
    akira.addNote({ title: "second", content: "I aspire to fly gliders on weekends." });

    const live = noteMemories()
      .map((m) => m.description)
      .sort();
    expect(live).toContain(DECLARATION);

    memoryService.reconstructRuntimeMemory();
    const once = noteMemories()
      .map((m) => m.description)
      .sort();

    memoryService.reconstructRuntimeMemory();
    const twice = noteMemories()
      .map((m) => m.description)
      .sort();

    expect(once).toEqual(live);
    expect(twice).toEqual(once);
    expect(once).toContain(DECLARATION);
  });

  it("keeps the declaration derivable after replay", () => {
    akira.addNote(DECLARATION);
    memoryService.reconstructRuntimeMemory();

    const fragments = personalDeclarationRule.evaluate(
      memoryService.getMemories(),
      storyService.getStories(),
    );
    expect(fragments.some((f) => f.canonicalKey.startsWith("goal:"))).toBe(true);
  });
});
