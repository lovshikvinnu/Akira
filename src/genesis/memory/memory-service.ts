import { candidateService } from "../candidate/candidate-service";
import { MemoryCandidate } from "../candidate/candidate";
import { Memory } from "../validation/types";
import { validator } from "../validation/validator";
import { recallService } from "../recall/recall-service";
import { getMemories } from "../../shared/genesis-provider";
import { getRetentionPolicy, trimOldest } from "../retention/policy";

export type MemoryListener = (memory: Memory) => void;
export type ClearListener = () => void;
/** Receives the ids of memories dropped by retention, oldest first. */
export type EvictionListener = (evictedMemoryIds: string[]) => void;
const listeners = new Set<MemoryListener>();
const clearListeners = new Set<ClearListener>();
const evictionListeners = new Set<EvictionListener>();

let rebuildRecallIndexCallback: (() => void) | null = null;

// In-memory array of validated, long-term preserved memories
const memories: Memory[] = [];

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const memoryService = {
  /**
   * Subscribe to new memories being validated and promoted in the system.
   * Useful for downstream layers (stories, identity) to monitor validated insights.
   */
  subscribe(listener: MemoryListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Retrieve all validated long-term memories.
   */
  getMemories(): Memory[] {
    return memories;
  },

  /**
   * Clear memories log cache.
   */
  clearHistory(): void {
    memories.length = 0;
  },

  /**
   * Validate a candidate and promote it to a long-term Memory if outcome is Promote.
   */
  processCandidate(candidate: MemoryCandidate): Memory | null {
    const result = validator.validate(candidate);
    if (result.outcome === "Promote") {
      const memory: Memory = {
        id: uid(),
        sourceEventId: candidate.sourceEventId,
        candidateId: candidate.id,
        timestamp: candidate.timestamp || new Date().toISOString(),
        reason: candidate.reason,
        explanation: result.explanation || candidate.explanation,
        title: candidate.title,
        description: candidate.description,
        relatedProjectId: candidate.relatedProjectId,
        relatedNoteId: candidate.relatedNoteId,
        metadata: candidate.metadata,
      };

      memories.push(memory);

      // Retention runs on write rather than on a timer: the only moment the
      // collection can exceed its cap is the moment something was added, and a
      // background sweep would be state nothing else in GENESIS needs.
      //
      // Eviction is by age. Importance would be the richer signal, but it is
      // derived *from* memories, so consulting it here would make the root
      // store depend on something downstream of itself. Recency is predictable
      // and cannot invert that direction.
      const evicted = trimOldest(memories, getRetentionPolicy().maxMemories);
      if (evicted.length > 0) {
        notifyEvicted(evicted.map((m) => m.id));
      }

      listeners.forEach((listener) => {
        try {
          listener(memory);
        } catch (err) {
          console.error("Error executing memory subscriber callback:", err);
        }
      });

      return memory;
    }
    return null;
  },

  /**
   * Initialize GENESIS lifecycle.
   * Reconstructs runtime memory from storage and rebuilds the recall index.
   */
  initialize(): void {
    // 1. Reconstruct Runtime Memory
    this.reconstructRuntimeMemory();
    // 2. Build Recall Index
    this.buildRecallIndex();
  },

  /**
   * Reconstructs runtime memory from persistent storage (store.memories)
   * while ensuring clean state across related cognitive services.
   */
  reconstructRuntimeMemory(): void {
    const storeMemories = getMemories();
    if (storeMemories && storeMemories.length > 0) {
      // Clear in-memory history/caches to prevent duplicate nodes on reloading
      candidateService.clearHistory();
      this.clearHistory();
      recallService.clearHistory();

      // Trigger clear event so downstream services clear their state synchronously
      clearListeners.forEach((listener) => {
        try {
          listener();
        } catch (err) {
          console.error("Error executing memory clear listener callback:", err);
        }
      });

      // Evaluate historical events chronologically (oldest to newest) to rebuild state
      const events = [...storeMemories].reverse();
      for (const event of events) {
        candidateService.evaluateEvent(event);
      }
    }
  },

  /**
   * Rebuilds the candidate recall index.
   */
  buildRecallIndex(): void {
    if (rebuildRecallIndexCallback) {
      rebuildRecallIndexCallback();
    }
  },

  /**
   * Registers the recall builder indexer callback to avoid circular dependencies at load time.
   */
  registerRecallBuilder(callback: () => void): void {
    rebuildRecallIndexCallback = callback;
  },

  /**
   * Subscribe to retention evictions.
   *
   * Derived stores hold memory ids; this is how they learn an id has gone so
   * they can drop the reference instead of dangling. See
   * ../retention/retention-service.ts, which is the only production subscriber.
   */
  subscribeEviction(listener: EvictionListener): () => void {
    evictionListeners.add(listener);
    return () => {
      evictionListeners.delete(listener);
    };
  },

  /**
   * Subscribe to memory clear events.
   */
  subscribeClear(listener: ClearListener): () => void {
    clearListeners.add(listener);
    return () => {
      clearListeners.delete(listener);
    };
  },
};

function notifyEvicted(evictedMemoryIds: string[]): void {
  evictionListeners.forEach((listener) => {
    try {
      listener(evictedMemoryIds);
    } catch (err) {
      console.error("Error executing memory eviction listener:", err);
    }
  });
}

let candidateSub: (() => void) | null = null;

export const validationEngine = {
  /**
   * Initialize candidate service subscription.
   */
  initialize(): void {
    if (!candidateSub) {
      candidateSub = candidateService.subscribe((candidate) => {
        memoryService.processCandidate(candidate);
      });
    }
  },

  /**
   * Dispose candidate service subscription.
   */
  dispose(): void {
    if (candidateSub) {
      candidateSub();
      candidateSub = null;
    }
  },
};
