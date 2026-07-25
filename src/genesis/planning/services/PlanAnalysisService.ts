import { PlanDiagnostics, PlanAnalysisResult, Task, Dependency, PlanningGraph } from "../types";
import { PlanRepository } from "../repositories/PlanRepository";
import { MilestoneRepository } from "../repositories/MilestoneRepository";
import { TaskRepository } from "../repositories/TaskRepository";
import { DependencyRepository } from "../repositories/DependencyRepository";
import { BlockerRepository } from "../repositories/BlockerRepository";
import { InMemoryPlanRepository } from "../repositories/InMemoryPlanRepository";
import { InMemoryMilestoneRepository } from "../repositories/InMemoryMilestoneRepository";
import { InMemoryTaskRepository } from "../repositories/InMemoryTaskRepository";
import { InMemoryDependencyRepository } from "../repositories/InMemoryDependencyRepository";
import { InMemoryBlockerRepository } from "../repositories/InMemoryBlockerRepository";
import { blockerAnalysisService } from "./BlockerAnalysisService";
import { nextActionService } from "./NextActionService";
import { planningGraphBuilder } from "./PlanningGraphBuilder";
import { eventService } from "../../events/event-service";
import { Events, DomainEventName } from "../../../contracts/events";

export class PlanAnalysisService {
  private planRepo!: PlanRepository;
  private milestoneRepo!: MilestoneRepository;
  private taskRepo!: TaskRepository;
  private dependencyRepo!: DependencyRepository;
  private blockerRepo!: BlockerRepository;

  constructor(
    planRepo?: PlanRepository,
    milestoneRepo?: MilestoneRepository,
    taskRepo?: TaskRepository,
    dependencyRepo?: DependencyRepository,
    blockerRepo?: BlockerRepository,
  ) {
    this.planRepo = planRepo || new InMemoryPlanRepository();
    this.milestoneRepo = milestoneRepo || new InMemoryMilestoneRepository();
    this.taskRepo = taskRepo || new InMemoryTaskRepository();
    this.dependencyRepo = dependencyRepo || new InMemoryDependencyRepository();
    this.blockerRepo = blockerRepo || new InMemoryBlockerRepository();
  }

  public initialize(
    planRepo: PlanRepository,
    milestoneRepo: MilestoneRepository,
    taskRepo: TaskRepository,
    dependencyRepo: DependencyRepository,
    blockerRepo: BlockerRepository,
  ): void {
    this.planRepo = planRepo;
    this.milestoneRepo = milestoneRepo;
    this.taskRepo = taskRepo;
    this.dependencyRepo = dependencyRepo;
    this.blockerRepo = blockerRepo;
  }

  private resolveGraph(graphOrPlanId: string | PlanningGraph): PlanningGraph {
    if (typeof graphOrPlanId === "string") {
      return planningGraphBuilder.build(graphOrPlanId);
    }
    return graphOrPlanId;
  }

  public getPlanDiagnostics(graphOrPlanId: string | PlanningGraph): PlanDiagnostics {
    const graph = this.resolveGraph(graphOrPlanId);
    const planId = graph.plan.id;
    const milestones = graph.milestones;
    const milestoneIds = new Set(milestones.map((m) => m.id));

    // Get all tasks in the plan
    const planTasks = graph.tasks;
    const planTaskIds = new Set(planTasks.map((t) => t.id));

    // Pull system-wide tasks to detect orphan tasks
    const allTasksInSystem = this.taskRepo.listTasks();

    const issues: string[] = [];

    // 1. Detect orphan tasks in the plan or system (whose milestone ID does not exist in the plan)
    // Note: To preserve backward compatibility, we check for tasks not belonging to plan milestones
    const orphans = allTasksInSystem.filter((t) => !milestoneIds.has(t.milestoneId));
    const orphanTasksCount = orphans.length;
    for (const orphan of orphans) {
      issues.push(
        `Task "${orphan.title}" (ID: ${orphan.id}) is an orphan with no valid milestone inside Plan ${planId}.`,
      );
    }

    // 2. Detect incomplete milestones
    const incompleteMilestones = milestones.filter((m) => m.status !== "Completed");
    const incompleteMilestonesCount = incompleteMilestones.length;

    // 3. Detect Cycles
    const planDeps = graph.dependencies;

    let hasCycles = false;
    const visited = new Map<string, "visiting" | "visited">();

    const dfs = (taskId: string) => {
      if (visited.get(taskId) === "visiting") {
        hasCycles = true;
        return;
      }
      if (visited.get(taskId) === "visited") return;
      visited.set(taskId, "visiting");

      const preds = planDeps.filter((d) => d.successorTaskId === taskId);
      for (const d of preds) {
        dfs(d.predecessorTaskId);
        if (hasCycles) return;
      }

      visited.set(taskId, "visited");
    };

    for (const t of planTasks) {
      if (!visited.has(t.id)) {
        dfs(t.id);
      }
    }

    if (hasCycles) {
      issues.push(`Plan "${planId}" has circular/cyclic task dependencies.`);
    }

    // 4. Calculate unreachable tasks
    const reachable = new Set<string>();

    // Seed reachable set with completed tasks
    for (const t of planTasks) {
      if (t.status === "Completed") {
        reachable.add(t.id);
      }
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const t of planTasks) {
        if (reachable.has(t.id)) continue;

        const preds = planDeps.filter((d) => d.successorTaskId === t.id);

        const allPredsReachable = preds.every((d) => reachable.has(d.predecessorTaskId));
        if (allPredsReachable) {
          reachable.add(t.id);
          changed = true;
        }
      }
    }

    // Unreachable tasks are incomplete tasks not in the reachable set
    const unreachableTasks = planTasks.filter(
      (t) => t.status !== "Completed" && !reachable.has(t.id),
    );
    const unreachableTasksCount = unreachableTasks.length;
    for (const ut of unreachableTasks) {
      issues.push(
        `Task "${ut.title}" (ID: ${ut.id}) is unreachable due to cyclic dependencies or missing predecessor tasks.`,
      );
    }

    // Check missing dependencies
    const missingPreds = blockerAnalysisService.detectMissingPredecessors(graph);
    for (const mp of missingPreds) {
      issues.push(
        `Task dependency "${mp.id}" refers to a missing predecessor task "${mp.predecessorTaskId}".`,
      );
    }

    const diagnostics: PlanDiagnostics = {
      planId,
      orphanTasksCount,
      unreachableTasksCount,
      incompleteMilestonesCount,
      hasCycles,
      diagnosticsGeneratedAt: new Date().toISOString(),
      issues,
    };

    // Record Event: DiagnosticsGenerated
    eventService.record(
      Events.DIAGNOSTICS_GENERATED as DomainEventName,
      "Plan Diagnostics Generated",
      `Diagnostics generated for plan ${planId}`,
      null,
      null,
      { diagnostics },
    );

    return diagnostics;
  }

  public analyzePlan(graphOrPlanId: string | PlanningGraph): PlanAnalysisResult {
    const graph = this.resolveGraph(graphOrPlanId);
    const planId = graph.plan.id;

    const diagnostics = this.getPlanDiagnostics(graph);
    const nextAction = nextActionService.getNextAction(graph);
    const availableTasks = nextActionService.getAvailableTasks(graph);
    const blockedTasks = blockerAnalysisService.getBlockedTasks(graph);
    const waitingTasks = nextActionService.getWaitingTasks(graph);
    const completedTasks = nextActionService.getCompletedTasks(graph);
    const unresolvedBlockers = blockerAnalysisService.getUnresolvedBlockers(graph);

    const result: PlanAnalysisResult = {
      planId,
      diagnostics,
      nextAction,
      availableTasks,
      blockedTasks,
      waitingTasks,
      completedTasks,
      unresolvedBlockers,
      analyzedAt: new Date().toISOString(),
    };

    // Record Event: PlanAnalyzed
    eventService.record(
      Events.PLAN_ANALYZED as DomainEventName,
      "Plan Analyzed",
      `Plan ${planId} successfully analyzed.`,
      null,
      null,
      { analysis: result },
    );

    // Record Event: NextActionCalculated
    eventService.record(
      Events.NEXT_ACTION_CALCULATED as DomainEventName,
      "Next Action Calculated",
      nextAction
        ? `Next action for plan ${planId} is task "${nextAction.title}"`
        : `No executable next action found for plan ${planId}`,
      null,
      null,
      { planId, nextAction },
    );

    // Record Event: BlockersDetected
    if (blockedTasks.length > 0 || unresolvedBlockers.length > 0) {
      eventService.record(
        Events.BLOCKERS_DETECTED as DomainEventName,
        "Blockers Detected",
        `Plan ${planId} has ${blockedTasks.length} blocked tasks and ${unresolvedBlockers.length} active blockers`,
        null,
        null,
        { planId, blockedTasks, unresolvedBlockers },
      );
    }

    return result;
  }
}

export const planAnalysisService = new PlanAnalysisService();
