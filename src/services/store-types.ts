import { MemoryEvent } from "./events/types";

export type Project = {
  id: string;
  name: string;
  tag: string;
  description: string;
  progress: number;
  color: string;
  nextTask: string;
  notes: string;
  timeSpentMinutes: number;
  lastWorked: string;
  createdAt: string;
  icon: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  priority: "Low" | "Medium" | "High";
  estimatedDuration: number;
  dueDate?: string | null;
  done: boolean;
  completed: boolean;
  projectId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  favorite: boolean;
  projectId?: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "akira";
  text: string;
  createdAt: string;
};

export type HabitStreak = {
  id: string;
  label: string;
  icon: "dumbbell" | "cpu" | "book" | "sparkles" | "moon";
  days: number;
  pct: number;
  color: string;
};

export type Profile = {
  name: string;
  role: string;
  motto: string;
};

export type WorkSession = {
  id: string;
  projectId: string;
  task: string;
  startedAt: string;
  endedAt: string;
  duration: number;
  notes?: string;
};

export type AkiraState = {
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  chat: ChatMessage[];
  streaks: HabitStreak[];
  profile: Profile;
  lastProjectId: string | null;
  memories: MemoryEvent[];
  sessions: WorkSession[];
  activeSession: {
    projectId: string;
    task: string;
    startedAt: string;
  } | null;
};
