/**
 * What a raw chat message costs GENESIS, and what it produces.
 *
 * `routes/chat.tsx:681` records every chat message the user sends as a
 * `note_created` MemoryEvent. This harness measures the consequence, for the
 * boundary decision: should raw conversation become cognitive memory at all.
 *
 * WHY COUNTS RATHER THAN TIMINGS
 * ------------------------------
 * Absolute per-action latency on this machine is trustworthy to roughly 3x
 * across processes -- see `tests/support/perf-ab.ts`. Every headline figure
 * here is therefore a deterministic operation count taken by wrapping a rule or
 * service boundary, reproducible run to run and immune to machine load. The one
 * wall-clock figure is a ratio between two interleaved arms whose ranges do not
 * overlap, which is the weakest claim that survives this hardware.
 *
 * WHAT IT IS NOT
 * --------------
 * Not an assertion suite. Nothing here fails on a threshold, because these are
 * measurements taken for a design decision rather than invariants to protect.
 * It lives as a `.bench.ts` so `vitest run` cannot collect it.
 *
 *   npx vitest run --config vitest.bench.config.ts tests/genesis-chat-intake-cost.bench.ts
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it } from "vitest";
import type { AkiraState } from "../src/shared/types/store-types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { eventService } = await import("../src/genesis/events/event-service");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { relationshipRules } =
  await import("../src/genesis/memory/relationships/relationship-rules");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { rules: understandingRules } = await import("../src/genesis/understanding/rules");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { identityService } = await import("../src/genesis/identity");
const { getRetentionPolicy, setRetentionPolicy, resetRetentionPolicy } =
  await import("../src/genesis/retention/policy");
const { candidateService } = genesis;

let relEvals = 0;
let relHits = 0;
let uEvals = 0;
let uFragments = 0;
let importanceUpdates = 0;
let recallRebuilds = 0;

for (const rule of relationshipRules) {
  const real = rule.evaluate.bind(rule);
  rule.evaluate = ((a: never, b: never) => {
    relEvals += 1;
    const out = real(a, b);
    if (out.detected) relHits += 1;
    return out;
  }) as typeof rule.evaluate;
}
for (const rule of understandingRules) {
  const real = rule.evaluate.bind(rule);
  rule.evaluate = ((m: never, s: never) => {
    uEvals += 1;
    const out = real(m, s);
    uFragments += out.length;
    return out;
  }) as typeof rule.evaluate;
}
const realImportance = importanceService.updateImportance.bind(importanceService);
importanceService.updateImportance = ((...a: never[]) => {
  importanceUpdates += 1;
  return (realImportance as (...x: never[]) => unknown)(...a);
}) as typeof importanceService.updateImportance;

const realRecall = recallBuilder.rebuildRecallCandidates.bind(recallBuilder);
recallBuilder.rebuildRecallCandidates = ((ctx?: never) => {
  recallRebuilds += 1;
  return realRecall(ctx);
}) as typeof recallBuilder.rebuildRecallCandidates;

function reset(): void {
  relEvals = relHits = uEvals = uFragments = importanceUpdates = recallRebuilds = 0;
}

function freshWorkspace(): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  recallService.clearHistory();
  // Registers the recall flusher. Outside a test this happens in
  // `contextStateService.bootstrap()`, so without it recall never runs and the
  // rebuild count reads a misleading zero.
  recallBuilder.initialize();
}

let seq = 0;

/** Exactly the shape `routes/chat.tsx:681` publishes. */
function chatMessage(text?: string, projectId?: string): void {
  eventService.record(
    "note_created",
    "Workspace Interaction",
    `User query submitted to AKIRA: "${text ?? `thing ${seq++}`}"`,
    projectId,
  );
}

function completeTask(projectId: string): void {
  const title = `cost-${seq++}`;
  akira.addTaskDetails({ title, projectId });
  const t = akira.getState().tasks.find((x) => x.title === title);
  if (t) akira.toggleTask(t.id);
}

const isChat = (description: string) => description.startsWith("User query submitted");

describe("cost of one raw chat message", () => {
  it("scans everything and detects nothing", () => {
    freshWorkspace();
    akira.addProject({ name: "Cost" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 100; i++) completeTask(pid);
    for (let i = 0; i < 50; i++) chatMessage();

    reset();
    chatMessage();
    const noProject = { relEvals, relHits, uEvals, uFragments, recallRebuilds };

    reset();
    chatMessage(undefined, pid);
    const withProject = { relEvals, relHits };

    console.log(
      `\nONE CHAT MESSAGE at ${memoryService.getMemories().length} memories\n` +
        `    relationship rule evaluations      ${noProject.relEvals}\n` +
        `    of which detected                  ${noProject.relHits}\n` +
        `    understanding rule evaluations     ${noProject.uEvals} (fragments ${noProject.uFragments})\n` +
        `    recall rebuilds                    ${noProject.recallRebuilds}\n` +
        `\n  ...and inside an active project session:\n` +
        `    relationship rule evaluations      ${withProject.relEvals}\n` +
        `    of which detected                  ${withProject.relHits}\n` +
        `\n  The zero-output case is the expensive one: detectRelationships applies\n` +
        `  its per-memory bound at creation and stops early once it holds 8. A\n` +
        `  chat message with no project can never detect anything -- all four\n` +
        `  rules require a matching relatedProjectId or relatedNoteId, and it has\n` +
        `  neither -- so it never stops early and scans the whole comparison set.`,
    );
  });

  it("recalculates importance for the whole reflections arc, up to its cap", () => {
    freshWorkspace();
    akira.addProject({ name: "Scale" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 20; i++) completeTask(pid);

    console.log(`\nIMPORTANCE RECALCULATIONS PER NEW CHAT MESSAGE`);
    for (const milestone of [0, 50, 100, 200, 400]) {
      while (memoryService.getMemories().filter((m) => isChat(m.description)).length < milestone) {
        chatMessage();
      }
      reset();
      chatMessage();
      console.log(`    after ${String(milestone).padStart(3)} accumulated: ${importanceUpdates}`);
    }
    console.log(
      `  Linear in accumulated chat until maxMemoriesPerStory ` +
        `(${getRetentionPolicy().maxMemoriesPerStory}), then flat.`,
    );
  });
});

describe("counterfactual: same knowledge, chat present or absent", () => {
  function build(withChat: boolean): void {
    freshWorkspace();
    akira.addProject({ name: "CF" });
    const pid = akira.getState().lastProjectId as string;
    akira.addNote({ content: "I want to become a pilot and build an aviation company." });
    for (let i = 0; i < 50; i++) {
      completeTask(pid);
      if (withChat) for (let j = 0; j < 4; j++) chatMessage();
    }
  }

  it("costs 12x the replay work for the same underlying knowledge", () => {
    for (const withChat of [false, true]) {
      build(withChat);
      const events = akira.getState().memories.length;
      const bytes = JSON.stringify(akira.getState().memories).length;
      reset();
      memoryService.reconstructRuntimeMemory();
      console.log(
        `\n  chat ${withChat ? "PRESENT" : "ABSENT "}: ` +
          `durableEvents=${String(events).padStart(3)} bytes=${String(bytes).padStart(6)} ` +
          `memories=${String(memoryService.getMemories().length).padStart(3)} ` +
          `relationshipRuleEvalsOnReplay=${relEvals}`,
      );
    }
  });

  it("and roughly 4x the wall clock, interleaved", () => {
    const A: number[] = [];
    const B: number[] = [];
    for (let r = 0; r < 5; r++) {
      build(false);
      let t = performance.now();
      memoryService.reconstructRuntimeMemory();
      A.push(performance.now() - t);
      build(true);
      t = performance.now();
      memoryService.reconstructRuntimeMemory();
      B.push(performance.now() - t);
    }
    const med = (x: number[]) => [...x].sort((a, b) => a - b)[Math.floor(x.length / 2)];
    console.log(
      `\nRECONSTRUCTION WALL CLOCK (median of 5, interleaved)\n` +
        `    chat ABSENT : ${med(A).toFixed(1)} ms  raw ${A.map((n) => n.toFixed(0)).join(",")}\n` +
        `    chat PRESENT: ${med(B).toFixed(1)} ms  raw ${B.map((n) => n.toFixed(0)).join(",")}\n` +
        `    ratio       : ${(med(B) / med(A)).toFixed(1)}x\n` +
        `  Reported as a ratio between arms whose ranges do not overlap, because\n` +
        `  absolute latency on this machine varies ~3x across processes.`,
    );
  });
});

describe("what chat produces, and what it displaces", () => {
  it("produces nothing in any derived subsystem", () => {
    freshWorkspace();
    akira.addProject({ name: "Out" });
    const pid = akira.getState().lastProjectId as string;
    akira.addNote({ content: "I want to become a pilot and build an aviation company." });
    for (let i = 0; i < 20; i++) completeTask(pid);
    for (let i = 0; i < 60; i++) chatMessage();

    const chatIds = new Set(
      memoryService
        .getMemories()
        .filter((m) => isChat(m.description))
        .map((m) => m.id),
    );
    const graph = understandingEngine.getUnderstandings();
    recallBuilder.rebuildRecallCandidates("BOOTSTRAP");

    console.log(
      `\n${chatIds.size} CHAT MEMORIES CONTRIBUTE\n` +
        `    understandings supported     ${
          graph.filter((u) => u.supportingMemoryIds.some((id) => chatIds.has(id))).length
        } of ${graph.length}\n` +
        `    relationships participated   ${
          relationshipService
            .getRelationships()
            .filter((r) => chatIds.has(r.sourceMemoryId) || chatIds.has(r.targetMemoryId)).length
        }\n` +
        `    active recall candidates     ${
          recallService
            .getRecallCandidates()
            .filter((c) => c.status === "Active" && chatIds.has(c.memoryId)).length
        }`,
    );
  });

  it("evicts every captured note from the reflections arc", () => {
    freshWorkspace();
    const noteMemIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = akira.addNote({ title: `keep ${i}`, content: `a thought I captured ${i}` });
      const m = memoryService.getMemories().find((x) => x.relatedNoteId === id);
      if (m) noteMemIds.push(m.id);
    }
    const cap = getRetentionPolicy().maxMemoriesPerStory;
    for (let i = 0; i < cap + 20; i++) chatMessage();

    const arc = storyService.getStories().find((s) => s.kind === "Reflections")!;
    const notesInArc = noteMemIds.filter((id) => arc.relatedMemoryIds.includes(id)).length;
    recallBuilder.rebuildRecallCandidates("BOOTSTRAP");
    const cands = recallService.getRecallCandidates();

    console.log(
      `\nREFLECTIONS ARC (cap ${cap}) after ${cap + 20} chat messages\n` +
        `    captured notes still in the arc   ${notesInArc} of ${noteMemIds.length}\n` +
        `    arc seats held by chat            ${
          arc.relatedMemoryIds.length - notesInArc
        } of ${arc.relatedMemoryIds.length}\n` +
        `    notes still recalled at BOOTSTRAP ${
          noteMemIds.filter((id) => cands.some((c) => c.memoryId === id && c.status === "Active"))
            .length
        } of ${noteMemIds.length}   <- the authorship stability floor does not\n` +
        `                                          depend on story membership\n` +
        `    notes keeping Story Influence     ${
          noteMemIds.filter((id) =>
            (importanceService.getImportance(id)?.signals ?? []).some(
              (s) => s.type === "Story Influence",
            ),
          ).length
        } of ${noteMemIds.length}   <- stale: importance is not recalculated\n` +
        `                                          when a memory leaves a story`,
    );
  });

  it("option B relocates the eviction rather than removing it", () => {
    // A proxy, stated as one: the pressure is applied with task completions
    // rather than with chat, so what this demonstrates is that the Episodic
    // class has no internal protection either. That is the claim B rests on.
    resetRetentionPolicy();
    setRetentionPolicy({ maxMemories: 40 });
    freshWorkspace();
    akira.addProject({ name: "B" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 20; i++) completeTask(pid);
    const founding = memoryService
      .getMemories()
      .filter((m) => m.eventType === "task_completed")
      .map((m) => m.id);
    for (let i = 0; i < 100; i++) completeTask(pid);

    const alive = new Set(memoryService.getMemories().map((m) => m.id));
    console.log(
      `\nOPTION B, Episodic cap ${getRetentionPolicy().maxMemories}\n` +
        `    founding task memories        ${founding.length}\n` +
        `    surviving 100 events later    ${founding.filter((id) => alive.has(id)).length}`,
    );
    resetRetentionPolicy();
  });
});

describe("the dependency that option C has to replace", () => {
  it("a declaration typed into chat reaches identity, via the Memory", () => {
    freshWorkspace();
    // `parseDeclaration` matches "i want to become ", not a bare "i want to ".
    // Phrasing it wrongly makes this print nothing and reads as "chat cannot
    // reach identity", which is false and would remove the main obstacle to C.
    chatMessage("I want to become a pilot");

    const mem = memoryService.getMemories().find((m) => m.description.includes("become a pilot"));
    const id = identityService.getIdentity();
    console.log(
      `\nDECLARATION VIA CHAT\n` +
        `    memory.description   ${JSON.stringify(mem?.description)}\n` +
        `    goal fragments       ${JSON.stringify(
          understandingEngine
            .getUnderstandings()
            .filter((u) => u.canonicalKey.startsWith("goal:"))
            .map((u) => u.canonicalKey),
        )}\n` +
        `    supported by it      ${understandingEngine
          .getUnderstandings()
          .some((u) => mem && u.supportingMemoryIds.includes(mem.id))}\n` +
        `    identity goals       ${JSON.stringify(
          id ? identityService.getGoals(id.id).map((g) => g.title) : [],
        )}\n` +
        `  This path exists only because the chat message became a Memory. It is\n` +
        `  also deliberate: parseDeclaration strips four "User query..." prefixes,\n` +
        `  so conversation is the declaration feature's designed input surface.`,
    );
  });
});
