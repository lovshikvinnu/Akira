export type UnderstandingCategory =
  "Goal" | "Project" | "Knowledge" | "Habit" | "Relationship" | "Preference";

export type UnderstandingStatus = "Active" | "Completed" | "Archived";

export type UnderstandingConfidence = "High" | "Medium" | "Low" | number;

export type Understanding = {
  id: string;
  canonicalKey: string;
  category: UnderstandingCategory;
  confidence: UnderstandingConfidence;
  status: UnderstandingStatus;
  supportingMemoryIds: string[];
  supportingStoryIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type UnderstandingFragment = {
  canonicalKey: string;
  category: UnderstandingCategory;
  confidence: UnderstandingConfidence;
  status: UnderstandingStatus;
  supportingMemoryIds: string[];
  supportingStoryIds: string[];
};

export interface UnderstandingRule {
  name: string;
  evaluate(
    memories: import("../validation/types").Memory[],
    stories: import("../stories/types").Story[],
  ): UnderstandingFragment[];
}
