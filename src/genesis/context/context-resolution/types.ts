import { PresenceContext } from "../../../akira-os/presence/types";
import { CompanionState } from "../state/types";
import { GoalContext, Goal } from "../goals/types";
import { KnowledgeContext, KnowledgeNode } from "../knowledge/types";
import { RelationshipContext, PersonRelationship } from "../relationships/types";
import { HabitContext, ObservedHabit } from "../habits/types";
import { ReflectionContext, ReflectionReport } from "../../insights/reflection/types";

export type ResolutionStatus =
  | "ContextsReceived"
  | "ContextsValidated"
  | "ConflictsResolved"
  | "RelevancePrioritized"
  | "ResolvedContextConstructed"
  | "ResolvedContextExposed";

/**
 * A confidence and the evidence that it is one.
 *
 * `score` is a mean over contributing engines; `basis` is how many of them
 * there were. `basis === 0` means nothing contributed, and `score` is then
 * `null` rather than a number -- there is no value that honestly represents
 * "no opinion" on a 0..1 scale, because both ends are claims.
 *
 * Consumers are meant to branch on `score === null` explicitly. That is the
 * point of the type: the old scalar let a caller read a default for absence as
 * a measurement without ever deciding to.
 */
export interface ContextCertainty {
  /** Contributing engines that actually had something to be certain about. */
  basis: number;
  /** Mean over those engines. `null` when `basis` is 0. */
  score: number | null;
}

export interface ResolvedContext {
  origin: "ContextResolutionEngine";
  status: ResolutionStatus;
  /**
   * How certain the resolved context is, and whether that is a measurement.
   *
   * This replaced `overallConfidence: number`, which could not distinguish
   * "every engine is sure" from "no engine had anything to say". The old value
   * was the mean of whichever sub-contexts existed and fell back to `1.0` when
   * there were none -- so an install with no data reported maximum certainty,
   * and two permanently-empty engines (`context/knowledge` and
   * `context/relationships`, neither of which has a producer) were enough to
   * make that mean look computed.
   *
   * A number alone cannot carry the difference, because the difference is not a
   * quantity. `basis` says how many engines contributed something real; `score`
   * is the mean over those and is `null` when there were none.
   *
   * One further caveat this does NOT fix, recorded so it is not mistaken for
   * settled: the engines that do contribute are measuring different things --
   * a goal's definitional clarity, a knowledge node's lifecycle stage, how sure
   * the presence engine is that the user just returned. Averaging them is still
   * a questionable operation. What has changed is that it is now an average of
   * things that exist.
   */
  certainty: ContextCertainty;

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
