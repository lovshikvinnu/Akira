/**
 * GENESIS per-action latency baseline.
 *
 *   npx vitest run --config vitest.bench.config.ts
 *
 * WHY THIS IS NOT A `.test.ts`
 * ----------------------------
 * The default vitest `include` is `**\/*.{test,spec}.*`, which cannot match
 * `.bench.ts`, so this file is structurally invisible to `npx vitest run`. That
 * is the point. Benchmarks were repeatedly dropped into `tests/` during
 * development and each time they perturbed or broke a concurrent suite run in
 * the same working tree -- and copying one in and deleting it immediately does
 * not help, because the copy still overlaps the other run's collection phase.
 * A name the default config cannot collect is a boundary rather than a
 * convention someone has to remember.
 *
 * WHAT SHAPE THIS MEASURES, AND WHY IT IS THIS ONE
 * ------------------------------------------------
 * Three properties of the workload were each discovered to invalidate earlier
 * measurements, so each is now fixed deliberately and asserted where possible:
 *
 *   Pending buffer.  `toggleTask` publishes MISSION_COMPLETED whenever the
 *     toggle leaves every task done. A harness that creates one task and
 *     completes it empties the list every iteration, so it fires on *every*
 *     action, producing two MemoryEvents, two cognitive transactions and two
 *     memories per "one completed task" -- inflating every per-action figure by
 *     roughly 2x. Tasks that are never completed keep `allDone` false. The
 *     guard below asserts one memory per action rather than trusting it.
 *
 *   Single project.  Relationships only form between same-project memories, so
 *     creations per action scale with the acting project's size. One project at
 *     the retention ceiling is the worst case (~500 creations) and the only
 *     shape in which the relationship phase shows its real cost.
 *
 *   Populated chat.  With an empty chat the multi-factor recall rule
 *     short-circuits -- `computeSemanticRelevance` returns 0 on a blank context
 *     string -- so recall's semantic half never runs. Every benchmark taken
 *     before this was discovered understated recall by ~3.5 ms and reported the
 *     wrong phase as dominant. Two messages are enough; chat *length* costs
 *     nothing measurable (2 and 200 messages measured the same).
 *
 * READING THE OUTPUT
 * ------------------
 * Medians, not means. A parallel build on the same machine was observed to make
 * 30-sample means of identical code vary by 44% -- enough to invert the sign of
 * a 2 ms effect. Absolute numbers are only comparable within one run; across
 * runs, compare ratios between phases.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const OUT: string[] = [];
const say = (line: string): void => {
  OUT.push(line);
};

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { importanceBuilder } = await import("../src/genesis/importance/importance-builder");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { contextBuilder } = await import("../src/genesis/context/context-builder");
const { identityBuilder } = await import("../src/genesis/understanding/identity-builder");

// recallBuilder is activated by companionStateService.bootstrap() in the real
// app rather than by genesis/composition.ts, so the importance -> recall edge
// is only under measurement if it is initialised here.
recallBuilder.initialize();

// ---------------------------------------------------------------------------
// Instrumentation
// ---------------------------------------------------------------------------
type Bucket = { calls: number; ms: number };
const buckets = new Map<string, Bucket>();
let measuring = false;
let relationshipsCreated = 0;

function bucket(name: string): Bucket {
  let b = buckets.get(name);
  if (!b) buckets.set(name, (b = { calls: 0, ms: 0 }));
  return b;
}

function wrap(target: any, method: string, label: string): void {
  const original = target[method];
  if (typeof original !== "function") throw new Error(`no method "${method}" for ${label}`);
  target[method] = function (...args: any[]) {
    if (!measuring) return original.apply(this, args);
    const b = bucket(label);
    const started = performance.now();
    try {
      return original.apply(this, args);
    } finally {
      b.ms += performance.now() - started;
      b.calls++;
    }
  };
}

const detectRelationships = relationshipService.detectRelationships.bind(relationshipService);
relationshipService.detectRelationships = function (memory) {
  const detected = detectRelationships(memory);
  if (measuring) relationshipsCreated += detected.length;
  return detected;
};

wrap(relationshipService, "detectRelationships", "relationship.detectRelationships");
wrap(recallBuilder, "rebuildRecallCandidates", "recall.rebuildRecallCandidates");
wrap(importanceBuilder, "flushDirtyStories", "importance.flushDirtyStories");
wrap(importanceService, "updateImportance", "importance.updateImportance");
wrap(identityBuilder, "flushDirtyStories", "identity.flushDirtyStories");
wrap(contextBuilder, "rebuildContextPackage", "context.rebuildContextPackage");
wrap(storyService, "findStoryContainingMemory", "story.findStoryContainingMemory");
wrap(relationshipService, "getRelationshipsForMemory", "relationship.getRelationshipsForMemory");

// ---------------------------------------------------------------------------
// Workload
// ---------------------------------------------------------------------------
const PRIMING_TASKS = 620;
const SAMPLES = 80;

let sequence = 0;

function newProject(name: string): string {
  akira.addProject({ name });
  return akira.getState().lastProjectId as string;
}

/** A task that is never completed, so `allDone` can never become true. */
function addPendingTask(projectId: string): void {
  akira.addTaskDetails({ title: `bench-pending-${sequence++}`, projectId });
}

function completeTask(projectId: string): void {
  const title = `bench-task-${sequence++}`;
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

function quantiles(samples: number[]): { p25: number; median: number; p75: number; min: number } {
  const sorted = samples.slice().sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return { min: sorted[0], p25: at(0.25), median: at(0.5), p75: at(0.75) };
}

describe("GENESIS per-action latency at the retention ceiling", () => {
  it("reports the populated-chat baseline", () => {
    const projectId = newProject("Perf Baseline");
    addPendingTask(projectId);
    addPendingTask(projectId);

    // The MISSION_COMPLETED guard: one real action must produce exactly one
    // memory. Two means the buffer failed and every figure below is doubled.
    const before = memoryService.getMemories().length;
    completeTask(projectId);
    expect(memoryService.getMemories().length - before).toBe(1);

    for (let i = 0; i < PRIMING_TASKS; i++) completeTask(projectId);

    akira.addChatMessage(
      "user",
      "How is the Verilog FPGA project going and what should I work on next?",
    );
    akira.addChatMessage("akira", "Steady progress on the RISC-V core.");

    const samples: number[] = [];
    buckets.clear();
    relationshipsCreated = 0;
    measuring = true;
    for (let i = 0; i < SAMPLES; i++) {
      const started = performance.now();
      completeTask(projectId);
      samples.push(performance.now() - started);
    }
    measuring = false;

    const q = quantiles(samples);
    say("GENESIS per-action latency -- populated chat, single project, retention ceiling");
    say(
      `memories=${memoryService.getMemories().length}  ` +
        `stories=${storyService.getStories().length}  ` +
        `chat=${akira.getState().chat.length}  samples=${SAMPLES}`,
    );
    say(
      `\nmedian ${q.median.toFixed(2)} ms/completed-task   ` +
        `IQR ${q.p25.toFixed(2)}-${q.p75.toFixed(2)}   min ${q.min.toFixed(2)}`,
    );
    say(`relationships created per action: ${(relationshipsCreated / SAMPLES).toFixed(1)}`);

    say("\n--- phase attribution (inclusive) ---");
    for (const [name, b] of [...buckets.entries()].sort((a, b) => b[1].ms - a[1].ms)) {
      say(
        `${name.padEnd(44)} ${(b.ms / SAMPLES).toFixed(4).padStart(9)} ms   ` +
          `${(b.calls / SAMPLES).toFixed(0).padStart(6)} calls`,
      );
    }

    const out = process.env.PERF_OUT || join(tmpdir(), "genesis-perf-baseline.txt");
    writeFileSync(out, OUT.join("\n"), "utf-8");
    say("");
  });
});
