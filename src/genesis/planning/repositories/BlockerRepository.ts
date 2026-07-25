import { Blocker } from "../types";

export interface BlockerRepository {
  getBlocker(id: string): Blocker | null;
  createBlocker(blocker: Blocker): Blocker;
  updateBlocker(blocker: Blocker): Blocker;
  deleteBlocker(id: string): void;
  listBlockers(planId?: string): Blocker[];
}
