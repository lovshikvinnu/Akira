/**
 * The three options for the chat intake boundary, measured.
 *
 *   A  current       raw chat -> Core memory
 *   B  transitional  raw chat -> Episodic memory
 *   C  proposed      raw chat -> conversation history only
 *
 * Three questions decide between them, and all three are retention or
 * dependency questions rather than cost questions:
 *
 *   DEPENDENCIES  what stops working if a chat turn is not a Memory?
 *   REPLAY        what reconstructs under C, and what silently does not?
 *   IS B SAFE     Episodic is capped at 500 / 750. Chat at hundreds a day would
 *                 then evict task completions -- the substrate relationships,
 *                 the Reinforcement signal and the project arcs are built from.
 *                 So B may relocate the fire rather than put it out.
 *
 * Option C is simulated rather than implemented: the durable stream is filtered
 * to drop chat events and replayed through the real reconstruction path, which
 * is exactly what a `chat_message` event type would produce, since the candidate
 * rules key on `eventType === "note_created"` and would not match it.
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

const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "akira-chat-options.txt");
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
const { buildRecallEvaluationContext } = await import("../src/genesis/recall/recall-rules");
const { classifyDurability, setRetentionPolicy, resetRetentionPolicy } = await import(
  "../src/genesis/retention/policy"
);

recallBuilder.initialize();

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  recallService.clearHistory();
  identityService.clearHistory();
}

function completeTask(projectId: string, title: string): void {
  akira.addTaskDetails({ title, projectId });
  const task = akira.getState().tasks.find((t) => t.title === title);
  if (!task) throw new Error(`store action did not create task "${title}"`);
  akira.toggleTask(task.id);
}

/** What `routes/chat.tsx` does for one user turn: history, then a MemoryEvent. */
function chatTurn(text: string, projectId: string | null = null): void {
  akira.addChatMessage("user", text);
  eventService.record(
    "note_created",
    "Workspace Interaction",
    `User query submitted to AKIRA: "${text}"`,
    projectId,
  );
}

const isChat = (d: string) => d.includes("submitted to AKIRA");

describe("chat boundary options", () => {
  it("O1: conversation already reaches recall without being a memory", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Live Channel" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 5; i++) completeTask(pid, `lc-${i}`);

    const before = buildRecallEvaluationContext();
    akira.addChatMessage("user", "how is the verilog compiler coming along");
    const after = buildRecallEvaluationContext();

    log("=== O1  the live chat->recall channel ===");
    log(`discussion before a chat message: ${JSON.stringify(before.discussion)}`);
    log(`discussion after:                 ${JSON.stringify(after.discussion)}`);
    log(`query stems before ${before.queryStems.length}, after ${after.queryStems.length}`);
    log(
      "  `buildRecallEvaluationContext` reads getChat() -- the chat ARRAY, not chat" +
        " memories. Conversation already steers semantic relevance through a channel" +
        " that has nothing to do with the memory stream.",
    );
  });

  it("O2: what stops working if a chat turn is not a Memory", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Dependency Graph" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 10; i++) completeTask(pid, `dg-${i}`);
    akira.addNote("A written reflection that is not chat.");
    for (let i = 0; i < 15; i++) chatTurn(`ordinary question ${i}`, pid);
    chatTurn("My goal is to learn Verilog", pid);

    const all = memoryService.getMemories();
    const chatIds = new Set(all.filter((m) => isChat(m.description)).map((m) => m.id));
    const withoutChat = all.filter((m) => !chatIds.has(m.id));

    // Every rule that reads memories, asked with and without the chat ones.
    const declAll = personalDeclarationRule
      .evaluate(all, storyService.getStories())
      .map((f) => f.canonicalKey)
      .sort();
    const declNoChat = personalDeclarationRule
      .evaluate(withoutChat, storyService.getStories())
      .map((f) => f.canonicalKey)
      .sort();

    recallBuilder.rebuildRecallCandidates();
    const cache = recallService.getRecallCandidates();
    const prompt = contextRules.filterActiveRecallCandidates(cache);

    log("");
    log("=== O2  dependency graph ===");
    log(`memories ${all.length}, of which chat ${chatIds.size}`);
    log(`declarations WITH chat:    ${JSON.stringify(declAll)}`);
    log(`declarations WITHOUT chat: ${JSON.stringify(declNoChat)}`);
    log(`  lost: ${JSON.stringify(declAll.filter((k) => !declNoChat.includes(k)))}`);
    log(
      `story memberships held by chat: ${storyService
        .getStories()
        .flatMap((s) => s.relatedMemoryIds)
        .filter((id) => chatIds.has(id)).length}`,
    );
    log(
      `relationship endpoints on chat: ${relationshipService
        .getRelationships()
        .filter((r) => chatIds.has(r.sourceMemoryId) || chatIds.has(r.targetMemoryId)).length}`,
    );
    log(`recall candidates that are chat: ${cache.filter((c) => chatIds.has(c.memoryId)).length}`);
    log(`prompt slots taken by chat:      ${prompt.filter((i) => chatIds.has(i.data.memoryId)).length} of ${prompt.length}`);
  });

  it("O3: reconstruction under C, simulated through the real replay path", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Replay Project" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 12; i++) completeTask(pid, `rp-${i}`);
    akira.addNote("My goal is to become a pilot and build an aviation company.");
    for (let i = 0; i < 20; i++) chatTurn(`question ${i}`, pid);

    const streamBefore = akira.getState().memories;
    memoryService.reconstructRuntimeMemory();
    recallBuilder.rebuildRecallCandidates();
    const withChat = {
      memories: memoryService.getMemories().length,
      stories: storyService.getStories().length,
      arcMembers: storyService.getStories().map((s) => s.relatedMemoryIds.length),
    };

    // Option C: the chat turns were never MemoryEvents. Filter and replay.
    const state = akira.getState() as AkiraState;
    akira.initializeState({
      ...state,
      memories: streamBefore.filter((e) => !isChat(e.description)),
    });
    memoryService.reconstructRuntimeMemory();
    recallBuilder.rebuildRecallCandidates();
    const withoutChat = {
      memories: memoryService.getMemories().length,
      stories: storyService.getStories().length,
      arcMembers: storyService.getStories().map((s) => s.relatedMemoryIds.length),
    };

    const foundingNote = memoryService
      .getMemories()
      .some((m) => m.description.includes("become a pilot"));
    const project = memoryService.getMemories().some((m) => m.eventType === "project_created");
    const chatHistory = akira.getState().chat.length;

    log("");
    log("=== O3  reconstruction under C ===");
    log(`durable stream: ${streamBefore.length} events, chat ${streamBefore.filter((e) => isChat(e.description)).length}`);
    log(`replayed WITH chat:    memories ${withChat.memories}, stories ${withChat.stories}, members ${JSON.stringify(withChat.arcMembers)}`);
    log(`replayed WITHOUT chat: memories ${withoutChat.memories}, stories ${withoutChat.stories}, members ${JSON.stringify(withoutChat.arcMembers)}`);
    log(`founding note survives replay: ${foundingNote}`);
    log(`project survives replay:       ${project}`);
    log(`conversation still on disk (s.chat): ${chatHistory} messages`);
    log(
      "  -- chat history is persisted by settings.updateChat, independent of the" +
        " MemoryEvent stream, so C loses no conversation. It loses the chat-derived" +
        " memories, which is the intent.",
    );
  });

  it("O4: is B safe -- chat as Episodic against the task-completion substrate", () => {
    resetRetentionPolicy();
    freshWorkspace();

    // Episodic production caps. Chat reclassified would land here.
    setRetentionPolicy({ maxMemories: 60, maxCoreMemories: 2000 });

    akira.addProject({ name: "Episodic Pressure" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 50; i++) completeTask(pid, `ep-${i}`);

    const tasksBefore = memoryService
      .getMemories()
      .filter((m) => m.eventType === "task_completed").length;
    const relBefore = relationshipService.getRelationships().length;

    // 150 chat turns recorded as an Episodic type, which is what B produces.
    for (let i = 0; i < 150; i++) {
      akira.addChatMessage("user", `q${i}`);
      eventService.record(
        "task_completed",
        "Workspace Interaction",
        `User query submitted to AKIRA: "q${i}"`,
        pid,
      );
    }

    const memories = memoryService.getMemories();
    const tasksAfter = memories.filter(
      (m) => m.eventType === "task_completed" && !isChat(m.description),
    ).length;
    const chatAfter = memories.filter((m) => isChat(m.description)).length;
    const relAfter = relationshipService.getRelationships().length;

    log("");
    log("=== O4  option B: chat in the Episodic class ===");
    log(`Episodic cap ${60}`);
    log(`real task completions before chat: ${tasksBefore}`);
    log(`real task completions after 150 chat turns: ${tasksAfter}`);
    log(`chat memories occupying Episodic: ${chatAfter}`);
    log(`relationships before ${relBefore}, after ${relAfter}`);
    log(
      "  -- if task completions fall, B relocates the displacement rather than" +
        " removing it: relationships, the Reinforcement signal and the project arcs" +
        " are all built from that substrate.",
    );

    resetRetentionPolicy();
  });
});
