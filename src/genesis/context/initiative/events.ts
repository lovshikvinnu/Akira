import { InitiativeDecision } from "./types";

export type InitiativeEventType = "initiative_decision_evaluated" | "initiative_decision_corrected";

export interface InitiativeEvent {
  type: InitiativeEventType;
  decision: InitiativeDecision;
  timestamp: number;
}

export type InitiativeCallback = (event: InitiativeEvent) => void;

const listeners = new Set<InitiativeCallback>();

export const initiativeEvents = {
  /**
   * Subscribe to Initiative Decision changes.
   */
  subscribe(callback: InitiativeCallback): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },

  /**
   * Publish an Initiative Engine transition.
   */
  publish(type: InitiativeEventType, decision: InitiativeDecision): void {
    const event: InitiativeEvent = {
      type,
      decision,
      timestamp: Date.now(),
    };

    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("Error executing initiative callback:", err);
      }
    });
  },
};
