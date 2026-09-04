import { MemoryImportance, ImportanceSignal } from "./types";
import { getRetentionPolicy, trimOldest } from "../retention/policy";

type ImportanceListener = (event: {
  type: "Updated" | "Increased" | "Decreased" | "Recalculated";
  importance: MemoryImportance;
}) => void;
const listeners = new Set<ImportanceListener>();

const importanceCache = new Map<string, MemoryImportance>();

export const importanceService = {
  /**
   * Subscribe to memory importance signal changes.
   */
  subscribe(listener: ImportanceListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Fetch importance record for a specific memory node.
   */
  getImportance(memoryId: string): MemoryImportance | null {
    return importanceCache.get(memoryId) || null;
  },

  /**
   * Fetch all recorded memory importance scores.
   */
  getAllImportance(): MemoryImportance[] {
    return Array.from(importanceCache.values());
  },

  /**
   * Clear importance cache.
   */
  clearHistory(): void {
    importanceCache.clear();
  },

  /**
   * Set or update signals for a given memory.
   */
  updateImportance(
    memoryId: string,
    signals: ImportanceSignal[],
    reason: string = "Recalculated",
  ): MemoryImportance {
    const existing = importanceCache.get(memoryId);
    let signalHistory: { signals: ImportanceSignal[]; timestamp: string; reason: string }[] = [];
    let eventType: "Updated" | "Increased" | "Decreased" | "Recalculated" = "Recalculated";

    if (existing) {
      signalHistory = [...existing.signalHistory];

      const oldStrengthSum = existing.signals.reduce((sum, s) => sum + s.strength, 0);
      const newStrengthSum = signals.reduce((sum, s) => sum + s.strength, 0);

      if (newStrengthSum > oldStrengthSum) {
        eventType = "Increased";
      } else if (newStrengthSum < oldStrengthSum) {
        eventType = "Decreased";
      } else {
        eventType = "Updated";
      }
    }

    // One instant for this recalculation, used by both the history entry and
    // the profile's `updatedAt`.
    //
    // Those were two separate `new Date().toISOString()` calls describing the
    // same moment in the same synchronous function, so the pair was pure
    // duplication rather than two facts. It mattered because of how often this
    // runs: importance recalculates every member of a touched story, which at
    // the `maxMemoriesPerStory` ceiling is 201 calls per user action, so the
    // duplicate cost 402 Date constructions and ISO formats where 201 do --
    // measured at 0.42-0.48 ms of a ~1.49 ms `updateImportance`.
    const recalculatedAt = new Date().toISOString();

    const historyEntry = {
      signals,
      timestamp: recalculatedAt,
      reason,
    };
    signalHistory.push(historyEntry);
    // Recalculated on every memory promotion and every story update, so this
    // grows even when the number of memories is stable.
    trimOldest(signalHistory, getRetentionPolicy().maxImportanceHistoryPerMemory);

    const importance: MemoryImportance = {
      memoryId,
      signals,
      signalHistory,
      updatedAt: recalculatedAt,
    };

    importanceCache.set(memoryId, importance);
    this.notify(eventType, importance);
    return importance;
  },

  /**
   * Drops importance profiles for memories retention has evicted. The cache is
   * keyed by memory id, so an entry outliving its memory is pure leak.
   */
  forgetMemories(evictedMemoryIds: string[]): void {
    evictedMemoryIds.forEach((id) => importanceCache.delete(id));
  },

  /**
   * Notify subscribers of updates.
   */
  notify(
    type: "Updated" | "Increased" | "Decreased" | "Recalculated",
    importance: MemoryImportance,
  ): void {
    listeners.forEach((listener) => {
      try {
        listener({ type, importance });
      } catch (err) {
        console.error("Error executing importance listener callback:", err);
      }
    });
  },
};
