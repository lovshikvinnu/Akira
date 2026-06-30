import { ImportanceSignal } from "../importance/types";

export type RecallCandidate = {
  memoryId: string;
  supportingStoryIds: string[];
  importanceSignals: ImportanceSignal[];
  recallReasons: string[];
  status: "Active" | "Inactive";
  recallTimestamp: string;
};

export type RecallAuditEntry = {
  memoryId: string;
  reason: string;
  timestamp: string;
};

export type RecallSession = {
  sessionId: string;
  candidates: RecallCandidate[];
  auditTrail: RecallAuditEntry[];
  timestamp: string;
};
