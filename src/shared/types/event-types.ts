import { DomainEventName } from "../../contracts/events";

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
    | "mission_completed"
    | "presence_updated"
    /**
     * One turn the user typed into the conversation.
     *
     * Deliberately its own type rather than borrowed from `note_created`,
     * which is what it used to be published as. Durability is decided by event
     * type, so borrowing a note's type gave a chat turn a note's durability --
     * and chat is the highest-volume input in the system while a note is one
     * of the rarest. See `DURABILITY_BY_EVENT_TYPE`, where this is Transient:
     * it informs cognition live and is never written to the durable stream,
     * because `settingsService.updateChat` already persists the conversation.
     */
    | "chat_message"
    /**
     * A first-person declaration the user made, promoted out of a chat turn.
     *
     * The durable half of the chat boundary. Raw conversation is transient;
     * this is what survives of it, and only when `parseDeclaration` confirms
     * the turn actually asserts something about the user.
     */
    | "declaration_captured"
    | DomainEventName; // Support namespaced events too
  title: string;
  description: string;
  relatedProjectId?: string | null;
  relatedNoteId?: string | null;
  metadata?: Record<string, unknown>;
};
