/**
 * Text-keyed decisions: what breaks when prose is the source of truth.
 *
 * A sweep diagnostic. Several cognitive decisions in GENESIS are keyed on
 * generated, human-readable text rather than on a structured field. The known
 * three were `Caused By` reading `explanation`, `inclusionReason` matching
 * `recallReasons`, and the `"Personal Growth Reflections"` title literal shared
 * by story, recall and identity rules.
 *
 * The sweep found a fourth family that is larger than all three, because it
 * carries an *identifier* rather than a label. `Story` has no structured
 * project reference:
 *
 *   type Story = { id, title, summary, status, relatedMemoryIds,
 *                  ruleProvenance, createdAt, updatedAt }
 *
 * so the project a narrative arc belongs to exists only inside a sentence:
 *
 *   summary: `...for Project ID: ${memory.relatedProjectId}.`
 *
 * and is read back out by substring match (`story-rules.ts:33`) and by regex
 * (`understanding/rules.ts:57`). The arc's title is separately derived from the
 * *memory* title, `Project Arc: ${memory.title.split(":")[0]}`.
 *
 * This measures the observable consequences of both, so the report classifies
 * on evidence rather than on reading. Nothing here asserts; it records.
 *
 * Named `.bench.ts` so the default suite cannot collect it.
 *
 * Run: npx vitest run --config vitest.bench.config.ts
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { EOL, tmpdir } from "node:os";
import { join } from "node:path";

const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "akira-text-keyed.txt");
writeFileSync(REPORT, "");
const log = (...parts: string[]) => appendFileSync(REPORT, parts.join(" ") + EOL);

import type { AkiraState } from "../src/shared/types/store-types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { projectRule } = await import("../src/genesis/understanding/rules");

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  recallService.clearHistory();
}

function completeTask(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

function buildThreeDistinctProjects() {
  const names = ["Aurora Compiler", "Basalt Ledger", "Cinder Telemetry"];
  const ids: string[] = [];
  for (const name of names) {
    akira.addProject({ name });
    const pid = akira.getState().lastProjectId as string;
    ids.push(pid);
    for (let i = 0; i < 4; i++) completeTask(pid, `${name.slice(0, 3)}-${i}`);
  }
  return { names, ids };
}

describe("text-keyed decisions", () => {
  it("F1: does the project arc title distinguish one project from another", () => {
    freshWorkspace();
    const { names, ids } = buildThreeDistinctProjects();

    const arcs = storyService.getStories().filter((s) => s.title.startsWith("Project Arc:"));

    log("=== F1  arc titles ===");
    log(`projects created: ${JSON.stringify(names)}`);
    log(`project arcs: ${arcs.length}`);
    for (const arc of arcs) {
      log(`  title ${JSON.stringify(arc.title)}`);
    }
    const distinctTitles = new Set(arcs.map((a) => a.title));
    log(`distinct arc titles: ${distinctTitles.size} for ${arcs.length} arcs`);
    log(
      `does any arc title contain its project's name? ` +
        `${arcs.some((a) => names.some((n) => a.title.includes(n))) ? "yes" : "NO"}`,
    );

    // The summary is where the identifier actually lives.
    log(
      `arcs whose summary carries the project id: ` +
        `${arcs.filter((a) => ids.some((id) => a.summary.includes(id))).length} of ${arcs.length}`,
    );
  });

  it("F2: what the prompt is told the user's goals are", () => {
    freshWorkspace();
    buildThreeDistinctProjects();

    // context-rules.ts:75-77 derives goal text from the arc title.
    // Mirrors context-rules.ts:75-77 exactly.
    const derivedGoals = storyService
      .getStories()
      .filter((s) => s.status === "Active" && s.title.startsWith("Project Arc:"))
      .map((s) => `Complete Project Arc: ${s.title.replace("Project Arc:", "").trim()}`);

    log("");
    log("=== F2  goals derived from arc titles ===");
    log(`goals the prompt would carry: ${JSON.stringify(derivedGoals)}`);
    log(`distinct goals: ${new Set(derivedGoals).size} for ${derivedGoals.length} projects`);
  });

  it("F3: does the understanding graph recover the right project ids", () => {
    freshWorkspace();
    const { ids } = buildThreeDistinctProjects();

    // `understanding/rules.ts` recovers a project id from the arc summary by
    // regex and puts it straight into the canonical key.
    const keys = understandingEngine
      .getUnderstandings()
      .filter((u) => u.category === "Project")
      .map((u) => u.canonicalKey);

    log("");
    log("=== F3  project ids recovered from the summary regex ===");
    log(`real project ids:    ${JSON.stringify(ids)}`);
    log(`Project canonicalKeys: ${JSON.stringify(keys)}`);
    const recovered = keys.filter((k) => ids.some((id) => k === `project:${id}`)).length;
    log(`keys naming a real project id: ${recovered} of ${keys.length}`);
    const bogus = keys.filter((k) => !ids.some((id) => k === `project:${id}`));
    if (bogus.length > 0) log(`keys naming something else:    ${JSON.stringify(bogus)}`);
  });

  it("F4: what the identity rule computes as the project name", () => {
    freshWorkspace();
    const { names } = buildThreeDistinctProjects();

    // identity-rules.ts:58 strips the prefix off the arc title to get a name.
    const derived = storyService
      .getStories()
      .filter((s) => s.title.startsWith("Project Arc:"))
      .map((s) => s.title.replace("Project Arc:", "").trim());

    log("");
    log("=== F4  project name the identity rule would match hypotheses against ===");
    log(`real project names: ${JSON.stringify(names)}`);
    log(`derived names:      ${JSON.stringify(derived)}`);
    log(
      `derived name matches a real project: ` +
        `${derived.filter((d) => names.some((n) => n.toLowerCase() === d.toLowerCase())).length}` +
        ` of ${derived.length}`,
    );
  });

  it("F6: can one subsystem's identifier be read as another's", () => {
    freshWorkspace();
    const { ids } = buildThreeDistinctProjects();

    // `understanding/rules.ts:57-58` tries the specific pattern first and then
    // falls back to a bare /ID:\s*(...)/i over EVERY story's summary -- not
    // only project arcs. Five sibling rules in the same file already expect
    // "Goal ID:", "Knowledge ID:", "Habit ID:", "Relationship ID:" and
    // "Preference Key:" in that same field, so the fallback is one summary
    // sentence away from claiming another subsystem's identifier.
    const foreign = storyService.createStory({
      title: "Some Other Arc",
      summary: "Narrative tracking progress for Goal ID: goal-abc-123.",
      status: "Active",
      ruleProvenance: "probe",
    });

    // The rule is asked directly rather than through the engine: a workload
    // that produces nothing cannot distinguish "cannot happen" from "did not
    // happen this time", which is the mistake that hid three earlier defects.
    const keys = projectRule
      .evaluate(memoryService.getMemories(), storyService.getStories())
      .map((f) => f.canonicalKey);

    log("");
    log("=== F6  cross-subsystem identifier contamination ===");
    log(`real project ids:      ${ids.length}`);
    log(`Project canonicalKeys: ${JSON.stringify(keys)}`);
    const bogus = keys.filter((k) => !ids.some((id) => k === `project:${id}`));
    log(`keys not naming a real project: ${JSON.stringify(bogus)}`);
    log(
      `a Goal ID was claimed as a Project: ` +
        `${bogus.some((k) => k.includes("goal-abc-123")) ? "YES" : "no"}`,
    );

    // And what the store can produce today, as opposed to what it could.
    const summaries = storyService.getStories().map((st) => st.summary);
    const withBareId = summaries.filter(
      (sm) => /ID:\s*[a-zA-Z0-9-]+/i.test(sm) && !/Project ID:/i.test(sm),
    );
    log(
      `stories with a bare "ID:" but no "Project ID:" in a real workload: ` +
        `${withBareId.length - 1} (excluding the one this probe injected)`,
    );

    storyService.updateStory(foreign.id, { relatedMemoryIds: [] });
  });

  it("F5: survives reconstruction, and repeated reconstruction", () => {
    freshWorkspace();
    buildThreeDistinctProjects();

    const before = storyService
      .getStories()
      .filter((s) => s.title.startsWith("Project Arc:"))
      .map((s) => `${s.title}|${s.summary}`)
      .sort();

    memoryService.reconstructRuntimeMemory();
    const once = storyService
      .getStories()
      .filter((s) => s.title.startsWith("Project Arc:"))
      .map((s) => `${s.title}|${s.summary}`)
      .sort();

    memoryService.reconstructRuntimeMemory();
    const twice = storyService
      .getStories()
      .filter((s) => s.title.startsWith("Project Arc:"))
      .map((s) => `${s.title}|${s.summary}`)
      .sort();

    log("");
    log("=== F5  reconstruction ===");
    log(
      `arcs live ${before.length}, after replay ${once.length}, after replay twice ${twice.length}`,
    );
    log(`live === replayed: ${JSON.stringify(before) === JSON.stringify(once)}`);
    log(`replayed idempotent: ${JSON.stringify(once) === JSON.stringify(twice)}`);
  });
});
