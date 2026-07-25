import { Task, PlanningGraph } from "../types";
import { PlanRepository } from "../repositories/PlanRepository";
import { MilestoneRepository } from "../repositories/MilestoneRepository";
import { TaskRepository } from "../repositories/TaskRepository";
import { DependencyRepository } from "../repositories/DependencyRepository";
import { InMemoryPlanRepository } from "../repositories/InMemoryPlanRepository";
import { InMemoryMilestoneRepository } from "../repositories/InMemoryMilestoneRepository";
import { InMemoryTaskRepository } from "../repositories/InMemoryTaskRepository";
import { InMemoryDependencyRepository } from "../repositories/InMemoryDependencyRepository";
import { blockerAnalysisService } from "./BlockerAnalysisService";
import { planningGraphBuilder } from "./PlanningGraphBuilder";

export class NextActionService {
  private planRepo!: PlanRepository;
  private milestoneRepo!: MilestoneRepository;
  private taskRepo!: TaskRepository;
  private dependencyRepo!: DependencyRepository;

  constructor(
    planRepo?: PlanRepository,
    milestoneRepo?: MilestoneRepository,
    taskRepo?: TaskRepository,
    dependencyRepo?: DependencyRepository,
  ) {
    this.planRepo = planRepo || new InMemoryPlanRepository();
    this.milestoneRepo = milestoneRepo || new InMemoryMilestoneRepository();
    this.taskRepo = taskRepo || new InMemoryTaskRepository();
    this.dependencyRepo = dependencyRepo || new InMemoryDependencyRepository();
  }

  public initialize(
    planRepo: PlanRepository,
    milestoneRepo: MilestoneRepository,
    taskRepo: TaskRepository,
    dependencyRepo: DependencyRepository,
  ): void {
    this.planRepo = planRepo;
    this.milestoneRepo = milestoneRepo;
    this.taskRepo = taskRepo;
    this.dependencyRepo = dependencyRepo;
  }

  private resolveGraph(graphOrPlanId: string | PlanningGraph): PlanningGraph {
    if (typeof graphOrPlanId === "string") {
      return planningGraphBuilder.build(graphOrPlanId);
    }
    return graphOrPlanId;
  }

  /**
   * Returns a sorted list of all tasks in the plan graph.
   * Sorted first by milestone order, then by task index.
   */
  private getSortedPlanTasks(graph: PlanningGraph): Task[] {
    const milestones = [...graph.milestones];
    milestones.sort((a, b) => a.order - b.order);

    const sortedTasks: Task[] = [];
    for (const m of milestones) {
      const mTasks = graph.tasks.filter((t) => t.milestoneId === m.id);
      sortedTasks.push(...mTasks);
    }
    return sortedTasks;
  }

  public getCompletedTasks(graphOrPlanId: string | PlanningGraph): Task[] {
    const graph = this.resolveGraph(graphOrPlanId);
    const tasks = this.getSortedPlanTasks(graph);
    return tasks.filter((t) => t.status === "Completed");
  }

  public getAvailableTasks(graphOrPlanId: string | PlanningGraph): Task[] {
    const graph = this.resolveGraph(graphOrPlanId);
    const tasks = this.getSortedPlanTasks(graph);
    const completedTasks = this.getCompletedTasks(graph);
    const completedTaskIds = new Set(completedTasks.map((t) => t.id));

    const blockedTasks = blockerAnalysisService.getBlockedTasks(graph);
    const blockedTaskIds = new Set(blockedTasks.map((t) => t.id));

    const allDeps = graph.dependencies;

    return tasks.filter((t) => {
      // Must not be completed or blocked
      if (t.status === "Completed" || blockedTaskIds.has(t.id)) {
        return false;
      }

      // All predecessors must be completed
      const taskPreds = allDeps.filter((d) => d.successorTaskId === t.id);
      for (const d of taskPreds) {
        if (!completedTaskIds.has(d.predecessorTaskId)) {
          return false;
        }
      }

      return true;
    });
  }

  public getWaitingTasks(graphOrPlanId: string | PlanningGraph): Task[] {
    const graph = this.resolveGraph(graphOrPlanId);
    const tasks = this.getSortedPlanTasks(graph);
    const completedTasks = this.getCompletedTasks(graph);
    const completedTaskIds = new Set(completedTasks.map((t) => t.id));

    const blockedTasks = blockerAnalysisService.getBlockedTasks(graph);
    const blockedTaskIds = new Set(blockedTasks.map((t) => t.id));

    const allDeps = graph.dependencies;

    return tasks.filter((t) => {
      if (t.status === "Completed" || blockedTaskIds.has(t.id)) {
        return false;
      }

      // Must have at least one uncompleted predecessor
      const taskPreds = allDeps.filter((d) => d.successorTaskId === t.id);
      let isWaiting = false;
      for (const d of taskPreds) {
        if (!completedTaskIds.has(d.predecessorTaskId)) {
          isWaiting = true;
          break;
        }
      }

      return isWaiting;
    });
  }

  public getNextAction(graphOrPlanId: string | PlanningGraph): Task | null {
    const graph = this.resolveGraph(graphOrPlanId);
    const available = this.getAvailableTasks(graph);
    return available.length > 0 ? available[0] : null;
  }
}

export const nextActionService = new NextActionService();
