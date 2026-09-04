import { MemoryEvent } from "../../shared/types/event-types";

export type CandidateReason =
  "Milestone" | "Goal Progress" | "Reflection Worthy" | "Repeated Activity";

export type MemoryCandidate = {
  id: string;
  sourceEventId: string;
  /**
   * The originating `MemoryEvent.eventType`, carried through unchanged.
   *
   * Retention classifies by event type, and it has to do so at two layers now:
   * the durable stream and the runtime memory set. Copying the canonical value
   * along the pipeline keeps `classifyDurability` the single authority --
   * re-deriving durability from `reason` further down would be a second,
   * silently divergent classification of the same fact.
   */
  eventType: MemoryEvent["eventType"];
  timestamp: string;
  reason: CandidateReason;
  explanation: string;
  title: string;
  description: string;
  relatedProjectId?: string | null;
  relatedNoteId?: string | null;
  metadata?: Record<string, unknown>;
};
