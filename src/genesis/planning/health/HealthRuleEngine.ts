// src/genesis/planning/health/HealthRuleEngine.ts
import { PlanningGraph, PlanHealthStatus } from "../types";
import { HealthRule } from "./HealthRule";
import { HealthEvaluation } from "./HealthEvaluation";
import { InactiveRule } from "./rules/InactiveRule";
import { CompletedRule } from "./rules/CompletedRule";
import { DerivedCompletionRule } from "./rules/DerivedCompletionRule";
import { StalledRule } from "./rules/StalledRule";
import { HealthyRule } from "./rules/HealthyRule";

/**
 * Engine that evaluates a {@link PlanningGraph} against a set of deterministic health rules.
 * Rules are evaluated according to their `priority` (lower number = higher priority).
 * The first matching rule returns its {@link HealthEvaluation}. If none match, a fallback
 * healthy evaluation is returned.
 */
export class HealthRuleEngine {
  private readonly rules: HealthRule[];

  constructor(rules?: HealthRule[]) {
    // Default rule set if none provided
    this.rules = rules ?? [
      new InactiveRule(),
      new CompletedRule(),
      new DerivedCompletionRule(),
      new StalledRule(),
      new HealthyRule(),
    ];
    // Ensure deterministic order by priority
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /** Evaluate the supplied planning graph.
   * Returns the evaluation from the first rule that matches.
   */
  public evaluate(graph: PlanningGraph): HealthEvaluation {
    for (const rule of this.rules) {
      const result = rule.evaluate(graph);
      if (result) {
        return result;
      }
    }
    // Fallback – should never happen because HealthyRule always matches
    return {
      status: PlanHealthStatus.Healthy,
      ruleId: "fallback",
      reason: "No rule matched – defaulting to Healthy",
    };
  }
}
