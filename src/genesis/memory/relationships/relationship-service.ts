import { memoryService } from "../memory-service";
import { Memory } from "../../validation/types";
import { MemoryRelationship } from "./types";
import { relationshipRules } from "./relationship-rules";
import { getRetentionPolicy, trimOldest } from "../../retention/policy";

type RelationshipListener = (relationship: MemoryRelationship) => void;
const listeners = new Set<RelationshipListener>();

const relationshipCache: MemoryRelationship[] = [];

/**
 * Adjacency index: memory id -> the relationships with that memory at either end.
 *
 * A projection of `relationshipCache`, which stays canonical. It exists because
 * `getRelationshipsForMemory` was a linear filter over the whole cache, and at
 * the retention ceiling that single query was measured at 47% of the cost of
 * one completed task: importance recalculates 201 story members per event and
 * two of its six rules ask this question, so the cache -- 1,000 entries at its
 * cap -- was scanned 402 times per user action, ~15.9 ms of a ~34 ms event.
 *
 * Both ends are indexed because the query matches either. A relationship whose
 * two ends are the same memory would otherwise be listed twice, so it is stored
 * once; `detectRelationships` never builds one, but the guard makes the index
 * agree with the filter it replaces rather than with the loop that feeds it.
 *
 * Order is preserved, not merely membership. The filter returned matches in
 * cache order; the cache only ever gains entries at the back and loses them
 * from the front or by targeted removal, so appending here in push order yields
 * the same sequence the scan produced.
 *
 * Maintained at the three places the cache changes -- creation (including the
 * `maxRelationships` eviction that trims it), `forgetMemories`, and
 * `clearHistory`. Reconstruction needs no special handling: it clears and
 * replays through those same paths.
 */
const byMemory = new Map<string, MemoryRelationship[]>();

function indexAttach(memoryId: string, relationship: MemoryRelationship): void {
  const existing = byMemory.get(memoryId);
  if (existing) existing.push(relationship);
  else byMemory.set(memoryId, [relationship]);
}

function indexAdd(relationship: MemoryRelationship): void {
  indexAttach(relationship.sourceMemoryId, relationship);
  if (relationship.targetMemoryId !== relationship.sourceMemoryId) {
    indexAttach(relationship.targetMemoryId, relationship);
  }
}

function indexDetach(memoryId: string, relationship: MemoryRelationship): void {
  const list = byMemory.get(memoryId);
  if (!list) return;
  const at = list.indexOf(relationship);
  if (at !== -1) list.splice(at, 1);
  // An empty list is indistinguishable from an absent one to every reader, and
  // keeping it would leak an entry per memory retention has finished with.
  if (list.length === 0) byMemory.delete(memoryId);
}

function indexRemove(relationship: MemoryRelationship): void {
  indexDetach(relationship.sourceMemoryId, relationship);
  if (relationship.targetMemoryId !== relationship.sourceMemoryId) {
    indexDetach(relationship.targetMemoryId, relationship);
  }
}

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
    // A copy, because the filter this replaces returned one. Callers read
    // `.length`, run `.filter()` and render -- none mutates today -- but
    // handing out the index's own array would make the index corruptible by
    // any future caller that did.
    const list = byMemory.get(memoryId);
    return list ? list.slice() : [];
  },

  /**
   * Clear relationship log cache.
   */
  clearHistory(): void {
    relationshipCache.length = 0;
    byMemory.clear();
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
          indexAdd(relationship);

          // The return value is the only signal that entries have gone: this
          // eviction notifies nobody, and discarding it would leave the index
          // reporting relationships the cache no longer holds.
          const evictedLinks = trimOldest(relationshipCache, getRetentionPolicy().maxRelationships);
          for (const evictedLink of evictedLinks) indexRemove(evictedLink);

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
  /** Test helper: the adjacency index as plain data, for consistency assertions. */
  getAdjacencyIndexSnapshot(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [memoryId, links] of byMemory) out[memoryId] = links.map((l) => l.id);
    return out;
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
        indexRemove(link);
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
