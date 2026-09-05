import { ResolvedContext } from "./types";
import { resolveUnifiedContext } from "./rules";
import { PresenceContext } from "../../../akira-os/presence/types";
import { CompanionState } from "../state/types";
import { RelationshipContext } from "../relationships/types";
import { HabitContext } from "../habits/types";
import { ReflectionContext } from "../../insights/reflection/types";

/**
 * Assembles and resolves all intelligence subsystem contexts into a unified ResolvedContext.
 */
export function buildResolvedContext(
  presence: PresenceContext | null,
  state: CompanionState | null,
  relationships: RelationshipContext | null,
  habits: HabitContext | null,
  reflection: ReflectionContext | null,
): ResolvedContext {
  return resolveUnifiedContext(presence, state, relationships, habits, reflection);
}
