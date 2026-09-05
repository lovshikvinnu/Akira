import { ContextCertainty, ResolvedContext } from "./types";
import * as CONSTANTS from "./constants";
import { PresenceContext } from "../../../akira-os/presence/types";
import { CompanionState } from "../state/types";
import { GoalContext } from "../goals/types";
import { KnowledgeContext } from "../knowledge/types";
import { RelationshipContext } from "../relationships/types";
import { HabitContext } from "../habits/types";
import { ReflectionContext } from "../../insights/reflection/types";

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

    // No conflict is derived from focus vs goal title, deliberately.
    //
    // There was a check here that declared a "Subsystem conflict" when the
    // top goal's title did not contain `currentFocus` as a substring, or vice
    // versa. Those two operands are not comparable: `currentFocus` is a
    // `FocusArea`, a closed vocabulary of "Planning" | "Learning" | "Building"
    // | "Reflection" | "Casual" | "Problem Solving", while a goal title is
    // whatever the user typed. A vocabulary token is not a substring of free
    // prose except by coincidence, so the predicate was true almost by
    // construction.
    //
    // Measured over the six real focus areas against six ordinary goal titles,
    // driving `resolveUnifiedContext` itself: a conflict was declared in 36 of
    // 36 pairs -- including every semantically aligned one.
    //
    //   Learning   vs "Learn Spanish"        -> conflict
    //   Building   vs "Build a home lab"     -> conflict
    //   Planning   vs "Plan the Q3 roadmap"  -> conflict
    //   Reflection vs "Reflect on the year"  -> conflict
    //
    // A predicate with the same answer for every input carries no information,
    // and this one was not inert. `conflictsExposed` costs
    // `certainty.situational.score` 0.15 below, when there is a score to deduct
    // from, prints an "Exposed Conflicts" block into the prompt, and is a
    // branch `initiative/rules.ts` tests. Which harm followed depended on the
    // baseline, and both were reachable:
    //
    //   baseline >= 0.90   lands in [0.75, 0.85] after the deduction, reaches
    //                      the conflict branch, answers `decisionOutcome:
    //                      "Question"` -- AKIRA interrupts to clarify a
    //                      contradiction it invented
    //   baseline <  0.90   falls under MIN_CONFIDENCE_FOR_PROACTIVE_INITIATIVE
    //                      (0.75) and every proactive branch is skipped --
    //                      AKIRA goes quiet instead
    //
    // So it either nagged the user or muted the assistant, decided by numbers
    // with nothing to do with goals or focus, and most reliably when the user
    // was doing exactly what their goal said.
    //
    // Only the producer is removed. `conflictsExposed`, the penalty, the prompt
    // block and the initiative branch all stay, so a detector that can actually
    // compare two claims has somewhere to publish to. Writing one means deciding
    // what makes two statements contradictory, which is a cognitive-model
    // question and not this function's to answer.
    //
    // The same comparison survives at `initiative/rules.ts:98`, as its mirror
    // image: there a goal title *containing* the focus offers a "your focus
    // aligns with this goal" suggestion. Being the same category error it fails
    // the other way -- it matches almost never, so that suggestion is dead
    // rather than harmful. Left in place: removing it would delete a feature
    // instead of a false alarm, and repairing it needs the same focus-to-goal
    // semantics that would be invented rather than derived.

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
    // Narrow to the people connected to this project, but only if any are.
    //
    // This filtered unconditionally, and `sharedProjectIds` has no producer:
    // it is initialised to `[]` in `relationships/rules.ts` and written only by
    // `correctRelationship`, a user-correction API with no production caller.
    // So the moment an active project existed -- which happens automatically
    // from `lastProjectId` as soon as the user touches a project -- every
    // relationship disappeared from the resolved context, and with it from the
    // prompt. Not a narrowing: a blackout wearing a narrowing's clothes.
    //
    // The intent is sound and is kept for the day the field is populated. What
    // changes is the reading of an empty result. Nobody being linked to this
    // project is evidence that the link data does not exist, not evidence that
    // nobody matters -- so the fallback is everyone, which is what the user
    // would see with no project open.
    //
    // Deliberately no automatic association. Deciding that a person mentioned
    // while a project is active belongs to that project is exactly the
    // proximity inference the project/aspiration rule was removed for, and it
    // would manufacture the very links this filter is then trusted to read.
    const activeProjectId = state.activeProject.id;
    const linkedToProject = relationships.importantPeople.filter((p) =>
      p.sharedProjectIds.includes(activeProjectId),
    );
    importantRelationships =
      linkedToProject.length > 0 ? linkedToProject : [...relationships.importantPeople];

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

  const contexts = [presence, state, goals, knowledge, relationships, habits, reflection];
  // Situational certainty: presence and companion state, and nothing else.
  //
  // This used to average every engine that had content into one score. They
  // measure different propositions -- presence certainty, goal definitional
  // clarity, knowledge lifecycle stage, habit stability -- and the mean of
  // those answers no question anyone asks. It existed because
  // `initiative/rules.ts` wanted a number, and it was handed one that had
  // nothing to do with whether interrupting was appropriate: a vaguely worded
  // goal made AKIRA less willing to speak.
  //
  // These two describe the moment the user is in, which is the proposition
  // initiative is actually evaluating. Neither carries a `basis` field, because
  // neither is an average over a collection that might be empty -- they either
  // resolved for this session or they did not, so presence is the basis.
  //
  // The other engines are not replaced by a sibling field. Nothing consumed a
  // cross-domain number for a real decision, and the prompt prints each
  // domain's own confidence next to the thing it describes, so there was
  // nothing to preserve.
  const situationalSources = [
    presence ? presence.confidence : null,
    state ? state.contextConfidence : null,
  ].filter((value): value is number => typeof value === "number");

  let situationalScore =
    situationalSources.length > 0
      ? Number(
          (situationalSources.reduce((a, b) => a + b, 0) / situationalSources.length).toFixed(2),
        )
      : null;

  // CONFLICT RESOLUTION: Lower certainty when contradictions exist. Nothing can
  // be deducted from a certainty that was never established.
  if (conflictsExposed.length > 0 && situationalScore !== null) {
    situationalScore = Math.max(0.1, Number((situationalScore - 0.15).toFixed(2)));
  }

  const certainty: ContextCertainty = {
    situational: { basis: situationalSources.length, score: situationalScore },
  };

  return {
    origin: "ContextResolutionEngine",
    status: "ResolvedContextConstructed",
    certainty,
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
