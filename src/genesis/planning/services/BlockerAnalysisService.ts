import { Task, Blocker, Dependency, Milestone, PlanningGraph } from "../types";
import { PlanRepository } from "../repositories/PlanRepository";
import { BlockerRepository } from "../repositories/BlockerRepository";
import { MilestoneRepository } from "../repositories/MilestoneRepository";
import { TaskRepository } from "../repositories/TaskRepository";
import { DependencyRepository } from "../repositories/DependencyRepository";
import { InMemoryPlanRepository } from "../repositories/InMemoryPlanRepository";
import { InMemoryBlockerRepository } from "../repositories/InMemoryBlockerRepository";
import { InMemoryMilestoneRepository } from "../repositories/InMemoryMilestoneRepository";
import { InMemoryTaskRepository } from "../repositories/InMemoryTaskRepository";
import { InMemoryDependencyRepository } from "../repositories/InMemoryDependencyRepository";
import { planningGraphBuilder } from "./PlanningGraphBuilder";

export class BlockerAnalysisService {
  private planRepo!: PlanRepository;
  private blockerRepo!: BlockerRepository;
  private milestoneRepo!: MilestoneRepository;
  private taskRepo!: TaskRepository;
  private dependencyRepo!: DependencyRepository;

  constructor(
    planRepo?: PlanRepository,
    blockerRepo?: BlockerRepository,
    milestoneRepo?: MilestoneRepository,
    taskRepo?: TaskRepository,
    dependencyRepo?: DependencyRepository,
  ) {
    this.planRepo = planRepo || new InMemoryPlanRepository();
    this.blockerRepo = blockerRepo || new InMemoryBlockerRepository();
    this.milestoneRepo = milestoneRepo || new InMemoryMilestoneRepository();
    this.taskRepo = taskRepo || new InMemoryTaskRepository();
    this.dependencyRepo = dependencyRepo || new InMemoryDependencyRepository();
  }

  public initialize(
    planRepo: PlanRepository,
    blockerRepo: BlockerRepository,
    milestoneRepo: MilestoneRepository,
    taskRepo: TaskRepository,
    dependencyRepo: DependencyRepository,
  ): void {
    this.planRepo = planRepo;
    this.blockerRepo = blockerRepo;
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

  public getUnresolvedBlockers(graphOrPlanId: string | PlanningGraph): Blocker[] {
    const graph = this.resolveGraph(graphOrPlanId);
    return graph.blockers.filter((b) => !b.resolved);
  }

  public getBlockedTasks(graphOrPlanId: string | PlanningGraph): Task[] {
    const graph = this.resolveGraph(graphOrPlanId);
    const planTasks = graph.tasks;
    const planTaskIds = new Set(planTasks.map((t) => t.id));

    const unresolvedBlockers = this.getUnresolvedBlockers(graph);
    const planHasBlocker = unresolvedBlockers.length > 0;

    const blockedSet = new Set<string>();

    // 1. Explicitly blocked tasks
    for (const t of planTasks) {
      if (t.status === "Blocked") {
        blockedSet.add(t.id);
      } else if (planHasBlocker && t.status !== "Completed") {
        // If the plan has unresolved blockers, all incomplete tasks are blocked
        blockedSet.add(t.id);
      }
    }

    // 2. Propagate blocked status down the dependency tree
    const deps = graph.dependencies;

    let changed = true;
    while (changed) {
      changed = false;
      for (const dep of deps) {
        if (blockedSet.has(dep.predecessorTaskId)) {
          const succ = planTasks.find((t) => t.id === dep.successorTaskId);
          if (succ && succ.status !== "Completed" && !blockedSet.has(succ.id)) {
            blockedSet.add(succ.id);
            changed = true;
          }
        }
      }
    }

    return planTasks.filter((t) => blockedSet.has(t.id));
  }

  public detectMissingPredecessors(graphOrPlanId: string | PlanningGraph): Dependency[] {
    const graph = this.resolveGraph(graphOrPlanId);
    const planTasks = graph.tasks;
    const planTaskIds = new Set(planTasks.map((t) => t.id));
    const deps = graph.dependencies;

    // Find dependencies where successor is in this plan, but predecessor task does not exist
    return deps.filter((d) => {
      const successorInPlan = planTaskIds.has(d.successorTaskId);
      if (!successorInPlan) return false;
      const predecessorExists = planTasks.some((t) => t.id === d.predecessorTaskId);
      return !predecessorExists;
    });
  }

  public detectStalledMilestones(graphOrPlanId: string | PlanningGraph): Milestone[] {
    const graph = this.resolveGraph(graphOrPlanId);
    const milestones = graph.milestones;
    const blockedTasks = this.getBlockedTasks(graph);
    const blockedTaskIds = new Set(blockedTasks.map((t) => t.id));

    return milestones.filter((m) => {
      if (m.status === "Completed") return false;
      const tasks = graph.tasks.filter((t) => t.milestoneId === m.id);
      if (tasks.length === 0) return false;

      // If at least one task is blocked, the milestone is stalled
      return tasks.some((t) => blockedTaskIds.has(t.id));
    });
  }
}

export const blockerAnalysisService = new BlockerAnalysisService();
