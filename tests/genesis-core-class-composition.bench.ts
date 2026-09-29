/**
 * What is actually in the protected class.
 *
 * `retention/policy.ts` splits durability into Core and Episodic so that
 * "high-volume Episodic traffic can never displace a Core event" -- a founding
 * project must outlive a year of completed tasks. Core is capped at 2000 and
 * Episodic at 500, and `applyRuntimeRetention` counts each class independently,
 * so the protection holds *between* classes by construction.
 *
 * It does not hold *within* one. `routes/chat.tsx:682` records every chat
 * message the user sends as `eventType: "note_created"`, and
 * `classifyDurability("note_created")` is Core. Chat is the highest-volume
 * event type the product has, and it is inside the class built to be protected
 * from high volume.
 *
 * The table's own docblock reasons about exactly this and stops one caller
 * short. It enumerates who shares `note_created` -- "the goals, habits,
 * knowledge, relationships, companion-state and reflection services" -- and
 * justifies Core on the grounds that those are "deliberate user acts". Every
 * one of those six fires on an explicit correction, a handful per week. A chat
 * message is deliberate too, and arrives hundreds of times a day. The premise
 * is about deliberateness; the cap is about volume; chat separates them.
 *
 * This measures the composition of the class and what eviction does at its
 * boundary. It asserts nothing -- the fix is a product decision about whether a
 * chat message should be a memory at all, and if so which class it belongs in.
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

const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "akira-core-class.txt");
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
const { eventService } = await import("../src/genesis/events/event-service");
const { classifyDurability, setRetentionPolicy, resetRetentionPolicy } =
  await import("../src/genesis/retention/policy");

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

/** Exactly what `routes/chat.tsx:682` does. */
function sendChatMessage(text: string, projectId: string | null = null): void {
  eventService.record(
    "note_created",
    "Workspace Interaction",
    `User query submitted to AKIRA: "${text}"`,
    projectId,
  );
}

const CHAT_MARKER = "submitted to AKIRA";
const isChat = (d: string) => d.includes(CHAT_MARKER);

function coreComposition() {
  const memories = memoryService.getMemories();
  const core = memories.filter((m) => classifyDurability(m.eventType) === "Core");
  const chat = core.filter((m) => isChat(m.description));
  const notes = core.filter((m) => m.relatedNoteId && !isChat(m.description));
  const projects = core.filter((m) => m.eventType.startsWith("project_"));
  const other = core.length - chat.length - notes.length - projects.length;
  return {
    total: memories.length,
    core: core.length,
    chat: chat.length,
    notes: notes.length,
    projects: projects.length,
    other,
  };
}

describe("the Core class", () => {
  it("C1: what a chatty session puts in the protected class", () => {
    resetRetentionPolicy();
    freshWorkspace();

    akira.addProject({ name: "Founding Project" });
    const pid = akira.getState().lastProjectId as string;
    akira.addNote("My goal is to become a pilot and build an aviation company.");
    akira.addNote({ title: "Why this matters", content: "The reason I started." });
    for (let i = 0; i < 30; i++) completeTask(pid, `t-${i}`);

    // One working session's worth of conversation.
    for (let i = 0; i < 200; i++) sendChatMessage(`question number ${i}`);

    const c = coreComposition();
    log("=== C1  composition after one chatty session ===");
    log(`memories ${c.total}, of which Core ${c.core}`);
    log(
      `  chat messages   ${c.chat}  (${((c.chat / Math.max(1, c.core)) * 100).toFixed(1)}% of Core)`,
    );
    log(`  captured notes  ${c.notes}`);
    log(`  project events  ${c.projects}`);
    log(`  other           ${c.other}`);
    log(`Episodic (task completions etc): ${c.total - c.core}`);
  });

  it("C2: at the Core cap, does chat evict what Core exists to protect", () => {
    resetRetentionPolicy();
    freshWorkspace();

    // A small Core cap stands in for a long life at the real 2000.
    setRetentionPolicy({ maxCoreMemories: 40, maxMemories: 500 });

    akira.addProject({ name: "Founding Project" });
    const pid = akira.getState().lastProjectId as string;
    akira.addNote("My goal is to become a pilot and build an aviation company.");
    akira.addNote({ title: "Founding intent", content: "Why I started all of this." });

    const foundingProjectPresent = () =>
      memoryService.getMemories().some((m) => m.eventType === "project_created");
    const foundingNotePresent = () =>
      memoryService
        .getMemories()
        .some((m) => m.description.includes("become a pilot") && !isChat(m.description));

    log("");
    log("=== C2  eviction at the Core boundary ===");
    log(
      `before chat -- founding project: ${foundingProjectPresent()}, founding note: ${foundingNotePresent()}`,
    );

    for (let i = 0; i < 30; i++) completeTask(pid, `bt-${i}`);
    log(
      `after 30 task completions (Episodic) -- project: ${foundingProjectPresent()}, note: ${foundingNotePresent()}`,
    );

    for (let i = 0; i < 100; i++) sendChatMessage(`chat ${i}`);
    const c = coreComposition();
    log(
      `after 100 chat messages -- project: ${foundingProjectPresent()}, note: ${foundingNotePresent()}`,
    );
    log(
      `  Core now ${c.core}: chat ${c.chat}, notes ${c.notes}, projects ${c.projects}, other ${c.other}`,
    );

    resetRetentionPolicy();
  });

  it("C3: the same volume as Episodic, for contrast", () => {
    resetRetentionPolicy();
    freshWorkspace();
    setRetentionPolicy({ maxCoreMemories: 40, maxMemories: 500 });

    akira.addProject({ name: "Founding Project" });
    const pid = akira.getState().lastProjectId as string;
    akira.addNote("My goal is to become a pilot and build an aviation company.");

    // Episodic volume at the same scale: the protection the design does deliver.
    for (let i = 0; i < 300; i++) completeTask(pid, `et-${i}`);

    const project = memoryService.getMemories().some((m) => m.eventType === "project_created");
    const note = memoryService.getMemories().some((m) => m.description.includes("become a pilot"));
    const c = coreComposition();

    log("");
    log("=== C3  300 Episodic events against the same Core cap ===");
    log(`founding project survives: ${project}`);
    log(`founding note survives:    ${note}`);
    log(`  Core ${c.core}: chat ${c.chat}, notes ${c.notes}, projects ${c.projects}`);
    log("  -- this is the protection working; C2 is the same volume from inside the class");

    resetRetentionPolicy();
  });

  it("C4: durable stream, since that is what survives a reload", () => {
    resetRetentionPolicy();
    freshWorkspace();
    setRetentionPolicy({ maxCoreMemoryEvents: 40, maxMemoryEvents: 750 });

    akira.addProject({ name: "Founding Project" });
    akira.addNote("My goal is to become a pilot and build an aviation company.");
    for (let i = 0; i < 100; i++) sendChatMessage(`durable chat ${i}`);

    const stream = akira.getState().memories;
    const core = stream.filter((e) => classifyDurability(e.eventType) === "Core");
    const chat = core.filter((e) => isChat(e.description));

    log("");
    log("=== C4  the durable stream at the Core event cap ===");
    log(`stream ${stream.length}, Core ${core.length}, of which chat ${chat.length}`);
    log(`founding project in the stream: ${stream.some((e) => e.eventType === "project_created")}`);
    log(
      `founding note in the stream:    ${stream.some((e) => e.description.includes("become a pilot") && !isChat(e.description))}`,
    );

    resetRetentionPolicy();
  });
});
