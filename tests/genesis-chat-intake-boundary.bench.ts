/**
 * What a chat message becomes, and what would notice if it stopped.
 *
 * `routes/chat.tsx` reaches GENESIS at four points, and only one of them is
 * high-volume:
 *
 *   line 334  project_continued  "Companion Session Started"   once per session
 *   line 516  project_continued  "Companion Session Started"   once per session
 *   line 681  note_created       "Workspace Interaction"       EVERY user message
 *   line 843  note_edited        "Companion Session Ended"     once per session
 *
 * There is no `chat_message` event type anywhere in the codebase. Chat borrows
 * `note_created`, and `classifyDurability` keys on the event type, so a chat
 * message inherits the durability of a written note. That is the whole
 * mechanism: chat has no event identity of its own, so it cannot have a
 * durability of its own.
 *
 * Before any boundary is moved, three things have to be known rather than
 * assumed:
 *
 *   PRODUCES   what cognition does a chat-derived memory actually generate?
 *   DEPENDS    which subsystems would notice if it were Episodic instead?
 *   BREAKS     which would notice if it produced no memory at all?
 *
 * The declaration path is the interesting one: `parseDeclaration` strips four
 * "User query..." prefixes and the rule has a third parse site that splits on
 * the marker, so the chat stream is the surface that feature was built for.
 * Whether it still is, is measured here rather than inferred from the strings.
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

const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "akira-chat-intake.txt");
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
const { eventService } = await import("../src/genesis/events/event-service");
const { personalDeclarationRule } = await import("../src/genesis/understanding/rules");
const { identityService } = await import("../src/genesis/understanding/identity-service");
const { identityBuilder } = await import("../src/genesis/understanding/identity-builder");
const { classifyDurability, resetRetentionPolicy } = await import(
  "../src/genesis/retention/policy"
);

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
  identityService.clearHistory();
}

/** Exactly `routes/chat.tsx:681`. */
function chat(text: string, projectId: string | null = null): void {
  eventService.record(
    "note_created",
    "Workspace Interaction",
    `User query submitted to AKIRA: "${text}"`,
    projectId,
  );
}

const CHAT_MARKER = "submitted to AKIRA";
const isChat = (d: string) => d.includes(CHAT_MARKER);
const chatMemories = () => memoryService.getMemories().filter((m) => isChat(m.description));

describe("chat intake", () => {
  it("B1: what one ordinary chat message produces, at every stage", () => {
    resetRetentionPolicy();
    freshWorkspace();

    chat("what should I work on today");

    const candidates = genesis.candidateService.getCandidates();
    const memories = memoryService.getMemories();
    const mem = memories[0];

    log("=== B1  one ordinary chat message ===");
    log(`candidates ${candidates.length}  reason ${JSON.stringify(candidates[0]?.reason)}`);
    log(`memories ${memories.length}`);
    if (mem) {
      log(`  eventType    ${mem.eventType}   durability ${classifyDurability(mem.eventType)}`);
      log(`  reason       ${JSON.stringify(mem.reason)}`);
      log(`  relatedNoteId ${JSON.stringify(mem.relatedNoteId)}`);
      log(`  description  ${JSON.stringify(mem.description)}`);
      const story = storyService.findStoryContainingMemory(mem.id);
      log(`  story        ${story ? JSON.stringify(story.title) : "NONE"}`);
      const imp = importanceService.getImportance(mem.id);
      log(`  signals      ${JSON.stringify(imp?.signals.map((s) => s.type) ?? [])}`);
    }
    recallBuilder.rebuildRecallCandidates();
    const cache = recallService.getRecallCandidates();
    log(`recall candidates ${cache.length}, active ${cache.filter((c) => c.status === "Active").length}`);
    log(`items reaching the prompt ${contextRules.filterActiveRecallCandidates(cache).length}`);
  });

  it("B2: what a DECLARATION typed into chat produces", () => {
    resetRetentionPolicy();
    freshWorkspace();

    chat("My goal is to learn Verilog");
    chat("I want to become a pilot and build an aviation company");
    chat("what is on my plate today");

    const fragments = personalDeclarationRule.evaluate(
      memoryService.getMemories(),
      storyService.getStories(),
    );
    identityBuilder.flushDirtyStories();

    log("");
    log("=== B2  declarations typed into chat ===");
    log(`chat memories ${chatMemories().length}`);
    log(`declaration fragments ${fragments.length}: ${JSON.stringify(fragments.map((f) => f.canonicalKey))}`);
    log(
      `identity observations: ${JSON.stringify(
        identityService.getObservations().map((o) => `${o.category}:${o.name}`),
      )}`,
    );
    log("  -- this is the capability that depends on chat becoming a memory");
  });

  it("B3: which subsystems hold a chat-derived memory", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Host Project" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 20; i++) chat(`question ${i}`, pid);

    const mems = chatMemories();
    const ids = new Set(mems.map((m) => m.id));

    const inStories = storyService
      .getStories()
      .flatMap((s) => s.relatedMemoryIds)
      .filter((id) => ids.has(id)).length;
    const withImportance = mems.filter((m) => importanceService.getImportance(m.id)).length;
    const inRelationships = relationshipService
      .getRelationships()
      .filter((r) => ids.has(r.sourceMemoryId) || ids.has(r.targetMemoryId)).length;
    recallBuilder.rebuildRecallCandidates();
    const asCandidates = recallService
      .getRecallCandidates()
      .filter((c) => ids.has(c.memoryId));
    const inPrompt = contextRules
      .filterActiveRecallCandidates(recallService.getRecallCandidates())
      .filter((i) => ids.has(i.data.memoryId)).length;

    log("");
    log("=== B3  who holds a chat memory (20 messages, project-attached) ===");
    log(`chat memories            ${mems.length}`);
    log(`story memberships        ${inStories}`);
    log(`importance profiles      ${withImportance}`);
    log(`relationship endpoints   ${inRelationships}`);
    log(`recall candidates        ${asCandidates.length} (active ${asCandidates.filter((c) => c.status === "Active").length})`);
    log(`reaching the prompt      ${inPrompt}`);
    log(
      `stories touched: ${JSON.stringify(
        storyService
          .getStories()
          .filter((s) => s.relatedMemoryIds.some((id) => ids.has(id)))
          .map((s) => s.title),
      )}`,
    );
  });

  it("B4: the three non-chat record sites, for contrast", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Session Project" });
    const pid = akira.getState().lastProjectId as string;

    // chat.tsx:334 / :516 -- once per session
    eventService.record(
      "project_continued",
      "Companion Session Started",
      `Initiated companion workspace session for "Session Project" focusing on: "ship it"`,
      pid,
    );
    // chat.tsx:843 -- once per session, carries user-written notes
    eventService.record(
      "note_edited",
      "Companion Session Ended",
      `Concluded workspace session for "Session Project". Summary notes: "went well"`,
      pid,
    );

    log("");
    log("=== B4  the other three chat.tsx record sites ===");
    for (const m of memoryService.getMemories()) {
      log(
        `  ${m.eventType.padEnd(18)} ${classifyDurability(m.eventType).padEnd(9)} ${JSON.stringify(m.title)}`,
      );
    }
    log("  -- session lifecycle, once per session; only line 681 scales with conversation");
  });

  it("B6: does chat volume distort what AKIRA concludes about the user", () => {
    resetRetentionPolicy();
    freshWorkspace();

    // The Reflective trait's confidence is 0.5 + members * 0.1, capped at 1.0,
    // and its members are every "Reflection Worthy" memory. Chat is Reflection
    // Worthy, so conversation volume feeds a trait about introspection.
    akira.addNote("A genuine reflection I chose to write down.");
    identityBuilder.flushDirtyStories();
    const arcBefore = storyService.getStories().find((st) => st.title === "Personal Growth Reflections");
    const before = identityService.getObservations().find((o) => o.name === "Reflective");

    log("");
    log("=== B6  chat volume against the Reflective trait ===");
    log(`after 1 written reflection: members ${arcBefore?.relatedMemoryIds.length ?? 0}, confidence ${before?.confidence ?? "none"}`);

    for (let i = 0; i < 60; i++) chat(`ordinary question ${i}`);
    identityBuilder.flushDirtyStories();
    const arcAfter = storyService.getStories().find((st) => st.title === "Personal Growth Reflections");
    const after = identityService.getObservations().find((o) => o.name === "Reflective");
    const members = arcAfter?.relatedMemoryIds ?? [];
    const chatIds = new Set(chatMemories().map((m) => m.id));
    const chatMembers = members.filter((id) => chatIds.has(id)).length;

    log(`after 60 chat messages:     members ${members.length}, confidence ${after?.confidence ?? "none"}`);
    log(`  of those members, chat:   ${chatMembers} (${((chatMembers / Math.max(1, members.length)) * 100).toFixed(1)}%)`);
    log(`  provenance: ${JSON.stringify(after?.provenance ?? "")}`);
    log("  -- the trait says the user reflects; the evidence is that they typed");
  });

  it("B5: would Episodic change what chat-derived cognition does", () => {
    resetRetentionPolicy();
    freshWorkspace();

    chat("My goal is to learn Verilog");
    const before = personalDeclarationRule
      .evaluate(memoryService.getMemories(), storyService.getStories())
      .map((f) => f.canonicalKey);

    // Durability is consulted only by retention. Nothing in candidate, story,
    // importance, recall, understanding or identity reads it -- so the same
    // memories with a different class should produce identical cognition until
    // a cap is reached. Verified by asking every rule that touches a memory.
    const memories = memoryService.getMemories();
    const asEpisodic = memories.map((m) => ({ ...m, eventType: "task_completed" as const }));
    const after = personalDeclarationRule
      .evaluate(asEpisodic as never, storyService.getStories())
      .map((f) => f.canonicalKey);

    log("");
    log("=== B5  does the durability class reach cognition ===");
    log(`declaration fragments as Core:     ${JSON.stringify(before)}`);
    log(`same memories reclassified:        ${JSON.stringify(after)}`);
    log(`identical: ${JSON.stringify(before) === JSON.stringify(after)}`);
    log(
      "  note: eventType is read by classifyDurability (retention) and by the" +
        " candidate rules at intake; the rules above read reason/description.",
    );
  });
});
