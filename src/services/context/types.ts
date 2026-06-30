import { RecallCandidate } from "../recall/types";
import { Story } from "../stories/types";
import { IdentityObservation } from "../identity/types";

export type ContextItem<T> = {
  data: T;
  inclusionReason: string;
};

export type ContextPackage = {
  contextSessionId: string;
  activeCandidates: ContextItem<RecallCandidate>[];
  activeStories: ContextItem<Story>[];
  identityObservations: ContextItem<IdentityObservation>[];
  currentGoals: ContextItem<string>[];
  userPreferences: ContextItem<string>[];
  importantConstraints: ContextItem<string>[];
  recentActivitySummary: string[];
  createdAt: string;
};
