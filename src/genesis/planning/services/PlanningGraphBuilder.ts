import {
  PlanningGraph,
  Plan,
  Milestone,
  Task,
  Dependency,
  Blocker,
  Progress,
  PlanningGraphNode,
  PlanningGraphEdge,
} from "../types";
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
import { progressService } from "./ProgressService";
import { eventService } from "../../events/event-service";
import { Events, DomainEventName } from "../../../contracts/events";

export class PlanningGraphBuilder {
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

  /**
   * Builds an immutable PlanningGraph snapshot representing the plan at this point in time.
   */
  public build(planId: string): PlanningGraph {
    const plan = this.planRepo.getPlan(planId);
    if (!plan) {
      throw new Error(`Plan with ID ${planId} does not exist.`);
    }

    const milestones = this.milestoneRepo.listMilestones(planId);
    const milestoneIds = new Set(milestones.map((m) => m.id));

    const allTasks = this.taskRepo.listTasks();
    const tasks = allTasks.filter((t) => milestoneIds.has(t.milestoneId));
    const taskIds = new Set(tasks.map((t) => t.id));

    const allDeps = this.dependencyRepo.listDependencies();
    const dependencies = allDeps.filter((d) => taskIds.has(d.successorTaskId));

    const blockers = this.blockerRepo.listBlockers(planId);
    const progress = progressService.calculateProgress(planId);

    // Build visual graph nodes/edges
    const nodes: PlanningGraphNode[] = [];
    const edges: PlanningGraphEdge[] = [];

    // 1. Add Plan node
    nodes.push({ id: plan.id, type: "Plan", data: plan });

    // 2. Add Goal reference edge if present
    if (plan.goalId) {
      nodes.push({
        id: plan.goalId,
        type: "Goal",
        data: { id: plan.goalId },
      });
      edges.push({
        id: `edge-goal-${plan.goalId}-to-plan-${plan.id}`,
        sourceId: plan.goalId,
        targetId: plan.id,
        type: "goal_to_plan",
      });
    }

    // 2. Add Milestone nodes
    for (const m of milestones) {
      nodes.push({ id: m.id, type: "Milestone", data: m });
      edges.push({
        id: `edge-plan-${plan.id}-to-milestone-${m.id}`,
        sourceId: plan.id,
        targetId: m.id,
        type: "plan_to_milestone",
      });
    }

    // 3. Add Task nodes
    for (const t of tasks) {
      nodes.push({ id: t.id, type: "Task", data: t });
      edges.push({
        id: `edge-milestone-${t.milestoneId}-to-task-${t.id}`,
        sourceId: t.milestoneId,
        targetId: t.id,
        type: "milestone_to_task",
      });
    }

    // 4. Add Blocker nodes
    for (const b of blockers) {
      nodes.push({ id: b.id, type: "Blocker", data: b });
      edges.push({
        id: `edge-plan-${plan.id}-to-blocker-${b.id}`,
        sourceId: plan.id,
        targetId: b.id,
        type: "plan_to_blocker",
      });
    }

    // 5. Add Progress (Derived View) Node
    nodes.push({
      id: `progress-${plan.id}`,
      type: "Progress",
      data: progress,
    });
    edges.push({
      id: `edge-plan-${plan.id}-to-progress-${plan.id}`,
      sourceId: plan.id,
      targetId: `progress-${plan.id}`,
      type: "plan_to_progress",
    });

    // 6. Add Task Dependencies
    for (const d of dependencies) {
      nodes.push({ id: d.id, type: "Dependency", data: d });
      edges.push({
        id: d.id,
        sourceId: d.predecessorTaskId,
        targetId: d.successorTaskId,
        type: "task_dependency",
      });
    }

    // Freeze objects recursively to ensure strict immutability of snapshot
    const immutablePlan = Object.freeze({ ...plan });
    const immutableMilestones = Object.freeze(milestones.map((m) => Object.freeze({ ...m })));
    const immutableTasks = Object.freeze(tasks.map((t) => Object.freeze({ ...t })));
    const immutableDependencies = Object.freeze(dependencies.map((d) => Object.freeze({ ...d })));
    const immutableBlockers = Object.freeze(blockers.map((b) => Object.freeze({ ...b })));
    const immutableProgress = Object.freeze({ ...progress });
    const immutableNodes = Object.freeze(nodes.map((n) => Object.freeze({ ...n })));
    const immutableEdges = Object.freeze(edges.map((e) => Object.freeze({ ...e })));

    const graph: PlanningGraph = {
      nodes: immutableNodes as any,
      edges: immutableEdges as any,
      plan: immutablePlan,
      milestones: immutableMilestones,
      tasks: immutableTasks,
      dependencies: immutableDependencies,
      blockers: immutableBlockers,
      progress: immutableProgress,
    };

    Object.freeze(graph);

    // Record Event: PlanningGraphBuilt
    eventService.record(
      Events.PLANNING_GRAPH_BUILT as DomainEventName,
      "Planning Graph Built",
      `Planning graph successfully built for plan ${planId}`,
      null,
      null,
      { planId },
    );

    return graph;
  }
}

export const planningGraphBuilder = new PlanningGraphBuilder();
