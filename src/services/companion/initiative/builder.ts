import { InitiativeDecision } from "./types";
import { evaluateInitiative } from "./rules";
import { ResolvedContext } from "../context-resolution/types";

/**
 * Builds the InitiativeDecision by running rules over the resolved context.
 */
export function buildInitiativeDecision(resolved: ResolvedContext | null): InitiativeDecision {
  return evaluateInitiative(resolved);
}
