// src/genesis/planning/health/rules/HealthyRule.ts
import { HealthRule } from "../HealthRule";
import { HealthEvaluation } from "../HealthEvaluation";
import { PlanningGraph } from "../../types";
import { PlanHealthStatus } from "../../types";

/**
 * HealthyRule – lowest priority (terminal rule).
 * Always matches. It exists so that the rule chain is total: once every
 * higher‑priority rule has declined, an Active plan with no unresolved
 * blockers and no derived completion is reported as Healthy.
 *
 * Because this rule always matches, the fallback branch in
 * {@link HealthRuleEngine} is unreachable under the default rule set.
 */
export class HealthyRule implements HealthRule {
  readonly id = "healthy";
  readonly priority = 5; // lowest priority – terminal

  evaluate(_graph: PlanningGraph): HealthEvaluation | undefined {
    return {
      status: PlanHealthStatus.Healthy,
      reason: "No adverse health condition detected → Healthy",
      ruleId: this.id,
    };
  }
}
