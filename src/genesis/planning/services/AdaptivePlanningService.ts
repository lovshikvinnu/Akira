import { PlanningGraph, Recommendation } from "../types";
import { planningGraphBuilder } from "./PlanningGraphBuilder";
import { recommendationService } from "./RecommendationService";

import { eventService } from "../../events/event-service";
import { Events, DomainEventName } from "../../../contracts/events";
import { createHealthRuleEngine } from "../health/createHealthRuleEngine";
import { HealthEvaluation } from "../health/HealthEvaluation";

export class AdaptivePlanningService {
  /**
   * Evaluates a plan's health status and provides recommendations.
   * This is advisory and never mutates repository state.
   */
  private readonly healthEngine = createHealthRuleEngine();

  public evaluatePlan(planId: string): { status: string; recommendations: Recommendation[] } {
    const graph = planningGraphBuilder.build(planId);

    // Run health evaluation through the rule engine
    const evaluation: HealthEvaluation = this.healthEngine.evaluate(graph);
    const status = evaluation.status;

    const recommendations = recommendationService.evaluatePlanningGraph(graph);

    // Record Event: RecommendationEvaluated
    eventService.record(
      Events.RECOMMENDATION_EVALUATED as DomainEventName,
      "Plan Recommendation Evaluated",
      `Plan ${planId} evaluated with health status "${status}"`,
      null,
      null,
      { planId, status, recommendations },
    );

    // Record Event: AdaptiveEvaluationCompleted
    eventService.record(
      Events.ADAPTIVE_EVALUATION_COMPLETED as DomainEventName,
      "Adaptive Evaluation Completed",
      `Adaptive planning evaluation finished for plan ${planId}`,
      null,
      null,
      { planId, status, progressPercentage: graph.progress.percentage },
    );

    return {
      status,
      recommendations,
    };
  }
}

export const adaptivePlanningService = new AdaptivePlanningService();
