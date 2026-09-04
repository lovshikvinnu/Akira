import { storyService } from "../stories/story-service";
import { Story } from "../stories/types";
import { identityService } from "./identity-service";
import { identityRules } from "./identity-rules";
import { hypothesesService } from "./hypotheses";
import { memoryService } from "../memory/memory-service";
import { isBatching, markDirty, registerFlusher, unregisterFlusher } from "../batch";

let storySub: (() => void) | null = null;
let clearSub: (() => void) | null = null;

/**
 * Stories whose identity implications are still outstanding in the open
 * transaction. Keyed by id because a story is replaced by a new object on every
 * update, so object identity would coalesce nothing.
 */
const dirtyStoryIds = new Set<string>();

export const identityBuilder = {
  /**
   * Subscribe only to Story events to drive identity emergence.
   */
  initialize(): void {
    registerFlusher("identity", () => {
      this.flushDirtyStories();
    });

    if (!storySub) {
      storySub = storyService.subscribe((event) => {
        // Identity can be coalesced now that confidence is derived from the
        // evidence a rule sees rather than from how often this ran. Every
        // observation field is order-independent: story and memory ids merge as
        // sets, and confidence is a pure function of the settled story. One
        // evaluation at the end of the transaction therefore produces exactly
        // what the last of many would have produced.
        if (isBatching()) {
          dirtyStoryIds.add(event.story.id);
          markDirty("identity");
          return;
        }
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
    unregisterFlusher("identity");
    dirtyStoryIds.clear();
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
   * Evaluates every story touched during the transaction, once each.
   *
   * A story retention removed mid-transaction is skipped: inferring a trait
   * from an arc that no longer exists would attach evidence to nothing.
   */
  flushDirtyStories(): void {
    if (dirtyStoryIds.size === 0) return;

    const ids = [...dirtyStoryIds];
    dirtyStoryIds.clear();

    const stories = storyService.getStories();
    for (const id of ids) {
      const story = stories.find((s) => s.id === id);
      if (story) this.processStoryEvent(story);
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
