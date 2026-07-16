export const Events = {
  PROJECT_CREATED: "project.created",
  PROJECT_UPDATED: "project.updated",
  PROJECT_CONTINUED: "project.continued",
  PROJECT_DELETED: "project.deleted",
  TASK_CREATED: "task.created",
  TASK_COMPLETED: "task.completed",
  TASK_UPDATED: "task.updated",
  TASK_DELETED: "task.deleted",
  MISSION_COMPLETED: "mission.completed",
  NOTE_CREATED: "note.created",
  NOTE_EDITED: "note.edited",
  NOTE_DELETED: "note.deleted",
  SESSION_STARTED: "session.started",
  SESSION_ENDED: "session.ended",
  PRESENCE_UPDATED: "presence.updated",
} as const;

export type DomainEventName = (typeof Events)[keyof typeof Events];

export interface DomainEvent<T = any> {
  name: DomainEventName;
  payload: T;
  timestamp: string;
}
