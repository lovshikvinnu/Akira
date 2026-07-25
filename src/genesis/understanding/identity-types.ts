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

export type IdentityObservation = {
  id: string;
  category: IdentityCategory;
  name: string;
  value: string;
  confidence: number; // Range 0.0 to 1.0
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
