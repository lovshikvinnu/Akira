import { Memory } from "../validation/types";
import { MemoryRelationship } from "../memory/relationships/types";
import { Story } from "./types";

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
      for (const story of existingStories) {
        if (
          story.relatedMemoryIds.includes(relationship.sourceMemoryId) ||
          story.relatedMemoryIds.includes(relationship.targetMemoryId)
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
