import { PresenceContext } from "../../../akira-os/presence/types";

export type SessionIntent =
  "Planning" | "Learning" | "Building" | "Reflection" | "Casual" | "Problem Solving" | "Unknown";

export type FocusArea =
  | "Planning"
  | "Learning"
  | "Building"
  | "Reflection"
  | "Casual"
  | "Problem Solving"
  | "Idle"
  | "Unknown";

/**
 * Ephemeral Awareness Snapshot compiled during session bootstrapping.
 */
export interface AwarenessSnapshot {
  sessionIdentifier: string;
  temporalReference: number;
  sessionIntent: SessionIntent;
  activeStories: string[];
  activeGoals: string[];
  relevantMemories: string[];
  identityObservations: string[];
  currentConstraints: string[];
  recentActivity: string[];
  initialProject?: { id: string; name: string } | null;
}

/**
 * Structured evidence logs for State Evolution.
 */
export interface StateEvidence {
  id: string;
  source:
    | "user_correction"
    | "workspace_event"
    | "dialogue_analysis"
    | "presence_baseline"
    | "awareness_snapshot";
  timestamp: number;
  description: string;
  verified: boolean;
  targetField:
    "activeProject" | "activeGoal" | "currentDiscussion" | "currentFocus" | "workingContext";
  value: string;
}

/**
 * Record of inferred values that were updated or corrected.
 */
export interface InferenceRecord {
  id: string;
  field: "activeProject" | "activeGoal" | "currentDiscussion" | "currentFocus";
  value: string;
  timestamp: number;
  status: "active" | "corrected" | "replaced";
  correctedByEvidenceId?: string;
}

/**
 * Ephemeral, session-scoped Companion State.
 */
export interface CompanionState {
  // Provenance Preservation metadata
  origin: "CompanionStateEngine";
  evidence: {
    snapshot: AwarenessSnapshot;
    presence: PresenceContext;
    evidenceLog: StateEvidence[];
    inferences: InferenceRecord[];
  };
  contextConfidence: number; // 0.0 to 1.0

  // Ephemeral working context parameters
  activeProject: { id: string; name: string } | null;
  activeGoal: string | null;
  currentDiscussion: string;
  currentFocus: FocusArea;
  workingContext: Record<string, unknown>;
  pendingQuestions: string[];
  activeTasks: { id: string; title: string; done: boolean }[];
}
