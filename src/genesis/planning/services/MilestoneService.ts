import { Milestone } from "../types";
import { MilestoneRepository } from "../repositories/MilestoneRepository";
import { InMemoryMilestoneRepository } from "../repositories/InMemoryMilestoneRepository";
import { planningValidationService } from "./PlanningValidationService";
import { eventService } from "../../events/event-service";
import { Events, DomainEventName } from "../../../contracts/events";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export class MilestoneService {
  private repository!: MilestoneRepository;

  constructor(repository?: MilestoneRepository) {
    this.repository = repository || new InMemoryMilestoneRepository();
  }

  public initialize(repository: MilestoneRepository): void {
    this.repository = repository;
  }

  public setRepository(repository: MilestoneRepository): void {
    this.repository = repository;
  }

  public createMilestone(input: Omit<Milestone, "id" | "createdAt" | "updatedAt">): Milestone {
    const milestone: Milestone = {
      ...input,
      id: uid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validation = planningValidationService.validateMilestone(milestone);
    if (!validation.isValid) {
      throw new Error(validation.error || "Milestone validation failed.");
    }

    const created = this.repository.createMilestone(milestone);

    eventService.record(
      Events.MILESTONE_CREATED as DomainEventName,
      "Milestone Created",
      `Milestone "${created.title}" created for plan ${created.planId}`,
      null,
      null,
      { milestone: created },
    );

    return created;
  }

  public updateMilestone(
    id: string,
    input: Partial<Omit<Milestone, "id" | "planId" | "createdAt" | "updatedAt">>,
  ): Milestone {
    const existing = this.repository.getMilestone(id);
    if (!existing) {
      throw new Error(`Milestone with ID ${id} does not exist.`);
    }

    const updated: Milestone = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    };

    const validation = planningValidationService.validateMilestone(updated);
    if (!validation.isValid) {
      throw new Error(validation.error || "Milestone validation failed.");
    }

    return this.repository.updateMilestone(updated);
  }

  public completeMilestone(id: string): Milestone {
    const existing = this.repository.getMilestone(id);
    if (!existing) {
      throw new Error(`Milestone with ID ${id} does not exist.`);
    }

    const updated: Milestone = {
      ...existing,
      status: "Completed",
      updatedAt: new Date().toISOString(),
    };

    const saved = this.repository.updateMilestone(updated);

    eventService.record(
      Events.MILESTONE_COMPLETED as DomainEventName,
      "Milestone Completed",
      `Milestone "${saved.title}" completed in plan ${saved.planId}`,
      null,
      null,
      { milestone: saved },
    );

    return saved;
  }

  public listMilestones(planId?: string): Milestone[] {
    return this.repository.listMilestones(planId);
  }
}

export const milestoneService = new MilestoneService();
