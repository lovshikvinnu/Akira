import { MemoryEvent } from "../events/types";

export type CandidateReason =
  "Milestone" | "Goal Progress" | "Reflection Worthy" | "Repeated Activity";

export type MemoryCandidate = {
  id: string;
  sourceEventId: string;
  timestamp: string;
  reason: CandidateReason;
  explanation: string;
  title: string;
  description: string;
  relatedProjectId?: string | null;
  relatedNoteId?: string | null;
  metadata?: Record<string, unknown>;
};
