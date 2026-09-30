/**
 * One user's life with AKIRA, across restarts, through the production paths.
 *
 * Every hardening fix in deep-scan/chat6_findings.md was proven in isolation.
 * This walks them in one sequence, because the failures that audit found lived
 * in the seams between systems that were each correct alone:
 *
 *   create project -> tasks -> reorder -> work a session -> notes -> chat
 *   -> cognition -> RESTART -> reconstruction -> delete project -> retraction
 *   -> retained session history -> RESTART -> retention window -> RESTART
 *   -> keep working -> nothing fabricated
 *
 * Each "process" is a fresh module graph (`vi.resetModules`), so the store's
 * one-way `hydrated` flag starts false as at a real start, and boots in
 * `__root.tsx`'s order: engines first, then the async load, then
 * `memoryService.initialize()`. A temp-file database carries data across.
 * `getInitialState` cannot be called for its value here (its return is RPC
 * transport and comes back undefined in tests), so `load()` performs the same
 * reads.
 *
 * The prompt is captured from the real `aiContextEngine.executeRequestStream`
 * via a provider that records the system instruction, the way `chat.tsx`
 * calls it -- so "what the model is told" is measured, not reassembled.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import type { AkiraState } from "../src/shared/types/store-types";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-09-01T09:00:00.000Z").getTime();
let dbPath: string;
let open: { exit(): Promise<void> } | null = null;

async function boot() {
  vi.resetModules();
  process.env.AKIRA_DATABASE_PATH = dbPath;
  process.env.NODE_ENV = "test";

  const { initializeDatabase } = await import("../src/persistence/initializer");
  initializeDatabase();
  await import("../src/genesis/index");
  const store = await import("../src/persistence/akira-store");
  const { akira, settlePendingPersistence } = store;
  const repos = await import("../src/persistence/repositories");
  const { getDatabaseConnection, closeDatabaseConnection } =
    await import("../src/persistence/connection");
  const { presenceService } = await import("../src/akira-os/presence/service");
  const { companionStateService } = await import("../src/genesis/context/state/service");
  const { relationshipService } = await import("../src/genesis/context/relationships/service");
  const { habitService } = await import("../src/genesis/context/habits/service");
  const { reflectionService } = await import("../src/genesis/insights/reflection/service");
  const { contextResolutionService } =
    await import("../src/genesis/context/context-resolution/service");
  const { initiativeService } = await import("../src/genesis/context/initiative/service");
  const { memoryService } = await import("../src/genesis/memory/memory-service");
  const { storyService } = await import("../src/genesis/stories/story-service");
  const { understandingEngine } = await import("../src/genesis/understanding/engine");
  const { candidateService } = await import("../src/genesis/candidate/candidate-service");
  const { identityService } = await import("../src/genesis/understanding/identity-service");
  const { importanceService } = await import("../src/genesis/importance/importance-service");
  const { recallService } = await import("../src/genesis/recall/recall-service");
  const memoryRelationships = (
    await import("../src/genesis/memory/relationships/relationship-service")
  ).relationshipService;
  const { contextService } = await import("../src/genesis/context/context-service");
  const { providerRegistry } = await import("../src/genesis/context/ai/provider-registry");
  const { aiContextEngine } = await import("../src/genesis/context/ai/context-engine");
  const { eventService } = await import("../src/genesis/events/event-service");
  // Loaded by chat.tsx through "@/akira-os" in production, which is what
  // registers the Historical Recall provider.
  const { conversationsService, historicalRecall } = await import("../src/akira-os/conversations");
  const { getHistoricalRecallProvider, registerHistoricalRecallProvider } =
    await import("../src/contracts/historical-recall");
  const registeredAtLoad = getHistoricalRecallProvider();
  // A server function's return value is RPC transport: under vitest its
  // handler runs but the value does not come back (see the header of
  // genesis-persisted-shape-validation.test.ts). So the one RPC hop is
  // replaced by a provider calling exactly what that handler calls. The
  // hop itself is pinned separately, in "the registered provider ...".
  const recall = {
    search: async (request: Parameters<typeof historicalRecall.search>[0]) =>
      repos.conversationRepository.searchMessages(request),
  };
  registerHistoricalRecallProvider(recall);

  const writeErrors: string[] = [];
  const errorSpy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    const line = a.map(String).join(" ");
    if (line.includes("failed")) writeErrors.push(line.slice(0, 200));
  });

  // __root.tsx's boot effect, against the unhydrated store.
  expect(akira.isHydrated()).toBe(false);
  presenceService.initialize();
  companionStateService.bootstrap();
  relationshipService.initialize();
  habitService.initialize();
  reflectionService.initialize();
  contextResolutionService.initialize();
  initiativeService.initialize();

  // The async loader: getInitialState's reads, then cognition rebuilt.
  const json = (key: string) => {
    const raw = repos.settingsRepository.get(key);
    return raw ? JSON.parse(raw) : null;
  };
  akira.initializeState({
    ...(akira.getState() as AkiraState),
    projects: repos.projectRepository.getAll(),
    tasks: repos.taskRepository.getAll(),
    notes: repos.noteRepository.getAll(),
    sessions: repos.sessionRepository.getAll(),
    activeSession: json("active_session"),
    lastProjectId: json("last_project_id"),
    // store-init: the saved profile, else the display fallback -- and only a
    // saved row is identity.
    profile: json("profile") ?? akira.getState().profile,
    profileSaved: repos.settingsRepository.get("profile") != null,
    chat: json("chat") ?? [],
    memories: json("genesis_memories") ?? [],
  });
  memoryService.initialize();

  let captured = "";
  let answered = "";
  providerRegistry.registerProvider({
    name: "capture",
    async generateContent(request) {
      captured = request.systemInstruction ?? "";
      // A stand-in for the model that can answer only from what it is handed,
      // and follows the historical section's instruction literally: cite the
      // dated lines when told to, otherwise state what they say with no date
      // or attribution. So an answer here proves the evidence -- and the
      // instruction -- reached the request, not that a real model would
      // phrase it well.
      const section = captured.split("[FROM PAST CONVERSATIONS]")[1] ?? "";
      const lines = section
        .split(String.fromCharCode(10))
        .filter((l) => /^\[\d{4}-\d{2}-\d{2}\]/.test(l));
      answered = section.includes("say when it was said")
        ? lines.join(String.fromCharCode(10))
        : lines.map((l) => l.replace(/^\[[^\]]+\] (?:User|AKIRA): /, "")).join(" ");
      return {
        responseId: "r",
        provider: "capture",
        model: "capture",
        content: answered,
        finishReason: "stop",
      } as never;
    },
  });
  providerRegistry.setActiveProvider("capture");

  const db = getDatabaseConnection();

  const app = {
    akira,
    db,
    repos,
    writeErrors,
    /** A user turn, recorded as chat.tsx records it (routes/chat.tsx, the send path). */
    say(text: string) {
      akira.addChatMessage("user", text);
      eventService.record("chat_message", "Chat Message", text, akira.getState().lastProjectId);
    },
    /**
     * The system instruction the model receives for `question`, as chat.tsx
     * sends it. No history is passed: every call is the first turn of a new
     * conversation, so anything the model is told came from memory, not from
     * earlier turns.
     */
    async promptFor(question: string): Promise<string> {
      await aiContextEngine.executeRequestStream(
        question,
        () => {},
        contextService.getActiveContext() || undefined,
      );
      return captured;
    },
    /** A turn in conversation `conversationId`, as chat.tsx sends it: the request and the answer. */
    async ask(question: string, conversationId: string) {
      const response = await aiContextEngine.executeRequestStream(
        question,
        () => {},
        contextService.getActiveContext() || undefined,
        { systemInstruction: "You are AKIRA.", history: [], conversationId },
      );
      return { system: captured, answer: response.content ?? answered };
    },
    /** The chat archive, saved the way chat.tsx saves it. */
    saveArchive: (conversations: Parameters<typeof conversationsService.save>[0]) =>
      conversationsService.save(conversations),
    historicalRecall,
    registeredAtLoad,
    recall,
    cognition() {
      return {
        // By content: memory ids are minted fresh on every replay (derived
        // state), so identity across a restart is what they say and when.
        memories: memoryService
          .getMemories()
          .map((m) => `${m.timestamp}|${m.title}|${m.description}`)
          .sort(),
        stories: storyService
          .getStories()
          .map((s) => s.title)
          .sort(),
        understandings: understandingEngine
          .getUnderstandings()
          .map((u) => `${u.canonicalKey}:${u.status}`)
          .sort(),
        // The rest of the nine derived structures Chat 5 proved replay-
        // equivalent (zz-c5-restart-journey). Their ids are minted per
        // replay, so they are compared by count; the above by content.
        counts: {
          durableStream: akira.getState().memories.length,
          candidates: candidateService.getCandidates().length,
          memoryRelationships: memoryRelationships.getRelationships().length,
          importance: importanceService.getAllImportance().length,
          recallCandidates: recallService.getRecallCandidates().length,
        },
        identity: identityService
          .getObservations()
          .map((o) => `${o.name}=${o.value}`)
          .sort(),
        contacts: (relationshipService.getContext()?.importantPeople ?? [])
          .map((p) => p.name)
          .sort(),
      };
    },
    focusSwitches: () =>
      (habitService.getContext()?.observedHabits ?? []).filter(
        (h) => h.name === "Workspace Focus Switch",
      ),
    companion: () => companionStateService.getState(),
    searchableSessions: () =>
      (
        db.prepare("SELECT title FROM fts_workspace WHERE entity_type = 'session'").all() as {
          title: string;
        }[]
      ).map((r) => r.title),
    async exit() {
      open = null;
      await settlePendingPersistence();
      for (const s of [
        initiativeService,
        contextResolutionService,
        reflectionService,
        habitService,
        relationshipService,
        presenceService,
      ])
        s.shutdown();
      companionStateService.closeSession();
      providerRegistry.clear();
      errorSpy.mockRestore();
      closeDatabaseConnection();
    },
    settle: settlePendingPersistence,
  };
  open = app;
  return app;
}

type App = Awaited<ReturnType<typeof boot>>;
const titles = (app: App) => app.akira.getState().tasks.map((t) => t.title);
const sessionTasks = (list: { task: string }[]) => list.map((s) => s.task).sort();

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "akira-journey-")), "akira.db");
});

afterEach(async () => {
  await open?.exit();
});

afterAll(() => {
  vi.useRealTimers();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

// One journey: each step depends on the state the previous one left on disk.
describe.sequential("a user's journey through AKIRA", { timeout: 60_000 }, () => {
  let kitchenId = "";
  let gardenId = "";
  let before: ReturnType<App["cognition"]>;

  it("day 1: builds a project, works it, writes about it, talks to AKIRA", async () => {
    const app = await boot();
    const { akira } = app;

    akira.addProject({ name: "Garden" });
    gardenId = akira.getState().lastProjectId as string;
    akira.addProject({ name: "Kitchen Renovation" });
    kitchenId = akira.getState().lastProjectId as string;

    for (const title of ["Order tiles", "Remove cabinets", "Seal grout"]) {
      akira.addTaskDetails({ title, projectId: kitchenId });
    }
    await app.settle();
    const [a, b, c] = akira.getState().tasks.map((t) => t.id);
    akira.reorderTasks([c, a, b]);

    akira.startSession(kitchenId, "Demolition");
    vi.setSystemTime(T0 + 45 * 60 * 1000);
    akira.toggleTask(b); // "Remove cabinets" completed inside the session
    akira.endSession("Cabinets out");

    akira.addNote({
      title: "Tile plan",
      content: "Grey hex tiles, epoxy grout",
      projectId: kitchenId,
    } as never);
    akira.addChatMessage("user", "@Sarah reviewed the tile plan with me");
    await app.settle();

    before = app.cognition();
    expect(titles(app)).toEqual(["Seal grout", "Order tiles", "Remove cabinets"]);
    expect(before.contacts).toEqual(["Sarah"]);
    expect(before.understandings).toContain(`project:${kitchenId}:Active`);
    expect(before.memories.length, "no cognition was generated").toBeGreaterThan(0);
    expect(before.stories.length).toBeGreaterThan(0);
    const dayOne = await app.promptFor("How is my kitchen project going?");
    expect(dayOne).toContain("Kitchen Renovation");
    // Never saved a profile: the display fallback must not become a name.
    expect(dayOne).not.toContain("[USER]");
    expect(dayOne).not.toContain("Lovshik");
    expect(app.writeErrors).toEqual([]);
    await app.exit();
  });

  it("restart: everything is reconstructed, nothing is invented", async () => {
    vi.setSystemTime(T0 + 1 * DAY);
    const app = await boot();

    expect(titles(app), "task order after restart").toEqual([
      "Seal grout",
      "Order tiles",
      "Remove cabinets",
    ]);
    expect(app.akira.getState().tasks.find((t) => t.title === "Remove cabinets")?.done).toBe(true);
    expect(sessionTasks(app.akira.getState().sessions)).toEqual(["Demolition"]);
    expect(app.cognition()).toEqual(before);
    expect(app.focusSwitches(), "the boot fabricated a focus switch").toEqual([]);
    const afterRestart = await app.promptFor("What is my name?");
    expect(afterRestart, "a name no one saved").not.toContain("[USER]");
    expect(afterRestart).not.toContain("Lovshik");
    expect(app.companion()?.currentFocus, "no session is running").not.toBe("Building");
    expect(app.writeErrors).toEqual([]);
    await app.exit();
  });

  it("a new conversation knows the name saved in Settings, and the goal stated in chat", async () => {
    vi.setSystemTime(T0 + 1 * DAY + 60 * 60 * 1000);
    const first = await boot();
    first.akira.updateProfile({ name: "Vishnu", role: "Engineer", motto: "Ship it" }); // settings.tsx
    first.say("My goal is to learn Verilog");
    // A new chat opened straight after saving, before any restart.
    expect(await first.promptFor("What is my name?")).toContain("The user's name is Vishnu.");
    await first.exit();

    const app = await boot();
    const prompt = await app.promptFor("What is my name?");

    expect(prompt).toContain("[USER]\nThe user's name is Vishnu.");
    // Control: identity the chat path does carry. If this fails too, the
    // harness is not seeing memory at all, and the name assertion proves nothing.
    expect(prompt).toContain("learn Verilog");
    expect(prompt).not.toContain("Lovshik");
  });

  it("deleting the project retracts it and keeps its session history", async () => {
    vi.setSystemTime(T0 + 2 * DAY);
    const app = await boot();
    app.akira.touchProject(kitchenId);
    const switchesBefore = app.focusSwitches().length;

    app.akira.deleteProject(kitchenId);
    await app.settle();

    const prompt = await app.promptFor("What am I working on right now?");
    expect(prompt).not.toMatch(/actively building Kitchen Renovation/);
    expect(prompt).not.toContain("Active Project: Kitchen Renovation");
    // Present, and archived: history kept, current-state claim retracted.
    expect(
      app.cognition().understandings.filter((u) => u.startsWith(`project:${kitchenId}:`)),
    ).toEqual([`project:${kitchenId}:Archived`]);
    expect(app.companion()?.activeProject?.id).toBe(gardenId);

    expect(sessionTasks(app.akira.getState().sessions)).toEqual(["Demolition"]);
    expect(sessionTasks(app.repos.sessionRepository.getAll())).toEqual(["Demolition"]);
    expect(app.searchableSessions()).toEqual(["Demolition"]);

    // Deletion reassigns the active project; the user did not switch focus.
    expect(app.focusSwitches().length, "reassignment after delete read as a focus switch").toBe(
      switchesBefore,
    );
    expect(app.writeErrors).toEqual([]);
    await app.exit();
  });

  it("restart after deletion: history kept, the project stays gone", async () => {
    vi.setSystemTime(T0 + 3 * DAY);
    const app = await boot();
    const s = app.akira.getState();

    expect(s.projects.map((p) => p.id)).toEqual([gardenId]);
    expect(s.lastProjectId).toBe(gardenId);
    expect(s.activeSession).toBeNull();
    expect(sessionTasks(s.sessions)).toEqual(["Demolition"]);
    expect(s.sessions[0].projectId).toBe("");
    expect(app.focusSwitches()).toEqual([]);
    expect(await app.promptFor("What am I working on?")).not.toContain(
      "Active Project: Kitchen Renovation",
    );
    await app.exit();
  });

  it("30 days after deletion the session is gone, from history and from search", async () => {
    vi.setSystemTime(T0 + 2 * DAY + 30 * DAY);
    const app = await boot();

    expect(app.akira.getState().sessions).toEqual([]);
    expect(app.repos.sessionRepository.getAll()).toEqual([]);
    expect(app.searchableSessions(), "an expired session is still searchable").toEqual([]);
    await app.exit();
  });

  it("the user keeps working, and nothing fabricated appears", async () => {
    vi.setSystemTime(T0 + 40 * DAY);
    const app = await boot();
    const { akira } = app;

    akira.addTaskDetails({ title: "Plant tomatoes", projectId: gardenId });
    await app.settle();
    const t = akira.getState().tasks.find((x) => x.title === "Plant tomatoes")!;
    akira.startSession(gardenId, "Planting");
    akira.toggleTask(t.id);
    akira.endSession("Done");
    akira.addChatMessage("user", "@Sarah says the tomatoes need more sun");
    await app.settle();

    const prompt = await app.promptFor("What should I do next in the garden?");
    expect(prompt).not.toContain("Active Project: Kitchen Renovation");
    expect(prompt).not.toMatch(/actively building Kitchen Renovation/);
    expect(app.companion()?.currentFocus).not.toBe("Building");
    expect(app.focusSwitches()).toEqual([]);
    expect(app.cognition().contacts).toEqual(["Sarah"]);
    expect(sessionTasks(app.repos.sessionRepository.getAll())).toEqual(["Planting"]);
    expect(app.writeErrors).toEqual([]);
    await app.exit();
  });
});

/**
 * Historical Recall v0: an explicit request to search past conversations
 * reaches the archive, and what it finds reaches the model as dated evidence.
 * Uses the same database and boot as the journey above; the archive is saved
 * the way chat.tsx saves it, through conversationsService.
 */
describe.sequential("searching past conversations, when asked", { timeout: 60_000 }, () => {
  const msg = (id: string, role: "user" | "akira", text: string, createdAt: string) => ({
    id,
    role,
    text,
    createdAt,
  });
  const conv = (id: string, title: string, messages: ReturnType<typeof msg>[]) => ({
    id,
    title,
    messages,
    createdAt: messages[0].createdAt,
    updatedAt: messages[messages.length - 1].createdAt,
  });

  const fieldSense = conv("conv-A", "FieldSense", [
    msg(
      "a1",
      "user",
      "For FieldSense we settled on the BME280 sensor for humidity",
      "2026-07-15T09:00:00.000Z",
    ),
    msg(
      "a2",
      "akira",
      "Good choice. The BME280 also gives you pressure.",
      "2026-07-15T09:00:05.000Z",
    ),
  ]);
  const cooking = conv("conv-C", "Dinner", [
    msg("c1", "user", "a pasta recipe with basil and garlic", "2026-07-20T18:00:00.000Z"),
  ]);
  const QUESTION = "Search our previous chats. What sensor did we use for FieldSense?";
  // Conversation B holds the question itself, as chat.tsx saves it before sending.
  const current = conv("conv-B", "Sensor question", [
    msg("b1", "user", QUESTION, "2026-10-12T10:00:00.000Z"),
  ]);

  it("the registered provider is AKIRA OS's, and it queries the repository", async () => {
    const app = await boot();
    expect(app.registeredAtLoad, "loading the module registers the provider").toBe(
      app.historicalRecall,
    );
    const query = vi.spyOn(app.repos.conversationRepository, "searchMessages");
    const request = { terms: ["fieldsense"], limit: 5, excludeConversationId: "conv-B" };

    await app.historicalRecall.search(request);

    expect(query).toHaveBeenCalledWith(request);
  });

  it("finds the fact from conversation A and puts it, dated, in the model request", async () => {
    vi.setSystemTime(new Date("2026-10-12T10:00:00.000Z"));
    const app = await boot();
    await app.saveArchive([current, cooking, fieldSense]);

    const { system, answer } = await app.ask(QUESTION, "conv-B");

    expect(system).toContain("[FROM PAST CONVERSATIONS]");
    expect(system).toContain("[2026-07-15] User: For FieldSense we settled on the BME280 sensor");
    expect(answer, "the model answers from the evidence").toContain("BME280");
    // Irrelevant history stays out, and so does the question's own conversation.
    expect(system).not.toContain("pasta");
    expect(system).not.toContain(`User: ${QUESTION}`);
  });

  it("answers plainly by default, keeping the dated source in the request", async () => {
    const app = await boot();

    const { system, answer } = await app.ask(QUESTION, "conv-B");

    // Provenance is kept, internally.
    expect(system).toContain("[2026-07-15] User: For FieldSense we settled on the BME280 sensor");
    // The instruction is to answer, not to report on the search.
    expect(system).toContain("Answer the user's question directly and concisely");
    expect(system).toContain(
      "Do not quote these messages, mention their dates, or say where the information came from",
    );
    expect(system).not.toContain("say when it was said");
    // So the answer carries the fact and none of the machinery.
    expect(answer).toContain("BME280");
    expect(answer).not.toMatch(/\d{4}-\d{2}-\d{2}|User:|AKIRA:|\[/);
  });

  it("cites the date and the words when the user asks where it came from", async () => {
    const app = await boot();
    const asking =
      "Search our previous chats: what sensor did we use for FieldSense, and when did we decide that?";

    const { system, answer } = await app.ask(asking, "conv-B");

    expect(system).toContain(
      "say when it was said (the date on the line) and quote the relevant words briefly",
    );
    expect(system).not.toContain("Do not quote these messages");
    expect(answer).toContain("[2026-07-15] User: For FieldSense we settled on the BME280 sensor");
  });

  it("does not search at all without an explicit request", async () => {
    const app = await boot();
    const search = vi.spyOn(app.recall, "search");

    const { system } = await app.ask("What sensor did we use for FieldSense?", "conv-B");

    expect(search).not.toHaveBeenCalled();
    expect(system).not.toContain("[FROM PAST CONVERSATIONS]");
    expect(system).not.toContain("BME280");
  });

  it("finds it again after a restart", async () => {
    const app = await boot();
    const { system } = await app.ask(QUESTION, "conv-B");
    expect(system).toContain("BME280");
  });

  it("does not turn what it retrieved into GENESIS memory", async () => {
    const app = await boot();
    const before = app.cognition();

    await app.ask(QUESTION, "conv-B");
    await app.settle();

    expect(app.cognition()).toEqual(before);
    expect(JSON.stringify(app.akira.getState().memories)).not.toContain("BME280");
  });

  it("quotes a bounded number of messages however many match", async () => {
    const app = await boot();
    const many = conv(
      "conv-many",
      "Zephyr",
      Array.from({ length: 12 }, (_, i) =>
        msg(
          `z${i}`,
          "user",
          `zephyr note ${i}`,
          `2026-08-01T10:${String(i).padStart(2, "0")}:00.000Z`,
        ),
      ),
    );
    await app.saveArchive([current, cooking, fieldSense, many]);

    const { system } = await app.ask("search our old chats for zephyr", "conv-B");

    const quoted = system.split(String.fromCharCode(10)).filter((l) => l.includes("zephyr note"));
    expect(quoted).toHaveLength(5);
  });

  it("cannot retrieve a deleted conversation", async () => {
    const app = await boot();
    await app.saveArchive([current, cooking]); // conversation A deleted in the sidebar

    const { system, answer } = await app.ask(QUESTION, "conv-B");

    expect(system).not.toContain("BME280");
    expect(system).toContain("you don't recall discussing it");
    expect(answer).toBe("");
  });

  it("says the search failed rather than letting the model guess", async () => {
    const app = await boot();
    vi.spyOn(app.recall, "search").mockRejectedValueOnce(new Error("db locked"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { system } = await app.ask(QUESTION, "conv-B");
    warn.mockRestore();

    expect(system).toContain("you can't recall it at the moment");
    expect(system).toContain("Do not describe searching");
  });
});
