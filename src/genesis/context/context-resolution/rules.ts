import { ContextCertainty, ResolvedContext } from "./types";
import * as CONSTANTS from "./constants";
import { PresenceContext } from "../../../akira-os/presence/types";
import { CompanionState } from "../state/types";
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

  // Ingest Reflection Reports
  const reflectionRelevance =
    reflection && reflection.activeReflection ? [reflection.activeReflection] : [];

  // Ingest Presence
  if (presence) {
    relevantContext.push(`Presence state: returned under return state "${presence.returnState}".`);
  }

  // Compute composite confidence across inputs

  const contexts = [presence, state, relationships, habits, reflection];
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
      relationshipContext: relationships,
      habitContext: habits,
      reflectionContext: reflection,
    },
    currentPriorities,
    relevantContext,
    supportingEvidence,
    currentFocus,
    importantRelationships,
    relevantHabits,
    reflectionRelevance,
    conflictsExposed,
  };
}
