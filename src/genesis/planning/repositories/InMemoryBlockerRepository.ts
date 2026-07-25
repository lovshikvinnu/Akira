import { Blocker } from "../types";
import { BlockerRepository } from "./BlockerRepository";

export class InMemoryBlockerRepository implements BlockerRepository {
  private blockers: Map<string, Blocker> = new Map();

  public getBlocker(id: string): Blocker | null {
    return this.blockers.get(id) || null;
  }

  public createBlocker(blocker: Blocker): Blocker {
    this.blockers.set(blocker.id, { ...blocker });
    return this.getBlocker(blocker.id)!;
  }

  public updateBlocker(blocker: Blocker): Blocker {
    const existing = this.blockers.get(blocker.id);
    if (!existing) {
      throw new Error(`Blocker with ID ${blocker.id} does not exist.`);
    }
    const updated = {
      ...existing,
      ...blocker,
    };
    this.blockers.set(blocker.id, updated);
    return this.getBlocker(blocker.id)!;
  }

  public deleteBlocker(id: string): void {
    this.blockers.delete(id);
  }

  public listBlockers(planId?: string): Blocker[] {
    const all = Array.from(this.blockers.values());
    if (planId) {
      return all.filter((b) => b.planId === planId);
    }
    return all;
  }

  public clear(): void {
    this.blockers.clear();
  }
}
