process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";
import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { EOL, tmpdir } from "node:os";
import { join } from "node:path";
const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "c3-conf.txt");
writeFileSync(REPORT, "");
const log = (...p: string[]) => appendFileSync(REPORT, p.join(" ") + EOL);
import type { AkiraState } from "../src/shared/types/store-types";
const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { identityService } = await import("../src/genesis/understanding/identity-service");
const { identityBuilder } = await import("../src/genesis/understanding/identity-builder");
const { eventService } = await import("../src/genesis/events/event-service");
const { contextRules } = await import("../src/genesis/context/context-rules");
const graph = await import("../src/genesis/identity");
const { resetRetentionPolicy } = await import("../src/genesis/retention/policy");

function fresh() {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  identityService.clearHistory();
}
const obs = () => identityService.getObservations();
const show = (label: string) => {
  const items = contextRules.filterIdentityObservations(obs());
  log(`  ${label}`);
  log(`    observations ${obs().length}, reaching prompt ${items.length}`);
  for (const o of obs())
    log(`      ${String(o.confidence).padEnd(5)} ${o.category.padEnd(12)} ${o.name}`);
};

describe("confidence semantics", () => {
  it("H1: the sporadic journaller -- five reflections, then two years of nothing", () => {
    resetRetentionPolicy();
    fresh();
    for (let i = 0; i < 5; i++) akira.addNote(`Reflection ${i}: a thought about how I work.`);
    identityBuilder.flushDirtyStories();
    log("=== H1  five reflections, then silence ===");
    show("immediately after writing them");
    // Nothing decays: no further input, no time term anywhere in the rule.
    log("    (no further input; nothing in the rule reads a timestamp)");
  });

  it("H2: the heavy user -- 200 reflections", () => {
    resetRetentionPolicy();
    fresh();
    for (let i = 0; i < 200; i++) akira.addNote(`Reflection ${i}: a distinct thought.`);
    identityBuilder.flushDirtyStories();
    log("");
    log("=== H2  two hundred reflections ===");
    show("after 200");
    log("    same confidence as the person who wrote five");
  });

  it("H3: the task-only user -- lots of work, no reflection", () => {
    resetRetentionPolicy();
    fresh();
    akira.addProject({ name: "Heads Down" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 40; i++) {
      const t = `hd-${i}`;
      akira.addTaskDetails({ title: t, projectId: pid });
      const task = akira.getState().tasks.find((x) => x.title === t);
      if (task) akira.toggleTask(task.id);
    }
    identityBuilder.flushDirtyStories();
    log("");
    log("=== H3  forty completed tasks, zero reflections ===");
    show("after 40 tasks");
  });

  it("D1: the same fact, scored by two different models", () => {
    resetRetentionPolicy();
    fresh();
    eventService.record(
      "declaration_captured",
      "Declaration Captured",
      "My goal is to learn Verilog",
      null,
    );
    identityBuilder.flushDirtyStories();

    const emergent = obs().find((o) => o.category === "Aspiration");
    const identity = graph.identityService.getIdentity();
    const goals = identity ? graph.identityService.getGoals(identity.id) : [];

    log("");
    log("=== D1  one declaration, two confidence systems ===");
    log(`  emergent  identityService.getObservations()`);
    log(`    ${emergent?.category}:${emergent?.name}  confidence ${emergent?.confidence}`);
    log(`  graph     identity/ IdentityConfidenceService`);
    for (const g of goals) {
      // `confidenceReference` is the graph NODE id; the goal's own id is not a
      // node and getConfidence returns null for it. Reading the wrong key here
      // would have reported "the second model is not running".
      const nodeId = (g as { confidenceReference?: string }).confidenceReference;
      const conf = nodeId ? graph.identityConfidenceService.getConfidence(nodeId) : null;
      log(`    goal "${(g as { title?: string }).title}"`);
      log(
        `      node ${nodeId ? "present" : "MISSING"}  score ${conf?.score}  level ${conf?.level}`,
      );
      log(`      ${JSON.stringify(conf?.explanation?.summary ?? "")}`);
    }
  });
});
