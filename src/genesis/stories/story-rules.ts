import { Memory } from "../validation/types";
import { MemoryRelationship } from "../memory/relationships/types";
import { Story } from "./types";
import { storyService } from "./story-service";
import {
  PROJECT_ARC_TITLE_PREFIX,
  REFLECTIONS_ARC_TITLE,
  StoryKind,
  isProjectArc,
  isReflectionsArc,
} from "./story-identity";

export interface StoryRule {
  name: string;
  evaluateMemory(
    memory: Memory,
    existingStories: Story[],
  ): {
    shouldCluster: boolean;
    storyId?: string;
    newStoryData?: {
      title: string;
      summary: string;
      kind?: StoryKind;
      relatedProjectId?: string | null;
    };
  };
  evaluateRelationship(
    relationship: MemoryRelationship,
    existingStories: Story[],
  ): {
    shouldCluster: boolean;
    storyId?: string;
  };
}

export const storyRules: StoryRule[] = [
  {
    name: "Project Clustering Rule",
    evaluateMemory(memory, existingStories) {
      if (memory.relatedProjectId) {
        // Matched on the id the story carries, not on the sentence it was
        // written into.
        //
        // This was a substring test against a longer sentence, standing in for
        // an equality between two ids that were both in hand. It is the hotter
        // of the two round-trips through prose: this runs for every memory
        // belonging to a project, where the understanding-graph one runs once
        // per story per rebuild.
        //
        // The summary test is kept as a fallback for a story carrying no
        // `relatedProjectId`, which today means one built by a rule registered
        // through `registerStoryRule`. It is second, so a story that carries
        // the id is never decided by its prose.
        const targetStory = existingStories.find((story) => {
          if (!isProjectArc(story)) return false;
          if (story.relatedProjectId) return story.relatedProjectId === memory.relatedProjectId;
          return story.summary.includes(`ID: ${memory.relatedProjectId}`);
        });

        if (targetStory) {
          return { shouldCluster: true, storyId: targetStory.id };
        } else {
          return {
            shouldCluster: true,
            newStoryData: {
              title: `${PROJECT_ARC_TITLE_PREFIX} ${memory.title.split(":")[0]}`,
              summary: `Evolving narrative tracking milestones, tasks, and reflections for Project ID: ${memory.relatedProjectId}.`,
              kind: "Project",
              // The same id the summary names. The sentence stays because it is
              // shown to people; this is what code reads.
              relatedProjectId: memory.relatedProjectId,
            },
          };
        }
      }
      return { shouldCluster: false };
    },
    evaluateRelationship(relationship, existingStories) {
      // Iteration stays over the caller's list so the answer is still "the
      // first of these stories holding either end". Only the membership test
      // changed: at 500 memories this ran twice for each of ~499 detected
      // relationships against a 200-member array, ~200,000 element comparisons
      // for a single completed task.
      for (const story of existingStories) {
        if (
          storyService.storyContainsMemory(story.id, relationship.sourceMemoryId) ||
          storyService.storyContainsMemory(story.id, relationship.targetMemoryId)
        ) {
          return { shouldCluster: true, storyId: story.id };
        }
      }
      return { shouldCluster: false };
    },
  },
  {
    name: "Reflection Worthy Cluster Rule",
    evaluateMemory(memory, existingStories) {
      if (memory.reason === "Reflection Worthy") {
        const reflectionStory = existingStories.find(isReflectionsArc);
        if (reflectionStory) {
          return { shouldCluster: true, storyId: reflectionStory.id };
        } else {
          return {
            shouldCluster: true,
            newStoryData: {
              title: REFLECTIONS_ARC_TITLE,
              summary:
                "A consolidated narrative clustering captured thoughts, ideas, and self-reflections.",
              kind: "Reflections",
            },
          };
        }
      }
      return { shouldCluster: false };
    },
    evaluateRelationship() {
      return { shouldCluster: false };
    },
  },
];

export function registerStoryRule(rule: StoryRule) {
  storyRules.unshift(rule);
}
