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
    /**
     * The Companion State Engine taking ownership of a session.
     *
     * Its own type for the same reason `chat_message` is: durability is decided
     * by event type, and this was published as `note_created`, so an internal
     * handoff inherited a user note's Core durability. It is not a note. Nobody
     * wrote it, it says the same fixed sentence every time, and nothing reads it
     * -- `state/service.ts` is the only site that mentions it.
     *
     * `bootstrap()` is not once-per-install: `chat.tsx` calls it from
     * `handleNewChat`, so it fires on every new conversation as well as every
     * cold start. Measured over 100 new-chat sessions each writing one real
     * note, it was 101 of 201 durable events -- half the stream -- and 101 of
     * 201 Memories, classified `reason: "Reflection Worthy"` and pulled into a
     * story. So the cost was not only budget: AKIRA was building narrative
     * about the user out of its own plumbing and calling it a reflection.
     *
     * Transient, so it still reaches every subscriber live but is never written
     * to the durable stream. No candidate rule matches this type, so it builds
     * no Memory either.
     */
    | "companion_bootstrapped"
    | DomainEventName; // Support namespaced events too
  title: string;
  description: string;
  relatedProjectId?: string | null;
  relatedNoteId?: string | null;
  metadata?: Record<string, unknown>;
};
