import { CandidateReason } from "../candidate";

export type Memory = {
  id: string;
  sourceEventId: string; // Lineage (Provenance)
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
