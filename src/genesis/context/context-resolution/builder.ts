import { ResolvedContext } from "./types";
import { resolveUnifiedContext } from "./rules";
import { PresenceContext } from "../../../akira-os/presence/types";
import { CompanionState } from "../state/types";
import { GoalContext } from "../goals/types";
import { KnowledgeContext } from "../knowledge/types";
import { RelationshipContext } from "../relationships/types";
import { HabitContext } from "../habits/types";
import { ReflectionContext } from "../../insights/reflection/types";

/**
 * Assembles and resolves all intelligence subsystem contexts into a unified ResolvedContext.
 */
export function buildResolvedContext(
  presence: PresenceContext | null,
  state: CompanionState | null,
  goals: GoalContext | null,
  knowledge: KnowledgeContext | null,
  relationships: RelationshipContext | null,
  habits: HabitContext | null,
  reflection: ReflectionContext | null,
): ResolvedContext {
  return resolveUnifiedContext(
    presence,
    state,
    goals,
    knowledge,
    relationships,
    habits,
    reflection,
  );
}
