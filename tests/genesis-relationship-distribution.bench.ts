/**
 * Relationship type distribution: what the 8-slot budget actually spends itself on.
 *
 * A diagnostic, not a benchmark and not an assertion. `detectRelationships`
 * gives every memory a budget of `maxRelationshipsPerMemory` links and fills it
 * by walking peers newest-first, evaluating all four rules against each peer
 * and stopping once the budget is gone. The four rules do not compete on equal
 * terms:
 *
 *   Project Membership  matches ANY two memories sharing a project
 *   Activity Sequence   matches two "Repeated Activity" memories in a project
 *   Milestone Causality matches a completion milestone and a creation milestone
 *   Cross-Reference     matches two memories sharing a note
 *
 * The first is satisfied by nearly every recent peer in an active project, so
 * the budget is spent by proximity before a rule with a distant-but-meaningful
 * peer is ever asked about it. This measures whether that is happening, how
 * often, and how far away the missed peer was -- so a budgeting decision can be
 * made on distances and counts rather than on the plausibility of the story.
 *
 * Deliberately reports counts, not timings. Named `.bench.ts` so the default
 * suite cannot collect it.
 *
 * Run: npx vitest run --config vitest.bench.config.ts
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { EOL, tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Defaults into the OS temp dir so a plain run leaves the working tree clean --
 * two sessions share this tree and an untracked report file in the repo root
 * shows up in the other session's `git status`. Override with AKIRA_PROBE_OUT.
 */
const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "akira-relationship-distribution.txt");
writeFileSync(REPORT, "");
const log = (...parts: string[]) => appendFileSync(REPORT, parts.join(" ") + EOL);

import type { AkiraState } from "../src/shared/types/store-types";
import type { Memory } from "../src/genesis/validation/types";
import type { RelationshipType } from "../src/genesis/memory/relationships/types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } = await import(
  "../src/genesis/memory/relationships/relationship-service"
);
const { relationshipRules } = await import(
  "../src/genesis/memory/relationships/relationship-rules"
);
const { getRetentionPolicy, resetRetentionPolicy } = await import("../src/genesis/retention/policy");

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

function newProject(name: string): string {
  akira.addProject({ name });
  return akira.getState().lastProjectId as string;
}

/** Type histogram over every retained relationship. */
function typeHistogram(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const link of relationshipService.getRelationships()) {
    counts[link.type] = (counts[link.type] ?? 0) + 1;
  }
  return counts;
}

/** How many distinct memories hold at least one relationship of each type. */
function coverageByType(): Record<string, number> {
  const seen: Record<string, Set<string>> = {};
  for (const link of relationshipService.getRelationships()) {
    (seen[link.type] ??= new Set()).add(link.sourceMemoryId);
    seen[link.type].add(link.targetMemoryId);
  }
  const out: Record<string, number> = {};
  for (const [type, ids] of Object.entries(seen)) out[type] = ids.size;
  return out;
}

/**
 * Replays the creation walk for one memory against the memory set as it stands,
 * without creating anything.
 *
 * Reports, for each rule that would have matched, the peer distance at which it
 * first matched -- distance measured in peers stepped, newest-first, exactly as
 * `detectRelationships` walks -- and how many budget slots had been consumed by
 * the time the walk reached it. A rule whose first match sits beyond the point
 * the budget runs out is crowded out, and by how far is the number that decides
 * whether a reservation would help.
 */
function simulateWalk(memory: Memory, allMemories: Memory[], budget: number) {
  const firstMatchAt: Partial<Record<RelationshipType, number>> = {};
  const slotsSpentWhenReached: Partial<Record<RelationshipType, number>> = {};
  const spentByType: Record<string, number> = {};
  let spent = 0;
  let stoppedAt: number | null = null;
  let stepped = 0;

  for (let i = allMemories.length - 1; i >= 0; i--) {
    const existing = allMemories[i];
    if (existing.id === memory.id) continue;
    stepped += 1;

    for (const rule of relationshipRules) {
      const result = rule.evaluate(memory, existing);
      if (!result.detected || !result.type) continue;

      if (firstMatchAt[result.type] === undefined) {
        firstMatchAt[result.type] = stepped;
        slotsSpentWhenReached[result.type] = spent;
      }
      // Only count against the budget while the budget still exists, so the
      // walk keeps reporting later matches that the real loop would refuse.
      if (spent < budget) {
        spent += 1;
        spentByType[result.type] = (spentByType[result.type] ?? 0) + 1;
        if (spent >= budget && stoppedAt === null) stoppedAt = stepped;
      }
    }
  }

  return { firstMatchAt, slotsSpentWhenReached, spentByType, stoppedAt, stepped };
}

function report(label: string) {
  const memories = memoryService.getMemories();
  const budget = getRetentionPolicy().maxRelationshipsPerMemory;

  log(`\n=== ${label} ===`);
  log(`memories ${memories.length}   budget ${budget}`);
  log("created by type   ", JSON.stringify(typeHistogram()));
  log("memories covered  ", JSON.stringify(coverageByType()));

  // Milestone memories are where Caused By lives; report each one's walk.
  const milestones = memories.filter((m) => m.reason === "Milestone");
  const completions = milestones.filter(
    (m) =>
      m.explanation.toLowerCase().includes("completed") ||
      m.explanation.toLowerCase().includes("100%"),
  );

  log(`milestones ${milestones.length}, of which completions ${completions.length}`);

  let crowdedOut = 0;
  let fired = 0;
  const distances: number[] = [];

  for (const completion of completions) {
    const walk = simulateWalk(completion, memories, budget);
    const causalAt = walk.firstMatchAt["Caused By"];
    if (causalAt === undefined) continue;

    distances.push(causalAt);
    const slots = walk.slotsSpentWhenReached["Caused By"] ?? 0;
    if (slots >= budget) crowdedOut += 1;
    else fired += 1;
  }

  log(
    `Caused By opportunities ${distances.length}: fired ${fired}, crowded out ${crowdedOut}`,
  );
  if (distances.length > 0) {
    distances.sort((a, b) => a - b);
    const median = distances[Math.floor(distances.length / 2)];
    log(
      `  peer distance to the causal partner: min ${distances[0]}, median ${median}, max ${distances[distances.length - 1]}`,
    );
  }

  // What the budget was actually spent on, for one representative completion.
  if (completions.length > 0) {
    const sample = completions[completions.length - 1];
    const walk = simulateWalk(sample, memories, budget);
    log(`  sample completion spend: ${JSON.stringify(walk.spentByType)}`);
    log(
      `  budget exhausted after stepping ${walk.stoppedAt ?? "never"} peers of ${walk.stepped}`,
    );
    const cost = evaluationCost(sample, memories, budget);
    log(
      `  rule.evaluate calls for that one memory: today ${cost.today}, ` +
        `reserved ${cost.reserved}, prefiltered ${cost.prefiltered}`,
    );
  }

  // Whole-workload evaluation cost, summed over every memory's detection.
  let totals = { today: 0, reserved: 0, prefiltered: 0 };
  for (let n = 0; n < memories.length; n++) {
    const c = evaluationCost(memories[n], memories.slice(0, n), budget);
    totals = {
      today: totals.today + c.today,
      reserved: totals.reserved + c.reserved,
      prefiltered: totals.prefiltered + c.prefiltered,
    };
  }
  log(
    `  whole-workload rule.evaluate calls: today ${totals.today}, ` +
      `reserved ${totals.reserved} (${(totals.reserved / Math.max(1, totals.today)).toFixed(2)}x), ` +
      `prefiltered ${totals.prefiltered} (${(totals.prefiltered / Math.max(1, totals.today)).toFixed(2)}x)`,
  );
}

/**
 * Rule-evaluation cost of the three candidate designs, as deterministic counts.
 *
 * Timing is not usable on this machine (see the measurement notes: ~3x run to
 * run on identical code), so the comparison is the count of `rule.evaluate`
 * calls one memory's detection would make. That is exactly proportional to the
 * work and is immune to load.
 *
 *   today        stop evaluating once the shared budget is spent
 *   reserved     keep evaluating the reserved rule across the whole remaining walk
 *   prefiltered  ask the reserved rule only about peers that could possibly match
 */
function evaluationCost(memory: Memory, allMemories: Memory[], budget: number) {
  let today = 0;
  let reserved = 0;
  let prefiltered = 0;
  let spent = 0;

  for (let i = allMemories.length - 1; i >= 0; i--) {
    const existing = allMemories[i];
    if (existing.id === memory.id) continue;

    const budgetLeft = spent < budget;
    if (budgetLeft) today += relationshipRules.length;
    // A reservation keeps one rule live for the entire walk.
    reserved += budgetLeft ? relationshipRules.length : 1;
    // Pre-filtering asks it only where a match is structurally possible.
    prefiltered += budgetLeft ? relationshipRules.length : 0;
    if (!budgetLeft && existing.reason === "Milestone" && memory.reason === "Milestone") {
      prefiltered += 1;
    }

    if (budgetLeft) {
      for (const rule of relationshipRules) {
        const r = rule.evaluate(memory, existing);
        if (r.detected && r.type && spent < budget) spent += 1;
      }
    }
  }

  return { today, reserved, prefiltered };
}

describe("relationship type distribution", () => {
  it("shape A: single project, create then complete, few tasks", () => {
    resetRetentionPolicy();
    freshWorkspace();

    const pid = newProject("Shape A");
    for (let i = 0; i < 3; i++) completeTask(pid, `a-${i}`);
    akira.updateProject(pid, { progress: 100 });

    report("A  single project, 3 tasks, then completed");
  });

  it("shape B: long-running project completed after sustained work", () => {
    resetRetentionPolicy();
    freshWorkspace();

    const pid = newProject("Shape B");
    for (let i = 0; i < 40; i++) completeTask(pid, `b-${i}`);
    akira.updateProject(pid, { progress: 100 });

    report("B  single project, 40 tasks, then completed");
  });

  it("shape C: several projects worked in parallel, each completed", () => {
    resetRetentionPolicy();
    freshWorkspace();

    const pids = [0, 1, 2, 3].map((n) => newProject(`Shape C ${n}`));
    for (let round = 0; round < 8; round++) {
      for (const pid of pids) completeTask(pid, `c-${pid.slice(-4)}-${round}`);
    }
    for (const pid of pids) akira.updateProject(pid, { progress: 100 });

    report("C  4 parallel projects, 8 tasks each, all completed");
  });

  it("shape D: mixed realistic activity with notes and continued work", () => {
    resetRetentionPolicy();
    freshWorkspace();

    const pids = [0, 1, 2].map((n) => newProject(`Shape D ${n}`));
    for (let round = 0; round < 10; round++) {
      for (const pid of pids) {
        completeTask(pid, `d-${pid.slice(-4)}-${round}`);
        if (round % 3 === 0) akira.touchProject(pid);
        if (round % 4 === 0) {
          akira.addNote({ title: `note ${pid.slice(-4)}-${round}`, content: "a thought" });
        }
      }
    }
    for (const pid of pids) akira.updateProject(pid, { progress: 100 });

    report("D  3 projects, tasks + touches + notes, all completed");
  });

  it("shape E: a project completed long after its own creation scrolled away", () => {
    resetRetentionPolicy();
    freshWorkspace();

    // The case the budget is suspected to break: the creation milestone is far
    // behind, and everything nearer is a same-project task completion.
    const pid = newProject("Shape E");
    for (let i = 0; i < 120; i++) completeTask(pid, `e-${i}`);
    akira.updateProject(pid, { progress: 100 });

    report("E  single project, 120 tasks, then completed");
  });
});
