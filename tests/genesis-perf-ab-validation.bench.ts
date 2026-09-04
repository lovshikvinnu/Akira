/**
 * Validates `tests/support/perf-ab.ts` against the two cases it must handle:
 * a null (it must refuse to report) and a known injected cost (it must report).
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { interleavedAB, describeAB } from "./support/perf-ab";

const OUT: string[] = [];
const say = (l: string): void => {
  OUT.push(l);
};

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");

recallBuilder.initialize();

let sequence = 0;
let projectId = "";

function completeTask(): void {
  const title = `vh-task-${sequence++}`;
  akira.addTaskDetails({ title, projectId });
  const t = akira.getState().tasks.find((x) => x.title === title);
  if (!t) throw new Error("no task");
  akira.toggleTask(t.id);
}

let sink = 0;

describe("perf-ab helper validation", () => {
  it("refuses a null and reports an injected cost", () => {
    akira.addProject({ name: "Helper Validation" });
    projectId = akira.getState().lastProjectId as string;
    akira.addTaskDetails({ title: `vh-pending-${sequence++}`, projectId });
    akira.addTaskDetails({ title: `vh-pending-${sequence++}`, projectId });

    let guard = 0;
    while (memoryService.getMemories().length < 500 && guard++ < 4000) completeTask();
    akira.addChatMessage("user", "What vh-task work is outstanding on this project?");
    const memories = memoryService.getMemories();
    say(`memories=${memories.length}`);

    // --- NULL: both arms identical. Must come back NOT REPORTABLE. ---
    const nullResult = interleavedAB({
      armA: completeTask,
      armB: completeTask,
      withNullCheck: true,
    });
    say("\n" + describeAB("NULL (identical arms)", nullResult));

    // --- SIGNAL: arm B pays ~500 short string allocations. ---
    const signalResult = interleavedAB({
      armA: completeTask,
      armB: () => {
        completeTask();
        for (const m of memories) sink += `${m.title} ${m.description}`.toLowerCase().length;
      },
      withNullCheck: true,
    });
    say("\n" + describeAB("SIGNAL (arm B allocates ~500 strings)", signalResult));

    say(
      `\nVERDICT  null reportable=${nullResult.reportable} (want false)   ` +
        `signal reportable=${signalResult.reportable} (want true)`,
    );
    say(`(sink ${sink > 0 ? "non-zero" : "ZERO — injected work eliminated"})`);

    writeFileSync(
      process.env.PERF_OUT || join(tmpdir(), "validate-helper.txt"),
      OUT.join("\n"),
      "utf-8",
    );
  }, 900_000);
});
