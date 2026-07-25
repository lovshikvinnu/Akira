import { PlanningGraph, Recommendation } from "../types";
import { nextActionService } from "./NextActionService";
import { blockerAnalysisService } from "./BlockerAnalysisService";
import { planAnalysisService } from "./PlanAnalysisService";

export interface RecommendationRule {
  name: string;
  evaluate(graph: PlanningGraph): Recommendation[];
}

export class RecommendationRuleEngine {
  private rules: Map<string, RecommendationRule> = new Map();

  constructor() {
    this.registerDefaultRules();
  }

  private registerDefaultRules(): void {
    // Rule 1: StartAvailableTask
    this.registerRule("StartAvailableTask", {
      name: "StartAvailableTask",
      evaluate: (graph: PlanningGraph): Recommendation[] => {
        const available = nextActionService.getAvailableTasks(graph);
        return available.map((task) => ({
          id: `rec-start-task-${task.id}`,
          type: "StartAvailableTask" as const,
          priority: "Medium" as const,
          title: `Start task: ${task.title}`,
          description: `This task is ready to start. All predecessor dependencies are complete.`,
          rationale: `Task "${task.title}" has zero incomplete predecessors and is ready for immediate action.`,
          relatedTaskId: task.id,
          createdAt: new Date().toISOString(),
        }));
      },
    });

    // Rule 2: ResolveBlocker
    this.registerRule("ResolveBlocker", {
      name: "ResolveBlocker",
      evaluate: (graph: PlanningGraph): Recommendation[] => {
        const blockers = blockerAnalysisService.getUnresolvedBlockers(graph);
        return blockers.map((blocker) => ({
          id: `rec-resolve-blocker-${blocker.id}`,
          type: "ResolveBlocker" as const,
          priority:
            blocker.severity === "Critical"
              ? "Critical"
              : blocker.severity === "High"
                ? "High"
                : blocker.severity === "Medium"
                  ? "Medium"
                  : "Low",
          title: `Resolve blocker: ${blocker.reason}`,
          description: `An unresolved blocker is preventing execution progress.`,
          rationale: `Active blocker "${blocker.reason}" is halting the plan. Critical to resolve to resume dependent tasks.`,
          createdAt: new Date().toISOString(),
        }));
      },
    });

    // Rule 3: ArchiveCompletedPlan
    this.registerRule("ArchiveCompletedPlan", {
      name: "ArchiveCompletedPlan",
      evaluate: (graph: PlanningGraph): Recommendation[] => {
        const plan = graph.plan;
        const progress = graph.progress;
        if (
          progress.percentage === 100 &&
          plan.status !== "Archived" &&
          plan.status !== "Completed"
        ) {
          return [
            {
              id: `rec-archive-plan-${plan.id}`,
              type: "ArchiveCompletedPlan" as const,
              priority: "Low" as const,
              title: `Archive Completed Plan: ${plan.title}`,
              description: `All milestones and tasks are 100% complete.`,
              rationale: `The plan "${plan.title}" has reached 100% completion. Consider archiving or setting status to Completed.`,
              createdAt: new Date().toISOString(),
            },
          ];
        }
        return [];
      },
    });

    // Rule 4: CompleteMilestone
    this.registerRule("CompleteMilestone", {
      name: "CompleteMilestone",
      evaluate: (graph: PlanningGraph): Recommendation[] => {
        const recs: Recommendation[] = [];
        for (const m of graph.milestones) {
          if (m.status !== "Completed") {
            const mTasks = graph.tasks.filter((t) => t.milestoneId === m.id);
            if (mTasks.length > 0 && mTasks.every((t) => t.status === "Completed")) {
              recs.push({
                id: `rec-complete-milestone-${m.id}`,
                type: "CompleteMilestone" as const,
                priority: "Medium" as const,
                title: `Complete milestone: ${m.title}`,
                description: `All tasks assigned to this milestone are finished.`,
                rationale: `Milestone "${m.title}" has 100% completed tasks, but its status is still "${m.status}".`,
                relatedMilestoneId: m.id,
                createdAt: new Date().toISOString(),
              });
            }
          }
        }
        return recs;
      },
    });

    // Rule 5: ResumePausedPlan
    this.registerRule("ResumePausedPlan", {
      name: "ResumePausedPlan",
      evaluate: (graph: PlanningGraph): Recommendation[] => {
        const plan = graph.plan;
        if (plan.status === "Paused") {
          const incompleteTasks = graph.tasks.filter((t) => t.status !== "Completed");
          if (incompleteTasks.length > 0) {
            return [
              {
                id: `rec-resume-plan-${plan.id}`,
                type: "ResumePausedPlan" as const,
                priority: "Medium" as const,
                title: `Resume Paused Plan: ${plan.title}`,
                description: `This plan is currently paused.`,
                rationale: `Plan "${plan.title}" has incomplete tasks. Resuming will allow work to continue.`,
                createdAt: new Date().toISOString(),
              },
            ];
          }
        }
        return [];
      },
    });

    // Rule 6: ReviewDependency
    this.registerRule("ReviewDependency", {
      name: "ReviewDependency",
      evaluate: (graph: PlanningGraph): Recommendation[] => {
        const recs: Recommendation[] = [];
        const planId = graph.plan.id;
        const missing = blockerAnalysisService.detectMissingPredecessors(graph);
        const hasCycles = planAnalysisService.getPlanDiagnostics(graph).hasCycles;

        if (missing.length > 0 || hasCycles) {
          recs.push({
            id: `rec-review-deps-${planId}`,
            type: "ReviewDependency" as const,
            priority: "High" as const,
            title: "Review dependency issues",
            description: "Plan contains cycle dependency paths or missing predecessor tasks.",
            rationale: `Dependency graph is inconsistent: cycles detected or predecessors missing. Review dependency links.`,
            createdAt: new Date().toISOString(),
          });
        }
        return recs;
      },
    });
  }

  public registerRule(name: string, rule: RecommendationRule): void {
    this.rules.set(name, rule);
  }

  public evaluatePlanningGraph(graph: PlanningGraph): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const seenIds = new Set<string>();

    for (const rule of this.rules.values()) {
      const results = rule.evaluate(graph);
      for (const rec of results) {
        if (!seenIds.has(rec.id)) {
          recommendations.push(rec);
          seenIds.add(rec.id);
        }
      }
    }

    // Sort by priority weight
    const priorityOrder = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    recommendations.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);

    return recommendations;
  }

  public listRecommendationRules(): string[] {
    return Array.from(this.rules.keys());
  }

  public clearRules(): void {
    this.rules.clear();
    this.registerDefaultRules();
  }
}

export const recommendationRuleEngine = new RecommendationRuleEngine();
