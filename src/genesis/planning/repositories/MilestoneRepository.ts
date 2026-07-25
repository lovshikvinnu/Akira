import { Milestone } from "../types";

export interface MilestoneRepository {
  getMilestone(id: string): Milestone | null;
  createMilestone(milestone: Milestone): Milestone;
  updateMilestone(milestone: Milestone): Milestone;
  deleteMilestone(id: string): void;
  listMilestones(planId?: string): Milestone[];
}
