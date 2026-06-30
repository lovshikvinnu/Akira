import { IdentityHypothesis, IdentityCategory, HypothesisStatus } from "./types";

const hypothesisCache: IdentityHypothesis[] = [];

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const hypothesesService = {
  /**
   * Get all active and processed onboarding hypotheses.
   */
  getHypotheses(): IdentityHypothesis[] {
    return hypothesisCache;
  },

  /**
   * Clear hypotheses cache.
   */
  clearHistory(): void {
    hypothesisCache.length = 0;
  },

  /**
   * Create a new proposed onboarding hypothesis.
   */
  proposeHypothesis(
    category: IdentityCategory,
    name: string,
    description: string,
  ): IdentityHypothesis {
    const hyp: IdentityHypothesis = {
      id: uid(),
      category,
      name,
      description,
      status: "Proposed",
      evidenceStoryIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    hypothesisCache.push(hyp);
    return hyp;
  },

  /**
   * Transition the status of an onboarding hypothesis.
   */
  updateHypothesisStatus(
    id: string,
    status: HypothesisStatus,
    evidenceStoryId?: string,
  ): IdentityHypothesis | null {
    const hyp = hypothesisCache.find((h) => h.id === id);
    if (!hyp) return null;

    const evidenceStoryIds = [...hyp.evidenceStoryIds];
    if (evidenceStoryId && !evidenceStoryIds.includes(evidenceStoryId)) {
      evidenceStoryIds.push(evidenceStoryId);
    }

    const updated = {
      ...hyp,
      status,
      evidenceStoryIds,
      updatedAt: new Date().toISOString(),
    };

    const idx = hypothesisCache.findIndex((h) => h.id === id);
    hypothesisCache[idx] = updated;
    return updated;
  },
};
