import { IdentityObservation } from "./identity-types";

export type IdentityListener = (event: {
  type: "Updated" | "Confirmed" | "Refined";
  observation: IdentityObservation;
}) => void;
const listeners = new Set<IdentityListener>();

const observationCache: IdentityObservation[] = [];

export const identityService = {
  /**
   * Subscribe to emergent identity updates.
   */
  subscribe(listener: IdentityListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Get all emergent identity observations.
   */
  getObservations(): IdentityObservation[] {
    return observationCache;
  },

  /**
   * Clear observations cache.
   */
  clearHistory(): void {
    observationCache.length = 0;
  },

  /**
   * Record a new emergent identity observation.
   * Merges and reinforces existing observations if Category and Name match.
   */
  addObservation(
    observation: Omit<IdentityObservation, "id" | "createdAt" | "updatedAt" | "confidenceHistory">,
  ): IdentityObservation {
    const uid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

    const obs: Omit<IdentityObservation, "id" | "createdAt" | "updatedAt" | "confidenceHistory"> = {
      ...observation,
    };

    const idx = observationCache.findIndex(
      (o) => o.category === obs.category && o.name === obs.name,
    );

    if (idx !== -1) {
      const oldObs = observationCache[idx];
      const mergedStoryIds = Array.from(
        new Set([...oldObs.supportingStoryIds, ...obs.supportingStoryIds]),
      );
      const mergedMemoryIds = Array.from(
        new Set([...oldObs.supportingMemoryIds, ...obs.supportingMemoryIds]),
      );

      const nextConfidence = Math.min(1.0, oldObs.confidence + 0.1);
      const mergeReason = `Merged and reinforced with new evidence: ${obs.provenance}`;

      let eventType: "Updated" | "Confirmed" | "Refined" = "Updated";
      if (oldObs.value !== obs.value) {
        eventType = "Refined";
      }
      if (obs.provenance.includes("Promoted from confirmed onboarding")) {
        eventType = "Confirmed";
      }

      const updatedObs: IdentityObservation = {
        ...oldObs,
        value: obs.value,
        confidence: nextConfidence,
        supportingStoryIds: mergedStoryIds,
        supportingMemoryIds: mergedMemoryIds,
        provenance: `${oldObs.provenance} | ${obs.provenance}`,
        confidenceHistory: [
          ...oldObs.confidenceHistory,
          {
            confidence: nextConfidence,
            timestamp: new Date().toISOString(),
            reason: mergeReason,
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      observationCache[idx] = updatedObs;
      this.notify(eventType, updatedObs);
      return updatedObs;
    } else {
      const isHypConfirm = obs.provenance.includes("Promoted from confirmed onboarding");
      const eventType = isHypConfirm ? "Confirmed" : "Updated";

      const newObs: IdentityObservation = {
        id: uid,
        ...obs,
        confidenceHistory: [
          {
            confidence: obs.confidence,
            timestamp: new Date().toISOString(),
            reason: `Initial observation: ${obs.provenance}`,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      observationCache.push(newObs);
      this.notify(eventType, newObs);
      return newObs;
    }
  },

  /**
   * Dispatch updates to subscribers.
   */
  notify(type: "Updated" | "Confirmed" | "Refined", observation: IdentityObservation): void {
    listeners.forEach((listener) => {
      try {
        listener({ type, observation });
      } catch (err) {
        console.error("Error executing identity listener callback:", err);
      }
    });
  },
};
