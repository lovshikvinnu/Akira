import { Milestone } from "../types";
import { MilestoneRepository } from "./MilestoneRepository";

export class InMemoryMilestoneRepository implements MilestoneRepository {
  private milestones: Map<string, Milestone> = new Map();

  public getMilestone(id: string): Milestone | null {
    return this.milestones.get(id) || null;
  }

  public createMilestone(milestone: Milestone): Milestone {
    this.milestones.set(milestone.id, { ...milestone });
    return this.getMilestone(milestone.id)!;
  }

  public updateMilestone(milestone: Milestone): Milestone {
    const existing = this.milestones.get(milestone.id);
    if (!existing) {
      throw new Error(`Milestone with ID ${milestone.id} does not exist.`);
    }
    const updated = {
      ...existing,
      ...milestone,
      updatedAt: new Date().toISOString(),
    };
    this.milestones.set(milestone.id, updated);
    return this.getMilestone(milestone.id)!;
  }

  public deleteMilestone(id: string): void {
    this.milestones.delete(id);
  }

  public listMilestones(planId?: string): Milestone[] {
    const all = Array.from(this.milestones.values());
    if (planId) {
      return all.filter((m) => m.planId === planId);
    }
    return all;
  }

  public clear(): void {
    this.milestones.clear();
  }
}
