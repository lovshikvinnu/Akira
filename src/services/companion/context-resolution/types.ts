import { PresenceContext } from "../presence/types";
import { CompanionState } from "../state/types";
import { GoalContext, Goal } from "../goals/types";
import { KnowledgeContext, KnowledgeNode } from "../knowledge/types";
import { RelationshipContext, PersonRelationship } from "../relationships/types";
import { HabitContext, ObservedHabit } from "../habits/types";
import { ReflectionContext, ReflectionReport } from "../reflection/types";

export type ResolutionStatus =
  | "ContextsReceived"
  | "ContextsValidated"
  | "ConflictsResolved"
  | "RelevancePrioritized"
  | "ResolvedContextConstructed"
  | "ResolvedContextExposed";

export interface ResolvedContext {
  origin: "ContextResolutionEngine";
  status: ResolutionStatus;
  overallConfidence: number; // Aggregated context certainty score

  // Provenance Preservation metadata
  provenance: {
    presenceContext?: PresenceContext | null;
    companionState?: CompanionState | null;
    goalContext?: GoalContext | null;
    knowledgeContext?: KnowledgeContext | null;
    relationshipContext?: RelationshipContext | null;
    habitContext?: HabitContext | null;
    reflectionContext?: ReflectionContext | null;
  };

  // Primary outputs (Section 5)
  currentPriorities: string[]; // Ranks focus areas/project/goals
  relevantContext: string[]; // Key context details chosen for relevance resolution
  supportingEvidence: string[]; // Citations back to events
  activeGoals: Goal[]; // Prioritized goals relevant to current task
  currentFocus: string | null; // Resolved active focus area (e.g. debugging, planning)
  importantRelationships: PersonRelationship[]; // Social details relevant to active project
  relevantHabits: ObservedHabit[]; // Routines that align/challenge current goals
  knowledgeRelevance: KnowledgeNode[]; // Competency details related to active topic
  reflectionRelevance: ReflectionReport[]; // Recent growth evaluations
  conflictsExposed: string[]; // Contradictions logged for downstream display/resolution
}
