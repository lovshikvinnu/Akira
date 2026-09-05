import { ImportanceSignal } from "../importance/types";

export type RecallContext = "BOOTSTRAP" | "QUERY" | "CONTINUATION";

export type RecallCandidate = {
  memoryId: string;
  supportingStoryIds: string[];
  importanceSignals: ImportanceSignal[];
  recallReasons: string[];
  /**
   * How strongly recall wanted this memory, on the scale the multi-factor rule
   * scores with.
   *
   * The highest score any rule that fired reported, or 0 when the only rules
   * that fired do not score -- `Active Story Recall Rule` recalls on story
   * membership alone and has no opinion about degree, which sorts it last, and
   * that is the right place for the weakest reason there is.
   *
   * Exists because the prompt budget has to choose. It used to choose by array
   * position.
   */
  recallScore: number;
  /**
   * Whether the user wrote this memory themselves.
   *
   * Read from `memory.relatedNoteId`, which the event translator sets for
   * exactly the two events the user originates. Carried on the candidate
   * because the prompt budget has to reserve room for these and only sees
   * candidates, never memories.
   *
   * Deliberately not inferred from the `User Intent` importance signal, which
   * is the same fact arrived at through a rule that also inspects the memory's
   * title text. Two consumers of one fact should not disagree because one of
   * them went via a string.
   */
  userAuthored: boolean;
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
  context?: RecallContext;
};
