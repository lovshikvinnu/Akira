import { PresenceContext } from "../presence/types";
import { CompanionState } from "../state/types";

export type GoalStatus =
  "Created" | "Clarified" | "Active" | "Progress" | "Paused" | "Resumed" | "Completed" | "Archived";

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  parentId: string | null;
  prerequisites: string[]; // goal IDs
  supportedTaskIds: string[]; // task IDs supporting this goal
  progressPercentage: number; // 0 to 100
  blockers: string[]; // blocker descriptions
  createdAt: number;
  updatedAt: number;
  confidence: number; // 0.0 to 1.0 representing clarity of goal definition
}

export interface GoalEvidence {
  id: string;
  source: "user_correction" | "workspace_event" | "companion_state" | "presence_context";
  timestamp: number;
  description: string;
  verified: boolean;
  goalId: string;
  targetProperty:
    | "status"
    | "progressPercentage"
    | "blockers"
    | "prerequisites"
    | "title"
    | "description"
    | "supportedTaskIds";
  value: string;
}

export interface GoalContext {
  // Provenance Preservation metadata
  origin: "GoalEngine";
  evidence: {
    evidenceLog: GoalEvidence[];
    goalsSnapshot: Goal[];
  };
  confidence: number; // Aggregated confidence rating across active goals

  // Primary output properties
  activeGoals: Goal[];
  currentPriorities: Goal[];
  goalHierarchy: { parentId: string | null; childIds: string[] }[];
  dependencies: { goalId: string; requiresGoalId: string }[];
  progress: { goalId: string; progressPercentage: number }[];
  blockers: { goalId: string; description: string }[];
  completionState: { goalId: string; completedAt: number }[];
}
