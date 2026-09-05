import { IdentityObservation, ObservationBasis } from "./identity-types";
import { getRetentionPolicy, trimOldest } from "../retention/policy";

export type IdentityListener = (event: {
  type: "Updated" | "Confirmed" | "Refined";
  observation: IdentityObservation;
}) => void;
const listeners = new Set<IdentityListener>();

const observationCache: IdentityObservation[] = [];

/**
 * Keeps a bounded provenance trail rather than one string that grows forever.
 *
 * Provenance concatenated a segment on every reinforcement, so a trait touched
 * by a thousand story updates carried a thousand-segment string. The newest
 * segments are the ones that explain the current confidence, so the stale end
 * is what goes, and an ellipsis marks that something was dropped.
 */
function appendProvenance(previous: string, addition: string): string {
  const segments = previous
    .split(" | ")
    .filter((segment) => segment !== "…")
    .concat(addition);
  const limit = getRetentionPolicy().maxObservationHistory;
  if (segments.length <= limit) return segments.join(" | ");
  return ["…", ...segments.slice(segments.length - limit)].join(" | ");
}

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
    observation: Omit<
      IdentityObservation,
      "id" | "createdAt" | "updatedAt" | "confidenceHistory" | "basis"
    > & { basis?: ObservationBasis },
  ): IdentityObservation {
    const uid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

    const obs: Omit<IdentityObservation, "id" | "createdAt" | "updatedAt" | "confidenceHistory"> = {
      ...observation,
      // Inferred unless a producer says otherwise. Only `PersonalDeclarationRule`
      // is reporting something the user said; every other rule is concluding.
      basis: observation.basis ?? "Inferred",
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

      // Confidence is what the rule computed from the evidence it just saw --
      // `0.5 + members x 0.1` for the reflective trait, `0.4 + members x 0.05`
      // for the work-style one -- not a count of how often this method ran.
      //
      // The merge branch used to discard `obs.confidence` entirely and apply
      // `min(1, old + 0.1)` instead. Both expressions arrived in the same
      // commit, so this was never a deliberate model: the rules answered the
      // question and the merge site ignored the answer. The effect was that a
      // trait's confidence tracked the number of relationship detections in its
      // project -- quadratic in project size -- and every trait saturated to 1.0
      // inside its first user action, which left `filterIdentityObservations`
      // sorting a field of ties to decide what reached the prompt.
      //
      // Taking the rule's value makes confidence a pure function of the settled
      // story. That is what allows identity to be evaluated once per event
      // instead of once per relationship without changing the result, and it is
      // what makes the value identical on replay regardless of cadence.
      //
      // It is deliberately not a ratchet. If retention evicts memories from a
      // story, the rule sees less evidence and confidence falls to match --
      // confidence describes what is currently supported, not the high-water
      // mark of what once was.
      const nextConfidence = obs.confidence;
      const mergeReason = `Merged and reinforced with new evidence: ${obs.provenance}`;

      let eventType: "Updated" | "Confirmed" | "Refined" = "Updated";
      if (oldObs.value !== obs.value) {
        eventType = "Refined";
      }
      if (obs.provenance.includes("Promoted from confirmed onboarding")) {
        eventType = "Confirmed";
      }

      // The history is a record of confidence *changes*. Re-observing a story
      // whose evidence has not moved produces the same value, and appending a
      // duplicate entry for it would push genuine transitions out of a bounded
      // trail -- the trail would end up describing how often the trait was
      // re-evaluated rather than how its confidence developed.
      //
      // trimOldest mutates in place and returns what it removed, so the array
      // is built first and then bounded.
      const confidenceChanged = nextConfidence !== oldObs.confidence;
      const nextConfidenceHistory = confidenceChanged
        ? [
            ...oldObs.confidenceHistory,
            {
              confidence: nextConfidence,
              timestamp: new Date().toISOString(),
              reason: mergeReason,
            },
          ]
        : oldObs.confidenceHistory;
      trimOldest(nextConfidenceHistory, getRetentionPolicy().maxObservationHistory);

      const updatedObs: IdentityObservation = {
        ...oldObs,
        value: obs.value,
        // A declaration can only strengthen the basis. If the user has ever
        // stated this outright, a later inference about the same trait does not
        // demote it back to something AKIRA worked out on its own.
        basis: obs.basis === "Declared" ? "Declared" : oldObs.basis,
        confidence: nextConfidence,
        supportingStoryIds: mergedStoryIds,
        supportingMemoryIds: mergedMemoryIds,
        provenance: appendProvenance(oldObs.provenance, obs.provenance),
        confidenceHistory: nextConfidenceHistory,
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
