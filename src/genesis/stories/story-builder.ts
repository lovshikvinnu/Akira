import { memoryService } from "../memory/memory-service";
import { relationshipService } from "../memory/relationships/relationship-service";
import { storyService } from "./story-service";
import { storyRules } from "./story-rules";
import { Memory } from "../validation/types";
import { MemoryRelationship } from "../memory/relationships/types";

let memorySub: (() => void) | null = null;
let relationshipSub: (() => void) | null = null;
let clearSub: (() => void) | null = null;

export const storyBuilder = {
  /**
   * Initialize subscriptions to memory promotions and relationship detections.
   */
  initialize(): void {
    if (!memorySub) {
      memorySub = memoryService.subscribe((memory) => {
        this.processNewMemory(memory);
      });
    }

    if (!relationshipSub) {
      relationshipSub = relationshipService.subscribe((relationship) => {
        this.processNewRelationship(relationship);
      });
    }

    if (!clearSub) {
      clearSub = memoryService.subscribeClear(() => {
        storyService.clearHistory();
      });
    }
  },

  /**
   * Dispose subscriptions.
   */
  dispose(): void {
    if (memorySub) {
      memorySub();
      memorySub = null;
    }
    if (relationshipSub) {
      relationshipSub();
      relationshipSub = null;
    }
    if (clearSub) {
      clearSub();
      clearSub = null;
    }
  },

  /**
   * Process a newly promoted memory node and associate it with an existing or new story.
   */
  processNewMemory(memory: Memory): void {
    const stories = storyService.getStories();
    for (const rule of storyRules) {
      const result = rule.evaluateMemory(memory, stories);
      if (result.shouldCluster) {
        if (result.storyId) {
          storyService.addMemoryToStory(result.storyId, memory.id);
        } else if (result.newStoryData) {
          const newStory = storyService.createStory({
            title: result.newStoryData.title,
            summary: result.newStoryData.summary,
            status: "Active",
            ruleProvenance: rule.name,
          });
          storyService.addMemoryToStory(newStory.id, memory.id);
        }
        break; // Cluster under the first matching rule
      }
    }
  },

  /**
   * Process a newly inferred memory relationship and link it to the relevant story.
   */
  processNewRelationship(relationship: MemoryRelationship): void {
    const stories = storyService.getStories();
    for (const rule of storyRules) {
      const result = rule.evaluateRelationship(relationship, stories);
      if (result.shouldCluster && result.storyId) {
        storyService.addRelationshipToStory(result.storyId, relationship.id);
        break; // Associate under the first matching rule
      }
    }
  },
};

// Activation is owned by src/genesis/composition.ts, which the production
// entry point composes explicitly. This module previously initialised itself
// on import — and nothing in the application imported it, so `storyBuilder`
// never ran outside its own tests.
