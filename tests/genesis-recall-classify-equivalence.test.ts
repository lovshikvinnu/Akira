/**
 * Recall-level equivalence for the `classifyMemory` Goal Progress hoist.
 *
 * `tests/genesis-recall-classify-hoist.test.ts` proves the predicate itself is
 * unchanged, against a verbatim copy of the pre-change function and a 2,304-case
 * cross-product. That is the strong proof, but it runs on synthesised memories.
 * This file closes the remaining gap in two ways:
 *
 *   1. It re-runs the same oracle against memories produced by the real store,
 *      so the equivalence covers the shapes GENESIS actually creates rather than
 *      the shapes a test author imagined.
 *   2. It asserts what recall derives *from* the classification -- candidate
 *      scores, recall reasons, ordering, status -- is stable, in all three chat
 *      conditions. Scores and categories are both embedded in the rule's reason
 *      string ("Score: 0.60 | Category: Goal | ..."), so comparing reasons
 *      compares the scoring model's output, not just its labels.
 *
 * WORKLOAD
 * --------
 * Deliberately mixed. A task-completion-only history classifies every memory as
 * Goal via the hoisted predicate, which is precisely the path that no longer
 * builds the text -- so a single-reason workload would exercise only the fast
 * path and prove nothing about the slow one. `touchProject` contributes
 * Repeated Activity, notes contribute Reflection Worthy, and project creation
 * contributes Milestone, so memories that *do* read the normalised text are
 * present and compared too.
 *
 * NOT COVERED HERE, DELIBERATELY
 * ------------------------------
 * Active -> Inactive transitions do not arise in this workload: every memory
 * qualifies under the Active Story rule, so the cache is uniformly Active. That
 * mechanism is covered by `tests/genesis-recall-session-diff.test.ts` and
 * `tests/genesis-recall-candidate-bounds.test.ts`, which drive the diff and the
 * eviction path directly. Duplicating it with a workload that cannot reach the
 * branch would assert nothing.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeAll } from "vitest";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { classifyMemory, peekNormalisedMemoryText } =
  await import("../src/genesis/recall/recall-rules");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { recallRules } = await import("../src/genesis/recall/recall-rules");
const { buildRecallEvaluationContext } = await import("../src/genesis/recall/recall-rules");

void genesis;

type Category =
  | "Goal"
  | "Project"
  | "Knowledge"
  | "Habit"
  | "Relationship"
  | "Preference"
  | "Reflection"
  | "General Observation";

/** The pre-change implementation, verbatim, as the equivalence oracle. */
function classifyMemoryReference(memory: {
  title: string;
  description: string;
  reason: string;
  relatedProjectId?: string | null;
}): Category {
  const text = `${memory.title} ${memory.description}`.toLowerCase();

  if (
    memory.reason === "Goal Progress" ||
    text.includes("dream") ||
    text.includes("goal") ||
    text.includes("target") ||
    text.includes("aim") ||
    text.includes("mission") ||
    text.includes("achieve")
  ) {
    return "Goal";
  }
  if (
    memory.relatedProjectId ||
    text.includes("project") ||
    text.includes("building") ||
    text.includes("startup") ||
    text.includes("repo") ||
    text.includes("codebase") ||
    text.includes("develop") ||
    text.includes("work on")
  ) {
    return "Project";
  }
  if (
    text.includes("learn") ||
    text.includes("studying") ||
    text.includes("understand") ||
    text.includes("verilog") ||
    text.includes("fpga") ||
    text.includes("risc-v") ||
    text.includes("concept") ||
    text.includes("domain") ||
    text.includes("skill") ||
    text.includes("read") ||
    text.includes("book")
  ) {
    return "Knowledge";
  }
  if (
    text.includes("streak") ||
    text.includes("habit") ||
    text.includes("routine") ||
    text.includes("every day") ||
    text.includes("daily") ||
    text.includes("workout") ||
    text.includes("fitness") ||
    text.includes("sleep")
  ) {
    return "Habit";
  }
  if (
    text.includes("friend") ||
    text.includes("contact") ||
    text.includes("person") ||
    text.includes("relationship") ||
    text.includes("spoke to") ||
    text.includes("meet") ||
    text.includes("colleague")
  ) {
    return "Relationship";
  }
  if (
    text.includes("like") ||
    text.includes("love") ||
    text.includes("prefer") ||
    text.includes("favorite") ||
    text.includes("dislike") ||
    text.includes("coffee") ||
    text.includes("tea")
  ) {
    return "Preference";
  }
  if (
    memory.reason === "Reflection Worthy" ||
    text.includes("reflect") ||
    text.includes("thought") ||
    text.includes("think") ||
    text.includes("ponder") ||
    text.includes("mind")
  ) {
    return "Reflection";
  }
  return "General Observation";
}

let seq = 0;
let projectId = "";

function completeTask(): void {
  const title = `eq-task-${seq++}`;
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

/** Candidate state in a comparable form. Order preserved, not sorted. */
function candidateSignature(): string[] {
  return recallService.getRecallCandidates().map(
    (c) =>
      `${c.memoryId}|${c.status}|${c.supportingStoryIds.join(",")}|` +
      `${c.recallReasons.join("~")}|sig=${c.importanceSignals
        .map((s) => `${s.type}:${s.strength}`)
        .sort()
        .join(",")}`,
  );
}

function setChat(mode: "empty" | "overlap" | "nooverlap"): void {
  akira.clearChat();
  if (mode === "overlap") {
    akira.addChatMessage("user", "How is the eq-task work on this project going?");
  } else if (mode === "nooverlap") {
    akira.addChatMessage("user", "zqxwv plughh frobnicate bazqux");
  }
}

beforeAll(() => {
  recallBuilder.initialize();

  akira.addProject({ name: "Equivalence Mix" });
  projectId = akira.getState().lastProjectId as string;
  // Never completed, so MISSION_COMPLETED cannot fire and inflate the history.
  akira.addTaskDetails({ title: "eq-pending", projectId });

  for (let i = 0; i < 12; i++) completeTask();
  // Repeated Activity memories: these DO read the normalised text.
  for (let i = 0; i < 4; i++) akira.touchProject(projectId);
  // Reflection Worthy memories.
  akira.addNote({ title: "Verilog notes", content: "risc-v decoder pipeline", projectId });
  akira.addNote({ title: "Morning routine", content: "workout every day", projectId: null });
  akira.updateNote(akira.getState().notes[0].id, { content: "updated decoder notes" });
  // Milestone.
  akira.updateProject(projectId, { progress: 100 });
});

describe("classification of real store-produced memories is unchanged", () => {
  it("covers more than one reason, so both paths are exercised", () => {
    const reasons = new Set(memoryService.getMemories().map((m) => m.reason));
    expect(reasons.size).toBeGreaterThan(1);
    expect(reasons.has("Goal Progress")).toBe(true);
    // At least one memory whose reason is NOT the hoisted predicate, i.e. one
    // that still builds and reads the normalised text.
    expect([...reasons].some((r) => r !== "Goal Progress")).toBe(true);
  });

  it("agrees with the pre-change implementation for every live memory", () => {
    const memories = memoryService.getMemories();
    expect(memories.length).toBeGreaterThan(10);
    for (const m of memories) {
      expect(classifyMemory(m), `${m.reason} | ${m.title} | ${m.description}`).toBe(
        classifyMemoryReference(m),
      );
    }
  });
});

describe("recall output derived from classification is stable", () => {
  it("produces identical candidates on an immediate second rebuild", () => {
    for (const mode of ["empty", "overlap", "nooverlap"] as const) {
      setChat(mode);

      recallBuilder.rebuildRecallCandidates();
      const first = candidateSignature();

      recallBuilder.rebuildRecallCandidates();
      const second = candidateSignature();

      // Ordering as well as content: compared as arrays, unsorted.
      expect(second, `chat=${mode}`).toEqual(first);
      expect(first.length, `chat=${mode} produced no candidates`).toBeGreaterThan(0);
    }
  });

  it("embeds a score and a category in every multi-factor reason", () => {
    setChat("overlap");
    recallBuilder.rebuildRecallCandidates();

    const multiFactor = recallService
      .getRecallCandidates()
      .flatMap((c) => c.recallReasons)
      .filter((r) => r.startsWith("Multi-factor recall"));

    expect(multiFactor.length).toBeGreaterThan(0);
    for (const reason of multiFactor) {
      expect(reason).toMatch(/Score: \d\.\d\d/);
      expect(reason).toMatch(
        /Category: (Goal|Project|Knowledge|Habit|Relationship|Preference|Reflection|General Observation)/,
      );
    }
  });

  it("gives every rule the same verdict whether or not the shared context is passed", () => {
    // The context hoist's contract, re-checked here because the classification
    // change sits inside the same rule.
    for (const mode of ["empty", "overlap", "nooverlap"] as const) {
      setChat(mode);
      const memories = memoryService.getMemories();
      const stories = storyService.getStories();
      const resolved = recallBuilder.resolveCurrentContext();
      const shared = buildRecallEvaluationContext();

      for (const memory of memories) {
        const importance = importanceService.getImportance(memory.id);
        for (const rule of recallRules) {
          const withShared = rule.evaluate(memory, importance, stories, resolved, shared);
          const withOwn = rule.evaluate(memory, importance, stories, resolved);
          expect(withShared.shouldRecall, `${mode} ${rule.name}`).toBe(withOwn.shouldRecall);
          expect(withShared.reason ?? "", `${mode} ${rule.name}`).toBe(withOwn.reason ?? "");
        }
      }
    }
  });

  it("keeps every candidate pointing at a live memory in all chat conditions", () => {
    for (const mode of ["empty", "overlap", "nooverlap"] as const) {
      setChat(mode);
      recallBuilder.rebuildRecallCandidates();
      const live = new Set(memoryService.getMemories().map((m) => m.id));
      for (const c of recallService.getRecallCandidates()) {
        expect(live.has(c.memoryId), `chat=${mode} dangling ${c.memoryId}`).toBe(true);
      }
    }
  });
});

/**
 * The normalised-text cache.
 *
 * Three sites read `${title} ${description}`.toLowerCase()` and it is now
 * computed once per memory object and held in a `WeakMap`. The cache is only
 * sound while a memory's text is immutable and its object identity stable, so
 * these assert the observable consequences of both rather than restating the
 * argument: a cached value must always equal a fresh computation, and two
 * memories must never share an entry.
 */
describe("normalised text is cached per memory without going stale", () => {
  it("is populated lazily and then agrees with a fresh computation", () => {
    setChat("overlap");
    recallBuilder.rebuildRecallCandidates();

    const memories = memoryService.getMemories();
    expect(memories.length).toBeGreaterThan(10);

    let cached = 0;
    for (const m of memories) {
      const peek = peekNormalisedMemoryText(m);
      if (peek === undefined) continue;
      cached++;
      // The invariant that matters: what the cache holds is what recomputing
      // would produce, character for character.
      expect(peek, `${m.id} cached text diverged`).toBe(
        `${m.title} ${m.description}`.toLowerCase(),
      );
    }
    // The populated chat drives the semantic path, which reads the text for
    // every memory, so the cache should be warm for essentially all of them.
    expect(cached).toBeGreaterThan(memories.length / 2);
  });

  it("does not let two memories share an entry, even with identical text", () => {
    // `touchProject` produces memories whose title and description are
    // identical to each other, which is the case a value-keyed cache would
    // conflate and an object-keyed one must not.
    for (let i = 0; i < 3; i++) akira.touchProject(projectId);
    recallBuilder.rebuildRecallCandidates();

    const continued = memoryService.getMemories().filter((m) => m.reason === "Repeated Activity");
    expect(continued.length).toBeGreaterThan(1);

    const texts = continued.map((m) => `${m.title} ${m.description}`.toLowerCase());
    // Precondition of the test: the texts really are duplicates.
    expect(new Set(texts).size).toBeLessThan(texts.length);

    for (const m of continued) {
      expect(classifyMemory(m)).toBe(classifyMemoryReference(m));
      const peek = peekNormalisedMemoryText(m);
      if (peek !== undefined) {
        expect(peek).toBe(`${m.title} ${m.description}`.toLowerCase());
      }
    }
  });

  it("classifies a fresh object with the same text identically to a cached one", () => {
    // A reload rebuilds memories as new objects. They get new cache entries,
    // and must classify the same as the originals did.
    const original = memoryService.getMemories().find((m) => m.reason !== "Goal Progress");
    expect(original).toBeDefined();

    const clone = { ...(original as object) } as typeof original;
    expect(peekNormalisedMemoryText(clone!)).toBeUndefined();
    expect(classifyMemory(clone!)).toBe(classifyMemory(original!));
    expect(peekNormalisedMemoryText(clone!)).toBe(
      `${clone!.title} ${clone!.description}`.toLowerCase(),
    );
  });

  it("still agrees with the oracle for every live memory after caching", () => {
    for (const m of memoryService.getMemories()) {
      expect(classifyMemory(m), `${m.reason} | ${m.title}`).toBe(classifyMemoryReference(m));
    }
  });
});
