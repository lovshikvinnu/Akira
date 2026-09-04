import { CandidateReason } from "../candidate/candidate";
import { MemoryEvent } from "../../shared/types/event-types";

export type Memory = {
  id: string;
  sourceEventId: string; // Lineage (Provenance)
  /** Originating `MemoryEvent.eventType`. See MemoryCandidate.eventType. */
  eventType: MemoryEvent["eventType"];
  candidateId: string; // Lineage (Provenance)
  timestamp: string;
  reason: CandidateReason; // Explainability
  explanation: string; // Explainability
  title: string;
  description: string;
  relatedProjectId?: string | null;
  relatedNoteId?: string | null;
  metadata?: Record<string, unknown>;
};
