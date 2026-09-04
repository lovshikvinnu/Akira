/**
 * What the understanding graph holds, and whether retention reaches it.
 *
 * Two questions raised by the performance work, both landing in retention
 * rather than in recall:
 *
 *   1. `Understanding.supportingMemoryIds` has no entry in the retention
 *      policy. Every other derived store does -- memories, core memories,
 *      candidates, stories, memories per story, importance history, observation
 *      history, relationships per memory, recall sessions. This one grows with
 *      the memory count, measured at 501 and 500 elements. The question that
 *      matters is not the size but whether the ids stay live: every other
 *      derived store needed an explicit `forgetMemories` to avoid pointing at
 *      evicted memories, and this one has none.
 *
 *   2. `personalDeclarationRule` parses each memory twice -- description, then
 *      title -- and the translator sets `title` to one of seven fixed labels.
 *      If none of them can be a first-person declaration, the second call is
 *      500 wasted parses per rebuild.
 *
 * Reports counts, asserts nothing. Named `.bench.ts` so the default suite
 * cannot collect it.
 *
 * Run: npx vitest run --config vitest.bench.config.ts
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { EOL, tmpdir } from "node:os";
import { join } from "node:path";

const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "akira-understanding-refs.txt");
writeFileSync(REPORT, "");
const log = (...parts: string[]) => appendFileSync(REPORT, parts.join(" ") + EOL);

import type { AkiraState } from "../src/shared/types/store-types";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } = await import(
  "../src/genesis/memory/relationships/relationship-service"
);
const { buildUnderstandingGraph } = await import("../src/genesis/understanding/builder");
const { personalDeclarationRule } = await import("../src/genesis/understanding/rules");
const { setRetentionPolicy, resetRetentionPolicy } = await import(
  "../src/genesis/retention/policy"
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

const graph = () =>
  buildUnderstandingGraph(memoryService.getMemories(), storyService.getStories(), []);

describe("understanding graph references", () => {
  it("U1: do supporting ids survive the eviction of the memories they name", () => {
    resetRetentionPolicy();
    freshWorkspace();

    // A tight Episodic cap stands in for a long history: far more activity
    // than the runtime memory set can hold.
    setRetentionPolicy({ maxMemories: 20, maxCoreMemories: 2000 });

    akira.addProject({ name: "Eviction Pressure" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 120; i++) completeTask(pid, `ev-${i}`);

    const live = new Set(memoryService.getMemories().map((m) => m.id));
    const built = graph();

    let dangling = 0;
    let total = 0;
    let largest = 0;
    for (const u of built) {
      total += u.supportingMemoryIds.length;
      largest = Math.max(largest, u.supportingMemoryIds.length);
      for (const id of u.supportingMemoryIds) if (!live.has(id)) dangling += 1;
    }

    log("=== U1  supporting ids under eviction ===");
    log(`live memories ${live.size}, understandings ${built.length}`);
    log(`supporting ids total ${total}, largest single understanding ${largest}`);
    log(`ids naming an evicted memory: ${dangling}`);
    log(
      dangling === 0
        ? "  graph is rebuilt from live memories, so retention reaches it transitively"
        : "  DANGLING -- the graph outlives the memories it cites",
    );

    resetRetentionPolicy();
  });

  it("U2: how large the arrays get at the production ceiling", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Ceiling" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 150; i++) completeTask(pid, `c-${i}`);
    akira.addNote({ title: "a thought", content: "My goal is to ship AKIRA" });

    const built = graph();
    const sizes = built.map((u) => `${u.canonicalKey}=${u.supportingMemoryIds.length}`);

    log("");
    log("=== U2  array sizes ===");
    log(`memories ${memoryService.getMemories().length}`);
    log(`understandings ${built.length}: ${JSON.stringify(sizes)}`);
    log(
      "no retention entry bounds supportingMemoryIds; the transitive bound is" +
        " maxMemories + maxCoreMemories per understanding",
    );
  });

  it("U4: can the declaration rule fire from any store action at all", () => {
    resetRetentionPolicy();
    freshWorkspace();

    // Every plausible route a user has for stating a declaration.
    akira.addNote({ title: "My goal is to learn Verilog", content: "body text" });
    akira.addNote({ title: "note", content: "My goal is to learn Verilog" });
    akira.addNote({ title: "I want to become an aircraft pilot", content: "x" });
    akira.addNote({ title: "aspiration", content: "I aspire to run a marathon" });
    akira.addProject({ name: "My dream is to ship AKIRA" });

    const memories = memoryService.getMemories();
    const fragments = personalDeclarationRule.evaluate(memories, storyService.getStories());

    log("");
    log("=== U4  can the rule fire from a store action ===");
    log(`memories ${memories.length}`);
    for (const m of memories) {
      log(`  title ${JSON.stringify(m.title)}  description ${JSON.stringify(m.description)}`);
    }
    log(`declaration fragments: ${fragments.length} ${JSON.stringify(fragments.map((f) => f.canonicalKey))}`);

    // And the parser in isolation, to separate "the parser is broken" from
    // "nothing reaches the parser in a parseable shape".
    const direct = personalDeclarationRule.evaluate(
      [
        {
          id: "synthetic",
          title: "irrelevant",
          description: "My goal is to learn Verilog",
          reason: "Reflection Worthy",
          explanation: "",
          timestamp: new Date().toISOString(),
          eventType: "note_created",
          sourceEventId: "e",
          relatedProjectId: null,
          relatedNoteId: "n",
        } as never,
      ],
      [],
    );
    log(`parser given a bare declaration directly: ${direct.length} fragment(s) ${JSON.stringify(direct.map((f) => f.canonicalKey))}`);
  });

  it("U3: can a memory title ever be a personal declaration", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Declaration Source" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 20; i++) completeTask(pid, `d-${i}`);
    akira.addNote({ title: "aspiration", content: "My goal is to learn Verilog" });
    akira.addNote({ title: "another", content: "I want to become an aircraft pilot" });
    akira.updateProject(pid, { progress: 100 });

    const memories = memoryService.getMemories();
    const distinctTitles = [...new Set(memories.map((m) => m.title))].sort();

    // The rule is the only caller, so run it and see which field produced the
    // fragments it emits.
    const fragments = personalDeclarationRule.evaluate(memories, storyService.getStories());

    log("");
    log("=== U3  the second parse ===");
    log(`memories ${memories.length}`);
    log(`distinct memory titles: ${JSON.stringify(distinctTitles)}`);
    log(`declaration fragments produced: ${fragments.length}`);
    log(`  ${JSON.stringify(fragments.map((f) => f.canonicalKey))}`);

    // Which of those titles could a declaration parser possibly accept? Every
    // declaration pattern is a first-person prefix or suffix.
    const firstPerson = /^(my |i )|( is my )/i;
    const titlesThatCouldParse = distinctTitles.filter((t) => firstPerson.test(t));
    log(
      `titles matching any first-person declaration shape: ` +
        `${titlesThatCouldParse.length} of ${distinctTitles.length}` +
        ` ${JSON.stringify(titlesThatCouldParse)}`,
    );
    log(`parse calls per rebuild: ${memories.length * 2} (2 per memory, by construction)`);
  });
});
