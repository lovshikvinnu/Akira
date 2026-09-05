import { StoryKind } from "./story-identity";

export type StoryStatus = "Active" | "Completed" | "Archived";

export type Story = {
  id: string;
  title: string;
  /**
   * Which narrative arc this is, independent of how its title reads.
   *
   * Optional because `registerStoryRule` is public and `newStoryData.kind` is
   * optional, so an externally registered rule can produce a story without one.
   * `isReflectionsArc` / `isProjectArc` in `story-identity` are the only things
   * that should read it, and they handle the absence.
   */
  kind?: StoryKind;
  /**
   * The project this arc tracks, when it tracks one.
   *
   * The id was always in hand at creation -- `story-rules` reads it off the
   * originating memory -- and was written into `summary` prose and read back
   * out with a regex by two separate consumers. This is the same value, kept.
   *
   * Optional for the same reason as `kind`, and null on an arc that is not
   * about a project. Read it rather than the summary; the summary is a sentence
   * for a person.
   */
  relatedProjectId?: string | null;
  summary: string;
  status: StoryStatus;
  relatedMemoryIds: string[];
  ruleProvenance: string;
  createdAt: string;
  updatedAt: string;
};
