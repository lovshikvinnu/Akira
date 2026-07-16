import { PresenceContext } from "../../../akira-os/presence/types";
import { CompanionState } from "../state/types";
import { GoalContext } from "../goals/types";
import { KnowledgeContext } from "../knowledge/types";
import { RelationshipContext } from "../relationships/types";

export type HabitStatus =
  | "BehaviorObserved"
  | "RepeatedEvidence"
  | "PatternDetected"
  | "HabitEstablished"
  | "HabitEvolves"
  | "HabitWeakens"
  | "HabitArchived";

export interface HabitEvidence {
  id: string;
  timestamp: number;
  description: string;
  source:
    "presence" | "state" | "goal" | "knowledge" | "relationship" | "user_correction" | "reflection";
  verified: boolean;
  contextDependency?: {
    projectId?: string;
    domainId?: string;
    timeOfDay?: string;
  };
}

export interface ObservedHabit {
  id: string;
  name: string; // e.g., "Morning Workspace Focus", "Late Night Concept Review"
  status: HabitStatus;
  confidence: number; // 0.0 to 1.0 representing understanding certainty
  stability: number; // 0.0 to 1.0 reflecting consistency of execution
  evidence: HabitEvidence[];
  statusHistory: HabitStatus[];
  contextDependency?: {
    projectId?: string;
    domainId?: string;
    timeOfDay?: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface HabitContext {
  // Provenance Preservation metadata
  origin: "HabitIntelligenceEngine";
  evidence: {
    evidenceLog: HabitEvidence[];
    habitsSnapshot: ObservedHabit[];
  };
  confidence: number; // Aggregated confidence rating across active habits

  // Primary output properties
  observedHabits: ObservedHabit[];
  habitConfidence: { habitId: string; value: number }[];
  habitStability: { habitId: string; rating: number }[];
  supportingEvidence: { habitId: string; evidenceCount: number }[];
  habitEvolution: { habitId: string; lastUpdated: number; statusHistory: HabitStatus[] }[];
  contextDependence: {
    habitId: string;
    projectId?: string;
    domainId?: string;
    timeOfDay?: string;
  }[];
  emergingHabits: ObservedHabit[];
  weakeningHabits: ObservedHabit[];
}
