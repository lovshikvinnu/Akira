export type UnderstandingCategory =
  "Goal" | "Project" | "Knowledge" | "Habit" | "Relationship" | "Preference" | "Interest" | "Value";

export type UnderstandingStatus = "Active" | "Completed" | "Archived";

export type UnderstandingConfidence = "High" | "Medium" | "Low" | number;

export type Understanding = {
  id: string;
  canonicalKey: string;
  /**
   * A human-readable name for the subject, when the key is an identifier.
   *
   * `serializeUnderstanding` used to derive its display name from
   * `canonicalKey.split(":")[1]`, which is right only when the key happens to be
   * words. `project:<uuid>` is a correct key -- it is stable across renames and
   * aggregates every memory about one project -- but rendering it produced
   * "The user is actively building 95880953 4989 45db 8a3f Ff18d611964a",
   * the title-caser having split the uuid on its dashes into pseudo-words.
   *
   * The key identifies; the label displays. Rules that key on words can leave
   * this undefined and the serializer falls back to the old derivation, so a
   * rule only sets it when the key is not meant to be read.
   */
  label?: string;

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
  /** See {@link Understanding.label}. */
  label?: string;
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
