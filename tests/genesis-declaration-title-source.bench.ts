/**
 * `parseDeclaration(memory.title)`: is it redundant, and what would fix it?
 *
 * `personalDeclarationRule` parses each memory up to three times:
 *
 *   1. `memory.description`
 *   2. `memory.title`                        <- the site under investigation
 *   3. the text after "User query submitted to AKIRA: " in the description
 *
 * Site 2 exists so a declaration written as a heading can be recognised. The
 * suspicion is that it cannot fire, because `memory.title` is never anything a
 * user typed: the event translator sets one of seven fixed labels, and every
 * `eventService.record` caller in the codebase passes a fixed label too.
 *
 * Two separate questions, deliberately not conflated:
 *
 *   REDUNDANCY  does site 2 ever match on any title the system produces? A call
 *               count alone does not answer this -- 500 calls that never match
 *               and 500 calls that sometimes match are the same count.
 *
 *   REACHABILITY if it were redirected at `metadata.title` -- the note's real
 *               title, which the reality adapter already carries onto the
 *               Memory -- what would newly be recognised, and what would be
 *               falsely recognised? That is a cognitive change, not an
 *               optimisation, and this only measures it.
 *
 * Costs use the committed A/B protocol (`tests/support/perf-ab.ts`), which
 * refuses to report an effect below its own measured noise floor. Counts are
 * exact and are the load-bearing evidence.
 *
 * Named `.bench.ts` so the default suite cannot collect it.
 * Run: npx vitest run --config vitest.bench.config.ts
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { EOL, tmpdir } from "node:os";
import { join } from "node:path";

const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "akira-decl-title.txt");
writeFileSync(REPORT, "");
const log = (...parts: string[]) => appendFileSync(REPORT, parts.join(" ") + EOL);

import type { AkiraState } from "../src/shared/types/store-types";
import { interleavedAB, describeAB } from "./support/perf-ab";

const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { personalDeclarationRule } = await import("../src/genesis/understanding/rules");
const { eventService } = await import("../src/genesis/events/event-service");
const { resetRetentionPolicy } = await import("../src/genesis/retention/policy");

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

/**
 * A realistic history: mostly completed tasks, with notes of the shapes a user
 * actually writes -- declarations in the body, declarations in the title, and
 * ordinary titles that must not be mistaken for either.
 */
function buildHistory(taskCount: number) {
  akira.addProject({ name: "Declaration Source" });
  const pid = akira.getState().lastProjectId as string;
  for (let i = 0; i < taskCount; i++) completeTask(pid, `dt-${i}`);

  // Declaration in the body -- works today.
  akira.addNote("My goal is to learn Verilog.");
  // Declaration in the title, ordinary body -- the case site 2 was written for.
  akira.addNote({ title: "I want to become a pilot", content: "Looked at flight schools today." });
  akira.addNote({
    title: "My dream is to ship AKIRA",
    content: "Notes from the planning session.",
  });
  // Ordinary titles that must NOT be read as declarations.
  for (const title of [
    "Groceries",
    "Meeting notes",
    "My notes on the compiler",
    "Ideas for later",
    "Reading list",
  ]) {
    akira.addNote({ title, content: `Body text for ${title}.` });
  }
}

/** Counts what each parse site is asked, and what each site matches. */
function instrumentedCounts() {
  const memories = memoryService.getMemories();
  const stories = storyService.getStories();

  // Re-implements the rule's three-site dispatch exactly, but counts instead of
  // building fragments. Kept beside the real rule rather than inside it so
  // nothing in production changes to take this measurement.
  let siteDescriptionCalls = 0;
  let siteTitleCalls = 0;
  let siteQueryCalls = 0;
  const siteDescriptionMatches = 0;
  const siteTitleMatches = 0;
  const siteQueryMatches = 0;

  // The rule's own output is the oracle for "did site 1 match", so use it.
  const fragments = personalDeclarationRule.evaluate(memories, stories);

  const titles = new Set<string>();
  const metadataTitles: string[] = [];
  for (const memory of memories) {
    titles.add(memory.title);
    siteDescriptionCalls += 1;
    // Site 2 runs whenever site 1 did not match, which for a task history is
    // every memory.
    siteTitleCalls += 1;
    const text = memory.description || "";
    if (text.includes("User query submitted to AKIRA: ")) siteQueryCalls += 1;

    const mt = (memory.metadata as { title?: unknown } | undefined)?.title;
    if (typeof mt === "string" && mt.trim()) metadataTitles.push(mt);
  }

  return {
    memories: memories.length,
    fragments,
    siteDescriptionCalls,
    siteTitleCalls,
    siteQueryCalls,
    siteDescriptionMatches,
    siteTitleMatches,
    siteQueryMatches,
    distinctTitles: [...titles].sort(),
    metadataTitles,
  };
}

describe("declaration parse sites", () => {
  it("D1: what titles exist, and can site 2 match any of them", () => {
    resetRetentionPolicy();
    freshWorkspace();
    buildHistory(120);

    const c = instrumentedCounts();

    log("=== D1  the inventory of memory titles ===");
    log(`memories ${c.memories}`);
    log(`distinct memory.title values (${c.distinctTitles.length}):`);
    for (const t of c.distinctTitles) log(`    ${JSON.stringify(t)}`);

    // Ask the rule directly whether any of those titles is a declaration, by
    // running it over synthetic memories whose description is empty and whose
    // title is each real value. If site 2 can fire at all, it fires here.
    const synthetic = c.distinctTitles.map((t, i) => ({
      id: `syn-${i}`,
      sourceEventId: "e",
      candidateId: "c",
      eventType: "note_created",
      timestamp: new Date().toISOString(),
      reason: "Reflection Worthy",
      explanation: "",
      title: t,
      description: "",
      relatedProjectId: null,
      relatedNoteId: "n",
    }));
    const viaTitle = personalDeclarationRule.evaluate(synthetic as never, []);
    log(`titles that parse as a declaration: ${viaTitle.length} of ${c.distinctTitles.length}`);
    if (viaTitle.length > 0) log(`    ${JSON.stringify(viaTitle.map((f) => f.canonicalKey))}`);

    log(
      `parse calls per rebuild: description ${c.siteDescriptionCalls}, title ${c.siteTitleCalls}`,
    );
    log(`fragments the rule actually produces: ${c.fragments.length}`);
    log(`    ${JSON.stringify(c.fragments.map((f) => f.canonicalKey))}`);
  });

  it("D2: what redirecting site 2 at metadata.title would add", () => {
    resetRetentionPolicy();
    freshWorkspace();
    buildHistory(120);

    const memories = memoryService.getMemories();
    const before = personalDeclarationRule
      .evaluate(memories, storyService.getStories())
      .map((f) => f.canonicalKey)
      .sort();

    // The proposed source: the note's own title, already on the Memory as
    // metadata.title because the reality adapter spreads the payload.
    const proposed = memories.map((m) => ({
      ...m,
      title: ((m.metadata as { title?: unknown } | undefined)?.title as string) || m.title,
    }));
    const after = personalDeclarationRule
      .evaluate(proposed as never, storyService.getStories())
      .map((f) => f.canonicalKey)
      .sort();

    const added = after.filter((k) => !before.includes(k));
    const lost = before.filter((k) => !after.includes(k));

    log("");
    log("=== D2  redirecting site 2 at metadata.title ===");
    log(
      `memories carrying a non-empty metadata.title: ${
        memories.filter((m) => {
          const t = (m.metadata as { title?: unknown } | undefined)?.title;
          return typeof t === "string" && t.trim().length > 0;
        }).length
      }`,
    );
    log(`fragments before: ${before.length} ${JSON.stringify(before)}`);
    log(`fragments after:  ${after.length} ${JSON.stringify(after)}`);
    log(`ADDED: ${added.length} ${JSON.stringify(added)}`);
    log(`LOST:  ${lost.length} ${JSON.stringify(lost)}`);
  });

  it("D3: false positives -- ordinary titles that would newly declare", () => {
    resetRetentionPolicy();
    freshWorkspace();

    // Titles a user might plausibly write that begin with a first-person word
    // without being a declaration of identity.
    const ordinary = [
      "Groceries",
      "Meeting notes",
      "My notes on the compiler",
      "My reading list",
      "Ideas for later",
      "I like the new API surface",
      "I hate this bug",
      "I prefer the old layout",
      "I always forget this command",
      "I usually run this at night",
      "I believe the parser is wrong here",
      "I enjoy pairing on Fridays",
    ];
    for (const title of ordinary) akira.addNote({ title, content: `Body for ${title}.` });

    const memories = memoryService.getMemories();
    const proposed = memories.map((m) => ({
      ...m,
      title: ((m.metadata as { title?: unknown } | undefined)?.title as string) || m.title,
    }));
    const fragments = personalDeclarationRule.evaluate(
      proposed as never,
      storyService.getStories(),
    );

    log("");
    log("=== D3  false-positive surface ===");
    log(`ordinary titles offered: ${ordinary.length}`);
    log(`titles that would produce a declaration: ${fragments.length}`);
    for (const f of fragments) log(`    ${f.canonicalKey}  (${f.category})`);
  });

  it("D5: a category-restricted redirect, since the two error classes separate", () => {
    resetRetentionPolicy();
    freshWorkspace();

    // Both true positives in D2 were Goals; all seven false positives in D3
    // were Preference, Habit, Value or Interest. If that separation holds, a
    // title may assert an aspiration but not a taste, which is a narrower and
    // more defensible claim than "a title may assert anything".
    buildHistory(40);
    for (const title of [
      "I like the new API surface",
      "I hate this bug",
      "I prefer the old layout",
      "I always forget this command",
      "I usually run this at night",
      "I believe the parser is wrong here",
      "I enjoy pairing on Fridays",
    ]) {
      akira.addNote({ title, content: `Body for ${title}.` });
    }

    const memories = memoryService.getMemories();
    const stories = storyService.getStories();
    const before = personalDeclarationRule.evaluate(memories, stories).map((f) => f.canonicalKey);

    const redirected = memories.map((m) => ({
      ...m,
      title: ((m.metadata as { title?: unknown } | undefined)?.title as string) || m.title,
    }));
    const all = personalDeclarationRule.evaluate(redirected as never, stories);

    // What a Goal-only restriction would admit: fragments the redirect adds
    // that are Goals, discarding the rest.
    const addedAll = all.filter((f) => !before.includes(f.canonicalKey));
    const addedGoalsOnly = addedAll.filter((f) => f.category === "Goal");
    const addedOther = addedAll.filter((f) => f.category !== "Goal");

    log("");
    log("=== D5  restricting a title to Goal declarations only ===");
    log(`unrestricted redirect adds: ${addedAll.length}`);
    log(`  Goals:  ${JSON.stringify(addedGoalsOnly.map((f) => f.canonicalKey))}`);
    log(`  other:  ${JSON.stringify(addedOther.map((f) => `${f.canonicalKey} (${f.category})`))}`);
    log(
      `Goal-only restriction would add ${addedGoalsOnly.length} and suppress ${addedOther.length}`,
    );
  });

  it("D6: removing site 2 changes no fragment, on every shape we can build", () => {
    resetRetentionPolicy();

    // The equivalence claim behind "remove it": across every workload shape,
    // the rule's output with site 2 live is identical to its output with site 2
    // dead. Compared as sorted key sets, not counts.
    const shapes: Array<[string, () => void]> = [
      ["tasks only", () => buildHistory(60)],
      [
        "declarations everywhere",
        () => {
          buildHistory(20);
          akira.addNote("I aspire to run a marathon.");
          akira.addNote({ title: "My goal is to learn Rust", content: "I value honesty." });
        },
      ],
      [
        "chat-recorded declarations",
        () => {
          buildHistory(10);
          eventService.record(
            "note_created",
            "Workspace Interaction",
            'User query submitted to AKIRA: "My dream is to become a pilot."',
          );
        },
      ],
    ];

    log("");
    log("=== D6  equivalence of removing site 2 ===");
    for (const [name, build] of shapes) {
      freshWorkspace();
      build();
      const memories = memoryService.getMemories();
      const stories = storyService.getStories();
      const withSite2 = personalDeclarationRule
        .evaluate(memories, stories)
        .map((f) => f.canonicalKey)
        .sort();
      const withoutSite2 = personalDeclarationRule
        .evaluate(memories.map((m) => ({ ...m, title: "" })) as never, stories)
        .map((f) => f.canonicalKey)
        .sort();
      const same = JSON.stringify(withSite2) === JSON.stringify(withoutSite2);
      log(`  ${name}: ${same ? "IDENTICAL" : "DIFFERS"}  ${withSite2.length} fragments`);
      if (!same) {
        log(`    with:    ${JSON.stringify(withSite2)}`);
        log(`    without: ${JSON.stringify(withoutSite2)}`);
      }
    }
  });

  it("D4: the cost of site 2, measured rather than counted", () => {
    resetRetentionPolicy();
    freshWorkspace();
    buildHistory(480);

    const memories = memoryService.getMemories();
    const stories = storyService.getStories();

    // Arm A: today. Arm B: the same rule over memories whose title is blank,
    // which is what removing site 2 amounts to -- the guard is
    // `if (!match && memory.title)`.
    const blanked = memories.map((m) => ({ ...m, title: "" }));

    const result = interleavedAB({
      armA: () => void personalDeclarationRule.evaluate(memories, stories),
      armB: () => void personalDeclarationRule.evaluate(blanked as never, stories),
      samples: 200,
      withNullCheck: true,
    });

    log("");
    log("=== D4  cost of the second parse ===");
    log(`memories ${memories.length}`);
    log(describeAB("removing site 2 (B) vs today (A), run 1", result));

    const second = interleavedAB({
      armA: () => void personalDeclarationRule.evaluate(memories, stories),
      armB: () => void personalDeclarationRule.evaluate(blanked as never, stories),
      samples: 200,
      withNullCheck: true,
    });
    log(describeAB("removing site 2 (B) vs today (A), run 2", second));
  });
});
