import { candidateService } from "../candidate-service";
import { MemoryCandidate } from "../candidate";
import { Memory } from "./types";
import { validator } from "./validator";

export type MemoryListener = (memory: Memory) => void;
const listeners = new Set<MemoryListener>();

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
        timestamp: new Date().toISOString(),
        reason: candidate.reason,
        explanation: result.explanation || candidate.explanation,
        title: candidate.title,
        description: candidate.description,
        relatedProjectId: candidate.relatedProjectId,
        relatedNoteId: candidate.relatedNoteId,
        metadata: candidate.metadata,
      };

      memories.push(memory);
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
};

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

// Automatic integration: initialize on load
validationEngine.initialize();
