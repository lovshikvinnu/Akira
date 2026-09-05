import { PresenceContext } from "../../../akira-os/presence/types";
import { CompanionState } from "../state/types";
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
export interface DomainCertainty {
  /** Contributing engines that actually had something to be certain about. */
  basis: number;
  /** Mean over those engines. `null` when `basis` is 0. */
  score: number | null;
}

export interface ContextCertainty {
  /**
   * How well AKIRA understands the user's situation right now.
   *
   * Presence and companion state, and deliberately nothing else. This exists
   * to answer one question -- is there enough understanding of the moment to
   * justify interrupting -- and those are the two engines that describe the
   * moment.
   *
   * The previous version averaged every context engine into a single score:
   * presence certainty, companion-state certainty, goal *definitional
   * clarity*, knowledge *lifecycle stage*, habit stability, reflection
   * observation certainty. Those are answers to different questions, and the
   * mean of them answers none. How clearly a goal is worded is not evidence
   * about whether now is a good time to speak.
   *
   * There is no cross-domain replacement because no consumer needed one. The
   * prompt does not get an aggregate at all: it already prints each domain's
   * own confidence beside the thing it describes -- `• Goal: ... Confidence:`,
   * `• Contact: ... Confidence:`, `Presence ... Confidence:` -- which is the
   * certainty a reader can actually use. A universal number was kept only
   * because the code expected one.
   */
  situational: DomainCertainty;
}

export interface ResolvedContext {
  origin: "ContextResolutionEngine";
  status: ResolutionStatus;
  /**
   * The certainty a consumer needs for the decision it is making.
   *
   * See {@link ContextCertainty}. This replaced a scalar `overallConfidence`
   * that could not distinguish "every engine is sure" from "no engine had
   * anything to say", and then a single aggregate that could not distinguish
   * one proposition from another.
   */
  certainty: ContextCertainty;

  // Provenance Preservation metadata
  provenance: {
    presenceContext?: PresenceContext | null;
    companionState?: CompanionState | null;
    relationshipContext?: RelationshipContext | null;
    habitContext?: HabitContext | null;
    reflectionContext?: ReflectionContext | null;
  };

  // Primary outputs (Section 5)
  currentPriorities: string[]; // Ranks focus areas/project/goals
  relevantContext: string[]; // Key context details chosen for relevance resolution
  supportingEvidence: string[]; // Citations back to events
  currentFocus: string | null; // Resolved active focus area (e.g. debugging, planning)
  importantRelationships: PersonRelationship[]; // Social details relevant to active project
  relevantHabits: ObservedHabit[]; // Routines that align/challenge current goals
  reflectionRelevance: ReflectionReport[]; // Recent growth evaluations
  conflictsExposed: string[]; // Contradictions logged for downstream display/resolution
}
