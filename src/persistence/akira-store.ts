import { useSyncExternalStore } from "react";
import { applyDurableRetention } from "../genesis/retention/policy";
import { seed } from "./seed";
import { registerStoreProvider } from "../shared/genesis-provider";
import { registerWorkspaceProvider } from "../contracts/workspace-provider";
import { Events } from "../contracts/events";
import { publish } from "../instrumentation";
import { healthRegistry } from "../observability/health/health-registry";

import type {
  Project,
  Task,
  Note,
  ChatMessage,
  HabitStreak,
  Profile,
  WorkSession,
  AkiraState,
  VaultFolder,
  VaultFile,
} from "../shared/types/store-types";

export type {
  Project,
  Task,
  Note,
  ChatMessage,
  HabitStreak,
  Profile,
  WorkSession,
  AkiraState,
  VaultFolder,
  VaultFile,
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const nowISO = () => new Date().toISOString();

let state: AkiraState = seed();
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

let applyingUpdate = false;
const pendingUpdaters: Array<(s: AkiraState) => AkiraState> = [];

function set(updater: (s: AkiraState) => AkiraState) {
  // Re-entrancy guard.
  //
  // Several mutations publish a platform event from inside their updater, and a
  // subscriber may write back to this store — GENESIS recording a MemoryEvent
  // is exactly that. Without queueing, the nested write assigns `state` and
  // then the outer `state = updater(state)` lands on top of it, silently
  // discarding the nested change. That cost every memory produced by a real
  // store action: they reached GENESIS but never reached the durable stream.
  if (applyingUpdate) {
    pendingUpdaters.push(updater);
    return;
  }

  applyingUpdate = true;
  try {
    state = updater(state);
    while (pendingUpdaters.length > 0) {
      state = pendingUpdaters.shift()!(state);
    }
  } finally {
    applyingUpdate = false;
    pendingUpdaters.length = 0;
  }
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => state;

export function useAkira<T>(selector: (s: AkiraState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    () => selector(state),
  );
}

export function useAkiraHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hydrated,
    () => hydrated,
  );
}

/**
 * Persistence side effects started by store mutations, still in flight.
 *
 * Every mutation updates React state synchronously and then writes through to
 * SQLite behind a dynamic import, which keeps better-sqlite3 out of the browser
 * bundle. That write is deliberately not awaited: the UI must not block on disk.
 *
 * What was missing is that nobody owned the resulting promises, and there were
 * two layers of them. The outer `import(...).then(...)` chain was unowned, and
 * the service call inside the callback was a bare statement, so the promise it
 * returned was discarded before it could even join that chain. A failed write
 * therefore surfaced as an unhandled rejection instead of an error anyone could
 * act on, and a module load still resolving when its environment disappeared --
 * which is what happens when a test file ends -- became an unhandled
 * EnvironmentTeardownError blamed on whichever test happened to be running.
 */
const pendingPersistence = new Set<Promise<void>>();

/**
 * Starts a write-through without blocking the caller, and without leaving the
 * promise unowned.
 *
 * Timing is unchanged: `run()` is invoked immediately, exactly as the bare
 * `import(...).then(...)` was, and nothing awaits it. The difference is that
 * the whole chain -- module load and the service call it returns -- is tracked
 * and its rejection is handled, so a genuine write failure is reported rather
 * than escaping the process.
 */
/**
 * Runs a write-through in a server runtime.
 *
 * The write ends in a TanStack server function. On the client that is an RPC
 * and needs nothing from us. On the server the function reads its options from
 * the Start context in AsyncLocalStorage, and throws outright when there is
 * none -- which is the case for any server-side write that does not happen to
 * sit inside an in-flight request, including every write a test makes.
 *
 * That is why store mutations persisted nothing under test: not a missing
 * repository or a broken query, but a write executed outside the runtime its
 * transport requires. When a real request context exists it is used unchanged;
 * otherwise a minimal one is established, which is a truthful statement that
 * this code is running server-side, not a stand-in for a request. The import is
 * dynamic and guarded so node:async_hooks never reaches the browser bundle.
 */
async function runInServerRuntime<T>(run: () => Promise<T>): Promise<T> {
  if (typeof window !== "undefined") return run();

  const { getStartContext, runWithStartContext } = await import("@tanstack/start-storage-context");
  if (getStartContext({ throwIfNotFound: false })) return run();

  return runWithStartContext({} as never, run);
}

/**
 * Health component id for one write-through operation.
 *
 * Per operation rather than one component for the whole store, because the two
 * kinds of write here fail differently and only one of them recovers. Measured
 * by injecting a failure at the repository:
 *
 *   settings.updateMemories   replaces the whole blob, so the next successful
 *                             write carries everything the failed one carried.
 *                             Durable count went 11, failed, still 11, then 13
 *                             on the next write. Self-healing.
 *   notes.add                 writes one row. The lost note was absent from the
 *                             database immediately after the failure and still
 *                             absent after a later successful write, while
 *                             present in in-memory state. Permanent.
 *
 * A single component would average those together and erase the only
 * distinction that matters. There are 29 distinct operations, all string
 * literals with no dynamic construction, against a `maxHealthComponents` of 64,
 * so this cannot exhaust the registry's cap or evict another component.
 */
const HEALTH_COMPONENT_PREFIX = "akira-store.persist.";

/**
 * Records the outcome of a write-through without being able to affect it.
 *
 * Guarded because this is the durability path: an observability call must never
 * be the reason a write's error handling does not run. `healthRegistry` already
 * guards its own listeners, so this is defence against the registry itself, and
 * it is cheap.
 */
/**
 * Operations already reported as unobservable, so the warning below is said
 * once per operation rather than once per write.
 *
 * Without this the failure mode it reports -- a full registry -- would produce
 * a console line on every single store mutation, which is noisier than the
 * silence it exists to break.
 */
const unobservableOperations = new Set<string>();

function observeWrite(operation: string, error?: unknown, attempted = true): void {
  try {
    const component = `${HEALTH_COMPONENT_PREFIX}${operation}`;

    // `register` returns false when the registry is at `maxHealthComponents`,
    // and `recordSuccess` / `recordFailure` are silent no-ops for a component
    // that is not registered. So a full registry would take this feature back
    // to console-only with nothing anywhere saying that observability had
    // stopped observing -- the precise failure this change exists to prevent,
    // reappearing one level up.
    //
    // Not reachable today: 29 persist operations plus roughly 8 event-bus
    // subscriber ids against a cap of 64, all code-defined literals with no
    // dynamic construction on either side. The return value was already there
    // and already discarded, so saying something costs an `if`, and a guard
    // would be a mechanism built for a condition that cannot currently occur.
    if (!healthRegistry.register(component) && !unobservableOperations.has(operation)) {
      unobservableOperations.add(operation);
      console.warn(
        `[akira-store] Durable write "${operation}" is not observable: ` +
          `the health registry is full, so its failures will only reach the console.`,
      );
    }

    // A skipped write has no outcome to record: the component exists and
    // stays `unknown`. See the durable-write guard in `saveMemory`.
    if (!attempted) return;

    if (error === undefined) healthRegistry.recordSuccess(component);
    else healthRegistry.recordFailure(component, error);
  } catch {
    // Deliberately empty. Losing the health signal is bad; losing the write's
    // console report because health threw would be worse.
  }
}

function persist(operation: string, run: () => Promise<unknown>): void {
  const task = runInServerRuntime(run).then(
    () => {
      observeWrite(operation);
    },
    (err: unknown) => {
      // Console first, health second, so the change is additive: the existing
      // report happens exactly as before regardless of what health does.
      //
      // Before this, a failed durable write was reported here and nowhere else.
      // The caller had already mutated in-memory state and returned, so it
      // believed the write had landed -- measured at 12 events in memory
      // against 11 on disk -- and `settlePendingPersistence()` resolved rather
      // than rejecting, so no lifecycle boundary could notice either. The
      // health registry is where a failed write is now held: it keeps the error
      // as evidence, counts consecutive failures, and turns degraded into
      // critical on its own threshold.
      //
      // The event-bus path is already observed this way. `EventBusObserver`
      // derives health from delivery outcomes and handles async subscribers
      // correctly, but `persist` is not a bus delivery -- it is started inside
      // `set()` and returns immediately -- so this write-through was the one
      // durable path with no observer.
      console.error(`[akira-store] Persistence write "${operation}" failed:`, err);
      observeWrite(operation, err);
    },
  );

  pendingPersistence.add(task);
  void task.finally(() => {
    pendingPersistence.delete(task);
  });
}

/**
 * Resolves once every write-through started so far has settled.
 *
 * Intended for deterministic tests and for any lifecycle boundary that needs
 * pending writes to land before it proceeds. A write can start another write,
 * so this drains until the set is empty rather than awaiting one snapshot of it.
 */
export async function settlePendingPersistence(): Promise<void> {
  while (pendingPersistence.size > 0) {
    await Promise.all(Array.from(pendingPersistence));
  }
}

/** Write-throughs started but not yet settled. */
export function pendingPersistenceCount(): number {
  return pendingPersistence.size;
}

export const akira = {
  getState() {
    return state;
  },
  isHydrated() {
    return hydrated;
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  initializeState(newState: AkiraState) {
    state = newState;
    hydrated = true;
    emit();
  },
  addProject(input: {
    name: string;
    tag?: string;
    description?: string;
    color?: string;
    icon?: string;
  }) {
    const p: Project = {
      id: uid(),
      name: input.name.trim() || "Untitled project",
      tag: input.tag?.trim() || "Project",
      description: input.description?.trim() || "",
      progress: 0,
      color: input.color || "from-violet to-electric",
      nextTask: "",
      notes: "",
      timeSpentMinutes: 0,
      lastWorked: nowISO(),
      createdAt: nowISO(),
      icon: input.icon || "sparkles",
    };

    publish({
      type: Events.PROJECT_CREATED,
      source: "projects-store",
      payload: { id: p.id, name: p.name, tag: p.tag },
      version: 1,
    });

    set((s) => ({
      ...s,
      projects: [p, ...s.projects],
      lastProjectId: p.id,
    }));

    persist("projects.add", () =>
      import("../akira-os/projects").then(({ projectsService }) => projectsService.add(p)),
    );
    persist("settings.updateLastProjectId", () =>
      import("../akira-os/settings").then(({ settingsService }) =>
        settingsService.updateLastProjectId(p.id),
      ),
    );

    return p.id;
  },
  updateProject(id: string, patch: Partial<Project>) {
    set((s) => {
      const project = s.projects.find((p) => p.id === id);
      if (!project) return s;
      const p = { ...project, ...patch };

      publish({
        type: Events.PROJECT_UPDATED,
        source: "projects-store",
        payload: { id: p.id, name: p.name, patch },
        version: 1,
      });

      persist("projects.update", () =>
        import("../akira-os/projects").then(({ projectsService }) =>
          projectsService.update(id, patch),
        ),
      );

      return {
        ...s,
        projects: s.projects.map((item) => (item.id === id ? p : item)),
      };
    });
  },
  deleteProject(id: string) {
    set((s) => {
      publish({
        type: Events.PROJECT_DELETED,
        source: "projects-store",
        payload: { id },
        version: 1,
      });

      const nextLastProjectId =
        s.lastProjectId === id
          ? (s.projects.find((p) => p.id !== id)?.id ?? null)
          : s.lastProjectId;

      persist("projects.delete", () =>
        import("../akira-os/projects").then(({ projectsService }) => projectsService.delete(id)),
      );
      persist("settings.updateLastProjectId", () =>
        import("../akira-os/settings").then(({ settingsService }) =>
          settingsService.updateLastProjectId(nextLastProjectId),
        ),
      );

      return {
        ...s,
        projects: s.projects.filter((p) => p.id !== id),
        lastProjectId: nextLastProjectId,
        tasks: s.tasks.map((t) => (t.projectId === id ? { ...t, projectId: null } : t)),
        notes: s.notes.map((n) => (n.projectId === id ? { ...n, projectId: null } : n)),
        sessions: (s.sessions || []).map((sess) =>
          sess.projectId === id ? { ...sess, projectId: "" } : sess,
        ),
        activeSession: s.activeSession?.projectId === id ? null : s.activeSession,
        memories: s.memories.map((m) =>
          m.relatedProjectId === id ? { ...m, relatedProjectId: null } : m,
        ),
      };
    });
  },
  touchProject(id: string) {
    set((s) => {
      const project = s.projects.find((p) => p.id === id);
      if (!project) return s;
      const p = {
        ...project,
        lastWorked: nowISO(),
        timeSpentMinutes: project.timeSpentMinutes + 5,
      };

      publish({
        type: Events.PROJECT_CONTINUED,
        source: "projects-store",
        payload: { id: p.id, name: p.name },
        version: 1,
      });

      persist("projects.touch", () =>
        import("../akira-os/projects").then(({ projectsService }) => projectsService.touch(id)),
      );
      persist("settings.updateLastProjectId", () =>
        import("../akira-os/settings").then(({ settingsService }) =>
          settingsService.updateLastProjectId(id),
        ),
      );

      return {
        ...s,
        lastProjectId: id,
        projects: s.projects.map((item) => (item.id === id ? p : item)),
      };
    });
  },

  addTask(title: string) {
    if (!title.trim()) return;
    const t: Task = {
      id: uid(),
      title: title.trim(),
      description: "",
      priority: "Medium",
      estimatedDuration: 30,
      dueDate: null,
      done: false,
      completed: false,
      projectId: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    set((s) => {
      publish({
        type: Events.TASK_CREATED,
        source: "tasks-store",
        payload: { id: t.id, title: t.title },
        version: 1,
      });
      return {
        ...s,
        tasks: [...s.tasks, t],
      };
    });
  },
  toggleTask(id: string) {
    set((s) => {
      const task = s.tasks.find((t) => t.id === id);
      if (!task) return s;
      const doneValue = !task.done;
      const t = { ...task, done: doneValue, completed: doneValue, updatedAt: nowISO() };
      const nextTasks = s.tasks.map((item) => (item.id === id ? t : item));

      if (t.done) {
        publish({
          type: Events.TASK_COMPLETED,
          source: "tasks-store",
          payload: { id: t.id, title: t.title, projectId: t.projectId },
          version: 1,
        });

        const allDone = nextTasks.every((tk) => tk.done) && nextTasks.length > 0;
        if (allDone) {
          publish({
            type: Events.MISSION_COMPLETED,
            source: "tasks-store",
            payload: { totalTasks: nextTasks.length },
            version: 1,
          });
        }
      } else {
        publish({
          type: Events.TASK_REOPENED,
          source: "tasks-store",
          payload: { id: t.id, title: t.title, projectId: t.projectId },
          version: 1,
        });
      }

      persist("tasks.update", () =>
        import("../akira-os/tasks").then(({ tasksService }) =>
          tasksService.update(id, { done: t.done, completed: t.completed }),
        ),
      );

      return {
        ...s,
        tasks: nextTasks,
      };
    });
  },
  updateTask(id: string, title: string) {
    set((s) => {
      publish({
        type: Events.TASK_UPDATED,
        source: "tasks-store",
        payload: { id, title },
        version: 1,
      });

      persist("tasks.update", () =>
        import("../akira-os/tasks").then(({ tasksService }) =>
          tasksService.update(id, { title: title.trim() }),
        ),
      );

      return {
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, title: title.trim() || t.title, updatedAt: nowISO() } : t,
        ),
      };
    });
  },
  deleteTask(id: string) {
    set((s) => {
      publish({
        type: Events.TASK_DELETED,
        source: "tasks-store",
        payload: { id },
        version: 1,
      });

      persist("tasks.delete", () =>
        import("../akira-os/tasks").then(({ tasksService }) => tasksService.delete(id)),
      );

      return { ...s, tasks: s.tasks.filter((t) => t.id !== id) };
    });
  },
  addTaskDetails(input: {
    title: string;
    description?: string;
    priority?: "Low" | "Medium" | "High";
    estimatedDuration?: number;
    dueDate?: string | null;
    projectId?: string | null;
  }) {
    const t: Task = {
      id: uid(),
      title: input.title.trim(),
      description: input.description?.trim() || "",
      priority: input.priority || "Medium",
      estimatedDuration: input.estimatedDuration || 30,
      dueDate: input.dueDate || null,
      done: false,
      completed: false,
      projectId: input.projectId || null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    set((s) => {
      publish({
        type: Events.TASK_CREATED,
        source: "tasks-store",
        payload: { id: t.id, title: t.title, projectId: t.projectId },
        version: 1,
      });

      persist("tasks.add", () =>
        import("../akira-os/tasks").then(({ tasksService }) => tasksService.add(t)),
      );

      return { ...s, tasks: [...s.tasks, t] };
    });
  },
  updateTaskDetails(id: string, patch: Partial<Task>) {
    set((s) => {
      const task = s.tasks.find((t) => t.id === id);
      if (!task) return s;
      const updated = { ...task, ...patch, updatedAt: nowISO() };
      if (patch.completed !== undefined) {
        updated.done = patch.completed;
      } else if (patch.done !== undefined) {
        updated.completed = patch.done;
      }

      persist("tasks.update", () =>
        import("../akira-os/tasks").then(({ tasksService }) => tasksService.update(id, patch)),
      );

      return {
        ...s,
        tasks: s.tasks.map((t) => (t.id === id ? updated : t)),
      };
    });
  },
  reorderTasks(ids: string[]) {
    set((s) => {
      const ordered = ids.map((id) => s.tasks.find((t) => t.id === id)).filter(Boolean) as Task[];
      const remaining = s.tasks.filter((t) => !ids.includes(t.id));
      return { ...s, tasks: [...ordered, ...remaining] };
    });
  },

  addNote(
    input:
      | string
      | {
          title?: string;
          content: string;
          tags?: string[];
          pinned?: boolean;
          favorite?: boolean;
          projectId?: string | null;
        },
  ) {
    const isStr = typeof input === "string";
    const content = (isStr ? input : input.content).trim();
    if (!content) return "";
    const title = (isStr ? "" : input.title || "").trim();
    const tags = isStr ? [] : input.tags || [];
    const pinned = isStr ? false : !!input.pinned;
    const favorite = isStr ? false : !!input.favorite;
    const projectId = isStr ? null : input.projectId || null;

    const n: Note = {
      id: uid(),
      title,
      content,
      tags,
      pinned,
      favorite,
      projectId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    set((s) => {
      publish({
        type: Events.NOTE_CREATED,
        source: "notes-store",
        // `content` is what the user actually wrote, and it is the only part
        // of a note GENESIS can reason over. Without it the translator has
        // nothing but the title to build a description from, which is why a
        // quick capture produced no memory at all.
        payload: { id: n.id, title, content, tags, projectId },
        version: 1,
      });

      persist("notes.add", () =>
        import("../akira-os/notes").then(({ notesService }) => notesService.add(n)),
      );

      return { ...s, notes: [n, ...s.notes] };
    });
    return n.id;
  },
  updateNote(id: string, patch: Partial<Note>) {
    set((s) => {
      const note = s.notes.find((n) => n.id === id);
      if (!note) return s;
      const n = { ...note, ...patch, updatedAt: nowISO() };

      const lastEdit = s.memories.find(
        (m) => m.eventType === "note_edited" && m.relatedNoteId === id,
      );
      const shouldLog =
        !lastEdit || Date.now() - new Date(lastEdit.timestamp).getTime() > 5 * 60 * 1000;

      if (shouldLog) {
        publish({
          type: Events.NOTE_EDITED,
          source: "notes-store",
          payload: { id: n.id, title: n.title, content: n.content, projectId: n.projectId },
          version: 1,
        });
      }

      persist("notes.update", () =>
        import("../akira-os/notes").then(({ notesService }) => notesService.update(id, patch)),
      );

      return {
        ...s,
        notes: s.notes.map((item) => (item.id === id ? n : item)),
      };
    });
  },
  deleteNote(id: string) {
    set((s) => {
      publish({
        type: Events.NOTE_DELETED,
        source: "notes-store",
        payload: { id },
        version: 1,
      });

      persist("notes.delete", () =>
        import("../akira-os/notes").then(({ notesService }) => notesService.delete(id)),
      );

      return {
        ...s,
        notes: s.notes.filter((n) => n.id !== id),
        memories: s.memories.map((m) =>
          m.relatedNoteId === id ? { ...m, relatedNoteId: null } : m,
        ),
      };
    });
  },

  addChatMessage(role: "user" | "akira", text: string): ChatMessage {
    const msg: ChatMessage = {
      id: uid(),
      role,
      text,
      createdAt: nowISO(),
    };
    set((s) => {
      const nextChat = [...s.chat, msg];
      persist("settings.updateChat", () =>
        import("../akira-os/settings").then(({ settingsService }) =>
          settingsService.updateChat(nextChat),
        ),
      );
      return {
        ...s,
        chat: nextChat,
      };
    });
    return msg;
  },

  updateChatMessage(id: string, text: string, skipPersist = false): void {
    set((s) => {
      const nextChat = s.chat.map((m) => (m.id === id ? { ...m, text } : m));
      if (!skipPersist) {
        persist("settings.updateChat", () =>
          import("../akira-os/settings").then(({ settingsService }) =>
            settingsService.updateChat(nextChat),
          ),
        );
      }
      return {
        ...s,
        chat: nextChat,
      };
    });
  },

  sendChat(text: string) {
    if (!text.trim()) return;
    const user: ChatMessage = { id: uid(), role: "user", text: text.trim(), createdAt: nowISO() };

    set((s) => {
      const nextChat = [...s.chat, user];
      persist("settings.updateChat", () =>
        import("../akira-os/settings").then(({ settingsService }) =>
          settingsService.updateChat(nextChat),
        ),
      );
      return { ...s, chat: nextChat };
    });

    const replies = [
      "Logged. I'll thread that into your next mission briefing.",
      "Noted — that aligns with Lovshik 2.0.",
      "Interesting. Want me to break it into smaller steps?",
      "Captured. Let's revisit it after today's mission.",
      "Got it. Full AI mode is coming online soon.",
    ];
    const reply: ChatMessage = {
      id: uid(),
      role: "akira",
      text: replies[Math.floor(Math.random() * replies.length)],
      createdAt: nowISO(),
    };

    setTimeout(() => {
      set((s) => {
        const nextChat = [...s.chat, reply];
        persist("settings.updateChat", () =>
          import("../akira-os/settings").then(({ settingsService }) =>
            settingsService.updateChat(nextChat),
          ),
        );
        return { ...s, chat: nextChat };
      });
    }, 450);
  },
  clearChat() {
    set((s) => {
      const cleared: ChatMessage[] = [
        {
          id: uid(),
          role: "akira",
          text: "Conversation cleared. Ready when you are.",
          createdAt: nowISO(),
        },
      ];
      persist("settings.updateChat", () =>
        import("../akira-os/settings").then(({ settingsService }) =>
          settingsService.updateChat(cleared),
        ),
      );
      return {
        ...s,
        chat: cleared,
      };
    });
  },

  updateProfile(patch: Partial<Profile>) {
    set((s) => {
      const updatedProfile = { ...s.profile, ...patch };
      persist("settings.updateProfile", () =>
        import("../akira-os/settings").then(({ settingsService }) =>
          settingsService.updateProfile(patch, s.profile),
        ),
      );
      publish({
        type: Events.SETTINGS_UPDATED,
        source: "settings-store",
        payload: { patch },
        version: 1,
      });
      return { ...s, profile: updatedProfile };
    });
  },

  startSession(projectId: string, task?: string) {
    set((s) => {
      let sessions = s.sessions || [];
      if (s.activeSession) {
        const endedAt = nowISO();
        const duration = Math.max(
          1,
          Math.round((Date.now() - new Date(s.activeSession.startedAt).getTime()) / 60000),
        );
        sessions = [
          {
            id: uid(),
            projectId: s.activeSession.projectId,
            task: s.activeSession.task,
            startedAt: s.activeSession.startedAt,
            endedAt,
            duration,
          },
          ...sessions,
        ];
      }

      publish({
        type: Events.SESSION_STARTED,
        source: "sessions-store",
        payload: { projectId, task: task || "" },
        version: 1,
      });

      persist("sessions.start", () =>
        import("../akira-os/sessions").then(({ sessionsService }) =>
          sessionsService.start(projectId, task),
        ),
      );

      return {
        ...s,
        sessions,
        activeSession: {
          projectId,
          task: task || "",
          startedAt: nowISO(),
        },
      };
    });
  },
  endSession(notes?: string) {
    set((s) => {
      if (!s.activeSession) return s;
      const endedAt = nowISO();
      const duration = Math.max(
        1,
        Math.round((Date.now() - new Date(s.activeSession.startedAt).getTime()) / 60000),
      );
      const newSession: WorkSession = {
        id: uid(),
        projectId: s.activeSession.projectId,
        task: s.activeSession.task,
        startedAt: s.activeSession.startedAt,
        endedAt,
        duration,
        notes,
      };

      const projects = s.projects.map((p) => {
        if (p.id === s.activeSession!.projectId) {
          return {
            ...p,
            lastWorked: endedAt,
            timeSpentMinutes: p.timeSpentMinutes + duration,
          };
        }
        return p;
      });

      publish({
        type: Events.SESSION_ENDED,
        source: "sessions-store",
        payload: {
          projectId: s.activeSession.projectId,
          duration,
          notes,
        },
        version: 1,
      });

      persist("sessions.end", () =>
        import("../akira-os/sessions").then(({ sessionsService }) => sessionsService.end(notes)),
      );

      return {
        ...s,
        projects,
        sessions: [newSession, ...(s.sessions || [])],
        activeSession: null,
      };
    });
  },
  updateSessionTask(task: string) {
    set((s) => {
      if (!s.activeSession) return s;

      persist("sessions.updateActiveTask", () =>
        import("../akira-os/sessions").then(({ sessionsService }) =>
          sessionsService.updateActiveTask(task),
        ),
      );

      return {
        ...s,
        activeSession: { ...s.activeSession, task },
      };
    });
  },

  // Vault Actions
  addFolder(name: string, parentId: string | null) {
    const id = uid();
    const now = nowISO();
    const folder: VaultFolder = {
      id,
      name: name.trim() || "New Folder",
      parentId,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      ...s,
      vaultFolders: [...(s.vaultFolders || []), folder],
    }));
    persist("vault.createFolder", () =>
      import("../akira-os/vault").then(({ VaultFolderService }) =>
        VaultFolderService.createFolder(folder.name, folder.parentId),
      ),
    );
    return id;
  },
  renameFolder(id: string, name: string) {
    set((s) => ({
      ...s,
      vaultFolders: (s.vaultFolders || []).map((f) =>
        f.id === id ? { ...f, name, updatedAt: nowISO() } : f,
      ),
    }));
    persist("vault.renameFolder", () =>
      import("../akira-os/vault").then(({ VaultFolderService }) =>
        VaultFolderService.renameFolder(id, name),
      ),
    );
  },
  moveFolder(id: string, parentId: string | null) {
    set((s) => ({
      ...s,
      vaultFolders: (s.vaultFolders || []).map((f) =>
        f.id === id ? { ...f, parentId, updatedAt: nowISO() } : f,
      ),
    }));
    persist("vault.moveFolder", () =>
      import("../akira-os/vault").then(({ VaultFolderService }) =>
        VaultFolderService.moveFolder(id, parentId),
      ),
    );
  },
  deleteFolder(id: string) {
    set((s) => {
      const getChildIds = (pid: string, list: VaultFolder[]): string[] => {
        const children = list.filter((f) => f.parentId === pid);
        return [pid, ...children.flatMap((c) => getChildIds(c.id, list))];
      };
      const idsToDelete = getChildIds(id, s.vaultFolders || []);

      return {
        ...s,
        vaultFolders: (s.vaultFolders || []).filter((f) => !idsToDelete.includes(f.id)),
        vaultFiles: (s.vaultFiles || []).map((file) =>
          file.folderId && idsToDelete.includes(file.folderId)
            ? { ...file, folderId: null, updatedAt: nowISO() }
            : file,
        ),
      };
    });
    persist("vault.deleteFolder", () =>
      import("../akira-os/vault").then(({ VaultFolderService }) =>
        VaultFolderService.deleteFolder(id),
      ),
    );
  },
  renameFile(id: string, name: string) {
    set((s) => ({
      ...s,
      vaultFiles: (s.vaultFiles || []).map((f) =>
        f.id === id ? { ...f, displayName: name, updatedAt: nowISO() } : f,
      ),
    }));
    persist("vault.renameFile", () =>
      import("../akira-os/vault").then(({ VaultStorageService }) =>
        VaultStorageService.renameFile(id, name),
      ),
    );
  },
  moveFile(id: string, folderId: string | null) {
    set((s) => ({
      ...s,
      vaultFiles: (s.vaultFiles || []).map((f) =>
        f.id === id ? { ...f, folderId, updatedAt: nowISO() } : f,
      ),
    }));
    persist("vault.moveFile", () =>
      import("../akira-os/vault").then(({ VaultStorageService }) =>
        VaultStorageService.moveFile(id, folderId),
      ),
    );
  },
  deleteFile(id: string) {
    set((s) => ({
      ...s,
      vaultFiles: (s.vaultFiles || []).map((f) =>
        f.id === id
          ? {
              ...f,
              deletedAt: nowISO(),
              storagePath: `Trash/${f.id}${f.extension}`,
              updatedAt: nowISO(),
            }
          : f,
      ),
    }));
    persist("vault.deleteFile", () =>
      import("../akira-os/vault").then(({ VaultStorageService }) =>
        VaultStorageService.deleteFile(id),
      ),
    );
  },
  restoreFile(id: string) {
    set((s) => ({
      ...s,
      vaultFiles: (s.vaultFiles || []).map((f) => {
        if (f.id !== id) return f;
        const mimeLower = f.mimeType.toLowerCase();
        let cat = "Documents";
        if (mimeLower.startsWith("image/")) cat = "Images";
        else if (mimeLower.startsWith("audio/")) cat = "Audio";
        else if (mimeLower.startsWith("video/")) cat = "Video";
        return {
          ...f,
          deletedAt: null,
          storagePath: `${cat}/${f.id}${f.extension}`,
          updatedAt: nowISO(),
        };
      }),
    }));
    persist("vault.restoreFile", () =>
      import("../akira-os/vault").then(({ VaultStorageService }) =>
        VaultStorageService.restoreFile(id),
      ),
    );
  },
  permanentDeleteFile(id: string) {
    set((s) => ({
      ...s,
      vaultFiles: (s.vaultFiles || []).filter((f) => f.id !== id),
    }));
    persist("vault.permanentDeleteFile", () =>
      import("../akira-os/vault").then(({ VaultStorageService }) =>
        VaultStorageService.permanentDeleteFile(id),
      ),
    );
  },
  setFavorite(id: string, favorite: boolean) {
    set((s) => ({
      ...s,
      vaultFiles: (s.vaultFiles || []).map((f) =>
        f.id === id ? { ...f, favorite, updatedAt: nowISO() } : f,
      ),
    }));
    persist("vault.setFavorite", () =>
      import("../akira-os/vault").then(({ VaultStorageService }) =>
        VaultStorageService.setFavorite(id, favorite),
      ),
    );
  },
  addUploadedFile(file: VaultFile) {
    set((s) => ({
      ...s,
      vaultFiles: [file, ...(s.vaultFiles || []).filter((f) => f.id !== file.id)],
    }));
  },
  linkTagToFile(fileId: string, tagName: string) {
    set((s) => ({
      ...s,
      vaultFiles: (s.vaultFiles || []).map((f) =>
        f.id === fileId ? { ...f, tags: [...(f.tags || []), tagName], updatedAt: nowISO() } : f,
      ),
    }));
    persist("vault.linkTagToFile", () =>
      import("../akira-os/vault").then(({ VaultTagService }) =>
        VaultTagService.linkTagToFile(fileId, tagName),
      ),
    );
  },
  unlinkTagFromFile(fileId: string, tagName: string) {
    set((s) => ({
      ...s,
      vaultFiles: (s.vaultFiles || []).map((f) =>
        f.id === fileId
          ? { ...f, tags: (f.tags || []).filter((t) => t !== tagName), updatedAt: nowISO() }
          : f,
      ),
    }));
    persist("vault.unlinkTagFromFile", () =>
      import("../akira-os/vault").then(({ VaultTagService }) =>
        VaultTagService.unlinkTagFromFile(fileId, tagName),
      ),
    );
  },

  reset() {
    // Clear the database too, not just this array.
    //
    // This was `state = seed(); emit();`, which emptied the store and left
    // every row on disk. `getInitialState()` read them all back on the next
    // boot, so "Reset all local data" undid itself at the next reload --
    // measured at one project, one task, one note, one chat message and
    // fourteen memory events, all still present after the reset.
    //
    // Scope and rationale are in `./reset.ts`: the four things the dialog names
    // plus the cognitive stream derived from them, and deliberately not the
    // vault, the profile or anything else the dialog does not mention.
    //
    // Fire-and-forget through `persist` like every other write here, so the
    // deletion is owned by `pendingPersistence` and a failure is recorded
    // against `akira-store.persist.reset` in the health registry instead of
    // vanishing. Not gated on `hydrated`: a reset is an explicit instruction to
    // discard, so writing it against an unhydrated store destroys nothing the
    // user has not just asked to destroy.
    persist("reset", () =>
      import("./reset").then(({ persistResetLocalData }) => persistResetLocalData()),
    );

    state = seed();
    emit();
  },
};

export const selectors = {
  taskProgress(s: AkiraState) {
    if (s.tasks.length === 0) return 0;
    return Math.round((s.tasks.filter((t) => t.done).length / s.tasks.length) * 100);
  },
};

registerStoreProvider({
  getMemories: () => state.memories,
  getChat: () => state.chat,
  saveMemory: (event) => {
    set((s) => {
      // Newest first, so the stale end is the tail. Bounding here bounds the
      // durable layer too: this array is what gets written to the database and
      // replayed on the next start, and an unbounded stream would mean an
      // unbounded blob and an ever-slower startup.
      //
      // Bounded per durability class rather than by a single recency cut. A
      // flat `slice()` discarded a project milestone from months ago to make
      // room for a task completed this morning, and because this array is the
      // only cognitive state that survives a reload, that loss was permanent.
      // See ../genesis/retention/policy.ts for which events are which.
      const memories = applyDurableRetention([event, ...s.memories]);

      // Never write the stream before the database has answered.
      //
      // `settings.updateMemories` replaces the whole blob, so what it writes is
      // whatever `s.memories` holds at the time. `__root.tsx` hydrates in an
      // async effect and calls `companionStateService.bootstrap()` from a
      // synchronous one below it, so a durable event recorded on a cold start
      // lands while this array is still empty -- and the write puts that one
      // event over the user's history.
      //
      // Reproduced end to end against the real repository: seven events on
      // disk, hydration withheld, one bootstrap event recorded, disk 7 -> 1
      // holding only "Companion State Bootstrapped". The same bootstrap with
      // the store hydrated first leaves 7 -> 8, so the cause is the empty
      // array rather than anything about bootstrap.
      //
      // THAT PRODUCER IS GONE, AND THIS GUARD IS STILL WANTED
      //
      // The reproduction above used `bootstrap()`, which published its handoff
      // as `note_created`. Since 7cb6994 it publishes `companion_bootstrapped`,
      // which is Transient and never reaches `saveMemory` at all -- so the
      // event that produced those numbers can no longer produce them.
      //
      // Measured after that change, running `__root.tsx`'s second effect
      // verbatim and in order against an unhydrated store with seven events on
      // disk: disk unchanged at 7, and the health component still `undefined`,
      // which distinguishes "nothing called `persist()`" from "`persist()` was
      // called and declined". Nothing in the boot sequence reaches the write.
      // A deliberate durable event in the same state does register the
      // component, so that is a property of the sequence and not of the probe.
      //
      // So this is now an invariant guard rather than a live fix: the window is
      // empty in production, and the cost of keeping it that way is one `if`.
      // The next durable event added to a boot path would otherwise reopen the
      // whole class silently, and `__root.tsx:287` -- `{hydrated ? <Outlet/> :
      // null}` -- only stops writes that a *user* originates.
      //
      // Whether it self-heals is a race, and nothing orders that race.
      // `getInitialState()` and `persistUpdateMemories` are both
      // `createServerFn` -- a GET and a POST -- so they are two independent
      // round-trips. Measured under explicit ordering control:
      //
      //   read wins    hydration loads 7, bad write lands, next write 1 -> 8
      //                  ... all 7 recovered
      //   write wins   bad write lands, hydration loads 1, next write 1 -> 2
      //                  ... 0 of 7 recovered, permanently
      //
      // An earlier version of this comment claimed categorically that it does
      // not self-heal. That was one arm reported as the rule.
      //
      // The bias runs the wrong way. `getInitialState()` reads and parses the
      // whole persisted state -- including the very `genesis_memories` blob it
      // is racing -- while this write POSTs a single-element array. The read
      // gets slower as the history grows; the write does not. So the write is
      // likeliest to win for the user with the most to lose.
      //
      // A guard here rather than a reordering of those effects. The ordering is
      // load-bearing for cognition and `__root.tsx` documents why: bootstrap
      // reconstructs against an empty stream and hydration re-runs
      // `memoryService.initialize()` afterwards to rebuild it. That mitigation
      // covers the read. This covers the write, which is the half that reaches
      // disk.
      //
      // The event is dropped, not deferred, and that is a deliberate choice
      // rather than an oversight: `initializeState` replaces `s.memories`
      // wholesale a moment later, so the bootstrap event was never going to
      // survive the cold start in memory either. Deferring it would mean
      // holding a queue across hydration to re-persist an event that hydration
      // is about to discard anyway.
      // What this guards is exactly one window -- before the first hydration --
      // and not the broader property "never write an empty stream over a full
      // one", which is how a guard on `hydrated` invites you to read it.
      // `hydrated` is one-way: set true once and never set back, so a store
      // emptied *after* hydration is unprotected by construction. `reset()`
      // does exactly that (`state = seed()`), and its only caller is the
      // destructive confirm at settings.tsx:636, where overwriting the stream
      // is what the user asked for. Correct today; the thing to check before
      // adding another path that empties the store.
      if (hydrated) {
        // Fire-and-forget, matching every other write in this store. A failed
        // persist costs the next reload some history; it must not break the
        // cognitive cycle that produced the event.
        persist("settings.updateMemories", () =>
          import("../akira-os/settings").then(({ settingsService }) =>
            settingsService.updateMemories(memories),
          ),
        );
      } else {
        // Register the component without an outcome, so that declining to
        // write stays distinguishable from never having tried. `observeWrite`
        // lives inside `persist()`, so a bare `return` here would leave
        // `healthRegistry.get(...)` undefined and collapse "we chose not to
        // write" into "nothing ever happened" -- the distinction 0443991 and
        // 302ba75 exist to draw.
        //
        // Registered-with-no-outcome is `unknown`, which the registry already
        // treats as explicitly not healthy. Not `degraded`: skipping is the
        // correct behaviour here, and reporting every cold start as degraded
        // would teach a reader to ignore the signal. It also gives the
        // pathological case a shape -- if hydration never resolves, this
        // component sits at `unknown` forever instead of vanishing.
        observeWrite("settings.updateMemories", undefined, false);
      }

      return { ...s, memories };
    });
  },
});

registerWorkspaceProvider(akira);
