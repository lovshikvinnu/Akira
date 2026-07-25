import { Plan } from "../types";
import { PlanRepository } from "./PlanRepository";

export class InMemoryPlanRepository implements PlanRepository {
  private plans: Map<string, Plan> = new Map();

  public getPlan(id: string): Plan | null {
    return this.plans.get(id) || null;
  }

  public createPlan(plan: Plan): Plan {
    this.plans.set(plan.id, { ...plan });
    return this.getPlan(plan.id)!;
  }

  public updatePlan(plan: Plan): Plan {
    const existing = this.plans.get(plan.id);
    if (!existing) {
      throw new Error(`Plan with ID ${plan.id} does not exist.`);
    }
    const updated = {
      ...existing,
      ...plan,
      updatedAt: new Date().toISOString(),
    };
    this.plans.set(plan.id, updated);
    return this.getPlan(plan.id)!;
  }

  public deletePlan(id: string): void {
    this.plans.delete(id);
  }

  public listPlans(): Plan[] {
    return Array.from(this.plans.values());
  }

  public clear(): void {
    this.plans.clear();
  }
}
