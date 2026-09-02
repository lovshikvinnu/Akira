// src/genesis/planning/health/rules/DerivedCompletionRule.ts
import { HealthRule } from "../HealthRule";
import { HealthEvaluation } from "../HealthEvaluation";
import { PlanningGraph } from "../../types";
import { PlanHealthStatus } from "../../types";

/**
 * DerivedCompletionRule – third priority.
 * Fires when the plan's progress indicates 100% completion even if the
 * explicit plan status is not "Completed". This derives completion from
 * the graph's progress metric.
 */
export class DerivedCompletionRule implements HealthRule {
  readonly id = "derived-completion";
  readonly priority = 3;

  evaluate(graph: PlanningGraph): HealthEvaluation | undefined {
    // Guard against missing progress information
    if (!graph.progress) {
      return undefined;
    }

    // ProgressService reports an empty plan as 100% (division-by-zero convention for
    // progress display). Completion cannot be *derived* when there is no work to
    // complete, so require at least one milestone or task before inferring it.
    const hasWork = graph.progress.totalTasks > 0 || graph.progress.totalMilestones > 0;

    if (hasWork && graph.progress.percentage === 100) {
      return {
        status: PlanHealthStatus.Completed,
        reason: "Plan progress is 100% → Derived Completed",
        ruleId: this.id,
      };
    }
    return undefined;
  }
}
