import { memoryService } from "../memory-service";
import { Memory } from "../../validation/types";
import { MemoryRelationship } from "./types";
import { relationshipRules } from "./relationship-rules";
import { getRetentionPolicy, trimOldest } from "../../retention/policy";

type RelationshipListener = (relationship: MemoryRelationship) => void;
const listeners = new Set<RelationshipListener>();

const relationshipCache: MemoryRelationship[] = [];

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const relationshipService = {
  /**
   * Subscribe to new memory relationships generated in the system.
   */
  subscribe(listener: RelationshipListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Get all active memory relationships.
   */
  getRelationships(): MemoryRelationship[] {
    return relationshipCache;
  },

  /**
   * Get all relationships associated with a specific memory ID.
   */
  getRelationshipsForMemory(memoryId: string): MemoryRelationship[] {
    return relationshipCache.filter(
      (r) => r.sourceMemoryId === memoryId || r.targetMemoryId === memoryId,
    );
  },

  /**
   * Clear relationship log cache.
   */
  clearHistory(): void {
    relationshipCache.length = 0;
  },

  /**
   * Fetch candidates for comparison.
   * Decoupled to allow future indexing/filtering (e.g. by project bucket or date range)
   * instead of scanning the full memory log.
   */
  getComparisonCandidates(newMemory: Memory): Memory[] {
    return memoryService.getMemories();
  },

  /**
   * Process a newly promoted memory and check for relationships against comparison candidates.
   */
  detectRelationships(newMemory: Memory): MemoryRelationship[] {
    const detected: MemoryRelationship[] = [];
    const candidates = this.getComparisonCandidates(newMemory);

    for (const existing of candidates) {
      // Do not link a memory to itself
      if (existing.id === newMemory.id) continue;

      for (const rule of relationshipRules) {
        const result = rule.evaluate(newMemory, existing);
        if (result.detected && result.type && result.evidence) {
          const relationship: MemoryRelationship = {
            id: uid(),
            sourceMemoryId: newMemory.id,
            targetMemoryId: existing.id,
            type: result.type,
            evidence: result.evidence,
            timestamp: new Date().toISOString(),
          };

          relationshipCache.push(relationship);
          trimOldest(relationshipCache, getRetentionPolicy().maxRelationships);
          detected.push(relationship);

          listeners.forEach((listener) => {
            try {
              listener(relationship);
            } catch (err) {
              console.error("Error executing relationship subscriber callback:", err);
            }
          });
        }
      }
    }

    return detected;
  },
  /**
   * Drops relationships that point at memories retention has evicted. A
   * relationship needs both ends to mean anything.
   */
  forgetMemories(evictedMemoryIds: string[]): void {
    if (evictedMemoryIds.length === 0) return;
    const evicted = new Set(evictedMemoryIds);

    for (let i = relationshipCache.length - 1; i >= 0; i--) {
      const link = relationshipCache[i];
      if (evicted.has(link.sourceMemoryId) || evicted.has(link.targetMemoryId)) {
        relationshipCache.splice(i, 1);
      }
    }
  },
};

let memorySub: (() => void) | null = null;
let clearSub: (() => void) | null = null;

export const relationshipEngine = {
  /**
   * Initialize memory subscription.
   */
  initialize(): void {
    if (!memorySub) {
      memorySub = memoryService.subscribe((memory) => {
        relationshipService.detectRelationships(memory);
      });
    }

    if (!clearSub) {
      clearSub = memoryService.subscribeClear(() => {
        relationshipService.clearHistory();
      });
    }
  },

  /**
   * Dispose memory subscription.
   */
  dispose(): void {
    if (memorySub) {
      memorySub();
      memorySub = null;
    }
    if (clearSub) {
      clearSub();
      clearSub = null;
    }
  },
};

// Automatic integration: initialize on load
relationshipEngine.initialize();
