import { Memory } from "../validation/types";
import { MemoryRelationship } from "../memory/relationships/types";
import { Story } from "./types";
import { storyService } from "./story-service";

export interface StoryRule {
  name: string;
  evaluateMemory(
    memory: Memory,
    existingStories: Story[],
  ): {
    shouldCluster: boolean;
    storyId?: string;
    newStoryData?: { title: string; summary: string };
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
        const targetStory = existingStories.find(
          (story) =>
            story.title.startsWith("Project Arc:") &&
            story.summary.includes(`ID: ${memory.relatedProjectId}`),
        );

        if (targetStory) {
          return { shouldCluster: true, storyId: targetStory.id };
        } else {
          return {
            shouldCluster: true,
            newStoryData: {
              title: `Project Arc: ${memory.title.split(":")[0]}`,
              summary: `Evolving narrative tracking milestones, tasks, and reflections for Project ID: ${memory.relatedProjectId}.`,
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
        const reflectionStory = existingStories.find(
          (s) => s.title === "Personal Growth Reflections",
        );
        if (reflectionStory) {
          return { shouldCluster: true, storyId: reflectionStory.id };
        } else {
          return {
            shouldCluster: true,
            newStoryData: {
              title: "Personal Growth Reflections",
              summary:
                "A consolidated narrative clustering captured thoughts, ideas, and self-reflections.",
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
