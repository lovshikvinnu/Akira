export type ReflectionLifecycleStatus =
  | "SessionFinalized"
  | "CollectFinalizedContexts"
  | "AnalyzeEvidence"
  | "GenerateReflection"
  | "ReflectionContextFinalized"
  | "ReflectionContextArchived";

export interface ReflectionEvidence {
  id: string;
  timestamp: number;
  description: string;
  source: "goals" | "knowledge" | "habits" | "relationships" | "user_correction";
  verified: boolean;
}

export interface ReflectionReport {
  id: string;
  timePeriod: {
    startedAt: number;
    endedAt: number;
  };
  progressSummary: string; // Summarized metrics of goals and milestones
  growthSummary: string; // Analyzed changes in user skills and competencies
  patternSummary: string; // Summarized routine and habit shifts
  achievements: string[]; // List of completed targets
  challenges: string[]; // Documented blockers and stagnated goals
  evidence: ReflectionEvidence[];
  confidence: number; // Mathematical metric representing the certainty of observations
  createdAt: number;
}

export interface ReflectionContext {
  /**
   * How many records this confidence is an average of.
   *
   * Zero means the engine has nothing to be confident about. The `confidence`
   * beside it is then a default rather than a measurement, and every aggregate
   * skips it -- see `ContextCertainty` in context-resolution/types.ts.
   */
  basis: number;
  origin: "ReflectionEngine";
  evidence: {
    evidenceLog: ReflectionEvidence[];
    historicalReflections: ReflectionReport[];
  };
  confidence: number; // Aggregated confidence rating

  // Primary outputs (retrospective understanding)
  activeReflection: ReflectionReport | null;
  archivedReflections: ReflectionReport[];
}
