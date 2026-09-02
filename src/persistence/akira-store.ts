import { useSyncExternalStore } from "react";
import { seed } from "./seed";
import { registerStoreProvider } from "../shared/genesis-provider";
import { registerWorkspaceProvider } from "../contracts/workspace-provider";
import { Events } from "../contracts/events";
import { publish } from "../instrumentation";

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

function set(updater: (s: AkiraState) => AkiraState) {
  state = updater(state);
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

    import("../akira-os/projects").then(({ projectsService }) => {
      projectsService.add(p);
    });
    import("../akira-os/settings").then(({ settingsService }) => {
      settingsService.updateLastProjectId(p.id);
    });

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

      import("../akira-os/projects").then(({ projectsService }) => {
        projectsService.update(id, patch);
      });

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

      import("../akira-os/projects").then(({ projectsService }) => {
        projectsService.delete(id);
      });
      import("../akira-os/settings").then(({ settingsService }) => {
        settingsService.updateLastProjectId(nextLastProjectId);
      });

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

      import("../akira-os/projects").then(({ projectsService }) => {
        projectsService.touch(id);
      });
      import("../akira-os/settings").then(({ settingsService }) => {
        settingsService.updateLastProjectId(id);
      });

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

      import("../akira-os/tasks").then(({ tasksService }) => {
        tasksService.update(id, { done: t.done, completed: t.completed });
      });

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

      import("../akira-os/tasks").then(({ tasksService }) => {
        tasksService.update(id, { title: title.trim() });
      });

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

      import("../akira-os/tasks").then(({ tasksService }) => {
        tasksService.delete(id);
      });

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

      import("../akira-os/tasks").then(({ tasksService }) => {
        tasksService.add(t);
      });

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

      import("../akira-os/tasks").then(({ tasksService }) => {
        tasksService.update(id, patch);
      });

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
        payload: { id: n.id, title, tags, projectId },
        version: 1,
      });

      import("../akira-os/notes").then(({ notesService }) => {
        notesService.add(n);
      });

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
          payload: { id: n.id, title: n.title, projectId: n.projectId },
          version: 1,
        });
      }

      import("../akira-os/notes").then(({ notesService }) => {
        notesService.update(id, patch);
      });

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

      import("../akira-os/notes").then(({ notesService }) => {
        notesService.delete(id);
      });

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
      import("../akira-os/settings").then(({ settingsService }) => {
        settingsService.updateChat(nextChat);
      });
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
        import("../akira-os/settings").then(({ settingsService }) => {
          settingsService.updateChat(nextChat);
        });
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
      import("../akira-os/settings").then(({ settingsService }) => {
        settingsService.updateChat(nextChat);
      });
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
        import("../akira-os/settings").then(({ settingsService }) => {
          settingsService.updateChat(nextChat);
        });
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
      import("../akira-os/settings").then(({ settingsService }) => {
        settingsService.updateChat(cleared);
      });
      return {
        ...s,
        chat: cleared,
      };
    });
  },

  updateProfile(patch: Partial<Profile>) {
    set((s) => {
      const updatedProfile = { ...s.profile, ...patch };
      import("../akira-os/settings").then(({ settingsService }) => {
        settingsService.updateProfile(patch, s.profile);
      });
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

      import("../akira-os/sessions").then(({ sessionsService }) => {
        sessionsService.start(projectId, task);
      });

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

      import("../akira-os/sessions").then(({ sessionsService }) => {
        sessionsService.end(notes);
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

      import("../akira-os/sessions").then(({ sessionsService }) => {
        sessionsService.updateActiveTask(task);
      });

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
    import("../akira-os/vault").then(({ VaultFolderService }) => {
      VaultFolderService.createFolder(folder.name, folder.parentId);
    });
    return id;
  },
  renameFolder(id: string, name: string) {
    set((s) => ({
      ...s,
      vaultFolders: (s.vaultFolders || []).map((f) =>
        f.id === id ? { ...f, name, updatedAt: nowISO() } : f,
      ),
    }));
    import("../akira-os/vault").then(({ VaultFolderService }) => {
      VaultFolderService.renameFolder(id, name);
    });
  },
  moveFolder(id: string, parentId: string | null) {
    set((s) => ({
      ...s,
      vaultFolders: (s.vaultFolders || []).map((f) =>
        f.id === id ? { ...f, parentId, updatedAt: nowISO() } : f,
      ),
    }));
    import("../akira-os/vault").then(({ VaultFolderService }) => {
      VaultFolderService.moveFolder(id, parentId);
    });
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
    import("../akira-os/vault").then(({ VaultFolderService }) => {
      VaultFolderService.deleteFolder(id);
    });
  },
  renameFile(id: string, name: string) {
    set((s) => ({
      ...s,
      vaultFiles: (s.vaultFiles || []).map((f) =>
        f.id === id ? { ...f, displayName: name, updatedAt: nowISO() } : f,
      ),
    }));
    import("../akira-os/vault").then(({ VaultStorageService }) => {
      VaultStorageService.renameFile(id, name);
    });
  },
  moveFile(id: string, folderId: string | null) {
    set((s) => ({
      ...s,
      vaultFiles: (s.vaultFiles || []).map((f) =>
        f.id === id ? { ...f, folderId, updatedAt: nowISO() } : f,
      ),
    }));
    import("../akira-os/vault").then(({ VaultStorageService }) => {
      VaultStorageService.moveFile(id, folderId);
    });
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
    import("../akira-os/vault").then(({ VaultStorageService }) => {
      VaultStorageService.deleteFile(id);
    });
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
    import("../akira-os/vault").then(({ VaultStorageService }) => {
      VaultStorageService.restoreFile(id);
    });
  },
  permanentDeleteFile(id: string) {
    set((s) => ({
      ...s,
      vaultFiles: (s.vaultFiles || []).filter((f) => f.id !== id),
    }));
    import("../akira-os/vault").then(({ VaultStorageService }) => {
      VaultStorageService.permanentDeleteFile(id);
    });
  },
  setFavorite(id: string, favorite: boolean) {
    set((s) => ({
      ...s,
      vaultFiles: (s.vaultFiles || []).map((f) =>
        f.id === id ? { ...f, favorite, updatedAt: nowISO() } : f,
      ),
    }));
    import("../akira-os/vault").then(({ VaultStorageService }) => {
      VaultStorageService.setFavorite(id, favorite);
    });
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
    import("../akira-os/vault").then(({ VaultTagService }) => {
      VaultTagService.linkTagToFile(fileId, tagName);
    });
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
    import("../akira-os/vault").then(({ VaultTagService }) => {
      VaultTagService.unlinkTagFromFile(fileId, tagName);
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
  saveMemory: (event) => {
    set((s) => ({
      ...s,
      memories: [event, ...s.memories],
    }));
  },
});

registerWorkspaceProvider(akira);
