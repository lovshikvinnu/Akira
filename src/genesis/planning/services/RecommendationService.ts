import { Recommendation, PlanningGraph } from "../types";
import { planningGraphBuilder } from "./PlanningGraphBuilder";
import { recommendationRuleEngine } from "./RecommendationRuleEngine";
import { eventService } from "../../events/event-service";
import { Events, DomainEventName } from "../../../contracts/events";

export class RecommendationService {
  /**
   * Retrieves a list of recommendations for a plan based on its current graph state.
   */
  public getRecommendations(planId: string): Recommendation[] {
    const graph = planningGraphBuilder.build(planId);
    return this.evaluatePlanningGraph(graph);
  }

  /**
   * Evaluates the planning graph snapshot to generate recommendations.
   */
  public evaluatePlanningGraph(graph: PlanningGraph): Recommendation[] {
    const planId = graph.plan.id;
    const recommendations = recommendationRuleEngine.evaluatePlanningGraph(graph);

    // Record Event: RecommendationCreated for each generated recommendation
    for (const rec of recommendations) {
      eventService.record(
        Events.RECOMMENDATION_CREATED as DomainEventName,
        "Recommendation Created",
        `Recommendation of type "${rec.type}" created for plan ${planId}`,
        null,
        null,
        { recommendation: rec },
      );
    }

    // Record Event: RecommendationsGenerated
    eventService.record(
      Events.RECOMMENDATIONS_GENERATED as DomainEventName,
      "Recommendations Generated",
      `Generated ${recommendations.length} recommendations for plan ${planId}`,
      null,
      null,
      { planId, recommendations },
    );

    return recommendations;
  }
}

export const recommendationService = new RecommendationService();
