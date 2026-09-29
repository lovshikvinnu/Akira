process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";
import { describe, it } from "vitest";

import type { MemoryEvent } from "../src/shared/types/event-types";
import type { AkiraState } from "../src/shared/types/store-types";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { eventService } = await import("../src/genesis/events/event-service");
const { contextService } = await import("../src/genesis/context/context-service");
const { contextResolutionService } =
  await import("../src/genesis/context/context-resolution/service");
const { contextRelevanceSelector } =
  await import("../src/genesis/context/context-relevance-selector");
const { promptBuilder } = await import("../src/genesis/context/ai/prompt-builder");

const P = (k: string, v: unknown) => console.info(`>> ${String(k).padEnd(30)} ${v}`);

/** Deterministic counters: immune to the timing noise this hardware has. */
const counts = {
  getMemories: 0,
  getStories: 0,
  getCandidates: 0,
  recallSessions: 0,
  recallCandidatesBuilt: 0,
  relationshipScans: 0,
};

function instrument(): void {
  const wrap = <T extends object, K extends keyof T>(obj: T, key: K, bump: () => void) => {
    const original = obj[key] as unknown as (...a: unknown[]) => unknown;
    (obj as Record<string, unknown>)[key as string] = (...a: unknown[]) => {
      bump();
      return original.apply(obj, a);
    };
  };
  wrap(memoryService, "getMemories" as never, () => (counts.getMemories += 1));
  wrap(storyService, "getStories" as never, () => (counts.getStories += 1));
  wrap(relationshipService, "getRelationships" as never, () => (counts.relationshipScans += 1));

  const originalStart = recallService.startRecallSession.bind(recallService);
  (recallService as unknown as Record<string, unknown>).startRecallSession = (
    candidates: unknown[],
    ...rest: unknown[]
  ) => {
    counts.recallSessions += 1;
    counts.recallCandidatesBuilt += Array.isArray(candidates) ? candidates.length : 0;
    return (originalStart as (...a: unknown[]) => unknown)(candidates, ...rest);
  };
}

function reset(): void {
  for (const k of Object.keys(counts)) (counts as Record<string, number>)[k] = 0;
}

/**
 * A realistic mix: projects, completed tasks against them, and notes.
 *
 * All-notes-with-no-project produced one story and zero understandings, which
 * exercises almost none of the pipeline. Real usage ties most events to a
 * project, which is what forms arcs, relationships and understanding fragments.
 */
function seedEvents(n: number): MemoryEvent[] {
  const events: MemoryEvent[] = [];
  const projectCount = Math.max(1, Math.round(n / 12));
  const base = Date.now() - n * 60_000;
  const at = (i: number) => new Date(base + i * 60_000).toISOString();

  for (let p = 0; p < projectCount; p++) {
    events.push({
      id: `p-${p}`,
      timestamp: at(events.length),
      eventType: "project_created",
      title: "Project Created",
      description: `Started new project: Project ${p}`,
      relatedProjectId: `proj-${p}`,
      relatedNoteId: null,
      metadata: {},
    });
  }
  let i = 0;
  while (events.length < n) {
    const p = i % projectCount;
    if (i % 3 === 2) {
      events.push({
        id: `n-${i}`,
        timestamp: at(events.length),
        eventType: "note_created",
        title: "Note Created",
        description: `Thoughts on Project ${p}: planning the next step`,
        relatedProjectId: `proj-${p}`,
        relatedNoteId: `note-${i}`,
        metadata: {},
      });
    } else {
      events.push({
        id: `t-${i}`,
        timestamp: at(events.length),
        eventType: "task_completed",
        title: "Task Completed",
        description: `Completed task: "step ${i} of Project ${p}"`,
        relatedProjectId: `proj-${p}`,
        relatedNoteId: null,
        metadata: {},
      });
    }
    i += 1;
  }
  return events.slice(0, n);
}

/** Load N memories through the real reconstruction path, then clear counters. */
function seed(n: number): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({
    ...s,
    memories: seedEvents(n),
    tasks: [],
    notes: [],
    projects: [],
    chat: [],
  });
  memoryService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  memoryService.reconstructRuntimeMemory();
  // Not in the composition manifest: `context/state/service` initializes it at
  // boot, so a benchmark that omits it misses recall entirely.
  recallBuilder.initialize();
}

describe("GENESIS per-event cost as memory count grows", () => {
  it("measures", () => {
    instrument();

    console.info(
      ">> N  | ms/event | action ms | chat ms | prompt ms | promptCh | getMemories | getStories | recallSessions | candidatesBuilt | relScans | memories | stories",
    );

    for (const n of [25, 50, 100, 150, 250, 500, 1000]) {
      seed(n);
      reset();

      // Pure cognition: one durable event through the GENESIS cascade.
      const t0 = performance.now();
      eventService.record(
        "task_completed",
        "Task Completed",
        'Completed task: "the probe task"',
        "proj-0",
        null,
        {},
      );
      const ms = performance.now() - t0;

      // The real user action: store mutation -> publish -> persistence ->
      // cognition. This is what a click costs, and it is the path the reported
      // degradation would have been felt through.
      akira.addProject({ name: "Probe Project" });
      const probeProject = akira.getState().lastProjectId as string;
      const t1 = performance.now();
      akira.addTaskDetails({ title: "probe task", projectId: probeProject });
      const probeTask = akira.getState().tasks.find((t) => t.title === "probe task");
      if (probeTask) akira.toggleTask(probeTask.id);
      const actionMs = performance.now() - t1;

      // The interactive path: the user sends a message and AKIRA assembles the
      // system instruction. This is the latency a person actually waits on.
      const t2 = performance.now();
      akira.addChatMessage("user", "what should I focus on next");
      const chatMs = performance.now() - t2;

      const t3 = performance.now();
      contextResolutionService.rebuildResolvedContext();
      const selection = contextRelevanceSelector.selectContext(
        "what should I focus on next",
        contextService.getActiveContext() ?? undefined,
        contextResolutionService.getContext(),
      );
      const instruction = promptBuilder.buildSystemInstruction(
        "what should I focus on next",
        selection,
        {
          intent: null,
          confidence: 1,
          ambiguous: false,
          clarificationRequired: false,
          candidates: [],
        },
      );
      const promptMs = performance.now() - t3;

      console.info(
        `>> ${String(n).padEnd(4)}| ${ms.toFixed(1).padStart(8)} | ${actionMs.toFixed(1).padStart(9)} | ${chatMs.toFixed(1).padStart(7)} | ${promptMs.toFixed(1).padStart(9)} | ${String(instruction.length).padStart(6)} | ${String(counts.getMemories).padStart(11)} | ` +
          `${String(counts.getStories).padStart(10)} | ${String(counts.recallSessions).padStart(14)} | ` +
          `${String(counts.recallCandidatesBuilt).padStart(15)} | ${String(counts.relationshipScans).padStart(8)} | ` +
          `${String(memoryService.getMemories().length).padStart(8)} | ${storyService.getStories().length}`,
      );
    }

    P("understandings at end", understandingEngine.getUnderstandings().length);
  });
});
