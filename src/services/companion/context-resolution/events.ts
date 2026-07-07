import { ResolvedContext } from "./types";

export type ContextResolutionEventType =
  "contexts_received" | "resolved_context_constructed" | "resolved_context_updated";

export interface ContextResolutionEvent {
  type: ContextResolutionEventType;
  resolvedContext: ResolvedContext;
  timestamp: number;
}

export type ContextResolutionCallback = (event: ContextResolutionEvent) => void;

const listeners = new Set<ContextResolutionCallback>();

export const contextResolutionEvents = {
  /**
   * Subscribe to Resolved Context changes.
   */
  subscribe(callback: ContextResolutionCallback): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },

  /**
   * Publish a Context Resolution transition.
   */
  publish(type: ContextResolutionEventType, resolvedContext: ResolvedContext): void {
    const event: ContextResolutionEvent = {
      type,
      resolvedContext,
      timestamp: Date.now(),
    };

    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("Error executing context resolution callback:", err);
      }
    });
  },
};
