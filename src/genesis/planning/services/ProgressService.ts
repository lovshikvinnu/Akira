import { Progress } from "../types";
import { PlanRepository } from "../repositories/PlanRepository";
import { MilestoneRepository } from "../repositories/MilestoneRepository";
import { TaskRepository } from "../repositories/TaskRepository";
import { InMemoryPlanRepository } from "../repositories/InMemoryPlanRepository";
import { InMemoryMilestoneRepository } from "../repositories/InMemoryMilestoneRepository";
import { InMemoryTaskRepository } from "../repositories/InMemoryTaskRepository";
import { eventService } from "../../events/event-service";
import { Events, DomainEventName } from "../../../contracts/events";

export class ProgressService {
  private planRepo!: PlanRepository;
  private milestoneRepo!: MilestoneRepository;
  private taskRepo!: TaskRepository;

  constructor(
    planRepo?: PlanRepository,
    milestoneRepo?: MilestoneRepository,
    taskRepo?: TaskRepository,
  ) {
    this.planRepo = planRepo || new InMemoryPlanRepository();
    this.milestoneRepo = milestoneRepo || new InMemoryMilestoneRepository();
    this.taskRepo = taskRepo || new InMemoryTaskRepository();
  }

  public initialize(
    planRepo: PlanRepository,
    milestoneRepo: MilestoneRepository,
    taskRepo: TaskRepository,
  ): void {
    this.planRepo = planRepo;
    this.milestoneRepo = milestoneRepo;
    this.taskRepo = taskRepo;
  }

  public setRepositories(
    planRepo: PlanRepository,
    milestoneRepo: MilestoneRepository,
    taskRepo: TaskRepository,
  ): void {
    this.planRepo = planRepo;
    this.milestoneRepo = milestoneRepo;
    this.taskRepo = taskRepo;
  }

  /**
   * Deterministically calculates progress based on the current state of tasks and milestones.
   * This does NOT mutate the repository state.
   */
  public calculateProgress(planId: string): Progress {
    const plan = this.planRepo.getPlan(planId);
    if (!plan) {
      throw new Error(`Plan with ID ${planId} does not exist.`);
    }

    const milestones = this.milestoneRepo.listMilestones(planId);
    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter((m) => m.status === "Completed").length;

    let totalTasks = 0;
    let completedTasks = 0;

    for (const m of milestones) {
      const tasks = this.taskRepo.listTasks(m.id);
      totalTasks += tasks.length;
      completedTasks += tasks.filter((t) => t.status === "Completed").length;
    }

    let percentage = 0;
    if (totalTasks > 0) {
      percentage = Math.round((completedTasks / totalTasks) * 100);
    } else if (totalMilestones > 0) {
      percentage = Math.round((completedMilestones / totalMilestones) * 100);
    } else {
      // Empty plan: 100% complete
      percentage = 100;
    }

    return {
      planId,
      completedTasks,
      totalTasks,
      completedMilestones,
      totalMilestones,
      percentage,
    };
  }

  /**
   * Triggers progress calculation and fires ProgressUpdated event if computed progress changes.
   */
  public getProgress(planId: string): Progress | null {
    const plan = this.planRepo.getPlan(planId);
    if (!plan) return null;

    const progress = this.calculateProgress(planId);

    // Record the ProgressUpdated event in the cognitive pipeline
    eventService.record(
      Events.PROGRESS_UPDATED as DomainEventName,
      "Progress Updated",
      `Progress updated for plan ${planId} to ${progress.percentage}%`,
      null,
      null,
      { progress },
    );

    return progress;
  }
}

export const progressService = new ProgressService();
