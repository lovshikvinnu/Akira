import { MemoryEvent } from "./types";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const nowISO = () => new Date().toISOString();

export type PersistHandler = (event: MemoryEvent) => void;
export type EventCallback = (event: MemoryEvent) => void;

const callbacks = new Set<EventCallback>();
let persistHandler: PersistHandler | null = null;

export const eventService = {
  /**
   * Register a persistence handler responsible for saving MemoryEvents to a storage adapter.
   */
  registerPersistHandler(handler: PersistHandler): void {
    persistHandler = handler;
  },

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

    // 1. Persist the event first if a handler exists (e.g., writing to state store/localStorage)
    if (persistHandler) {
      try {
        persistHandler(event);
      } catch (err) {
        console.error("Error executing event persistence handler:", err);
      }
    }

    // 2. Publish the event to subscribers (e.g., candidate engine, runtime caches)
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
