import { StoryKind } from "./story-identity";

export type StoryStatus = "Active" | "Completed" | "Archived";

export type Story = {
  id: string;
  title: string;
  /**
   * Which narrative arc this is, independent of how its title reads.
   *
   * Optional because a story persisted before this field existed has no value
   * to restore. `isReflectionsArc` / `isProjectArc` in `story-identity` are the
   * only things that should read it, and they handle the absence.
   */
  kind?: StoryKind;
  summary: string;
  status: StoryStatus;
  relatedMemoryIds: string[];
  ruleProvenance: string;
  createdAt: string;
  updatedAt: string;
};
