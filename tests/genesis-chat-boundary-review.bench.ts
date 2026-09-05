/**
 * Adversarial review instrument for the chat -> cognition boundary.
 *
 * Written before the implementation lands, against the LOCKED architecture
 * rather than against any particular design of it:
 *
 *   - a new `chat_message` event type
 *   - raw chat does not automatically become a GENESIS memory
 *   - chat remains available through `getChat()`
 *   - valuable declarations are explicitly promoted
 *   - existing chat-derived memories age out naturally
 *   - raw chat must NOT be moved to Episodic
 *
 * The last of those is the one with a trap under it, and R1 demonstrates the
 * trap rather than asserting it. `eventService.record` persists unconditionally
 * -- `saveMemory(event)` runs before any candidate rule is consulted -- and
 * `classifyDurability` returns Episodic for any type not in the table. So an
 * implementation that keeps calling `record("chat_message", ...)` produces no
 * Memory and still puts every chat turn into the Episodic half of the DURABLE
 * STREAM, where it competes with task completions for `maxMemoryEvents`.
 *
 * "Produces no memory" and "consumes no retention budget" are different
 * claims, and only the first is enforced by not having a candidate rule.
 *
 * Workloads here deliberately vary what earlier fixtures held constant: chat
 * messages have distinct phrasing, the chat array is populated through
 * `addChatMessage` as `chat.tsx` does, and arms run both free-standing and
 * inside a project session.
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

const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "akira-chat-review.txt");
writeFileSync(REPORT, "");
const log = (...parts: string[]) => appendFileSync(REPORT, parts.join(" ") + EOL);

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
const { classifyDurability, getRetentionPolicy, setRetentionPolicy, resetRetentionPolicy } =
  await import("../src/genesis/retention/policy");

function freshWorkspace(): void {
  const state = akira.getState() as AkiraState;
  akira.initializeState({ ...state, memories: [], tasks: [], notes: [], projects: [], chat: [] });
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

/** Distinct phrasing, so no arm accidentally holds vocabulary constant. */
const QUESTIONS = [
  "how do I wire the uart on this board",
  "remind me what the deploy step needs",
  "is the invoice for March paid yet",
  "what did we decide about the schema migration",
  "can you summarise yesterday",
  "which flight school is nearest",
  "explain monads again",
  "should I refactor the parser now",
  "did the tests pass",
  "what time is the standup",
  "help me name this function",
  "what does ETIMEDOUT mean",
  "why is the build slow",
  "who wrote this module",
  "what is my next task",
  "how long until the release",
  "draft a reply to Sam",
  "book a table for two",
  "is there milk left",
  "what is the capital of Peru",
];
const question = (i: number) =>
  QUESTIONS[i % QUESTIONS.length] + (i >= QUESTIONS.length ? ` (${i})` : "");

/**
 * A chat turn under the LOCKED architecture, as the simplest implementation of
 * it would be written: history first, then an event carrying the new type.
 * This is a review fixture demonstrating what that shape does -- not a
 * proposed implementation.
 */
function lockedChatTurn(text: string, projectId: string | null = null): void {
  akira.addChatMessage("user", text);
  eventService.record("chat_message" as never, "Workspace Interaction", text, projectId);
}

describe("chat boundary review", () => {
  it("R1: does a chat_message event still consume durable retention budget", () => {
    resetRetentionPolicy();
    freshWorkspace();

    log("=== R1  the trap under 'raw chat must not be Episodic' ===");
    log(`classifyDurability("chat_message") = ${classifyDurability("chat_message")}`);
    log(
      `  unknown types default to Episodic (policy.ts), and eventService.record` +
        ` calls saveMemory BEFORE any candidate rule is consulted.`,
    );

    // Tight Episodic EVENT cap stands in for a long life at the real 750.
    setRetentionPolicy({ maxMemoryEvents: 40, maxCoreMemoryEvents: 2000 });

    akira.addProject({ name: "Durable Budget" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 30; i++) completeTask(pid, `db-${i}`);

    const stream0 = akira.getState().memories;
    const tasks0 = stream0.filter((e) => e.eventType === "task_completed").length;

    for (let i = 0; i < 100; i++) lockedChatTurn(question(i), pid);

    const stream1 = akira.getState().memories;
    const tasks1 = stream1.filter((e) => e.eventType === "task_completed").length;
    const chatEvents = stream1.filter((e) => e.eventType === ("chat_message" as never)).length;
    const memories = memoryService.getMemories();

    log(`durable task_completed events before chat: ${tasks0}`);
    log(`durable task_completed events after 100 chat turns: ${tasks1}`);
    log(`chat_message events occupying the stream: ${chatEvents}`);
    log(
      `GENESIS memories produced by those 100 turns: ${
        memories.filter((m) => QUESTIONS.some((q) => m.description.includes(q))).length
      }`,
    );
    log(
      tasks1 < tasks0
        ? "  DEFECT SHAPE: no Memory is produced, but the durable stream is displaced anyway"
        : "  clean: chat events did not displace durable task history",
    );

    resetRetentionPolicy();
  });

  it("R2: is the durability table explicit about chat, or silent", () => {
    log("");
    log("=== R2  explicit vs default classification ===");
    for (const t of [
      "chat_message",
      "note_created",
      "note_edited",
      "task_completed",
      "project_created",
      "project_continued",
      "some.future.event",
    ]) {
      log(`  ${t.padEnd(20)} ${classifyDurability(t)}`);
    }
    log(
      `  policy caps: Core ${getRetentionPolicy().maxCoreMemoryEvents} events /` +
        ` ${getRetentionPolicy().maxCoreMemories} memories;` +
        ` Episodic ${getRetentionPolicy().maxMemoryEvents} / ${getRetentionPolicy().maxMemories}`,
    );
    log(
      "  -- a type absent from the table is indistinguishable from a type" +
        " deliberately classed Episodic. The lock says chat must be NEITHER.",
    );
  });

  it("R3: baseline -- what the four chat.tsx sites do today, for the diff", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Baseline" });
    const pid = akira.getState().lastProjectId as string;

    eventService.record(
      "project_continued",
      "Companion Session Started",
      `Initiated companion workspace session for "Baseline" focusing on: "ship it"`,
      pid,
    );
    eventService.record(
      "note_edited",
      "Companion Session Ended",
      `Concluded workspace session for "Baseline". Summary notes: "went well"`,
      pid,
    );
    akira.addNote("A written reflection, which must be unaffected.");

    log("");
    log("=== R3  session lifecycle and note ingestion, pre-change baseline ===");
    for (const m of memoryService.getMemories()) {
      log(
        `  ${m.eventType.padEnd(18)} ${classifyDurability(m.eventType).padEnd(9)}` +
          ` reason ${String(m.reason).padEnd(20)} ${JSON.stringify(m.title)}`,
      );
    }
    log("  -- these three must be byte-identical after the change");
  });

  it("R4: existing chat memories must age out, not vanish or be reclassified", () => {
    resetRetentionPolicy();
    freshWorkspace();

    // Legacy shape: chat recorded as note_created, as it is today.
    akira.addProject({ name: "Legacy" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 12; i++) {
      akira.addChatMessage("user", question(i));
      eventService.record(
        "note_created",
        "Workspace Interaction",
        `User query submitted to AKIRA: "${question(i)}"`,
        pid,
      );
    }

    const legacy = akira
      .getState()
      .memories.filter((e) => e.description.includes("submitted to AKIRA"));

    log("");
    log("=== R4  legacy chat-derived events ===");
    log(`legacy chat events in the durable stream: ${legacy.length}`);
    log(
      `their durability class: ${[...new Set(legacy.map((e) => classifyDurability(e.eventType)))].join(", ")}`,
    );
    log(
      `legacy chat memories in the runtime set: ${
        memoryService.getMemories().filter((m) => m.description.includes("submitted to AKIRA"))
          .length
      }`,
    );
    log(
      "  -- the lock says these age out naturally. After the change they must" +
        " still be Core note_created, still replay, and not be purged or" +
        " retroactively reclassified.",
    );

    // And they must survive a replay unchanged.
    memoryService.reconstructRuntimeMemory();
    log(
      `after reconstruction: ${
        memoryService.getMemories().filter((m) => m.description.includes("submitted to AKIRA"))
          .length
      } legacy chat memories`,
    );
  });

  it("R5: chat must stay available to cognition through getChat()", () => {
    resetRetentionPolicy();
    freshWorkspace();

    for (let i = 0; i < 6; i++) lockedChatTurn(question(i));

    const chat = akira.getState().chat;
    log("");
    log("=== R5  conversation availability ===");
    log(`messages in the chat array: ${chat.length}`);
    log(`last user message: ${JSON.stringify(chat[chat.length - 1]?.text ?? "")}`);
    log(
      "  -- buildRecallEvaluationContext and resolveCurrentContext both read this" +
        " array, so context resolution and semantic relevance survive the change.",
    );
  });
});
