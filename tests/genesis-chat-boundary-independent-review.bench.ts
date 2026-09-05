/**
 * Independent adversarial verification of the implemented chat boundary.
 *
 * Deliberately not built from the implementer's fixtures. Every arm drives the
 * real store/event path, uses distinct phrasing per turn, populates the chat
 * array as `chat.tsx` does, and runs both free-standing and in-session --
 * the three variables earlier fixtures on both sides held constant by accident.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { EOL, tmpdir } from "node:os";
import { join } from "node:path";

const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "c3-review.txt");
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
const { recallService } = await import("../src/genesis/recall/recall-service");
const { eventService } = await import("../src/genesis/events/event-service");
const { identityService } = await import("../src/genesis/understanding/identity-service");
const { identityBuilder } = await import("../src/genesis/understanding/identity-builder");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { classifyDurability, setRetentionPolicy, resetRetentionPolicy } =
  await import("../src/genesis/retention/policy");

function freshWorkspace(): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
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
  const t = akira.getState().tasks.find((x) => x.title === title);
  if (!t) throw new Error(`no task ${title}`);
  akira.toggleTask(t.id);
}

/** The implemented chat path: history, then a chat_message event. */
function chatTurn(text: string, projectId: string | null = null): void {
  akira.addChatMessage("user", text);
  eventService.record("chat_message", "Workspace Interaction", text, projectId);
}

/** Ordinary working conversation. None of this declares an identity. */
const CONVERSATION = [
  "what should I work on today",
  "I like the new API surface better than the old one",
  "can you summarise yesterday's standup",
  "I hate this bug, it's taken all morning",
  "why is the build so slow",
  "I prefer the old layout honestly",
  "what does ETIMEDOUT mean",
  "I always forget the deploy command",
  "remind me what the schema migration needed",
  "I usually run the tests before lunch",
  "who wrote this module",
  "I believe the parser is wrong here",
  "draft a reply to Sam",
  "I enjoy pairing on Fridays",
  "how long until the release",
  "I love how fast this is now",
  "is the invoice paid",
  "I dislike the new icon set",
  "book a table for two",
  "I care deeply about getting this right",
  "what is my next task",
  "I value honesty in code review",
  "every morning I check the dashboard",
  "explain monads again",
  "I am interested in the new runtime",
  "did the tests pass",
];

const stream = () => akira.getState().memories;
const declEvents = () => stream().filter((e) => e.eventType === ("declaration_captured" as never));

describe("independent review", () => {
  it("V1: ten checks over a realistic session", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Review Project" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 20; i++) completeTask(pid, `rv-${i}`);
    akira.addNote({ title: "Founding note", content: "My goal is to ship AKIRA" });

    const streamBeforeChat = stream().length;
    const memBeforeChat = memoryService.getMemories().length;

    for (const t of CONVERSATION) chatTurn(t, pid);

    log("=== V1  realistic session, 26 ordinary turns ===");
    log(`durable stream: ${streamBeforeChat} before chat, ${stream().length} after`);
    log(
      `chat_message events in the stream: ${stream().filter((e) => e.eventType === ("chat_message" as never)).length}`,
    );
    log(`memories: ${memBeforeChat} before chat, ${memoryService.getMemories().length} after`);
    log(`declaration_captured events: ${declEvents().length}`);
    for (const e of declEvents()) log(`    ${JSON.stringify(e.description)}`);
    log(`chat array (getChat availability): ${akira.getState().chat.length} messages`);
  });

  it("V2: session lifecycle and note ingestion unchanged", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Lifecycle" });
    const pid = akira.getState().lastProjectId as string;
    eventService.record(
      "project_continued",
      "Companion Session Started",
      `Initiated companion workspace session for "Lifecycle" focusing on: "ship it"`,
      pid,
    );
    eventService.record(
      "note_edited",
      "Companion Session Ended",
      `Concluded workspace session for "Lifecycle". Summary notes: "went well"`,
      pid,
    );
    akira.addNote("A written reflection, unaffected by the chat change.");

    log("");
    log("=== V2  the three sites that must not move ===");
    for (const m of memoryService.getMemories()) {
      log(
        `  ${m.eventType.padEnd(20)} ${classifyDurability(m.eventType).padEnd(9)} reason ${String(m.reason).padEnd(20)} ${JSON.stringify(m.title)}`,
      );
    }
  });

  it("V3: HARDEST PATH A -- declaration in chat, then reload", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Replay" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 10; i++) completeTask(pid, `rp-${i}`);
    for (const t of CONVERSATION.slice(0, 8)) chatTurn(t, pid);
    chatTurn("I want to become a pilot and build an aviation company", pid);
    for (const t of CONVERSATION.slice(8, 14)) chatTurn(t, pid);

    identityBuilder.flushDirtyStories();
    const liveMem = memoryService.getMemories().length;
    const liveDecl = memoryService
      .getMemories()
      .filter((m) => m.description.includes("become a pilot")).length;
    const liveGoals = identityService
      .getObservations()
      .filter((o) => o.category === "Aspiration")
      .map((o) => o.name);

    memoryService.reconstructRuntimeMemory();
    identityBuilder.flushDirtyStories();
    const r1Mem = memoryService.getMemories().length;
    const r1Decl = memoryService
      .getMemories()
      .filter((m) => m.description.includes("become a pilot")).length;

    memoryService.reconstructRuntimeMemory();
    const r2Mem = memoryService.getMemories().length;
    const r2Decl = memoryService
      .getMemories()
      .filter((m) => m.description.includes("become a pilot")).length;

    log("");
    log("=== V3  declaration in chat, then reload ===");
    log(`memories       live ${liveMem}  replay ${r1Mem}  replay x2 ${r2Mem}`);
    log(
      `the declaration live ${liveDecl}  replay ${r1Decl}  replay x2 ${r2Decl}  (must be exactly 1)`,
    );
    log(`identity Aspirations live: ${JSON.stringify(liveGoals)}`);
    log(
      `chat memories resurrected by replay: ${
        memoryService
          .getMemories()
          .filter((m) =>
            CONVERSATION.some((c) => m.description === c && !m.description.includes("become")),
          ).length
      }`,
    );
  });

  it("V4: HARDEST PATH B -- declaration in chat during a project session", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "In Session" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 6; i++) completeTask(pid, `is-${i}`);
    chatTurn("My goal is to learn Verilog", pid);

    const decl = memoryService.getMemories().find((m) => m.description.includes("learn Verilog"));
    const story = decl ? storyService.findStoryContainingMemory(decl.id) : undefined;

    log("");
    log("=== V4  declaration during an active project session ===");
    log(`declaration memory exists: ${Boolean(decl)}`);
    log(`  relatedProjectId: ${JSON.stringify(decl?.relatedProjectId)}`);
    log(`  story:            ${story ? JSON.stringify(story.title) : "NONE"}`);
    log(`  reason:           ${JSON.stringify(decl?.reason)}`);
    log(
      `  eventType:        ${decl?.eventType}  durability ${decl ? classifyDurability(decl.eventType) : "-"}`,
    );
    log(
      `  understandings:   ${JSON.stringify(
        understandingEngine
          .getUnderstandings()
          .filter((u) => u.category === "Goal")
          .map((u) => u.canonicalKey),
      )}`,
    );
  });

  it("V5: THE DEFECT -- ordinary conversation, then reload", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Gate" });
    const pid = akira.getState().lastProjectId as string;
    for (const t of CONVERSATION) chatTurn(t, pid);
    identityBuilder.flushDirtyStories();

    const promoted = declEvents();
    const obs = identityService.getObservations();

    log("");
    log("=== V5  what ordinary conversation leaves behind ===");
    log(`ordinary turns: ${CONVERSATION.length}`);
    log(`promoted to durable Core events: ${promoted.length}`);
    for (const e of promoted) {
      log(`    ${classifyDurability(e.eventType)}  ${JSON.stringify(e.description)}`);
    }
    log(`identity observations created: ${obs.length}`);
    for (const o of obs) log(`    ${o.category}:${o.name}  confidence ${o.confidence}`);

    memoryService.reconstructRuntimeMemory();
    log(
      `after reload, Core memories from conversation: ${
        memoryService.getMemories().filter((m) => CONVERSATION.includes(m.description)).length
      }`,
    );

    // Projection at the real Core cap.
    const rate = promoted.length / CONVERSATION.length;
    log(
      `promotion rate ${(rate * 100).toFixed(1)}%  ->  a 200-turn session yields ~${Math.round(rate * 200)} Core memories`,
    );
    log(
      `  Core cap is 2000, so ~${Math.round(2000 / Math.max(1, rate * 200))} sessions to refill it`,
    );
  });

  it("V6: Core capacity under sustained conversation", () => {
    resetRetentionPolicy();
    freshWorkspace();
    setRetentionPolicy({ maxCoreMemories: 40, maxCoreMemoryEvents: 40, maxMemories: 500 });

    akira.addProject({ name: "Capacity" });
    const pid = akira.getState().lastProjectId as string;
    akira.addNote({ title: "Founding", content: "The reason I started all of this." });

    const founding = () =>
      memoryService.getMemories().some((m) => m.description.includes("reason I started"));
    log("");
    log("=== V6  founding knowledge under sustained conversation ===");
    log(`founding note before conversation: ${founding()}`);

    for (let round = 0; round < 6; round++) {
      for (const t of CONVERSATION) chatTurn(`${t} (${round})`, pid);
    }

    log(`founding note after ${6 * CONVERSATION.length} turns: ${founding()}`);
    const core = memoryService
      .getMemories()
      .filter((m) => classifyDurability(m.eventType) === "Core");
    log(
      `Core memories: ${core.length}, of which declaration_captured: ${
        core.filter((m) => m.eventType === ("declaration_captured" as never)).length
      }`,
    );
    resetRetentionPolicy();
  });
});
