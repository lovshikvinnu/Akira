import { PresenceContext } from "./types";

export type PresenceCallback = (context: PresenceContext) => void;

const listeners = new Set<PresenceCallback>();

export const presenceEvents = {
  /**
   * Subscribe to Presence Context updates.
   */
  subscribe(callback: PresenceCallback): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },

  /**
   * Publish a new Presence Context.
   */
  publish(context: PresenceContext): void {
    listeners.forEach((listener) => {
      try {
        listener(context);
      } catch (err) {
        console.error("Error executing presence update listener callback:", err);
      }
    });
  },
};
export type { PresenceContext };
