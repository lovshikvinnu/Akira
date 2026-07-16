import { MemoryEvent } from "../../shared/types/event-types";
import { eventBus } from "../../shared/infrastructure/event-bus";
import { Events } from "../../contracts/events";
import { saveMemory } from "../../shared/genesis-provider";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const nowISO = () => new Date().toISOString();

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

  /**
   * Initialize Event Bus subscription to bridge namespaced events.
   */
  initialize(): void {
    if (isInitialized) return;
    isInitialized = true;

    eventBus.subscribe("*", (evt) => {
      let legacyType: MemoryEvent["eventType"] | null = null;
      let title = "";
      let description = "";
      let relatedProjectId: string | null = null;
      let relatedNoteId: string | null = null;
      const metadata = evt.payload || {};

      switch (evt.type) {
        case Events.PROJECT_CREATED:
          legacyType = "project_created";
          title = "Project Created";
          description = `Started new project: ${evt.payload.name}`;
          relatedProjectId = evt.payload.id;
          break;
        case Events.PROJECT_UPDATED:
          legacyType = "project_updated";
          title = "Project Updated";
          description = `Updated details for project: ${evt.payload.name}`;
          relatedProjectId = evt.payload.id;
          break;
        case Events.PROJECT_CONTINUED:
          legacyType = "project_continued";
          title = "Project Continued";
          description = `Logged 5 minutes of work on project: ${evt.payload.name}`;
          relatedProjectId = evt.payload.id;
          break;
        case Events.TASK_COMPLETED:
          legacyType = "task_completed";
          title = "Task Completed";
          description = `Completed task: "${evt.payload.title}"`;
          relatedProjectId = evt.payload.projectId;
          break;
        case Events.MISSION_COMPLETED:
          legacyType = "mission_completed";
          title = "Daily Mission Completed";
          description = `Finished all ${evt.payload.totalTasks} missions for today!`;
          break;
        case Events.NOTE_CREATED:
          legacyType = "note_created";
          title = "Note Created";
          description = evt.payload.title
            ? `Captured thought: "${evt.payload.title}"`
            : "Captured raw thought";
          relatedNoteId = evt.payload.id;
          relatedProjectId = evt.payload.projectId;
          break;
        case Events.NOTE_EDITED:
          legacyType = "note_edited";
          title = "Note Edited";
          description = evt.payload.title
            ? `Updated thought: "${evt.payload.title}"`
            : "Updated raw thought";
          relatedNoteId = evt.payload.id;
          relatedProjectId = evt.payload.projectId;
          break;
        case Events.PRESENCE_UPDATED:
          legacyType = "presence_updated";
          title = "Presence Context Resolved";
          description = `Resolved: ${evt.payload.context.returnState} during the ${evt.payload.context.timePeriod}`;
          relatedProjectId = evt.payload.context.recentProjectReference;
          break;
      }

      if (legacyType) {
        this.record(legacyType, title, description, relatedProjectId, relatedNoteId, metadata);
      }
    });
  },
};

let isInitialized = false;
eventService.initialize();
