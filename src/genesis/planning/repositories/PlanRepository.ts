import { Plan } from "../types";

export interface PlanRepository {
  getPlan(id: string): Plan | null;
  createPlan(plan: Plan): Plan;
  updatePlan(plan: Plan): Plan;
  deletePlan(id: string): void;
  listPlans(): Plan[];
}
