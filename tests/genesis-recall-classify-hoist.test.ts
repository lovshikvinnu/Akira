/**
 * `classifyMemory`'s Goal Progress short-circuit, and the equivalence it must
 * preserve.
 *
 * The function used to build `${title} ${description}`.toLowerCase()` as its
 * first statement, then test `memory.reason === "Goal Progress"` as the first
 * disjunct of its first block -- so a Goal Progress memory paid the whole
 * normalisation and no branch ever read it. Measured on a task-completion
 * history at the retention ceiling: 500 of 500 memories per rebuild.
 *
 * The reason test now happens before the text is built. That is a claim about
 * a predicate, and the claim is checked two ways here rather than argued.
 *
 * WHY A REFERENCE IMPLEMENTATION
 * ------------------------------
 * `classifyMemoryReference` below is the pre-change function, verbatim. A test
 * that only asserted the new function's outputs would encode whatever the new
 * function does, including a mistake. Comparing against the original makes this
 * a characterisation test: the two must agree on every input, and the corpus is
 * built to include the cases where hoisting could plausibly have changed which
 * category wins.
 *
 * THE PRECEDENCE HAZARD
 * ---------------------
 * Only `reason === "Goal Progress"` is safe to hoist, because it is the first
 * disjunct of the first block. The Project block's `memory.relatedProjectId` is
 * *not*: a memory with a project id whose text contains "goal" classifies as
 * Goal today, and hoisting the project-id test above the Goal block would flip
 * it to Project. The corpus asserts that exact case, so a future attempt to
 * "finish the optimisation" by hoisting the second field test fails loudly.
 */
import { describe, it, expect } from "vitest";

import { classifyMemory, type MemoryCategory } from "../src/genesis/recall/recall-rules";
import type { Memory } from "../src/genesis/validation/types";

/** The pre-change implementation, kept verbatim as the equivalence oracle. */
function classifyMemoryReference(memory: Memory): MemoryCategory {
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
function mem(patch: Partial<Memory>): Memory {
  return {
    id: `m-${seq++}`,
    sourceEventId: "e",
    eventType: "task_completed",
    candidateId: "c",
    timestamp: new Date().toISOString(),
    reason: "Goal Progress",
    explanation: "",
    title: "",
    description: "",
    relatedProjectId: null,
    relatedNoteId: null,
    metadata: {},
    ...patch,
  } as Memory;
}

/**
 * Inputs chosen to reach every category and, more importantly, every
 * interaction between a field test and a text test.
 */
const CORPUS: { label: string; memory: Memory; expect: MemoryCategory }[] = [
  // --- the hoisted predicate itself ---
  {
    label: "Goal Progress with empty text",
    memory: mem({ reason: "Goal Progress" }),
    expect: "Goal",
  },
  {
    label: "Goal Progress with text matching a LATER block wins Goal",
    memory: mem({ reason: "Goal Progress", title: "Studied Verilog", description: "learn fpga" }),
    expect: "Goal",
  },
  {
    label: "Goal Progress with a project id still wins Goal, not Project",
    memory: mem({
      reason: "Goal Progress",
      relatedProjectId: "p1",
      title: "Project work",
      description: "codebase",
    }),
    expect: "Goal",
  },

  // --- THE PRECEDENCE HAZARD: project id must NOT preempt the Goal block ---
  {
    label: "non-Goal reason + project id + 'goal' in text must be Goal",
    memory: mem({ reason: "Repeated Activity", relatedProjectId: "p1", description: "goal" }),
    expect: "Goal",
  },
  {
    label: "non-Goal reason + project id + no goal words is Project",
    memory: mem({
      reason: "Repeated Activity",
      relatedProjectId: "p1",
      description: "logged work",
    }),
    expect: "Project",
  },

  // --- text-driven routes through each block ---
  {
    label: "dream -> Goal",
    memory: mem({ reason: "Milestone", description: "a dream" }),
    expect: "Goal",
  },
  {
    label: "achieve -> Goal",
    memory: mem({ reason: "Milestone", description: "achieve it" }),
    expect: "Goal",
  },
  {
    label: "project text -> Project",
    memory: mem({ reason: "Milestone", description: "the project" }),
    expect: "Project",
  },
  {
    label: "work on -> Project",
    memory: mem({ reason: "Milestone", description: "work on this" }),
    expect: "Project",
  },
  {
    label: "learn -> Knowledge",
    memory: mem({ reason: "Milestone", description: "learn things" }),
    expect: "Knowledge",
  },
  {
    label: "risc-v -> Knowledge",
    memory: mem({ reason: "Milestone", description: "risc-v pipeline" }),
    expect: "Knowledge",
  },
  {
    label: "habit -> Habit",
    memory: mem({ reason: "Milestone", description: "a habit" }),
    expect: "Habit",
  },
  {
    label: "every day -> Habit",
    memory: mem({ reason: "Milestone", description: "every day now" }),
    expect: "Habit",
  },
  {
    label: "friend -> Relationship",
    memory: mem({ reason: "Milestone", description: "a friend" }),
    expect: "Relationship",
  },
  {
    label: "coffee -> Preference",
    memory: mem({ reason: "Milestone", description: "coffee" }),
    expect: "Preference",
  },
  {
    label: "reflect -> Reflection",
    memory: mem({ reason: "Milestone", description: "reflect on it" }),
    expect: "Reflection",
  },
  {
    label: "Reflection Worthy reason -> Reflection",
    memory: mem({ reason: "Reflection Worthy", description: "nondescript" }),
    expect: "Reflection",
  },
  {
    label: "nothing matches -> General Observation",
    memory: mem({ reason: "Milestone", title: "zzz", description: "qqq" }),
    expect: "General Observation",
  },

  // --- case-insensitivity must survive the hoist ---
  {
    label: "uppercase GOAL still matches",
    memory: mem({ reason: "Milestone", description: "GOAL reached" }),
    expect: "Goal",
  },
  {
    label: "mixed-case Habit still matches",
    memory: mem({ reason: "Milestone", description: "Daily ROUTINE" }),
    expect: "Habit",
  },

  // --- degenerate inputs ---
  {
    label: "empty everything",
    memory: mem({ reason: "Milestone" }),
    expect: "General Observation",
  },
  {
    label: "keyword split across title and description boundary",
    memory: mem({ reason: "Milestone", title: "every", description: "day" }),
    expect: "Habit",
  },
];

describe("classifyMemory: Goal Progress short-circuit is equivalent", () => {
  it("agrees with the pre-change implementation on every corpus case", () => {
    for (const { label, memory } of CORPUS) {
      expect(classifyMemory(memory), label).toBe(classifyMemoryReference(memory));
    }
  });

  it("returns the categories the corpus was built to reach", () => {
    for (const { label, memory, expect: want } of CORPUS) {
      expect(classifyMemory(memory), label).toBe(want);
    }
  });

  it("reaches every category, so the corpus is not accidentally narrow", () => {
    const reached = new Set(CORPUS.map((c) => classifyMemory(c.memory)));
    for (const category of [
      "Goal",
      "Project",
      "Knowledge",
      "Habit",
      "Relationship",
      "Preference",
      "Reflection",
      "General Observation",
    ] as MemoryCategory[]) {
      expect(reached.has(category), `category ${category} unreached`).toBe(true);
    }
  });

  it("agrees across a generated cross-product of reasons, project ids and keywords", () => {
    // The corpus is hand-picked; this is the brute-force complement, so an
    // interaction nobody thought of still has to agree.
    const reasons = [
      "Goal Progress",
      "Milestone",
      "Repeated Activity",
      "Reflection Worthy",
    ] as const;
    const projectIds = [null, "p1"];
    const noteIds = [null, "n1"];
    const texts = [
      "",
      "goal",
      "project",
      "learn",
      "habit",
      "friend",
      "coffee",
      "reflect",
      "zzz",
      "GOAL",
      "work on the codebase daily",
      "dream of a startup",
    ];

    let compared = 0;
    for (const reason of reasons) {
      for (const relatedProjectId of projectIds) {
        for (const relatedNoteId of noteIds) {
          for (const title of texts) {
            for (const description of texts) {
              const m = mem({ reason, relatedProjectId, relatedNoteId, title, description });
              expect(
                classifyMemory(m),
                `reason=${reason} pid=${relatedProjectId} title="${title}" desc="${description}"`,
              ).toBe(classifyMemoryReference(m));
              compared++;
            }
          }
        }
      }
    }
    // 4 reasons x 2 pids x 2 nids x 12 titles x 12 descriptions
    expect(compared).toBe(4 * 2 * 2 * 12 * 12);
  });
});
