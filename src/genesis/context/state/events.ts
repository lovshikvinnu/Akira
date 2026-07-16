import { CompanionState } from "./types";

export type StateEventType =
  "state_initialized" | "state_updated" | "state_corrected" | "state_expired";

export interface CompanionStateEvent {
  type: StateEventType;
  state: CompanionState;
  timestamp: number;
}

export type StateCallback = (event: CompanionStateEvent) => void;

const listeners = new Set<StateCallback>();

export const stateEvents = {
  /**
   * Subscribe to Companion State changes.
   */
  subscribe(callback: StateCallback): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },

  /**
   * Publish a state lifecycle change event.
   */
  publish(type: StateEventType, state: CompanionState): void {
    const event: CompanionStateEvent = {
      type,
      state,
      timestamp: Date.now(),
    };

    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("Error executing state update listener callback:", err);
      }
    });
  },
};
