import { storyService } from "../stories/story-service";
import { Story } from "../stories/types";
import { identityService } from "./identity-service";
import { identityRules } from "./identity-rules";
import { hypothesesService } from "./hypotheses";
import { memoryService } from "../memory/validation/memory-service";

let storySub: (() => void) | null = null;
let clearSub: (() => void) | null = null;

export const identityBuilder = {
  /**
   * Subscribe only to Story events to drive identity emergence.
   */
  initialize(): void {
    if (!storySub) {
      storySub = storyService.subscribe((event) => {
        this.processStoryEvent(event.story);
      });
    }

    if (!clearSub) {
      clearSub = memoryService.subscribeClear(() => {
        identityService.clearHistory();
        hypothesesService.clearHistory();
      });
    }
  },

  /**
   * Dispose story listener.
   */
  dispose(): void {
    if (storySub) {
      storySub();
      storySub = null;
    }
    if (clearSub) {
      clearSub();
      clearSub = null;
    }
  },

  /**
   * Evaluate a story and apply rules to generate identity observations or confirm hypotheses.
   */
  processStoryEvent(story: Story): void {
    for (const rule of identityRules) {
      const result = rule.evaluateStory(story);

      if (result.detected && result.category && result.observationName && result.value) {
        identityService.addObservation({
          category: result.category,
          name: result.observationName,
          value: result.value,
          confidence: result.confidence ?? 0.5,
          supportingStoryIds: [story.id],
          supportingMemoryIds: story.relatedMemoryIds,
          provenance:
            result.provenance || `Inferred via rule "${rule.name}" from Story: ${story.title}`,
        });
      }

      if (result.hypothesisTrigger) {
        const hypotheses = hypothesesService.getHypotheses();
        const hyp = hypotheses.find(
          (h) => h.name === result.hypothesisTrigger?.targetHypothesisName,
        );
        if (hyp) {
          const nextStatus = result.hypothesisTrigger.confirm ? "Confirmed" : "Rejected";
          hypothesesService.updateHypothesisStatus(hyp.id, nextStatus, story.id);

          if (nextStatus === "Confirmed") {
            identityService.addObservation({
              category: hyp.category,
              name: hyp.name,
              value: "Achieved",
              confidence: 1.0,
              supportingStoryIds: [story.id],
              supportingMemoryIds: story.relatedMemoryIds,
              provenance: `Promoted from confirmed onboarding hypothesis: "${hyp.description}"`,
            });
          }
        }
      }
    }
  },
};

// Automatic integration: initialize on load
identityBuilder.initialize();
