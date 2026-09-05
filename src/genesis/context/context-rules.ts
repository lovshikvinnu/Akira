import { RecallCandidate } from "../recall/types";
import { getRetentionPolicy } from "../retention/policy";
import { Story } from "../stories/types";
import { IdentityObservation } from "../understanding/identity-types";
import { hypothesesService } from "../understanding/hypotheses";
import { ContextItem } from "./types";
import {
  PROJECT_ARC_TITLE_PREFIX,
  isProjectArc,
  projectArcTitleRemainder,
} from "../stories/story-identity";

/**
 * The active candidates the prompt can afford, strongest first.
 *
 * `recallCache` is built by walking `memoryService.getMemories()` in insertion
 * order, so taking the head of it took the OLDEST active candidates. At the
 * retention ceiling that is a hard rule with an unpleasant consequence: a
 * memory created today is candidate ~500, and no score it earns can move it
 * into a twelve-slot budget filled by whatever happened to be recorded first.
 * Recall could decide a thought mattered and the decision could not reach the
 * prompt.
 *
 * Ranking is the whole change. The bound, the budget and which candidates are
 * eligible are all untouched -- this decides which twelve of them get spent,
 * using the score recall already computed instead of using array position.
 *
 * `sort` is stable, so candidates that genuinely tie keep insertion order and
 * the previous behaviour survives wherever there was nothing to rank by.
 */
function rankedActive(candidates: RecallCandidate[], limit: number): RecallCandidate[] {
  return candidates
    .filter((c) => c.status === "Active")
    .slice()
    .sort((a, b) => b.recallScore - a.recallScore)
    .slice(0, limit);
}

export const contextRules = {
  /**
   * Filter out inactive recall candidates to reduce prompt window noise.
   */
  filterActiveRecallCandidates(candidates: RecallCandidate[]): ContextItem<RecallCandidate>[] {
    // Capped independently of memory retention: what GENESIS may reason over
    // and what is worth spending prompt tokens on are different budgets.
    return rankedActive(candidates, getRetentionPolicy().context.maxRecallCandidates)
      .map((c) => {
        let reason = "Recent Recall";
        if (c.recallReasons.some((r) => r.toLowerCase().includes("user intent"))) {
          reason = "User Intent";
        } else if (c.recallReasons.some((r) => r.toLowerCase().includes("milestone"))) {
          reason = "High Importance";
        }
        return {
          data: c,
          inclusionReason: reason,
        };
      });
  },

  /**
   * Keep only active in-progress story arcs.
   */
  filterActiveStories(stories: Story[]): ContextItem<Story>[] {
    // Most recently touched arcs first: an arc that has not moved in weeks is
    // the least useful thing to spend prompt space on.
    return stories
      .filter((s) => s.status === "Active")
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, getRetentionPolicy().context.maxStories)
      .map((s) => ({
        data: s,
        inclusionReason: "Active Story",
      }));
  },

  /**
   * Prioritize emergent traits and values with high confidence scores.
   */
  filterIdentityObservations(
    observations: IdentityObservation[],
  ): ContextItem<IdentityObservation>[] {
    return observations
      .filter((o) => o.confidence >= 0.5)
      .slice()
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, getRetentionPolicy().context.maxIdentityObservations)
      .map((o) => ({
        data: o,
        inclusionReason: "Identity Evidence",
      }));
  },

  /**
   * Extract current aspirations and project objectives.
   */
  extractGoals(stories: Story[]): ContextItem<string>[] {
    const goals: string[] = [];

    // 1. Extract goals from active project narratives
    stories
      .filter((s) => s.status === "Active" && isProjectArc(s))
      .forEach((s) => {
        goals.push(`Complete ${PROJECT_ARC_TITLE_PREFIX} ${projectArcTitleRemainder(s)}`);
      });

    // 2. Extract goals from proposed/confirmed onboarding aspirations
    const hypotheses = hypothesesService.getHypotheses();
    hypotheses
      .filter(
        (h) => h.category === "Aspiration" && (h.status === "Proposed" || h.status === "Confirmed"),
      )
      .forEach((h) => {
        goals.push(`${h.name} (${h.description})`);
      });

    return Array.from(new Set(goals))
      .map((g) => ({
        data: g,
        inclusionReason: "User Intent",
      }))
      .slice(0, getRetentionPolicy().context.maxGoals);
  },

  /**
   * Extract active learning, work, and communication preferences.
   */
  extractUserPreferences(observations: IdentityObservation[]): ContextItem<string>[] {
    const prefs: string[] = [];

    observations
      .filter(
        (o) =>
          (o.category === "LearningStyle" || o.category === "WorkStyle") && o.confidence >= 0.5,
      )
      .forEach((o) => {
        prefs.push(`${o.name}: ${o.value}`);
      });

    const hypotheses = hypothesesService.getHypotheses();
    hypotheses
      .filter(
        (h) =>
          (h.category === "LearningStyle" ||
            h.category === "WorkStyle" ||
            h.category === "Value") &&
          (h.status === "Proposed" || h.status === "Confirmed"),
      )
      .forEach((h) => {
        prefs.push(`${h.category} hypothesis: ${h.name} - ${h.description}`);
      });

    return Array.from(new Set(prefs)).map((p) => ({
      data: p,
      inclusionReason: "Identity Evidence",
    }));
  },

  /**
   * Compile core constraints and ethical values.
   */
  extractConstraints(observations: IdentityObservation[]): ContextItem<string>[] {
    const constraints: string[] = [];
    observations
      .filter((o) => o.category === "Value" && o.confidence >= 0.7)
      .forEach((o) => {
        constraints.push(`User value constraint: Align interactions with ${o.name} (${o.value})`);
      });
    return constraints.map((c) => ({
      data: c,
      inclusionReason: "Identity Evidence",
    }));
  },

  /**
   * Generate human-readable recent activity logs from recalled memory tags.
   */
  compileRecentActivity(candidates: RecallCandidate[]): string[] {
    // Same ranking as the candidate list above, and for the same reason: this
    // is the second place a twelve-item budget was spent on whatever came
    // first. The two lists are drawn from one pool and should not disagree
    // about which of it matters.
    return rankedActive(candidates, getRetentionPolicy().context.maxRecentActivity).map((c) => {
      return `Recall active memory node (${c.memoryId}) because: ${c.recallReasons.join(" | ")}`;
    });
  },
};
