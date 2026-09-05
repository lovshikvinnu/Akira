import { RecallCandidate } from "../recall/types";
import { getRetentionPolicy } from "../retention/policy";
import { Story } from "../stories/types";
import { IdentityObservation } from "../understanding/identity-types";
import { hypothesesService } from "../understanding/hypotheses";
import { identityService } from "../identity";
import { identityConfidenceService } from "../identity";
import { IdentityGoal } from "../identity/types";
import { ContextItem } from "./types";
import { MULTI_FACTOR_RECALL_PREFIX } from "../recall/recall-rules";
import {
  PROJECT_ARC_TITLE_PREFIX,
  isProjectArc,
  projectArcProjectName,
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
/**
 * What the prompt is told about where an observation came from, and how well
 * supported it is -- as two statements rather than one number.
 *
 * The line used to read `- become a pilot: Active (Confidence: 1)`.
 * `PersonalDeclarationRule` writes every declaration-derived observation at
 * exactly 1.0, so for anything the user ever said out loud the model was handed
 * maximum confidence with no indication of what that confidence was *about*.
 * Measured on a single note written once, a year ago, with no work attached:
 *
 *     identity graph (unread)   score 0.175  level "Weak"
 *     prompt (read)             "(Confidence: 1)"
 *
 * Both are correct about different things. AKIRA is certain the sentence was
 * typed; the evidence that it describes a live commitment is weak. Collapsing
 * those into one number is what let the prompt overclaim.
 *
 * So the reason string carries both:
 *
 *   Declared   the user said it. Certain, and said so plainly, because that is
 *              the part not in doubt. The evidence level is appended from the
 *              identity graph, which is the only thing in GENESIS that computes
 *              belief strength -- no second scorer is introduced here.
 *   Inferred   GENESIS concluded it. There is no separate source certainty to
 *              report, so `confidence` is what it has always been for these.
 *
 * The graph is read rather than recomputed: `addEvidence` refreshes the cached
 * score whenever evidence changes, and recomputing here would call `Date.now()`
 * once per observation per prompt, making the text a function of wall-clock.
 * A node with no cached score yet contributes nothing rather than a guess.
 */
export function identityInclusionReason(observation: IdentityObservation): string {
  if (observation.basis !== "Declared") {
    return `Inferred from activity (confidence ${observation.confidence.toFixed(2)})`;
  }

  const node = identityService
    .getIdentityNodes()
    .find((n) => (n.value ?? "").toLowerCase() === observation.name.toLowerCase());
  const level = node ? identityConfidenceService.getConfidence(node.id)?.level : undefined;

  return level
    ? `Stated explicitly by the user; supporting evidence so far: ${level}`
    : "Stated explicitly by the user";
}

/** A project arc the user has open. Work is happening. */
export const ACTIVE_PROJECT_REASON = "Active project";

/**
 * Something the user said they wanted.
 *
 * Deliberately not "goal". The user mentioning an aspiration is not evidence
 * that they are pursuing it, and nothing downstream should read this label as
 * progress or as an achievement.
 */
export const STATED_ASPIRATION_REASON = "Stated aspiration";

/**
 * The aspirations the user has actually declared, newest first.
 *
 * `PersonalDeclarationRule` creates one `IdentityGoal` per parsed declaration.
 * They are all stored with `status: "Active"` and `priority: "High"` by
 * `IdentityGoalService.createGoal`, which is why neither field is filtered on
 * here: every record would pass, and a filter that admits everything reads as
 * a safeguard without being one. The distinction this function exists to
 * preserve is carried by the label, not by a status nothing sets.
 */
function statedAspirations(): IdentityGoal[] {
  const identity = identityService.getIdentity();
  if (!identity) return [];
  // Reversed before sorting, not after. `lastUpdated` is an ISO string at
  // millisecond precision and declarations parsed from one batch of notes
  // routinely share a timestamp, which makes the comparator return 0 and
  // leaves the order to whatever the input was. `sort` is stable, so
  // reversing first means a tie falls back to newest-inserted rather than to
  // an arbitrary survivor of the `maxGoals` cap.
  return [...identityService.getGoals(identity.id)]
    .reverse()
    .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
}

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
    // Confidence first, then recency -- because confidence alone does not
    // order these.
    //
    // Every declaration-derived observation is written at exactly 1.0
    // (`PersonalDeclarationRule`), and the two computed traits saturate to 1.0
    // after five reflections and twelve work memories respectively. Measured on
    // sixteen ordinary declarations: fourteen observations, *all* at 1.0. So
    // `b.confidence - a.confidence` returns 0 for every pair and the sort
    // degenerates into the array's own order, which is `observationCache` in
    // insertion order, oldest first.
    //
    // With `maxIdentityObservations` at 12 the tail is then cut off by age:
    // "I am interested in starting my own company" was dropped in favour of
    // "I enjoy cooking Thai food" declared earlier. Not a tie-break detail --
    // it means the longer someone uses AKIRA, the less likely anything they
    // newly declare ever reaches the prompt.
    //
    // `updatedAt` rather than `createdAt`, so re-stating a belief renews it:
    // upsert refreshes that field while keeping the cache position. The index
    // is the final discriminator because two observations written in the same
    // millisecond would otherwise fall back to insertion order and reinstate
    // the original bug in miniature.
    //
    // This deliberately does not touch what confidence *means*. When two
    // observations differ in confidence the ordering is exactly as before;
    // this only decides the cases the old sort left to chance.
    const policy = getRetentionPolicy().context.maxIdentityObservations;
    return observations
      .filter((o) => o.confidence >= 0.5)
      .map((o, index) => ({ o, index }))
      .sort(
        (a, b) =>
          b.o.confidence - a.o.confidence ||
          Date.parse(b.o.updatedAt) - Date.parse(a.o.updatedAt) ||
          b.index - a.index,
      )
      .slice(0, policy)
      .map(({ o }) => ({
        data: o,
        inclusionReason: identityInclusionReason(o),
      }));
  },

  /**
   * What the user is working on, and what they have said they want.
   *
   * These are two different claims and the prompt now makes them separately.
   * `inclusionReason` is printed to the model as `- <goal> (Reason: <reason>)`,
   * so it is the channel that carries the distinction:
   *
   *   "Active project"      the user has an open project arc. Work is
   *                         happening; the arc exists because memories
   *                         clustered under a project id.
   *   "Stated aspiration"   the user said they wanted this. Nothing here
   *                         claims they are pursuing it, have made progress on
   *                         it, or have achieved it.
   *
   * Both were previously labelled "User Intent", which is why the second half
   * could not have been added without changing the first: with one label the
   * model cannot tell a project someone is actively working through from a
   * sentence they said once.
   *
   * WHY ASPIRATIONS ARE READ FROM IDENTITY AND NOT FROM HYPOTHESES
   * -------------------------------------------------------------
   * This used to read `Proposed`/`Confirmed` Aspiration hypotheses. That branch
   * never produced a goal in the life of the app: `proposeHypothesis` has no
   * callers, so `hypothesisCache` is empty for the whole process. Meanwhile the
   * thing it was reaching for -- the record that the user declared an
   * aspiration -- is created on every declaration by `PersonalDeclarationRule`
   * as an `IdentityGoal`, and was read by nothing at all. `getIdentitySummary`,
   * `getCurrentProfile` and `getActiveGoals` have no callers outside the
   * identity module, so "I want to become a pilot" was parsed, evidenced,
   * confidence-scored, and then never spoken of again.
   *
   * `IdentityGoal` is also the richer of the two records -- it carries a graph
   * node, evidence records and a confidence score, where `IdentityHypothesis`
   * carries a name and a status -- so routing both into this one channel would
   * be the duplicate projection rather than a second opinion. One source.
   *
   * ORDERING AND THE BUDGET
   * -----------------------
   * Projects first, then aspirations, then the cap. Active work outranks a
   * stated wish when the two compete for `maxGoals`. Aspirations are ordered
   * most-recently-updated first, because truncating the head of an
   * insertion-ordered list drops the newest thing the user said -- the same
   * oldest-first mistake `filterActiveRecallCandidates` above documents having
   * made once already.
   */
  extractGoals(stories: Story[]): ContextItem<string>[] {
    const items: ContextItem<string>[] = [];

    // 1. What the user is working on.
    stories
      .filter((s) => s.status === "Active" && isProjectArc(s))
      .forEach((s) => {
        // The project's name, not the arc's title. Every arc is titled
        // "Project Arc: Project Created", so building the goal from the title
        // gave every project the same string and the dedupe below collapsed
        // them into one -- two projects, one goal, naming neither.
        items.push({
          data: `Complete ${PROJECT_ARC_TITLE_PREFIX} ${projectArcProjectName(s)}`,
          inclusionReason: ACTIVE_PROJECT_REASON,
        });
      });

    // 2. What the user said they want.
    for (const aspiration of statedAspirations()) {
      items.push({ data: aspiration.title, inclusionReason: STATED_ASPIRATION_REASON });
    }

    const seen = new Set<string>();
    const deduped: ContextItem<string>[] = [];
    for (const item of items) {
      if (seen.has(item.data)) continue;
      seen.add(item.data);
      deduped.push(item);
    }
    return deduped.slice(0, getRetentionPolicy().context.maxGoals);
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
      // Only the reasons a reader would recognise as reasons.
      //
      // `recallReasons` mixes two kinds of string. One explains the memory in
      // terms the model can use -- `Associated with active narrative: "..."`.
      // The other is the ranking breakdown, and it reached the model verbatim
      // in a real system prompt:
      //
      //   Multi-factor recall [Context: QUERY | Score: 0.87 | Category: Goal
      //   | Stability: 1.0 | SemanticMatch: Yes | Recency: 1.0 | ...]
      //
      // Those are weights this code computed to decide what to recall. The
      // model cannot check them, cannot act on them, and reads them as if they
      // were facts about the user. A blacklist rather than a whitelist on
      // purpose: a recall rule added later is far likelier to write a sentence
      // than a metrics dump, so the default should be to show it.
      //
      // The candidate keeps every reason. This filters the copy built for the
      // prompt; `brain.tsx` still renders `recallReasons` in full.
      const readable = c.recallReasons.filter((r) => !r.startsWith(MULTI_FACTOR_RECALL_PREFIX));

      // The id stays: `prompt-builder` uses it to swap in the memory's text and
      // drops the entry when it cannot. It is a join key, never something the
      // model sees.
      return readable.length > 0
        ? `Recall active memory node (${c.memoryId}) because: ${readable.join(" | ")}`
        : `Recall active memory node (${c.memoryId})`;
    });
  },
};
