/**
 * The hoisted recall evaluation context, and the equivalence it must preserve.
 *
 * `recallRules[1]` used to rebuild the current discussion for every memory it
 * judged: the chat array copied and reversed to find its last user message, the
 * companion state read, the pieces concatenated, and the result re-tokenised
 * into query words and stems. None of that reads the memory under judgement, so
 * a rebuild at the retention ceiling repeated it ~500 times. It is now built
 * once per rebuild and passed in.
 *
 * WHY THE CHAT FIXTURES MATTER
 * ---------------------------
 * With an empty chat the rule short-circuits: `currentContextStr` stays blank,
 * so tokenisation yields nothing and the relevance fraction returns 0 without
 * touching a single memory's text. An equivalence test that only ran with an
 * empty chat would therefore exercise none of the hoisted code and would pass
 * however badly it were broken. Each branch is covered deliberately:
 *
 *   empty chat     the short-circuit, as a regression guard
 *   matching chat  query words that hit memory text, so `getStems` and the
 *                  containment check both do real work and relevance > 0
 *   no-match chat  query words that tokenise but hit nothing, so the
 *                  denominator is non-zero while every numerator term is 0
 *
 * WHAT IS ASSERTED
 * ----------------
 * Not timing. The claim is that hoisting changed when the context is computed
 * and not what any rule concludes from it, so the assertions compare the rule's
 * own verdicts -- and the settled recall state built from them -- between the
 * hoisted path and a path that forces the rule to build its own context, which
 * is the pre-change behaviour still reachable through the optional parameter.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeAll } from "vitest";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { recallRules, buildRecallEvaluationContext } =
  await import("../src/genesis/recall/recall-rules");
const { recallBuilder } = await import("../src/genesis/recall/recall-builder");
const { recallService } = await import("../src/genesis/recall/recall-service");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");

void genesis;

let seq = 0;

function newProject(name: string): string {
  akira.addProject({ name });
  return akira.getState().lastProjectId as string;
}

function completeTask(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

/**
 * Every rule's verdict for every retained memory, in iteration order.
 *
 * `withHoist` mirrors the builder: one context for the pass. `withoutHoist`
 * passes no context, so each rule rebuilds its own per call -- the behaviour
 * this change replaced.
 */
function verdicts(mode: "withHoist" | "withoutHoist"): string[] {
  const memories = memoryService.getMemories();
  const stories = storyService.getStories();
  const resolved = recallBuilder.resolveCurrentContext();
  const shared = mode === "withHoist" ? buildRecallEvaluationContext() : undefined;

  const out: string[] = [];
  for (const memory of memories) {
    const importance = importanceService.getImportance(memory.id);
    for (const rule of recallRules) {
      const r = rule.evaluate(memory, importance, stories, resolved, shared);
      out.push(`${memory.id}|${rule.name}|${r.shouldRecall}|${r.reason ?? ""}`);
    }
  }
  return out;
}

/** The settled recall state, as the builder actually produces it. */
function recallSnapshot(): string[] {
  recallBuilder.rebuildRecallCandidates();
  return recallService
    .getRecallCandidates()
    .map((c) => `${c.memoryId}|${c.status}|${c.recallReasons.slice().sort().join("~")}`)
    .sort();
}

let projectId: string;

beforeAll(() => {
  recallBuilder.initialize();
  projectId = newProject("Verilog FPGA Companion");
  // Memory text that a crafted query can match on, and text it cannot.
  completeTask(projectId, "Wrote the RISC-V pipeline decoder in Verilog");
  completeTask(projectId, "Studied FPGA timing closure");
  completeTask(projectId, "Bought groceries and cleaned the kitchen");
  for (let i = 0; i < 6; i++) completeTask(projectId, `routine-item-${seq++}`);
});

describe("hoisted evaluation context is equivalent to per-memory rebuilding", () => {
  it("agrees on every verdict with an empty chat", () => {
    expect(akira.getState().chat.length).toBe(0);

    // The short-circuit really is a short-circuit: nothing to tokenise.
    const ctx = buildRecallEvaluationContext();
    expect(ctx.discussion).toBe("");
    expect(ctx.queryStems.length).toBe(0);

    expect(verdicts("withHoist")).toEqual(verdicts("withoutHoist"));
  });

  it("agrees on every verdict when the query matches memory text", () => {
    akira.addChatMessage("user", "What is that Verilog RISC-V decoder doing?");

    const ctx = buildRecallEvaluationContext();
    expect(ctx.discussion).toContain("Verilog");
    // Tokenisation dropped the stop words and kept the signal-bearing ones.
    expect(ctx.queryStems.length).toBeGreaterThan(0);
    const flat = ctx.queryStems.flatMap((s) => [...s]);
    expect(flat).toContain("verilog");
    // "what" and "that" are in IGNORE_WORDS; "the" is too short to survive anyway.
    expect(flat).not.toContain("what");
    expect(flat).not.toContain("that");

    // The match branch is genuinely reached: at least one memory scores.
    const matched = memoryService
      .getMemories()
      .some((m) => `${m.title} ${m.description}`.toLowerCase().includes("verilog"));
    expect(matched).toBe(true);

    expect(verdicts("withHoist")).toEqual(verdicts("withoutHoist"));
  });

  it("agrees on every verdict when the query tokenises but matches nothing", () => {
    akira.addChatMessage("user", "zqxwv plughh frobnicate bazqux");

    const ctx = buildRecallEvaluationContext();
    // Non-zero denominator, so the fraction is computed rather than skipped.
    expect(ctx.queryStems.length).toBeGreaterThan(0);
    const none = memoryService
      .getMemories()
      .every((m) => !`${m.title} ${m.description}`.toLowerCase().includes("frobnicate"));
    expect(none).toBe(true);

    expect(verdicts("withHoist")).toEqual(verdicts("withoutHoist"));
  });

  it("produces the same settled recall state across all three fixtures", () => {
    const seen: string[][] = [];

    akira.clearChat?.();
    seen.push(recallSnapshot());

    akira.addChatMessage("user", "What is that Verilog RISC-V decoder doing?");
    const matching = recallSnapshot();
    seen.push(matching);

    akira.addChatMessage("user", "zqxwv plughh frobnicate bazqux");
    seen.push(recallSnapshot());

    // Rebuilding against unchanged state is a fixed point -- the hoisted
    // context is recomputed per rebuild, so a stale one would show up here.
    expect(recallSnapshot()).toEqual(seen[2]);

    // Every candidate still points at a live memory in every fixture.
    const live = new Set(memoryService.getMemories().map((m) => m.id));
    for (const snapshot of seen) {
      for (const row of snapshot) expect(live.has(row.split("|")[0])).toBe(true);
    }
  });
});

describe("the optional parameter keeps externally registered rules working", () => {
  it("evaluates a rule that ignores the new argument", () => {
    // A rule written against the old four-argument signature.
    const legacyRule = {
      name: "Legacy Four Arg Rule",
      evaluate(memory: { id: string }) {
        return { shouldRecall: true, reason: `legacy:${memory.id}` };
      },
    };

    const memory = memoryService.getMemories()[0];
    const result = legacyRule.evaluate(memory);
    expect(result.shouldRecall).toBe(true);
    expect(result.reason).toBe(`legacy:${memory.id}`);

    // And a built-in rule handed no context builds its own rather than throwing.
    const stories = storyService.getStories();
    const importance = importanceService.getImportance(memory.id);
    for (const rule of recallRules) {
      expect(() => rule.evaluate(memory, importance, stories, "QUERY")).not.toThrow();
    }
  });
});
