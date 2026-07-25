import {
  Plan,
  Milestone,
  Task,
  Dependency,
  Blocker,
  PlanStatus,
  PlanPriority,
  MilestoneStatus,
  TaskStatus,
  DependencyType,
  BlockerSeverity,
} from "../types";
import { PlanRepository } from "../repositories/PlanRepository";
import { MilestoneRepository } from "../repositories/MilestoneRepository";
import { TaskRepository } from "../repositories/TaskRepository";
import { DependencyRepository } from "../repositories/DependencyRepository";
import { BlockerRepository } from "../repositories/BlockerRepository";

export class PlanningValidationService {
  private planRepo!: PlanRepository;
  private milestoneRepo!: MilestoneRepository;
  private taskRepo!: TaskRepository;
  private dependencyRepo!: DependencyRepository;
  private blockerRepo!: BlockerRepository;

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

  public validatePlanStatus(status: string): boolean {
    const valid: PlanStatus[] = ["Draft", "Active", "Paused", "Completed", "Archived"];
    return valid.includes(status as PlanStatus);
  }

  public validatePlanPriority(priority: string): boolean {
    const valid: PlanPriority[] = ["Low", "Medium", "High", "Critical"];
    return valid.includes(priority as PlanPriority);
  }

  public validateMilestoneStatus(status: string): boolean {
    const valid: MilestoneStatus[] = ["Pending", "Active", "Completed", "Archived"];
    return valid.includes(status as MilestoneStatus);
  }

  public validateTaskStatus(status: string): boolean {
    const valid: TaskStatus[] = ["Pending", "InProgress", "Completed", "Blocked"];
    return valid.includes(status as TaskStatus);
  }

  public validateDependencyType(type: string): boolean {
    const valid: DependencyType[] = ["FinishToStart", "StartToStart", "FinishToFinish"];
    return valid.includes(type as DependencyType);
  }

  public validateBlockerSeverity(severity: string): boolean {
    const valid: BlockerSeverity[] = ["Low", "Medium", "High", "Critical"];
    return valid.includes(severity as BlockerSeverity);
  }

  public validateBlocker(blocker: Blocker): { isValid: boolean; error?: string } {
    if (!blocker.id) return { isValid: false, error: "Blocker ID is required." };
    if (!blocker.planId) return { isValid: false, error: "Blocker Plan ID is required." };
    if (!this.validateBlockerSeverity(blocker.severity)) {
      return { isValid: false, error: `Invalid blocker severity: ${blocker.severity}` };
    }
    const plan = this.planRepo.getPlan(blocker.planId);
    if (!plan) {
      return { isValid: false, error: `Blocker references non-existent Plan: ${blocker.planId}` };
    }
    return { isValid: true };
  }

  public validateMilestone(milestone: Milestone): { isValid: boolean; error?: string } {
    if (!milestone.id) return { isValid: false, error: "Milestone ID is required." };
    if (!milestone.planId) return { isValid: false, error: "Milestone Plan ID is required." };
    if (!this.validateMilestoneStatus(milestone.status)) {
      return { isValid: false, error: `Invalid milestone status: ${milestone.status}` };
    }
    const plan = this.planRepo.getPlan(milestone.planId);
    if (!plan) {
      return {
        isValid: false,
        error: `Milestone references non-existent Plan: ${milestone.planId}`,
      };
    }

    const otherMilestones = this.milestoneRepo.listMilestones(milestone.planId);
    const orderConflict = otherMilestones.some(
      (m) => m.id !== milestone.id && m.order === milestone.order,
    );
    if (orderConflict) {
      return {
        isValid: false,
        error: `Milestone order ${milestone.order} is already taken in Plan ${milestone.planId}.`,
      };
    }

    return { isValid: true };
  }

  public validateTask(task: Task): { isValid: boolean; error?: string } {
    if (!task.id) return { isValid: false, error: "Task ID is required." };
    if (!task.milestoneId) return { isValid: false, error: "Task Milestone ID is required." };
    if (!this.validateTaskStatus(task.status)) {
      return { isValid: false, error: `Invalid task status: ${task.status}` };
    }
    const milestone = this.milestoneRepo.getMilestone(task.milestoneId);
    if (!milestone) {
      return {
        isValid: false,
        error: `Task references non-existent Milestone: ${task.milestoneId}`,
      };
    }
    return { isValid: true };
  }

  public validateDependency(dep: Dependency): { isValid: boolean; error?: string } {
    if (!dep.id) return { isValid: false, error: "Dependency ID is required." };
    if (!dep.predecessorTaskId || !dep.successorTaskId) {
      return { isValid: false, error: "Predecessor and successor task IDs are required." };
    }
    if (dep.predecessorTaskId === dep.successorTaskId) {
      return { isValid: false, error: "Task cannot depend on itself." };
    }
    if (!this.validateDependencyType(dep.type)) {
      return { isValid: false, error: `Invalid dependency type: ${dep.type}` };
    }

    const pred = this.taskRepo.getTask(dep.predecessorTaskId);
    const succ = this.taskRepo.getTask(dep.successorTaskId);
    if (!pred) {
      return { isValid: false, error: `Predecessor task ${dep.predecessorTaskId} does not exist.` };
    }
    if (!succ) {
      return { isValid: false, error: `Successor task ${dep.successorTaskId} does not exist.` };
    }

    const allDeps = this.dependencyRepo.listDependencies();
    const isDup = allDeps.some(
      (d) =>
        d.id !== dep.id &&
        d.predecessorTaskId === dep.predecessorTaskId &&
        d.successorTaskId === dep.successorTaskId,
    );
    if (isDup) {
      return {
        isValid: false,
        error: `Dependency between ${dep.predecessorTaskId} and ${dep.successorTaskId} already exists.`,
      };
    }

    const wouldHaveCycle = this.checkCycleWithNewDependency(
      dep.predecessorTaskId,
      dep.successorTaskId,
    );
    if (wouldHaveCycle) {
      return { isValid: false, error: "Creating this dependency would introduce a cycle." };
    }

    return { isValid: true };
  }

  private checkCycleWithNewDependency(predecessor: string, successor: string): boolean {
    const adjList = new Map<string, string[]>();
    const deps = this.dependencyRepo.listDependencies();
    for (const d of deps) {
      if (!adjList.has(d.predecessorTaskId)) {
        adjList.set(d.predecessorTaskId, []);
      }
      adjList.get(d.predecessorTaskId)!.push(d.successorTaskId);
    }

    const queue = [successor];
    const visited = new Set<string>([successor]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === predecessor) return true;

      const neighbors = adjList.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    return false;
  }
}

export const planningValidationService = new PlanningValidationService();
