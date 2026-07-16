import { ContextPackage } from "./types";

type ContextListener = (event: {
  type: "Created" | "Updated" | "Expired";
  package: ContextPackage | null;
}) => void;
const listeners = new Set<ContextListener>();

let activePackage: ContextPackage | null = null;

export const contextService = {
  /**
   * Subscribe to ephemeral context package lifecycle updates.
   */
  subscribe(listener: ContextListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Fetch the current active context package.
   */
  getActiveContext(): ContextPackage | null {
    return activePackage;
  },

  /**
   * Set the current active context package and notify subscribers.
   */
  updateContextPackage(newPackage: ContextPackage): void {
    const isNew = !activePackage;
    activePackage = newPackage;
    this.notify(isNew ? "Created" : "Updated", newPackage);
  },

  /**
   * Expire the active context package, setting it to null and triggering Expired.
   */
  expireContextPackage(): void {
    if (activePackage) {
      const expiredPkg = activePackage;
      activePackage = null;
      this.notify("Expired", expiredPkg);
    }
  },

  /**
   * Broadcast changes.
   */
  notify(type: "Created" | "Updated" | "Expired", pkg: ContextPackage | null): void {
    listeners.forEach((listener) => {
      try {
        listener({ type, package: pkg });
      } catch (err) {
        console.error("Error executing context listener callback:", err);
      }
    });
  },
};
