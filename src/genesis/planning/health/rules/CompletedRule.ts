// src/genesis/planning/health/rules/CompletedRule.ts
import { HealthRule } from "../HealthRule";
import { HealthEvaluation } from "../HealthEvaluation";
import { PlanningGraph } from "../../types";
import { PlanHealthStatus } from "../../types";

/**
 * CompletedRule – second priority.
 * Fires when the plan's lifecycle status is explicitly "Completed".
 * This overrides derived completion logic.
 */
export class CompletedRule implements HealthRule {
  readonly id = "completed";
  readonly priority = 2;

  evaluate(graph: PlanningGraph): HealthEvaluation | undefined {
    if (graph.plan.status === "Completed") {
      return {
        status: PlanHealthStatus.Completed,
        reason: `Plan status is "Completed"`,
        ruleName: this.id,
      };
    }
    return undefined;
  }
}
