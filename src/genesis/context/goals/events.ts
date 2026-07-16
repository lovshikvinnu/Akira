import { GoalContext, Goal } from "./types";

export type GoalEventType =
  "goal_created" | "goal_updated" | "goal_completed" | "goal_corrected" | "goal_context_updated";

export interface GoalEngineEvent {
  type: GoalEventType;
  goalContext: GoalContext;
  targetGoal?: Goal;
  timestamp: number;
}

export type GoalCallback = (event: GoalEngineEvent) => void;

const listeners = new Set<GoalCallback>();

export const goalEvents = {
  /**
   * Subscribe to Goal Context modifications.
   */
  subscribe(callback: GoalCallback): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },

  /**
   * Publish a Goal Engine transition.
   */
  publish(type: GoalEventType, context: GoalContext, targetGoal?: Goal): void {
    const event: GoalEngineEvent = {
      type,
      goalContext: context,
      targetGoal,
      timestamp: Date.now(),
    };

    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("Error executing goal update listener callback:", err);
      }
    });
  },
};
