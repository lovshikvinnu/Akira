import { ResolvedContext } from "./types";
import * as CONSTANTS from "./constants";
import { PresenceContext } from "../presence/types";
import { CompanionState } from "../state/types";
import { GoalContext } from "../goals/types";
import { KnowledgeContext } from "../knowledge/types";
import { RelationshipContext } from "../relationships/types";
import { HabitContext } from "../habits/types";
import { ReflectionContext } from "../reflection/types";

/**
 * Reconciles, prioritizes, and validates all subsystem contexts into a unified ResolvedContext.
 * Conforms to conflict preservation, provenance metadata, and modularity invariants.
 */
export function resolveUnifiedContext(
  presence: PresenceContext | null,
  state: CompanionState | null,
  goals: GoalContext | null,
  knowledge: KnowledgeContext | null,
  relationships: RelationshipContext | null,
  habits: HabitContext | null,
  reflection: ReflectionContext | null,
): ResolvedContext {
  const conflictsExposed: string[] = [];
  const relevantContext: string[] = [];
  const supportingEvidence: string[] = [];

  let currentFocus: string | null = null;
  const currentPriorities: string[] = [];

  // Ingest Companion State
  if (state) {
    currentFocus = state.currentFocus;
    currentPriorities.push(`Active Focus: ${state.currentFocus}`);
    relevantContext.push(`Present focus state is "${state.currentFocus}".`);
    if (state.activeProject) {
      relevantContext.push(`Active Project: ${state.activeProject.name}`);
    }

    state.evidence.evidenceLog.forEach((ev) => {
      supportingEvidence.push(`[CompanionState] ${ev.description}`);
    });

    if (
      state.evidence.snapshot.relevantMemories &&
      state.evidence.snapshot.relevantMemories.length > 0
    ) {
      state.evidence.snapshot.relevantMemories.forEach((mem) => {
        relevantContext.push(`Recalled Memory: ${mem}`);
        supportingEvidence.push(`[GENESIS Recall] Recalled memory: ${mem}`);
      });
    }
  }

  // Ingest Goals Context
  let activeGoals = goals ? [...goals.activeGoals] : [];
  if (goals && goals.activeGoals.length > 0) {
    const topGoal = goals.activeGoals[0];
    currentPriorities.push(`Goal Priority: ${topGoal.title}`);

    // CONFLICT RESOLUTION: Check for contradictions between Goals and active State focus
    if (
      currentFocus &&
      currentFocus !== "Idle" &&
      currentFocus !== "Unknown" &&
      !topGoal.title.toLowerCase().includes(currentFocus.toLowerCase()) &&
      !currentFocus.toLowerCase().includes(topGoal.title.toLowerCase())
    ) {
      conflictsExposed.push(
        `Subsystem conflict: Conversational focus "${currentFocus}" differs from top Goal priority "${topGoal.title}".`,
      );
    }

    // Prioritize relevance: keep goals associated with current project
    if (state && state.activeProject?.id) {
      activeGoals = goals.activeGoals.filter(
        (g) =>
          g.supportedTaskIds.length === 0 ||
          g.supportedTaskIds.some((id) => id === state.activeProject?.id),
      );
    }

    goals.evidence.evidenceLog.forEach((ev) => {
      supportingEvidence.push(`[GoalEngine] ${ev.description}`);
    });
  }

  // Ingest Social Relationship Context
  let importantRelationships = relationships ? [...relationships.importantPeople] : [];
  if (relationships && state && state.activeProject?.id) {
    importantRelationships = relationships.importantPeople.filter((p) =>
      p.sharedProjectIds.includes(state.activeProject!.id),
    );

    relationships.evidence.evidenceLog.forEach((ev) => {
      supportingEvidence.push(`[RelationshipEngine] ${ev.description}`);
    });
  }

  // Ingest Habit Routines Context
  let relevantHabits = habits ? [...habits.observedHabits] : [];
  if (habits && state && state.activeProject?.id) {
    relevantHabits = habits.observedHabits.filter(
      (h) => h.contextDependency?.projectId === state.activeProject!.id,
    );

    habits.evidence.evidenceLog.forEach((ev) => {
      supportingEvidence.push(`[HabitIntelligence] ${ev.description}`);
    });
  }

  // Ingest Knowledge Domain Maps
  const knowledgeRelevance = knowledge
    ? [...knowledge.knownDomains, ...knowledge.skills, ...knowledge.concepts]
    : [];

  if (knowledge) {
    knowledge.evidence.evidenceLog.forEach((ev) => {
      supportingEvidence.push(`[KnowledgeEngine] ${ev.description}`);
    });
  }

  // Ingest Reflection Reports
  const reflectionRelevance =
    reflection && reflection.activeReflection ? [reflection.activeReflection] : [];

  // Ingest Presence
  if (presence) {
    relevantContext.push(`Presence state: returned under return state "${presence.returnState}".`);
  }

  // Compute composite confidence across inputs
  let confidenceCount = 0;
  let confidenceSum = 0;

  const contexts = [presence, state, goals, knowledge, relationships, habits, reflection];
  contexts.forEach((ctx) => {
    if (ctx) {
      const conf = "contextConfidence" in ctx ? ctx.contextConfidence : ctx.confidence;
      confidenceSum += conf;
      confidenceCount++;
    }
  });

  let overallConfidence =
    confidenceCount > 0 ? Number((confidenceSum / confidenceCount).toFixed(2)) : 1.0;

  // CONFLICT RESOLUTION: Lower overall certainty when contradictions exist
  if (conflictsExposed.length > 0) {
    overallConfidence = Math.max(0.1, Number((overallConfidence - 0.15).toFixed(2)));
  }

  return {
    origin: "ContextResolutionEngine",
    status: "ResolvedContextConstructed",
    overallConfidence,
    provenance: {
      presenceContext: presence,
      companionState: state,
      goalContext: goals,
      knowledgeContext: knowledge,
      relationshipContext: relationships,
      habitContext: habits,
      reflectionContext: reflection,
    },
    currentPriorities,
    relevantContext,
    supportingEvidence,
    activeGoals,
    currentFocus,
    importantRelationships,
    relevantHabits,
    knowledgeRelevance,
    reflectionRelevance,
    conflictsExposed,
  };
}
