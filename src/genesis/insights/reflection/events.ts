import { ReflectionContext, ReflectionReport } from "./types";

export type ReflectionEventType =
  | "session_finalized"
  | "reflection_prepared"
  | "reflection_context_finalized"
  | "reflection_corrected";

export interface ReflectionEngineEvent {
  type: ReflectionEventType;
  reflectionContext: ReflectionContext;
  targetReport?: ReflectionReport;
  timestamp: number;
}

export type ReflectionCallback = (event: ReflectionEngineEvent) => void;

const listeners = new Set<ReflectionCallback>();

export const reflectionEvents = {
  /**
   * Subscribe to Reflection Context updates.
   */
  subscribe(callback: ReflectionCallback): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },

  /**
   * Publish a Reflection Engine update.
   */
  publish(
    type: ReflectionEventType,
    context: ReflectionContext,
    targetReport?: ReflectionReport,
  ): void {
    const event: ReflectionEngineEvent = {
      type,
      reflectionContext: context,
      targetReport,
      timestamp: Date.now(),
    };

    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("Error executing reflection callback:", err);
      }
    });
  },
};
