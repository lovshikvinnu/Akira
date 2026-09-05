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

  it("O5: is the zero-output claim conditional on there being no project session", () => {
    resetRetentionPolicy();

    // chat.tsx is the *companion workspace*. An active project session is the
    // normal case there, not the exception, so a zero-output finding measured
    // free-standing needs that condition stated.
    const arm = (attachToProject: boolean) => {
      freshWorkspace();
      akira.addProject({ name: "Session Arm" });
      const pid = akira.getState().lastProjectId as string;
      for (let i = 0; i < 10; i++) completeTask(pid, `sa-${i}`);
      for (let i = 0; i < 20; i++) chatTurn(`question ${i}`, attachToProject ? pid : null);

      const chatIds = new Set(
        memoryService.getMemories().filter((m) => isChat(m.description)).map((m) => m.id),
      );
      recallBuilder.rebuildRecallCandidates();
      const cache = recallService.getRecallCandidates();
      const active = cache.filter((c) => c.status === "Active" && chatIds.has(c.memoryId));
      const prompt = contextRules
        .filterActiveRecallCandidates(cache)
        .filter((i) => chatIds.has(i.data.memoryId));
      const rels = relationshipService
        .getRelationships()
        .filter((r) => chatIds.has(r.sourceMemoryId) || chatIds.has(r.targetMemoryId));
      const arcSeats = storyService
        .getStories()
        .flatMap((st) => st.relatedMemoryIds)
        .filter((id) => chatIds.has(id)).length;
      return { active: active.length, prompt: prompt.length, rels: rels.length, arcSeats };
    };

    const free = arm(false);
    const attached = arm(true);

    log("");
    log("=== O5  zero output, or zero output without a project session ===");
    log(`free-standing chat   active recall ${free.active}, prompt ${free.prompt}, relationships ${free.rels}, arc seats ${free.arcSeats}`);
    log(`project-attached     active recall ${attached.active}, prompt ${attached.prompt}, relationships ${attached.rels}, arc seats ${attached.arcSeats}`);
    log("  -- chat.tsx passes currentProjectId, so attached is the companion-session case");
  });

  it("O9: is chat's score real, or does my fixture share vocabulary with the query", () => {
    resetRetentionPolicy();

    // O8 gave every chat message the text `question N`, so they all share
    // vocabulary with the live query -- which is itself one of them. That is a
    // fixture artefact of exactly the kind I challenged elsewhere, so this arm
    // varies the text and re-asks.
    const VARIED = [
      "how do I wire the uart on this board",
      "remind me what the deploy step needs",
      "is the invoice for March paid yet",
      "what did we decide about the schema migration",
      "can you summarise yesterday",
      "which flight school is nearest",
      "what is the capital of Peru",
      "explain monads again",
      "should I refactor the parser now",
      "did the tests pass",
      "what time is the standup",
      "help me name this function",
      "is there milk left",
      "what does ETIMEDOUT mean",
      "book a table for two",
      "why is the build slow",
      "who wrote this module",
      "what is my next task",
      "how long until the release",
      "draft a reply to Sam",
    ];

    const arm = (label: string, texts: string[]) => {
      freshWorkspace();
      akira.addProject({ name: "Vocab Arm" });
      const pid = akira.getState().lastProjectId as string;
      for (let i = 0; i < 30; i++) completeTask(pid, `va-${i}`);
      akira.addNote("A written reflection that is not chat.");
      for (const t of texts) chatTurn(t, pid);

      const byId = new Map(memoryService.getMemories().map((m) => [m.id, m]));
      recallBuilder.rebuildRecallCandidates();
      const cache = recallService.getRecallCandidates();
      const prompt = contextRules.filterActiveRecallCandidates(cache);
      const chatIds = new Set(
        memoryService.getMemories().filter((m) => isChat(m.description)).map((m) => m.id),
      );
      const scoreOf = (c: unknown) => (c as { recallScore?: number }).recallScore ?? -1;
      const chatScores = cache.filter((c) => chatIds.has(c.memoryId)).map(scoreOf);
      const taskScores = cache
        .filter((c) => {
          const m = byId.get(c.memoryId);
          return m && m.eventType === "task_completed";
        })
        .map(scoreOf);

      log(
        `  ${label.padEnd(22)} chat slots ${String(prompt.filter((i) => chatIds.has(i.data.memoryId)).length).padStart(2)}/${prompt.length}` +
          `  chat score ${Math.min(...chatScores).toFixed(2)}..${Math.max(...chatScores).toFixed(2)}` +
          `  task score ${Math.min(...taskScores).toFixed(2)}..${Math.max(...taskScores).toFixed(2)}`,
      );
    };

    log("");
    log("=== O9  vocabulary overlap, controlled ===");
    log(`last user message drives semantic relevance; it is itself a chat memory`);
    arm("uniform 'question N'", Array.from({ length: 20 }, (_, i) => `question ${i}`));
    arm("varied real questions", VARIED);
  });

  it("O8: what is actually in the twelve slots, itemised", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Itemised" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 30; i++) completeTask(pid, `it-${i}`);
    akira.addNote("A written reflection that is not chat.");
    for (let i = 0; i < 20; i++) chatTurn(`question ${i}`, pid);

    recallBuilder.rebuildRecallCandidates();
    const cache = recallService.getRecallCandidates();
    const prompt = contextRules.filterActiveRecallCandidates(cache);
    const byId = new Map(memoryService.getMemories().map((m) => [m.id, m]));

    log("");
    log("=== O8  the twelve slots, itemised ===");
    log(`context ${recallBuilder.resolveCurrentContext()}`);
    log(`memories ${memoryService.getMemories().length}, candidates ${cache.length}, active ${cache.filter((c) => c.status === "Active").length}`);
    for (const item of prompt) {
      const m = byId.get(item.data.memoryId);
      const kind = !m ? "?" : isChat(m.description) ? "CHAT" : m.relatedNoteId ? "note" : m.eventType;
      const sc = (item.data as { recallScore?: number }).recallScore;
      const au = (item.data as { userAuthored?: boolean }).userAuthored;
      log(`  ${String(kind).padEnd(14)} score ${sc?.toFixed(2) ?? "n/a"}  authored ${au}  ${item.inclusionReason}`);
    }

    // And the score distribution across all active candidates, by kind.
    const scoreOf = (c: unknown) => (c as { recallScore?: number }).recallScore ?? -1;
    const active = cache.filter((c) => c.status === "Active");
    const kinds = new Map<string, number[]>();
    for (const c of active) {
      const m = byId.get(c.memoryId);
      const kind = !m ? "?" : isChat(m.description) ? "CHAT" : m.relatedNoteId ? "note" : m.eventType;
      if (!kinds.has(kind)) kinds.set(kind, []);
      kinds.get(kind)!.push(scoreOf(c));
    }
    log("  score range by kind across all active candidates:");
    for (const [kind, scores] of kinds) {
      log(`    ${kind.padEnd(14)} n=${String(scores.length).padStart(3)}  ${Math.min(...scores).toFixed(2)}..${Math.max(...scores).toFixed(2)}`);
    }
  });

  it("O7: how chat's share of the prompt varies with how much real work exists", () => {
    resetRetentionPolicy();

    // Two of my own earlier arms disagreed -- one reported 1 of 12 slots taken
    // by chat, another 12 of 12 -- and I quoted the worse without reconciling
    // them. This varies the one thing that differed.
    const arm = (tasks: number, notes: number, chats: number) => {
      freshWorkspace();
      akira.addProject({ name: "Share Arm" });
      const pid = akira.getState().lastProjectId as string;
      for (let i = 0; i < tasks; i++) completeTask(pid, `sh-${i}`);
      for (let i = 0; i < notes; i++) akira.addNote(`A written reflection ${i}.`);
      for (let i = 0; i < chats; i++) chatTurn(`question ${i}`, pid);

      const chatIds = new Set(
        memoryService.getMemories().filter((m) => isChat(m.description)).map((m) => m.id),
      );
      recallBuilder.rebuildRecallCandidates();
      const cache = recallService.getRecallCandidates();
      const prompt = contextRules.filterActiveRecallCandidates(cache);
      const chatSlots = prompt.filter((i) => chatIds.has(i.data.memoryId)).length;
      const scores = prompt.map((i) => (i.data as { recallScore?: number }).recallScore ?? -1);
      return {
        prompt: prompt.length,
        chatSlots,
        topScore: Math.max(...scores),
        lowScore: Math.min(...scores),
      };
    };

    log("");
    log("=== O7  chat's share of the prompt vs how much real work exists ===");
    for (const [tasks, notes, chats] of [
      [0, 0, 20],
      [10, 0, 20],
      [10, 1, 20],
      [30, 1, 20],
      [100, 1, 20],
    ] as Array<[number, number, number]>) {
      const r = arm(tasks, notes, chats);
      log(
        `  tasks ${String(tasks).padStart(3)}  notes ${notes}  chat ${chats}  ->` +
          ` chat holds ${String(r.chatSlots).padStart(2)} of ${r.prompt} slots` +
          `  (scores ${r.lowScore.toFixed(2)}..${r.topScore.toFixed(2)})`,
      );
    }
    log("  -- chat floods the prompt in proportion to how little real work outranks it");
  });

  it("O6: does a memory keep Story Influence after the arc evicts it", () => {
    resetRetentionPolicy();
    freshWorkspace();
    setRetentionPolicy({ maxMemoriesPerStory: 12, maxMemories: 500, maxCoreMemories: 2000 });

    // Chat 4 flagged this as retention territory: importance is not
    // recalculated when a story drops a member, so a signal derived from
    // membership may outlive the membership.
    for (let i = 0; i < 4; i++) akira.addNote(`A written reflection number ${i}.`);
    const notes = memoryService.getMemories().filter((m) => m.relatedNoteId);
    const before = notes.map((m) => ({
      id: m.id,
      inArc: Boolean(storyService.findStoryContainingMemory(m.id)),
      hasStoryInfluence: Boolean(
        importanceService.getImportance(m.id)?.signals.some((sg) => sg.type === "Story Influence"),
      ),
    }));

    for (let i = 0; i < 30; i++) chatTurn(`flood ${i}`);

    const after = before.map((b) => ({
      inArc: Boolean(storyService.findStoryContainingMemory(b.id)),
      hasStoryInfluence: Boolean(
        importanceService.getImportance(b.id)?.signals.some((sg) => sg.type === "Story Influence"),
      ),
    }));

    log("");
    log("=== O6  stale Story Influence after arc eviction ===");
    log(`notes before flood: in arc ${before.filter((b) => b.inArc).length}/${before.length}, with Story Influence ${before.filter((b) => b.hasStoryInfluence).length}`);
    log(`notes after flood:  in arc ${after.filter((b) => b.inArc).length}/${after.length}, with Story Influence ${after.filter((b) => b.hasStoryInfluence).length}`);
    const stale = after.filter((a) => !a.inArc && a.hasStoryInfluence).length;
    log(`memories holding Story Influence while NOT in any arc: ${stale}`);

    resetRetentionPolicy();
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
