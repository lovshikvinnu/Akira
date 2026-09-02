/**
 * Platform event -> GENESIS MemoryEvent translation.
 *
 * This is the single definition of how an AKIRA OS event becomes something
 * GENESIS can record. It is pure: no bus, no subscription, no side effect, no
 * I/O. That matters because two callers share it —
 *
 *   - `event-service.ts`, whose legacy-bus subscription has always owned this
 *     logic inline, and
 *   - `reality-adapter.ts`, the instrumentation-bus boundary,
 *
 * and a second copy of these strings is exactly how `note.updated` drifted away
 * from every one of its consumers (see the P1 contract repair).
 *
 * The translator table doubles as the allowlist. Support for an event type and
 * the ability to translate it are the same fact, so they cannot disagree.
 *
 * Behaviour is preserved verbatim from the original `switch`, including the
 * places where a malformed payload throws rather than degrading — callers are
 * responsible for isolating that.
 */

import { MemoryEvent } from "../../shared/types/event-types";
import { Events } from "../../contracts/events";

/** The parts of a MemoryEvent that are derived from the platform event. */
export interface TranslatedEvent {
  eventType: MemoryEvent["eventType"];
  title: string;
  description: string;
  relatedProjectId: string | null;
  relatedNoteId: string | null;
}

interface ProjectPayload {
  id: string;
  name: string;
}

interface TaskCompletedPayload {
  id: string;
  title: string;
  projectId: string | null;
}

interface MissionCompletedPayload {
  totalTasks: number;
}

interface NotePayload {
  id: string;
  title?: string;
  projectId: string | null;
}

interface PresencePayload {
  context: {
    returnState: string;
    timePeriod: string;
    recentProjectReference: string | null;
  };
}

/**
 * One translator per supported platform event type.
 *
 * `payload` is deliberately typed per entry rather than defensively widened:
 * the shapes below are what the producers in `akira-store` actually publish,
 * and narrowing here is what makes a producer payload change a compile error
 * instead of a silent `undefined` in a memory description.
 */
const TRANSLATORS: Record<string, (payload: never) => TranslatedEvent> = {
  [Events.PROJECT_CREATED]: (payload: ProjectPayload): TranslatedEvent => ({
    eventType: "project_created",
    title: "Project Created",
    description: `Started new project: ${payload.name}`,
    relatedProjectId: payload.id,
    relatedNoteId: null,
  }),

  [Events.PROJECT_UPDATED]: (payload: ProjectPayload): TranslatedEvent => ({
    eventType: "project_updated",
    title: "Project Updated",
    description: `Updated details for project: ${payload.name}`,
    relatedProjectId: payload.id,
    relatedNoteId: null,
  }),

  [Events.PROJECT_CONTINUED]: (payload: ProjectPayload): TranslatedEvent => ({
    eventType: "project_continued",
    title: "Project Continued",
    description: `Logged 5 minutes of work on project: ${payload.name}`,
    relatedProjectId: payload.id,
    relatedNoteId: null,
  }),

  [Events.TASK_COMPLETED]: (payload: TaskCompletedPayload): TranslatedEvent => ({
    eventType: "task_completed",
    title: "Task Completed",
    description: `Completed task: "${payload.title}"`,
    relatedProjectId: payload.projectId,
    relatedNoteId: null,
  }),

  [Events.MISSION_COMPLETED]: (payload: MissionCompletedPayload): TranslatedEvent => ({
    eventType: "mission_completed",
    title: "Daily Mission Completed",
    description: `Finished all ${payload.totalTasks} missions for today!`,
    relatedProjectId: null,
    relatedNoteId: null,
  }),

  [Events.NOTE_CREATED]: (payload: NotePayload): TranslatedEvent => ({
    eventType: "note_created",
    title: "Note Created",
    description: payload.title ? `Captured thought: "${payload.title}"` : "Captured raw thought",
    relatedProjectId: payload.projectId,
    relatedNoteId: payload.id,
  }),

  [Events.NOTE_EDITED]: (payload: NotePayload): TranslatedEvent => ({
    eventType: "note_edited",
    title: "Note Edited",
    description: payload.title ? `Updated thought: "${payload.title}"` : "Updated raw thought",
    relatedProjectId: payload.projectId,
    relatedNoteId: payload.id,
  }),

  [Events.PRESENCE_UPDATED]: (payload: PresencePayload): TranslatedEvent => ({
    eventType: "presence_updated",
    title: "Presence Context Resolved",
    description: `Resolved: ${payload.context.returnState} during the ${payload.context.timePeriod}`,
    relatedProjectId: payload.context.recentProjectReference,
    relatedNoteId: null,
  }),
};

/**
 * The platform event types GENESIS currently understands.
 *
 * Derived from the translator table, so it cannot fall out of step with what
 * is actually translatable. Note that `presence.updated` travels only on the
 * legacy bus today; it is listed because the legacy subscription shares this
 * table, not because the instrumentation bus carries it.
 */
export const SUPPORTED_PLATFORM_EVENT_TYPES: readonly string[] = Object.freeze(
  Object.keys(TRANSLATORS),
);

/** True when `type` is a platform event GENESIS can interpret. */
export function isTranslatable(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(TRANSLATORS, type);
}

/**
 * Translates a platform event into the fields `eventService.record()` needs,
 * or returns null when GENESIS has no interpretation for the type.
 *
 * Throws only if a supported type arrives with a payload that does not match
 * its declared shape — the caller decides whether that is fatal.
 */
export function translatePlatformEvent(type: string, payload: unknown): TranslatedEvent | null {
  const translator = TRANSLATORS[type];
  if (!translator) return null;
  return (translator as (p: unknown) => TranslatedEvent)(payload);
}
