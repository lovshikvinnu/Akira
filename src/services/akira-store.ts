import { useSyncExternalStore } from "react";
import { seed } from "./seed";
import { MemoryEvent } from "./events/types";
import { eventService } from "./events/event-service";
import { registerStoreProvider } from "./genesis-provider";
import "./memory";
import "./stories";
import "./identity";
import "./importance";
import "./recall";
import "./context";

import type {
  Project,
  Task,
  Note,
  ChatMessage,
  HabitStreak,
  Profile,
  WorkSession,
  AkiraState,
} from "./store-types";

export type {
  Project,
  Task,
  Note,
  ChatMessage,
  HabitStreak,
  Profile,
  WorkSession,
  AkiraState,
};


const STORAGE_KEY = "akira:state:v1";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const nowISO = () => new Date().toISOString();

function load(): AkiraState {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Partial<AkiraState>;
    return { ...seed(), ...parsed };
  } catch {
    return seed();
  }
}

let state: AkiraState = load();
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function set(updater: (s: AkiraState) => AkiraState) {
  state = updater(state);
  emit();
}

// Register the persistence handler on eventService to own MemoryEvent persistence globally
eventService.registerPersistHandler((event) => {
  set((s) => ({
    ...s,
    memories: [event, ...s.memories],
  }));
});

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

export const akira = {
  getState() {
    return state;
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
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

    eventService.record(
      "project_created",
      "Project Created",
      `Started new project: ${p.name}`,
      p.id,
      null,
      { name: p.name, tag: p.tag },
    );
    set((s) => ({
      ...s,
      projects: [p, ...s.projects],
      lastProjectId: p.id,
    }));
    return p.id;
  },
  updateProject(id: string, patch: Partial<Project>) {
    set((s) => {
      const project = s.projects.find((p) => p.id === id);
      if (!project) return s;
      const p = { ...project, ...patch };
      eventService.record(
        "project_updated",
        "Project Updated",
        `Updated details for project: ${p.name}`,
        p.id,
        null,
        { name: p.name, patch },
      );
      return {
        ...s,
        projects: s.projects.map((item) => (item.id === id ? p : item)),
      };
    });
  },
  deleteProject(id: string) {
    set((s) => ({
      ...s,
      projects: s.projects.filter((p) => p.id !== id),
      lastProjectId:
        s.lastProjectId === id
          ? (s.projects.find((p) => p.id !== id)?.id ?? null)
          : s.lastProjectId,
      tasks: s.tasks.map((t) => (t.projectId === id ? { ...t, projectId: null } : t)),
      notes: s.notes.map((n) => (n.projectId === id ? { ...n, projectId: null } : n)),
      sessions: (s.sessions || []).map((sess) =>
        sess.projectId === id ? { ...sess, projectId: "" } : sess,
      ),
      activeSession: s.activeSession?.projectId === id ? null : s.activeSession,
      memories: s.memories.map((m) =>
        m.relatedProjectId === id ? { ...m, relatedProjectId: null } : m,
      ),
    }));
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
      eventService.record(
        "project_continued",
        "Project Continued",
        `Logged 5 minutes of work on project: ${p.name}`,
        p.id,
        null,
        { name: p.name },
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
    set((s) => ({
      ...s,
      tasks: [...s.tasks, t],
    }));
  },
  toggleTask(id: string) {
    set((s) => {
      const task = s.tasks.find((t) => t.id === id);
      if (!task) return s;
      const doneValue = !task.done;
      const t = { ...task, done: doneValue, completed: doneValue, updatedAt: nowISO() };
      const nextTasks = s.tasks.map((item) => (item.id === id ? t : item));

      if (t.done) {
        eventService.record(
          "task_completed",
          "Task Completed",
          `Completed task: "${t.title}"`,
          t.projectId,
          null,
          { title: t.title },
        );

        const allDone = nextTasks.every((tk) => tk.done) && nextTasks.length > 0;
        if (allDone) {
          eventService.record(
            "mission_completed",
            "Daily Mission Completed",
            `Finished all ${nextTasks.length} missions for today!`,
            null,
            null,
            { totalTasks: nextTasks.length },
          );
        }
      }

      return {
        ...s,
        tasks: nextTasks,
      };
    });
  },
  updateTask(id: string, title: string) {
    set((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, title: title.trim() || t.title, updatedAt: nowISO() } : t,
      ),
    }));
  },
  deleteTask(id: string) {
    set((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
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
    set((s) => ({ ...s, tasks: [...s.tasks, t] }));
  },
  updateTaskDetails(id: string, patch: Partial<Task>) {
    set((s) => ({
      ...s,
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, ...patch, updatedAt: nowISO() };
        if (patch.completed !== undefined) {
          updated.done = patch.completed;
        } else if (patch.done !== undefined) {
          updated.completed = patch.done;
        }
        return updated;
      }),
    }));
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
      eventService.record(
        "note_created",
        "Note Created",
        title ? `Captured thought: "${title}"` : "Captured raw thought",
        projectId,
        n.id,
        { title, tags },
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
        eventService.record(
          "note_edited",
          "Note Edited",
          n.title ? `Updated thought: "${n.title}"` : "Updated raw thought",
          n.projectId,
          n.id,
          { title: n.title },
        );
      }

      return {
        ...s,
        notes: s.notes.map((item) => (item.id === id ? n : item)),
      };
    });
  },
  deleteNote(id: string) {
    set((s) => ({
      ...s,
      notes: s.notes.filter((n) => n.id !== id),
      memories: s.memories.map((m) => (m.relatedNoteId === id ? { ...m, relatedNoteId: null } : m)),
    }));
  },

  addChatMessage(role: "user" | "akira", text: string): ChatMessage {
    const msg: ChatMessage = {
      id: uid(),
      role,
      text,
      createdAt: nowISO(),
    };
    set((s) => ({
      ...s,
      chat: [...s.chat, msg],
    }));
    return msg;
  },

  updateChatMessage(id: string, text: string): void {
    set((s) => ({
      ...s,
      chat: s.chat.map((m) => (m.id === id ? { ...m, text } : m)),
    }));
  },

  sendChat(text: string) {
    if (!text.trim()) return;
    const user: ChatMessage = { id: uid(), role: "user", text: text.trim(), createdAt: nowISO() };
    set((s) => ({ ...s, chat: [...s.chat, user] }));
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
    setTimeout(() => set((s) => ({ ...s, chat: [...s.chat, reply] })), 450);
  },
  clearChat() {
    set((s) => ({
      ...s,
      chat: [
        {
          id: uid(),
          role: "akira",
          text: "Conversation cleared. Ready when you are.",
          createdAt: nowISO(),
        },
      ],
    }));
  },

  updateProfile(patch: Partial<Profile>) {
    set((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
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
      return {
        ...s,
        activeSession: { ...s.activeSession, task },
      };
    });
  },

  reset() {
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
});

