import { KnowledgeContext, KnowledgeNode } from "./types";

export type KnowledgeEventType =
  | "knowledge_observed"
  | "knowledge_updated"
  | "knowledge_gap_detected"
  | "knowledge_corrected"
  | "knowledge_context_updated";

export interface KnowledgeEngineEvent {
  type: KnowledgeEventType;
  knowledgeContext: KnowledgeContext;
  targetNode?: KnowledgeNode;
  timestamp: number;
}

export type KnowledgeCallback = (event: KnowledgeEngineEvent) => void;

const listeners = new Set<KnowledgeCallback>();

export const knowledgeEvents = {
  /**
   * Subscribe to Knowledge Context updates.
   */
  subscribe(callback: KnowledgeCallback): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },

  /**
   * Publish a Knowledge Engine transition event.
   */
  publish(type: KnowledgeEventType, context: KnowledgeContext, targetNode?: KnowledgeNode): void {
    const event: KnowledgeEngineEvent = {
      type,
      knowledgeContext: context,
      targetNode,
      timestamp: Date.now(),
    };

    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("Error executing knowledge update callback:", err);
      }
    });
  },
};
