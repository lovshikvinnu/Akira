/**
 * Does the AI prompt's "Reason:" label ever say anything but "Recent Recall"?
 *
 * `contextRules.filterActiveRecallCandidates` decides the label the prompt
 * shows for each recalled memory by substring-matching generated prose:
 *
 *   if (recallReasons.some(r => r.toLowerCase().includes("user intent")))
 *   else if (recallReasons.some(r => r.toLowerCase().includes("milestone")))
 *
 * `recallReasons` is assembled in `recall-builder` from exactly two rule
 * outputs -- `Associated with active narrative: "<story title>"` and
 * `Multi-factor recall [Context: ... | Intent: N | Reinforce: N]`. Neither
 * template contains the literal "user intent" or "milestone", so the two
 * branches can only fire on an accident of a story title.
 *
 * Meanwhile the same candidate carries `importanceSignals`, whose entries are
 * typed `{type: "User Intent" | "Milestone" | ...}` -- the exact facts the
 * substring match is trying to recover, available structurally on the object
 * being inspected.
 *
 * This measures which of those is true on a real workload: how the labels are
 * actually distributed, how many candidates carry the signals structurally, and
 * whether the prose ever carries them at all. That decides whether replacing
 * the match is a dead-branch repair or a semantic change to what the AI is told.
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

const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "akira-inclusion-reason.txt");
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
const { recallService } = await import("../src/genesis/recall/recall-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { contextRules } = await import("../src/genesis/context/context-rules");

recallBuilder.initialize();

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

/** The structural answer the substring match is trying to reconstruct. */
function structuralLabel(signals: { type: string }[]): string {
  if (signals.some((s) => s.type === "User Intent")) return "User Intent";
  if (signals.some((s) => s.type === "Milestone")) return "High Importance";
  return "Recent Recall";
}

function measure(label: string) {
  recallBuilder.rebuildRecallCandidates();
  const candidates = recallService.getRecallCandidates();
  const items = contextRules.filterActiveRecallCandidates(candidates);

  const shipped: Record<string, number> = {};
  const structural: Record<string, number> = {};
  let disagreements = 0;

  for (const item of items) {
    const actual = item.inclusionReason;
    const would = structuralLabel(item.data.importanceSignals);
    shipped[actual] = (shipped[actual] ?? 0) + 1;
    structural[would] = (structural[would] ?? 0) + 1;
    if (actual !== would) disagreements += 1;
  }

  // Does the prose ever carry the strings the match looks for?
  let proseUserIntent = 0;
  let proseMilestone = 0;
  for (const c of candidates) {
    const joined = c.recallReasons.join(" | ").toLowerCase();
    if (joined.includes("user intent")) proseUserIntent += 1;
    if (joined.includes("milestone")) proseMilestone += 1;
  }

  // And do the signals carry them?
  let signalUserIntent = 0;
  let signalMilestone = 0;
  for (const c of candidates) {
    if (c.importanceSignals.some((s) => s.type === "User Intent")) signalUserIntent += 1;
    if (c.importanceSignals.some((s) => s.type === "Milestone")) signalMilestone += 1;
  }

  log("");
  log(`=== ${label} ===`);
  log(`memories ${memoryService.getMemories().length}, candidates ${candidates.length}`);
  log(`items reaching the prompt: ${items.length}`);
  log(`labels actually shipped   ${JSON.stringify(shipped)}`);
  log(`labels the signals imply  ${JSON.stringify(structural)}`);
  log(`disagreements: ${disagreements} of ${items.length}`);
  log(
    `candidates whose PROSE contains the matched strings:` +
      ` "user intent" ${proseUserIntent}, "milestone" ${proseMilestone} (of ${candidates.length})`,
  );
  log(
    `candidates whose SIGNALS carry the same facts:` +
      ` User Intent ${signalUserIntent}, Milestone ${signalMilestone} (of ${candidates.length})`,
  );

  if (candidates.length > 0) {
    log(`sample recallReasons: ${JSON.stringify(candidates[0].recallReasons)}`);
  }

  // Why User Intent reads zero. The rule needs `relatedNoteId` on the memory
  // and a title without "untitled"; both halves are checked separately so a
  // zero is attributed rather than guessed at.
  const all = memoryService.getMemories();
  const withNote = all.filter((m) => m.relatedNoteId);
  const noteEligible = withNote.filter((m) => !(m.title || "").toLowerCase().includes("untitled"));
  const candidateIds = new Set(candidates.map((c) => c.memoryId));
  const eligibleAndCandidate = noteEligible.filter((m) => candidateIds.has(m.id));
  let eligibleWithSignal = 0;
  for (const m of noteEligible) {
    const imp = importanceService.getImportance(m.id);
    if (imp?.signals.some((sig) => sig.type === "User Intent")) eligibleWithSignal += 1;
  }

  log(
    `User Intent precondition: ${withNote.length} memories carry relatedNoteId, ` +
      `${noteEligible.length} also pass the title test, ` +
      `${eligibleWithSignal} actually hold the signal, ` +
      `${eligibleAndCandidate.length} of those are recall candidates`,
  );
  if (withNote.length > 0) {
    log(`  sample note-bearing memory title: ${JSON.stringify(withNote[0].title)}`);
  }
}

/**
 * The minimal comparison: two notes differing only in project attachment.
 *
 * The earlier commit attributed a free-standing note's absence from recall to
 * "no project, so no story arc". That attribution is checked here directly --
 * reason, category, story membership and each rule's verdict -- because the arc
 * may in fact exist and be suppressed rather than be missing.
 */
function reportNoteMechanism() {
  const notes = memoryService.getMemories().filter((m) => m.relatedNoteId);
  log("");
  log("=== note recall mechanism ===");
  for (const m of notes.slice(0, 2)) {
    const story = storyService.findStoryContainingMemory(m.id);
    const candidate = recallService
      .getRecallCandidates()
      .find((c) => c.memoryId === m.id);
    log(
      `  note ${JSON.stringify(m.title)} project=${m.relatedProjectId ? "set" : "null"}` +
        ` reason=${JSON.stringify(m.reason)}` +
        ` story=${story ? JSON.stringify(story.title) : "NONE"}` +
        ` candidate=${candidate ? candidate.status : "no"}`,
    );
  }
}

describe("context inclusion reason", () => {
  it("shape A: tasks only", () => {
    freshWorkspace();
    akira.addProject({ name: "Labels A" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 20; i++) completeTask(pid, `la-${i}`);
    measure("A  single project, 20 completed tasks");
  });

  it("shape B: notes, which are the User Intent source", () => {
    freshWorkspace();
    akira.addProject({ name: "Labels B" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 10; i++) {
      completeTask(pid, `lb-${i}`);
      akira.addNote({ title: `thought ${i}`, content: `something the user wrote ${i}` });
    }
    measure("B  tasks interleaved with user-authored notes");
    reportNoteMechanism();
  });

  it("shape D: notes attached to a project, vs the free-standing ones in B", () => {
    freshWorkspace();
    akira.addProject({ name: "Labels D" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 10; i++) {
      completeTask(pid, `ld-${i}`);
      // The difference from B: these notes belong to a project, so they can
      // join its story arc and be recalled through the Active Story rule.
      akira.addNote({ title: `project thought ${i}`, content: `written by the user ${i}`, projectId: pid });
    }
    measure("D  notes attached to a project");
    reportNoteMechanism();
  });

  it("shape C: milestones", () => {
    freshWorkspace();
    const pids = [0, 1, 2].map((n) => {
      akira.addProject({ name: `Labels C ${n}` });
      return akira.getState().lastProjectId as string;
    });
    for (const pid of pids) {
      for (let i = 0; i < 6; i++) completeTask(pid, `lc-${pid.slice(-4)}-${i}`);
      akira.updateProject(pid, { progress: 100 });
    }
    akira.addNote({ title: "why it mattered", content: "a reflection worth keeping" });
    measure("C  three projects created and completed, plus a note");
  });
});
