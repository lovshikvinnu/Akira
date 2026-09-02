import { MemoryEvent } from "../../shared/types/event-types";
import { saveMemory } from "../../shared/genesis-provider";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const nowISO = () => new Date().toISOString();

/**
 * GENESIS's intake is `src/genesis/events/reality-adapter.ts`, attached to the
 * instrumentation `globalEventBus` by `genesis/composition.ts`.
 *
 * This module used to open a second one: an `initialize()` that subscribed
 * `"*"` on the legacy `shared/infrastructure/event-bus`. That was the S1 defect
 * — workspace events are published on the instrumentation bus, so the legacy
 * subscription carried only `presence.updated` and GENESIS observed no user
 * activity at all. It is removed rather than left dormant, because the legacy
 * bus forwards everything except `presence.updated` onward to the
 * instrumentation bus with a *fresh* event id; had both paths stayed live, the
 * same real action would have been processed twice and id-based idempotency
 * could not have detected it.
 *
 * `eventService` is now purely a recorder. Its public `record()` / `onRecord()`
 * API is unchanged, and all 77 internal callers are unaffected.
 */
export type PersistHandler = (event: MemoryEvent) => void;
export type EventCallback = (event: MemoryEvent) => void;

const callbacks = new Set<EventCallback>();
let localPersistHandler: PersistHandler | null = null;

export const eventService = {
  /**
   * Register a persistence handler responsible for saving MemoryEvents to a storage adapter.
   */
  registerPersistHandler(handler: PersistHandler): void {
    localPersistHandler = handler;
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

    // 1. Persist the event first if a handler exists (e.g. via local handler or shared saveMemory provider)
    if (localPersistHandler) {
      try {
        localPersistHandler(event);
      } catch (err) {
        console.error("Error executing event persistence handler:", err);
      }
    } else {
      try {
        saveMemory(event);
      } catch (err) {
        console.error("Error saving memory event to database provider:", err);
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
