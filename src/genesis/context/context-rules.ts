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
 * Why this memory is in the prompt, in the two words the model sees.
 *
 * Read off the candidate's typed importance signals. It used to be read off
 * the recall reasons -- prose the rules assemble for a human -- by searching
 * them for the substrings "user intent" and "milestone". Neither string occurs
 * in either reason a rule produces: one is `Associated with active narrative:
 * "<title>"` and the other is `Multi-factor recall [Context: ... | Category:
 * ... | Intent: 0.8 | ...]`, which spells the signal `Intent` and its strength
 * rather than its name. So both branches were unreachable and every recalled
 * memory reached the prompt labelled "Recent Recall", including a note the
 * user had just typed.
 *
 * The signals were on the candidate the whole time, as a typed union. This
 * reads them instead, which makes the labels the branches were written to
 * produce actually appear. The precedence is theirs, unchanged: explicit user
 * intent outranks a milestone, and anything else is recent recall.
 */
function inclusionReasonFor(candidate: RecallCandidate): string {
  for (const signal of candidate.importanceSignals) {
    if (signal.type === "User Intent") return "User Intent";
  }
  for (const signal of candidate.importanceSignals) {
    if (signal.type === "Milestone") return "High Importance";
  }
  return "Recent Recall";
}

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
 * Score decides, with one reservation. `maxAuthoredRecallCandidates` of the
 * budget is held for memories the user wrote, and is a floor rather than a
 * cap: authored candidates that rank on merit are selected by score like
 * anything else, and the reservation only tops up when fewer than that many
 * made it. Set the policy value to 0 and this is pure ranking.
 *
 * The reservation exists because scores go degenerate, which ranking alone
 * cannot fix. Measured at the retention ceiling on a task-dominated history:
 * 500 completed-task memories all score 0.85, because stability 1.0 and a
 * saturated relationship signal are the same for every one of them, and a
 * freshly captured note scores 0.70. Sorting is correct and still spends the
 * entire budget on copies of one fact. What distinguishes the note is not that
 * it scores higher -- it does not -- but that it is unique by construction.
 *
 * `sort` is stable throughout, so candidates that genuinely tie keep insertion
 * order and nothing reshuffles between rebuilds for no reason.
 */
function rankedActive(candidates: RecallCandidate[], limit: number): RecallCandidate[] {
  const byScore = candidates
    .filter((c) => c.status === "Active")
    .slice()
    .sort((a, b) => b.recallScore - a.recallScore);

  const reserved = Math.min(getRetentionPolicy().context.maxAuthoredRecallCandidates, limit);

  const chosen: RecallCandidate[] = [];
  const taken = new Set<string>();

  // The reserved slots, strongest authored first. Fewer are used when there
  // are fewer authored candidates than the reservation allows for; none are
  // used when the user has written nothing.
  for (const candidate of byScore) {
    if (chosen.length >= reserved) break;
    if (!candidate.userAuthored) continue;
    chosen.push(candidate);
    taken.add(candidate.memoryId);
  }

  // The rest of the budget by score, authored or not.
  for (const candidate of byScore) {
    if (chosen.length >= limit) break;
    if (taken.has(candidate.memoryId)) continue;
    chosen.push(candidate);
    taken.add(candidate.memoryId);
  }

  // Presented in score order regardless of which pass selected them, so the
  // reservation changes which candidates are spent and never implies a ranking
  // the scores do not support.
  return chosen.sort((a, b) => b.recallScore - a.recallScore);
}

export const contextRules = {
  /**
   * Filter out inactive recall candidates to reduce prompt window noise.
   */
  filterActiveRecallCandidates(candidates: RecallCandidate[]): ContextItem<RecallCandidate>[] {
    // Capped independently of memory retention: what GENESIS may reason over
    // and what is worth spending prompt tokens on are different budgets.
    return rankedActive(candidates, getRetentionPolicy().context.maxRecallCandidates).map((c) => ({
      data: c,
      inclusionReason: inclusionReasonFor(c),
    }));
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
