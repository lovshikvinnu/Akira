import { HabitContext, ObservedHabit } from "./types";

export type HabitEventType =
  | "behavior_observed"
  | "habit_detected"
  | "habit_updated"
  | "habit_corrected"
  | "habit_context_updated";

export interface HabitEngineEvent {
  type: HabitEventType;
  habitContext: HabitContext;
  targetHabit?: ObservedHabit;
  timestamp: number;
}

export type HabitCallback = (event: HabitEngineEvent) => void;

const listeners = new Set<HabitCallback>();

export const habitEvents = {
  /**
   * Subscribe to Habit Context changes.
   */
  subscribe(callback: HabitCallback): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },

  /**
   * Publish a Habit Engine transition.
   */
  publish(type: HabitEventType, context: HabitContext, targetHabit?: ObservedHabit): void {
    const event: HabitEngineEvent = {
      type,
      habitContext: context,
      targetHabit,
      timestamp: Date.now(),
    };

    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("Error executing habit update callback:", err);
      }
    });
  },
};
