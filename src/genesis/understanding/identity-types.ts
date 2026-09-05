export type IdentityCategory =
  | "Trait"
  | "Value"
  | "Strength"
  | "Growth"
  | "LearningStyle"
  | "WorkStyle"
  | "Aspiration"
  | "Interest"
  | "Preference"
  | "Habit";

/**
 * How AKIRA came to hold an observation, which is not how strongly it holds it.
 *
 * "Declared" means the user said so. "Inferred" means GENESIS concluded it from
 * activity. The two are different kinds of claim and the prompt has to be able
 * to tell them apart without reading `provenance`, which is prose assembled for
 * a human -- `inclusionReasonFor` in `context-rules` documents what happens when
 * code decides something by searching prose for a substring.
 */
export type ObservationBasis = "Declared" | "Inferred";

export type IdentityObservation = {
  id: string;
  category: IdentityCategory;
  name: string;
  value: string;
  /**
   * Source certainty: how sure AKIRA is that this came from where it says.
   *
   * Not belief strength. A declaration is written at 1.0 because the user
   * definitely said it, and that is *all* 1.0 asserts here -- it carries no
   * claim that the goal is still live, pursued, or true of them. How strongly
   * the evidence supports the claim itself is the identity graph's
   * `IdentityConfidence`, computed from evidence count, recency and
   * contradictions, and read at the prompt boundary rather than copied here.
   *
   * The two must stay separate because this field also gates retention:
   * `filterIdentityObservations` drops anything under 0.5, so storing belief
   * strength here would delete a genuine declaration from the prompt as soon as
   * it aged -- losing what the user actually said, which is the one thing that
   * is not in doubt.
   */
  confidence: number; // Range 0.0 to 1.0
  /** See {@link ObservationBasis}. Defaults to "Inferred". */
  basis: ObservationBasis;
  supportingStoryIds: string[];
  supportingMemoryIds: string[];
  provenance: string;
  confidenceHistory: { confidence: number; timestamp: string; reason: string }[];
  createdAt: string;
  updatedAt: string;
};

export type HypothesisStatus = "Proposed" | "Confirmed" | "Refined" | "Rejected";

export type IdentityHypothesis = {
  id: string;
  category: IdentityCategory;
  name: string;
  description: string;
  status: HypothesisStatus;
  evidenceStoryIds: string[];
  createdAt: string;
  updatedAt: string;
};
