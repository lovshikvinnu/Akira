import { MemoryEvent } from "./types";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const nowISO = () => new Date().toISOString();

type EventCallback = (event: MemoryEvent) => void;
const callbacks = new Set<EventCallback>();

export const eventService = {
  /**
   * Subscribe to new events being recorded in the system.
   * Useful for decoupling downstream processes (e.g., consolidation, metrics) from the store.
   */
  onRecord(callback: EventCallback): () => void {
    callbacks.add(callback);
    return () => {
      callbacks.delete(callback);
    };
  },

  /**
   * Record a new workspace or companion event.
   */
  record(
    eventType: MemoryEvent["eventType"],
    title: string,
    description: string,
    relatedProjectId?: string | null,
    relatedNoteId?: string | null,
    metadata?: Record<string, unknown>,
  ): MemoryEvent {
    const event: MemoryEvent = {
      id: uid(),
      timestamp: nowISO(),
      eventType,
      title,
      description,
      relatedProjectId: relatedProjectId || null,
      relatedNoteId: relatedNoteId || null,
      metadata: metadata || {},
    };

    callbacks.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.error("Error executing event subscription callback:", err);
      }
    });

    return event;
  },
};
