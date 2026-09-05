/**
 * The chat -> cognition boundary.
 *
 *   Chat history records what was said. GENESIS remembers what mattered.
 *
 * A turn the user types is published as `chat_message`, which is Transient: it
 * reaches every subscriber and is never written to the durable stream, because
 * `settingsService.updateChat` already persists the conversation. Only a turn
 * that `parseDeclaration` confirms asserts something about the user is
 * re-recorded as `declaration_captured`, and that is what becomes a memory.
 *
 * WHY THIS FILE IS NOT ONE TEST
 * -----------------------------
 * "Chat does not become a memory" is true for several independent reasons, and
 * a single end-to-end assertion would pass if any one of them held while the
 * others had quietly broken. The reasons are pinned separately: the durability
 * table says Transient, `record` does not persist a Transient event, no
 * candidate rule matches the type, and nothing survives replay. Each of those
 * is load-bearing on its own.
 *
 * ON NOT RELYING ON THE DEFAULT
 * -----------------------------
 * `classifyDurability` returns Episodic for any type it does not know, so
 * `chat_message` would have been Episodic even with no table entry -- and
 * Episodic is capped at 500 against Core's 2000, which is a smaller room for
 * the same fire rather than a fix. The entry is explicit and asserted to be
 * explicit here: the test below distinguishes "the table says Transient" from
 * "the type is unknown and fell through", so deleting the row fails rather
 * than silently reclassifying every chat turn as a retained memory.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import type { AkiraState } from "../src/shared/types/store-types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { eventService } = await import("../src/genesis/events/event-service");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { contextRules } = await import("../src/genesis/context/context-rules");
const { rules: candidateRules } = await import("../src/genesis/candidate/candidate-rules");
const { classifyDurability, setRetentionPolicy, resetRetentionPolicy } =
  await import("../src/genesis/retention/policy");
const { identityService } = await import("../src/genesis/identity");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { getChat } = await import("../src/shared/genesis-provider");
const { hasPendingWork } = await import("../src/genesis/batch");
const { candidateService } = genesis;

function freshWorkspace(): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  recallService.clearHistory();
  recallBuilder.initialize();
}

let seq = 0;

/**
 * Exactly what `routes/chat.tsx` does when the user sends a message: store the
 * turn, then tell GENESIS it happened.
 *
 * Both halves matter to the tests. Omitting `addChatMessage` leaves the chat
 * array empty, which pins `resolveCurrentContext()` at BOOTSTRAP -- a state
 * that exists only before the user's first message of a session, and one that
 * makes chat look absent from recall for the wrong reason.
 */
function sendChat(text?: string, projectId?: string): string {
  const userText = text ?? `what about thing ${seq++}`;
  akira.addChatMessage("user", userText);
  eventService.record("chat_message", "Chat Message", userText, projectId);
  return userText;
}

const durableStream = () => akira.getState().memories;

beforeEach(() => {
  freshWorkspace();
});

describe("chat_message cannot become a high-volume memory source", () => {
  it("is Transient by an explicit table entry, not by the unknown-type default", () => {
    expect(classifyDurability("chat_message")).toBe("Transient");

    // The default exists and is Episodic. Naming it here is what makes the
    // assertion above meaningful: if the table row were deleted, chat would
    // classify as Episodic and this pair would disagree.
    expect(classifyDurability("some_type_nobody_has_declared")).toBe("Episodic");
    expect(classifyDurability("chat_message")).not.toBe(
      classifyDurability("some_type_nobody_has_declared"),
    );
  });

  it("matches no candidate rule, so no rule can build a memory from it", () => {
    const event = {
      id: "e1",
      timestamp: new Date().toISOString(),
      eventType: "chat_message" as const,
      title: "Chat Message",
      description: "how do I wire the FPGA clock",
      relatedProjectId: null,
      relatedNoteId: null,
      metadata: {},
    };
    const matching = candidateRules.filter((r) => r.evaluate(event).shouldGenerate);
    expect(matching.map((r) => r.name)).toEqual([]);
  });

  it("keeps 120 chat messages out of the durable stream entirely", () => {
    akira.addProject({ name: "Boundary" });
    const before = durableStream().length;

    for (let i = 0; i < 120; i++) sendChat();

    expect(durableStream().length, "chat reached the durable stream").toBe(before);
    expect(durableStream().some((e) => e.eventType === "chat_message")).toBe(false);
  });

  it("consumes no Core capacity, and does not displace founding knowledge", () => {
    akira.addProject({ name: "Founding" });
    const noteId = akira.addNote({ content: "I want to become a pilot" });

    const coreBefore = durableStream().filter(
      (e) => classifyDurability(e.eventType) === "Core",
    ).length;

    for (let i = 0; i < 120; i++) sendChat();

    const coreAfter = durableStream().filter(
      (e) => classifyDurability(e.eventType) === "Core",
    ).length;

    // The note declares something, so the promoter adds exactly one Core event
    // for it. 120 raw turns add none.
    expect(coreAfter).toBe(coreBefore);
    expect(durableStream().some((e) => e.eventType === "project_created")).toBe(true);
    expect(durableStream().some((e) => e.relatedNoteId === noteId)).toBe(true);
  });

  it("creates no cognitive memory for a non-declaration message", () => {
    const before = memoryService.getMemories().length;
    for (let i = 0; i < 40; i++) sendChat(`how do I wire the FPGA clock ${i}`);
    expect(memoryService.getMemories().length).toBe(before);
  });
});

describe("chat stays cognitively available", () => {
  it("remains readable through getChat()", () => {
    const texts = [sendChat("first thing"), sendChat("second thing"), sendChat("third thing")];
    const chat = getChat() ?? [];
    for (const t of texts) {
      expect(
        chat.some((m) => m.text === t),
        `"${t}" is not in the chat history`,
      ).toBe(true);
    }
  });

  it("still drives the recall discussion context", () => {
    // The live channel, which is the one that was always correct. Recall reads
    // the chat array, not chat memories, so removing the memories changes
    // nothing about what recall considers relevant.
    akira.addProject({ name: "Ctx" });
    akira.addNote({ content: "the aviation licence paperwork is filed" });

    sendChat("what about the aviation licence");
    const noteMemory = memoryService.getMemories().find((m) => m.relatedNoteId)!;

    recallBuilder.rebuildRecallCandidates("QUERY");
    const candidate = recallService.getRecallCandidates().find((c) => c.memoryId === noteMemory.id);

    expect(candidate, "the note was not evaluated against the live chat").toBeDefined();
    expect(
      candidate!.recallReasons.some((r) => r.includes("SemanticMatch: Yes")),
      "chat text no longer reaches semantic relevance",
    ).toBe(true);
  });
});

describe("a declaration made in conversation is promoted", () => {
  it("produces one durable event, one memory, and an identity goal", () => {
    sendChat("I want to become a pilot");

    const promoted = durableStream().filter((e) => e.eventType === "declaration_captured");
    expect(promoted.length, "the declaration was not promoted").toBe(1);
    expect(promoted[0].description, "the promoted event lost the user's words").toBe(
      "I want to become a pilot",
    );

    const memory = memoryService.getMemories().find((m) => m.eventType === "declaration_captured");
    expect(memory, "the promoted event produced no memory").toBeDefined();
    expect(memory!.description).toBe("I want to become a pilot");

    expect(
      understandingEngine.getUnderstandings().some((u) => u.canonicalKey === "goal:become-a-pilot"),
    ).toBe(true);

    const identity = identityService.getIdentity();
    expect(identity).toBeDefined();
    expect(identityService.getGoals(identity!.id).map((g) => g.title)).toContain("become a pilot");
  });

  it("promotes only the turns that declare something", () => {
    sendChat("how do I wire the FPGA clock");
    sendChat("My goal is to learn Verilog");
    sendChat("what did I do last tuesday");
    sendChat("is the parser finished");

    const promoted = durableStream().filter((e) => e.eventType === "declaration_captured");
    expect(promoted.map((e) => e.description)).toEqual(["My goal is to learn Verilog"]);
  });

  it("does not promote a phrasing the parser does not recognise", () => {
    // Not a defect being pinned as correct -- a boundary being stated. The
    // parser has "i want to become " and no bare "i want to ", so this is the
    // gate's real behaviour and widening it is a separate change.
    sendChat("I want to run a marathon");
    expect(durableStream().some((e) => e.eventType === "declaration_captured")).toBe(false);
  });
});

describe("note ingestion is unchanged", () => {
  it("still turns a captured note into a memory carrying the user's words", () => {
    const sentence = "I want to become a marathon runner";
    const noteId = akira.addNote({ title: "Plan", content: sentence });

    const memory = memoryService.getMemories().find((m) => m.relatedNoteId === noteId);
    expect(memory, "note ingestion stopped producing a memory").toBeDefined();
    expect(memory!.eventType).toBe("note_created");
    expect(memory!.description).toBe(sentence);
    expect(classifyDurability("note_created")).toBe("Core");
  });

  it("still recalls a free-standing note at BOOTSTRAP", () => {
    const noteId = akira.addNote({ content: "I want to become a pilot and build a company" });
    const memory = memoryService.getMemories().find((m) => m.relatedNoteId === noteId)!;

    recallBuilder.rebuildRecallCandidates("BOOTSTRAP");
    expect(
      recallService
        .getRecallCandidates()
        .some((c) => c.memoryId === memory.id && c.status === "Active"),
    ).toBe(true);
  });

  it("keeps an untitled quick capture working", () => {
    const noteId = akira.addNote({ content: "sleep has been bad this week" });
    expect(memoryService.getMemories().some((m) => m.relatedNoteId === noteId)).toBe(true);
  });
});

describe("replay is faithful", () => {
  it("rebuilds the promoted declaration and no chat", () => {
    akira.addProject({ name: "Replay" });
    akira.addNote({ content: "a thought I captured" });
    sendChat("I want to become a pilot");
    for (let i = 0; i < 60; i++) sendChat();

    const liveMemories = memoryService.getMemories().length;
    const liveDeclarations = memoryService
      .getMemories()
      .filter((m) => m.eventType === "declaration_captured").length;
    expect(liveDeclarations).toBe(1);

    memoryService.reconstructRuntimeMemory();

    expect(memoryService.getMemories().length, "replay changed the memory count").toBe(
      liveMemories,
    );
    expect(
      memoryService.getMemories().filter((m) => m.eventType === "declaration_captured").length,
      "the promoted declaration did not survive replay",
    ).toBe(1);
    expect(
      memoryService.getMemories().some((m) => m.eventType === "chat_message"),
      "replay resurrected chat as memory",
    ).toBe(false);
  });

  it("is idempotent across repeated replays", () => {
    sendChat("My goal is to learn Verilog");
    for (let i = 0; i < 20; i++) sendChat();

    memoryService.reconstructRuntimeMemory();
    const once = memoryService
      .getMemories()
      .map((m) => m.description)
      .sort();
    memoryService.reconstructRuntimeMemory();
    const twice = memoryService
      .getMemories()
      .map((m) => m.description)
      .sort();

    expect(twice).toEqual(once);
  });
});

describe("the prompt no longer echoes the current message back", () => {
  /**
   * The argument for this boundary that does not depend on cost.
   *
   * `buildRecallEvaluationContext` scores semantic relevance against the last
   * user message. That message used to be a memory too, so it matched itself
   * perfectly and took a prompt slot -- showing the model the sentence it was
   * already answering, verbatim, at the expense of something it did not have.
   */
  it("spends no prompt slot on a chat turn", () => {
    akira.addProject({ name: "Echo" });
    const pid = akira.getState().lastProjectId as string;
    akira.addTaskDetails({ title: "echo-pending", projectId: pid });
    for (let i = 0; i < 10; i++) {
      const title = `echo-${i}`;
      akira.addTaskDetails({ title, projectId: pid });
      const task = akira.getState().tasks.find((t) => t.title === title);
      if (task) akira.toggleTask(task.id);
    }
    akira.addNote({ content: "the licence paperwork is filed" });

    for (let i = 0; i < 20; i++) sendChat(`question ${i}`, pid);

    recallBuilder.rebuildRecallCandidates();
    const selected = contextRules.filterActiveRecallCandidates(recallService.getRecallCandidates());
    const memories = new Map(memoryService.getMemories().map((m) => [m.id, m]));

    for (const item of selected) {
      const memory = memories.get(item.data.memoryId);
      expect(memory?.eventType, "a chat turn reached the prompt").not.toBe("chat_message");
    }
    expect(selected.length).toBeGreaterThan(0);
  });

  it("leaves no chat memory to become a recall candidate at all", () => {
    for (let i = 0; i < 30; i++) sendChat(`question ${i}`);
    recallBuilder.rebuildRecallCandidates();

    const memories = new Map(memoryService.getMemories().map((m) => [m.id, m]));
    const chatCandidates = recallService
      .getRecallCandidates()
      .filter((c) => memories.get(c.memoryId)?.eventType === "chat_message");
    expect(chatCandidates).toEqual([]);
  });
});

describe("a turn that declares nothing costs nothing downstream", () => {
  /**
   * The counterpart to the durability tests. Those say chat is not *stored*;
   * this says it does not set the cognitive machinery running either.
   *
   * A flush is the observable unit of derived work: recall rebuilds once per
   * cognitive transaction that dirtied it, and the understanding engine
   * notifies once per transaction that changed the graph. Counting them is
   * deterministic, unlike timing anything on this machine.
   *
   * Before the boundary moved, every turn produced a memory and therefore
   * dirtied every derived phase -- measured at 1,004 relationship rule
   * evaluations for zero detections, and importance recalculated across the
   * whole reflections arc, per message.
   */
  function countFlushes(fn: () => void): { recall: number; understanding: number } {
    let recall = 0;
    let understanding = 0;
    const realRebuild = recallBuilder.rebuildRecallCandidates.bind(recallBuilder);
    recallBuilder.rebuildRecallCandidates = ((ctx?: never) => {
      recall += 1;
      return realRebuild(ctx);
    }) as typeof recallBuilder.rebuildRecallCandidates;
    const unsubscribe = understandingEngine.subscribe(() => {
      understanding += 1;
    });
    // `subscribe` invokes the listener once with the current graph before
    // returning. That call is not work caused by `fn`, and counting it made
    // every measurement here read exactly one too high -- including, briefly,
    // a conclusion that a plain chat turn dirtied the understanding phase.
    understanding = 0;

    // Settle anything an earlier case left dirty, then require it to be
    // settled. A phase stays dirty until the next cognitive transaction
    // flushes it, so without this a count can include work caused by the
    // previous test -- which made these assertions fail about one full run in
    // five while passing in isolation every time. Recording a transient event
    // is the cheapest transaction available: it opens and closes a batch and
    // produces nothing of its own.
    eventService.record("chat_message", "Chat Message", "settle", undefined);
    expect(hasPendingWork(), "pipeline was not settled before measuring").toBe(false);
    recall = 0;
    understanding = 0;

    try {
      fn();
    } finally {
      recallBuilder.rebuildRecallCandidates = realRebuild;
      unsubscribe();
    }
    return { recall, understanding };
  }

  it("dirties no derived phase at all", () => {
    akira.addProject({ name: "Idle" });
    const counts = countFlushes(() => sendChat("how do I wire the FPGA clock"));
    expect(counts).toEqual({ recall: 0, understanding: 0 });
  });

  it("stays at zero however many turns are sent", () => {
    akira.addProject({ name: "Idle" });
    const counts = countFlushes(() => {
      for (let i = 0; i < 25; i++) sendChat(`question ${i}`);
    });
    expect(counts).toEqual({ recall: 0, understanding: 0 });
  });

  it("and a declaring turn costs exactly what a captured note costs", () => {
    // Not zero -- promotion is real work and should look like the work it is.
    // The point is that it is one transaction, not two: the promoter records
    // from inside an `onRecord` callback, and `event-service` documents that a
    // subscriber recording its own event joins the open transaction rather
    // than settling inside it. If that were wrong, this would be 2 and 2.
    akira.addProject({ name: "Cost" });
    const declaring = countFlushes(() => sendChat("I want to become a pilot"));
    const note = countFlushes(() => akira.addNote({ content: "My goal is to learn Verilog" }));

    expect(declaring).toEqual({ recall: 1, understanding: 1 });
    expect(declaring).toEqual(note);
  });
});

describe("a declaration made inside a project session", () => {
  it("is filed under the project rather than the reflections arc", () => {
    // `chat.tsx` passes `currentProjectId` when a session is active, and the
    // promoter carries it onto the promoted event. So the declaration lands in
    // the project's narrative, which is where the user was working when they
    // said it.
    akira.addProject({ name: "Aviation Co" });
    const projectId = akira.getState().lastProjectId as string;

    sendChat("I want to become a pilot", projectId);

    const memory = memoryService.getMemories().find((m) => m.eventType === "declaration_captured");
    expect(memory, "the declaration was not promoted inside a project session").toBeDefined();
    expect(memory!.relatedProjectId).toBe(projectId);
    expect(memory!.description).toBe("I want to become a pilot");

    const story = storyService.findStoryContainingMemory(memory!.id);
    expect(story, "the declaration joined no story").toBeDefined();
    expect(story!.kind).toBe("Project");
  });

  it("still reaches identity from inside a project session", () => {
    akira.addProject({ name: "Aviation Co" });
    const projectId = akira.getState().lastProjectId as string;
    sendChat("My goal is to learn Verilog", projectId);

    const identity = identityService.getIdentity();
    expect(identity).toBeDefined();
    expect(identityService.getGoals(identity!.id).map((g) => g.title)).toContain("learn Verilog");
  });
});

describe("the gate admits aspirations and nothing else", () => {
  /**
   * `parseDeclaration` recognises five categories and four of them are how
   * people talk while working. Ungated, the promoter turned 50-60% of an
   * ordinary session into durable Core memories and permanent identity claims
   * -- putting back, through the promotion path, the Core flood this milestone
   * removed at the intake.
   *
   * The corpus below is a working session with no deliberate statement of
   * identity in it. Every line of it used to be promoted or not by accident of
   * phrasing; none of it should be now.
   */
  const ORDINARY = [
    "how do I wire the FPGA clock",
    "I hate this bug, it's taken all morning",
    "I always forget which flag disables the cache",
    "I prefer the shorter error message",
    "I believe this regex is wrong",
    "I enjoy this kind of refactor",
    "I care deeply about not breaking replay",
    "every day I forget to pull first",
    "I dislike how verbose this getter is",
    "I love when a test catches something real",
    "I usually start with the failing test",
    "I run the suite every morning before standup",
    "I'm interested in how the batching works",
    "I like how the new layout turned out",
    "what did I change in the store yesterday",
  ];

  const ASPIRATIONS = [
    "I want to become a pilot",
    "My goal is to learn Verilog",
    "My dream is to build an aviation company",
    "I aspire to write a compiler from scratch",
    "Shipping this milestone is my goal",
  ];

  it("promotes none of an ordinary working session", () => {
    for (const turn of ORDINARY) sendChat(turn);

    const promoted = durableStream().filter((e) => e.eventType === "declaration_captured");
    expect(
      promoted.map((e) => e.description),
      "ordinary conversation was promoted to durable memory",
    ).toEqual([]);
    expect(memoryService.getMemories().some((m) => m.eventType === "declaration_captured")).toBe(
      false,
    );
  });

  it("makes no identity claim from an ordinary working session", () => {
    // The harm that outlives the capacity cost. A Core memory ages out; an
    // identity observation is an assertion about who the person is.
    //
    // Asserted on the values rather than on a count. The identity graph is not
    // reset between cases in this file and observations dedupe by name, so a
    // count would stay flat whether or not the claims were being made -- which
    // it did, passing with the gate removed until this was rewritten.
    const phrases = [
      "this bug",
      "which flag disables the cache",
      "the shorter error message",
      "this regex is wrong",
      "this kind of refactor",
      "not breaking replay",
      "pull first",
      "verbose this getter",
      "a test catches something real",
      "the failing test",
      "the suite",
      "how the batching works",
      "the new layout",
    ];
    for (const turn of ORDINARY) sendChat(turn);

    const values = identityService.getIdentityNodes().map((n) => (n.value ?? "").toLowerCase());
    for (const phrase of phrases) {
      expect(
        values.some((v) => v.includes(phrase)),
        `conversation became an identity claim: "${phrase}"`,
      ).toBe(false);
    }
  });

  it("promotes every aspiration", () => {
    for (const turn of ASPIRATIONS) sendChat(turn);

    const promoted = durableStream().filter((e) => e.eventType === "declaration_captured");
    expect(promoted.map((e) => e.description).sort()).toEqual([...ASPIRATIONS].sort());
  });

  it("separates them cleanly when they are interleaved", () => {
    const mixed = [
      ORDINARY[1],
      ASPIRATIONS[0],
      ORDINARY[2],
      ORDINARY[4],
      ASPIRATIONS[1],
      ORDINARY[7],
    ];
    for (const turn of mixed) sendChat(turn);

    // `saveMemory` prepends, so the stream is newest-first.
    expect(
      durableStream()
        .filter((e) => e.eventType === "declaration_captured")
        .map((e) => e.description)
        .reverse(),
    ).toEqual([ASPIRATIONS[0], ASPIRATIONS[1]]);
  });

  it("does not narrow what a captured note can say", () => {
    // The asymmetry, stated as a test. Writing something down is a deliberate
    // act of recording; a chat turn is not. So a note still reaches identity
    // with the categories chat no longer can, and the gate is on the
    // incidental path only.
    akira.addNote({ content: "I prefer working in the morning" });
    akira.addNote({ content: "I run every morning" });

    const nodes = identityService.getIdentityNodes().map((n) => n.value ?? "");
    expect(
      nodes.some((v) => v.includes("working in the morning")),
      "a preference captured as a note stopped reaching identity",
    ).toBe(true);
    expect(nodes.some((v) => v.includes("run"))).toBe(true);
  });

  it("does not evict founding knowledge across a long conversation", () => {
    // Chat 3's arm: at a reduced Core cap the ungated promoter refilled Core
    // and pushed the founding note out. Six rounds of the same ordinary
    // session, against a founding capture made first.
    resetRetentionPolicy();
    setRetentionPolicy({ maxCoreMemories: 40, maxCoreMemoryEvents: 40 });
    try {
      const noteId = akira.addNote({ content: "the licence paperwork is filed" });
      const noteMemoryId = memoryService.getMemories().find((m) => m.relatedNoteId === noteId)!.id;

      for (let round = 0; round < 6; round++) {
        for (const turn of ORDINARY) sendChat(`${turn} ${round}`);
      }

      expect(
        memoryService.getMemories().some((m) => m.id === noteMemoryId),
        "conversation evicted the founding capture from Core",
      ).toBe(true);
      expect(
        memoryService.getMemories().filter((m) => m.eventType === "declaration_captured").length,
      ).toBe(0);
    } finally {
      resetRetentionPolicy();
    }
  });
});
