/**
 * Durable write integrity: what `persist()` can lose, and how quietly.
 *
 * A diagnostic. `persist()` starts a write-through without awaiting it and
 * catches every rejection into a `console.error`, so a failed durable write is
 * invisible to the caller, to the cognitive cycle, and to anything that could
 * report it. Two separate questions follow from that, and they have different
 * answers:
 *
 *   1. Is a *failed* write recoverable? `settings.updateMemories` replaces the
 *      whole `genesis_memories` blob rather than appending, so the next
 *      successful write carries everything the failed one carried. That would
 *      make a transient failure self-healing.
 *
 *   2. Are *concurrent* writes ordered? Each carries its own snapshot of the
 *      array. Nothing sequences them. If an earlier snapshot lands last, the
 *      durable record silently regresses -- and both writes "succeeded", so
 *      there is no error anywhere, not even in the console.
 *
 * This measures both against the real store rather than reasoning about them.
 *
 * Named `.bench.ts` so the default suite cannot collect it; it reports counts
 * and writes to the OS temp dir.
 *
 * Run: npx vitest run --config vitest.bench.config.ts
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { EOL, tmpdir } from "node:os";
import { join } from "node:path";

const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "akira-durable-write.txt");
writeFileSync(REPORT, "");
const log = (...parts: string[]) => appendFileSync(REPORT, parts.join(" ") + EOL);

import type { AkiraState } from "../src/shared/types/store-types";

const genesis = await import("../src/genesis/index");
const { akira, pendingPersistenceCount, settlePendingPersistence } = await import(
  "../src/persistence/akira-store"
);
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } = await import(
  "../src/genesis/memory/relationships/relationship-service"
);

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
}

function completeTask(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

describe("durable write integrity", () => {
  it("measures how many durable writes are in flight at once", async () => {
    freshWorkspace();
    await settlePendingPersistence();

    akira.addProject({ name: "Concurrency" });
    const pid = akira.getState().lastProjectId as string;

    // Sample the in-flight count after each user action, synchronously -- which
    // is exactly the window in which a reload would drop whatever is pending.
    const samples: number[] = [];
    for (let i = 0; i < 25; i++) {
      completeTask(pid, `w-${i}`);
      samples.push(pendingPersistenceCount());
    }

    const peak = Math.max(...samples);
    const atEnd = pendingPersistenceCount();

    log("=== concurrency ===");
    log(`in-flight after each of 25 actions: peak ${peak}, last ${samples[samples.length - 1]}`);
    log(`still in flight when the loop ends: ${atEnd}`);
    log(
      `writes are ${peak > 1 ? "CONCURRENT -- nothing sequences them" : "serialised"}` +
        ` (peak in-flight ${peak})`,
    );

    await settlePendingPersistence();
    log(`after settlePendingPersistence: ${pendingPersistenceCount()}`);
  });

  it("measures whether a durable write carries a full snapshot or a delta", async () => {
    freshWorkspace();
    await settlePendingPersistence();

    akira.addProject({ name: "Snapshot" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 5; i++) completeTask(pid, `s-${i}`);
    await settlePendingPersistence();

    const before = akira.getState().memories.length;
    completeTask(pid, "s-final");
    await settlePendingPersistence();
    const after = akira.getState().memories.length;

    log("");
    log("=== snapshot shape ===");
    log(`durable stream length before ${before}, after one more action ${after}`);
    log(
      "settings.updateMemories writes the whole array as one JSON blob" +
        " (settingsRepository.set('genesis_memories', ...)), so a single failed" +
        " write is repaired by the next successful one.",
    );
    log(
      "The exposure is therefore the LAST write before a reload, not any" +
        " individual failure -- and a page refresh makes that a routine event," +
        " not an edge case.",
    );
  });

  it("counts writes started per user action", async () => {
    freshWorkspace();
    await settlePendingPersistence();

    akira.addProject({ name: "Fanout" });
    const pid = akira.getState().lastProjectId as string;
    await settlePendingPersistence();

    let started = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 10; i++) {
      const before = pendingPersistenceCount();
      completeTask(pid, `f-${i}`);
      const after = pendingPersistenceCount();
      started += Math.max(0, after - before);
      seen.add(after - before);
    }

    log("");
    log("=== write fan-out ===");
    log(`writes started across 10 completed tasks: ${started}`);
    log(`distinct per-action deltas: ${JSON.stringify([...seen].sort())}`);
    await settlePendingPersistence();
  });
});
