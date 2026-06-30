export type MemoryEvent = {
  id: string;
  timestamp: string;
  eventType:
    | "project_created"
    | "project_continued"
    | "project_updated"
    | "note_created"
    | "note_edited"
    | "task_completed"
    | "mission_completed";
  title: string;
  description: string;
  relatedProjectId?: string | null;
  relatedNoteId?: string | null;
  metadata?: Record<string, unknown>;
};
