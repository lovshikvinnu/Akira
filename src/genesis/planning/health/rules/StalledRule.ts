// src/genesis/planning/health/rules/StalledRule.ts
import { HealthRule } from "../HealthRule";
import { HealthEvaluation } from "../HealthEvaluation";
import { PlanningGraph } from "../../types";
import { PlanHealthStatus } from "../../types";

/**
 * StalledRule – fourth priority.
 * Fires when the plan has unresolved blockers, indicating it cannot make
 * forward progress. This is a simple heuristic based on the existence of
 * any blocker that is not resolved.
 */
export class StalledRule implements HealthRule {
  readonly id = "stalled";
  readonly priority = 4;

  evaluate(graph: PlanningGraph): HealthEvaluation | undefined {
    const hasUnresolvedBlocker = graph.blockers.some((b) => !b.resolved);
    if (hasUnresolvedBlocker) {
      return {
        status: PlanHealthStatus.Stalled,
        reason: "Plan has unresolved blockers → Stalled",
        ruleName: this.id,
      };
    }
    return undefined;
  }
}
