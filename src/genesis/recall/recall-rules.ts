import { Memory } from "../validation/types";
import { MemoryImportance } from "../importance/types";
import { Story } from "../stories/types";
import { storyService } from "../stories/story-service";
import { REFLECTIONS_ARC_TITLE } from "../stories/story-identity";
import { getChat, getCompanionState } from "../../shared/genesis-provider";
import { RecallContext } from "./types";

/**
 * The part of a recall evaluation that is the same for every memory in one
 * rebuild.
 *
 * A rebuild asks each rule about every retained memory, and the multi-factor
 * rule opened by rebuilding the current discussion from scratch: the chat array
 * copied and reversed to find its last user message, the companion state read,
 * the pieces concatenated, and the result re-tokenised into query words and
 * stems. None of that reads the memory being judged, so at the retention
 * ceiling it was ~500 identical repetitions per rebuild -- measured at
 * 2.02-2.16 ms against 0.78 ms for the work that genuinely varies per memory.
 *
 * Computing it once per rebuild is safe rather than merely faster: a rebuild is
 * synchronous and writes to neither the chat nor the companion state, so no
 * memory in the pass can observe a different value than any other.
 *
 * Passed to `RecallRule.evaluate` as an optional argument, so a rule registered
 * from outside through {@link registerRecallRule} keeps its existing signature
 * and behaviour. A rule handed no context builds its own, which is what makes
 * the parameter an optimisation rather than a new obligation.
 */
export interface RecallEvaluationContext {
  /** The assembled discussion context, trimmed. Empty when there is none. */
  readonly discussion: string;
  /**
   * Stems for each significant query word, in query order.
   *
   * One entry per word that survived the stop-word filter, so its length is the
   * denominator the relevance fraction used to divide by.
   */
  readonly queryStems: readonly (readonly string[])[];
  /** The active project, with its name pre-lowercased for matching. */
  readonly activeProject: { readonly id: string; readonly nameLower: string } | null;
}

export interface RecallRule {
  name: string;
  evaluate(
    memory: Memory,
    importance: MemoryImportance | null,
    stories: Story[],
    context?: RecallContext,
    evaluation?: RecallEvaluationContext,
  ): {
    shouldRecall: boolean;
    reason?: string;
  };
}

export type MemoryCategory =
  | "Goal"
  | "Project"
  | "Knowledge"
  | "Habit"
  | "Relationship"
  | "Preference"
  | "Reflection"
  | "General Observation";

/**
 * A memory's title and description, concatenated and lowercased, computed once
 * per memory object rather than once per read.
 *
 * Three places need this exact string -- `classifyMemory`, the semantic
 * relevance score and the active-project match -- and a rebuild asks each of
 * them about every retained memory. Skipping the classification build for Goal
 * Progress memories removed the dead half of that, but the semantic site still
 * ran for every memory on every rebuild: 526 normalisations per rebuild at the
 * retention ceiling with a populated chat, recomputing the same immutable text
 * for the same objects each time.
 *
 * WHY A WeakMap AND NOT A KEYED CACHE
 * -----------------------------------
 * A `Map<memoryId, string>` would be a fourth derived structure needing
 * synchronisation wherever memories are evicted -- the bug class this module's
 * neighbours have already paid for in `importanceService.forgetMemories`,
 * `relationshipService.forgetMemories` and the recall candidate cache. Keying
 * on the object instead removes the problem rather than managing it: when
 * retention drops a memory and the last reference goes, the entry is collected.
 * There is nothing to invalidate, so there is nothing to forget to invalidate.
 *
 * WHAT MAKES IT CORRECT
 * ---------------------
 * Two properties, both verified rather than assumed:
 *
 *   Stable identity. `memories.push(memory)` in `memory-service.ts` is the only
 *   insertion, and `applyRuntimeRetention` compacts the array by moving
 *   references without replacing the objects, so a memory keeps one identity for
 *   its whole life. Reconstruction after a reload builds new objects, which is
 *   harmless -- they simply get new entries.
 *
 *   Immutable text. Nothing anywhere assigns to a Memory's `title`,
 *   `description` or `reason`. (The `updated.title = ...` assignments in
 *   `context/goals/rules.ts` and `context/knowledge/rules.ts` are on Goal and
 *   Knowledge objects, not memories.) A cached value therefore cannot go stale.
 *
 * The same reasoning would be wrong for a `Story`, which is replaced on every
 * update -- a story-keyed WeakMap would silently miss on every read.
 *
 * WHAT IT IS WORTH, AND WHEN
 * --------------------------
 * Only on a populated chat, and the size depends on machine load. Measured at
 * 500 memories, `toLowerCase` calls per rebuild in steady state:
 *
 *   empty chat       25 -> 24    the semantic site returns early on a blank
 *                               query, so there is nothing per-memory to cache
 *   populated chat  526 -> 25
 *
 * So the cache does nothing for an empty chat. On a populated one the rebuild
 * improved by 0.03-1.12 ms across six interleaved rounds, median ~0.40 ms on
 * the minimum-of-201-trials statistic -- the larger figures on a loaded machine,
 * the smallest on a quiet one, which is what removing ~500 short-lived
 * allocations should look like when collection pressure is what varies. Real
 * sessions have a chat, so the populated case is the common one, but a
 * benchmark run with an empty chat will correctly show no change.
 */
const normalisedTextByMemory = new WeakMap<Memory, string>();

function normalisedMemoryText(memory: Memory): string {
  let text = normalisedTextByMemory.get(memory);
  if (text === undefined) {
    text = `${memory.title} ${memory.description}`.toLowerCase();
    normalisedTextByMemory.set(memory, text);
  }
  return text;
}

/** Test seam: the cached text for a memory, or undefined if not yet computed. */
export function peekNormalisedMemoryText(memory: Memory): string | undefined {
  return normalisedTextByMemory.get(memory);
}

/**
 * Classifies memory into one of the conceptual categories.
 */
export function classifyMemory(memory: Memory): MemoryCategory {
  // Answered before the normalised text exists, because it needs none.
  //
  // This is the first disjunct of the first block below, so nothing can
  // precede it and hoisting it cannot change which category wins: the original
  // returned "Goal" for `reason || D` and this returns "Goal" for `reason`,
  // then for `D` only when `reason` was false -- the same predicate.
  //
  // What it saves is the normalisation. `${title} ${description}`.toLowerCase()
  // used to be the first statement of this function, so a Goal Progress memory
  // paid a full string build and lowercase that was then never read. Measured
  // on a task-completion history at the retention ceiling that was 500 of 500
  // memories per rebuild, ~0.38 ms of allocation whose result no branch
  // consulted. Task completion is the highest-volume event type in real use, so
  // the common case was the wasteful one.
  //
  // Memories that fall through still build the text exactly once, as before.
  if (memory.reason === "Goal Progress") {
    return "Goal";
  }

  const text = normalisedMemoryText(memory);

  if (
    text.includes("dream") ||
    text.includes("goal") ||
    text.includes("target") ||
    text.includes("aim") ||
    text.includes("mission") ||
    text.includes("achieve")
  ) {
    return "Goal";
  }

  if (
    memory.relatedProjectId ||
    text.includes("project") ||
    text.includes("building") ||
    text.includes("startup") ||
    text.includes("repo") ||
    text.includes("codebase") ||
    text.includes("develop") ||
    text.includes("work on")
  ) {
    return "Project";
  }

  if (
    text.includes("learn") ||
    text.includes("studying") ||
    text.includes("understand") ||
    text.includes("verilog") ||
    text.includes("fpga") ||
    text.includes("risc-v") ||
    text.includes("concept") ||
    text.includes("domain") ||
    text.includes("skill") ||
    text.includes("read") ||
    text.includes("book")
  ) {
    return "Knowledge";
  }

  if (
    text.includes("streak") ||
    text.includes("habit") ||
    text.includes("routine") ||
    text.includes("every day") ||
    text.includes("daily") ||
    text.includes("workout") ||
    text.includes("fitness") ||
    text.includes("sleep")
  ) {
    return "Habit";
  }

  if (
    text.includes("friend") ||
    text.includes("contact") ||
    text.includes("person") ||
    text.includes("relationship") ||
    text.includes("spoke to") ||
    text.includes("meet") ||
    text.includes("colleague")
  ) {
    return "Relationship";
  }

  if (
    text.includes("like") ||
    text.includes("love") ||
    text.includes("prefer") ||
    text.includes("favorite") ||
    text.includes("dislike") ||
    text.includes("coffee") ||
    text.includes("tea")
  ) {
    return "Preference";
  }

  if (
    memory.reason === "Reflection Worthy" ||
    text.includes("reflect") ||
    text.includes("thought") ||
    text.includes("think") ||
    text.includes("ponder") ||
    text.includes("mind")
  ) {
    return "Reflection";
  }

  return "General Observation";
}

/**
 * Strips common question/functional words and returns simple stems for keyword matching.
 */
function getStems(word: string): string[] {
  const stems = [word];
  if (word.endsWith("ing")) stems.push(word.slice(0, -3));
  if (word.endsWith("s")) stems.push(word.slice(0, -1));
  if (word.endsWith("ed")) stems.push(word.slice(0, -2));
  if (word.endsWith("er")) stems.push(word.slice(0, -2));
  return stems;
}

/**
 * Question and function words that carry no recall signal.
 *
 * Module scope rather than a literal inside the tokeniser: it is constant, and
 * rebuilding a twelve-element array once per memory per rebuild was ~500
 * pointless allocations.
 */
const IGNORE_WORDS: readonly string[] = [
  "what",
  "whats",
  "where",
  "when",
  "your",
  "with",
  "that",
  "this",
  "have",
  "the",
  "and",
  "only",
];

/**
 * Splits a discussion context into the stems each significant word matches on.
 *
 * One entry per surviving query word, in query order, so the caller can use
 * `length` as the relevance denominator exactly as the inline version did.
 * An empty context yields no entries, which is how the old early return for a
 * blank context is preserved.
 */
function tokenizeQuery(currentContext: string): string[][] {
  if (!currentContext) return [];

  const queryWords = currentContext
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !IGNORE_WORDS.includes(w));

  return queryWords.map(getStems);
}

/**
 * Assembles everything a recall evaluation needs that does not depend on the
 * memory under judgement. See {@link RecallEvaluationContext}.
 *
 * The assembly order of the discussion string is load bearing and unchanged:
 * last user message, then current discussion, then active goal, then active
 * project name. It feeds a keyword match, so a different order would tokenise
 * to the same set -- but leaving it alone keeps the equivalence argument about
 * the hoist rather than about tokenisation.
 */
export function buildRecallEvaluationContext(): RecallEvaluationContext {
  let currentContextStr = "";

  const chat = getChat();
  if (chat && chat.length > 0) {
    const lastUserMsg = [...chat].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      currentContextStr += " " + lastUserMsg.text;
    }
  }

  const companionState = getCompanionState();
  if (companionState) {
    if (companionState.currentDiscussion) {
      currentContextStr += " " + companionState.currentDiscussion;
    }
    if (companionState.activeGoal) {
      currentContextStr += " " + companionState.activeGoal;
    }
    if (companionState.activeProject) {
      currentContextStr += " " + companionState.activeProject.name;
    }
  }

  const discussion = currentContextStr.trim();

  return {
    discussion,
    queryStems: tokenizeQuery(discussion),
    activeProject: companionState?.activeProject
      ? {
          id: companionState.activeProject.id,
          nameLower: companionState.activeProject.name.toLowerCase(),
        }
      : null,
  };
}

/**
 * Computes semantic keyword match relevance against current discussion context.
 *
 * Takes the pre-tokenised query rather than the raw string: tokenisation is
 * identical for every memory in a rebuild, so it moved to
 * {@link buildRecallEvaluationContext}. The fraction returned is unchanged --
 * one entry per surviving query word means `queryStems.length` is the same
 * denominator `queryWords.length` was.
 */
function computeSemanticRelevance(
  memory: Memory,
  queryStems: readonly (readonly string[])[],
): number {
  if (queryStems.length === 0) return 0;

  const memoryText = normalisedMemoryText(memory);

  let matches = 0;
  for (const stems of queryStems) {
    const hasMatch = stems.some((stem) => memoryText.includes(stem));
    if (hasMatch) {
      matches++;
    }
  }

  return matches / queryStems.length;
}

export const recallRules: RecallRule[] = [
  {
    name: "Active Story Recall Rule",
    evaluate(memory, importance, stories, context) {
      const parentStory = storyService.findStoryContainingMemory(memory.id);
      if (
        parentStory &&
        parentStory.status === "Active" &&
        !(context === "BOOTSTRAP" && parentStory.title === REFLECTIONS_ARC_TITLE)
      ) {
        return {
          shouldRecall: true,
          reason: `Associated with active narrative: "${parentStory.title}".`,
        };
      }
      return { shouldRecall: false };
    },
  },

  {
    name: "Intelligent Multi-Factor Recall Rule",
    evaluate(memory, importance, stories, context, evaluation) {
      const resolvedContext = context || "QUERY";

      // 1. Ingest Current User Intent & Chat Context
      //
      // Supplied by the caller when one rebuild is judging many memories, since
      // this is identical for all of them. Built here when absent, so a rule
      // invoked directly -- or an externally registered rule calling through --
      // behaves exactly as before.
      const evaluationContext = evaluation ?? buildRecallEvaluationContext();

      // 2. Classify Memory & Calculate Stability Score
      const category = classifyMemory(memory);
      let stabilityScore = 0.1;
      if (category === "Goal") stabilityScore = 1.0;
      else if (category === "Project" || category === "Knowledge") stabilityScore = 0.8;
      else if (category === "Habit" || category === "Relationship") stabilityScore = 0.6;
      else if (category === "Reflection") stabilityScore = 0.4;
      else if (category === "Preference") stabilityScore = 0.2;

      // 3. Calculate Semantic Relevance Score
      const relevance = computeSemanticRelevance(memory, evaluationContext.queryStems);
      const semanticScore = relevance > 0 ? 1.0 : 0.0;

      // 4. Calculate Importance Signals Scores
      let recencyStrength = 0.0;
      let userIntentStrength = 0.0;
      let reinforcementStrength = 0.0;
      let relationshipStrength = 0.0;
      let milestoneStrength = 0.0;

      if (importance && importance.signals) {
        importance.signals.forEach((sig) => {
          if (sig.type === "Recency") recencyStrength = sig.strength;
          else if (sig.type === "User Intent") userIntentStrength = sig.strength;
          else if (sig.type === "Reinforcement") reinforcementStrength = sig.strength;
          else if (sig.type === "Relationships") relationshipStrength = sig.strength;
          else if (sig.type === "Milestone") milestoneStrength = sig.strength;
        });
      }

      // 5. Calculate Project/Context Alignment
      let contextMatchScore = 0.0;
      const activeProject = evaluationContext.activeProject;
      if (activeProject) {
        if (memory.relatedProjectId === activeProject.id) {
          contextMatchScore = 1.0;
        } else {
          // Both sides are normalised once and reused: the project name once per
          // rebuild in `buildRecallEvaluationContext`, the memory text once per
          // memory in `normalisedMemoryText`.
          const memoryText = normalisedMemoryText(memory);
          if (memoryText.includes(activeProject.nameLower)) {
            contextMatchScore = 0.8;
          }
        }
      }

      // 6. Compute Multi-Factor Scoring Model with context-aware weights
      let wSemantic = 0.4;
      let wStability = 0.3;
      let wRecency = 0.1;
      let wIntent = 0.1;
      let wReinforce = 0.1;

      if (resolvedContext === "BOOTSTRAP") {
        wSemantic = 0.0;
        wStability = 0.6;
        wRecency = 0.1;
        wIntent = 0.15;
        wReinforce = 0.15;
      } else if (resolvedContext === "CONTINUATION") {
        wSemantic = 0.3;
        wStability = 0.3;
        wRecency = 0.15;
        wIntent = 0.1;
        wReinforce = 0.15;
      }

      const scoreIntent = Math.max(userIntentStrength, milestoneStrength);
      const scoreReinforce = Math.max(
        reinforcementStrength,
        relationshipStrength,
        contextMatchScore,
      );

      const compositeScore =
        wSemantic * semanticScore +
        wStability * stabilityScore +
        wRecency * recencyStrength +
        wIntent * scoreIntent +
        wReinforce * scoreReinforce;

      const threshold = 0.6;
      const isExtremelyRecent = recencyStrength >= 0.8 && resolvedContext !== "BOOTSTRAP";
      const isHighIntentUserNote = userIntentStrength >= 0.8 && semanticScore > 0;

      const shouldRecall = compositeScore >= threshold || isExtremelyRecent || isHighIntentUserNote;

      if (shouldRecall) {
        const factors = [
          `Context: ${resolvedContext}`,
          `Score: ${compositeScore.toFixed(2)}`,
          `Category: ${category}`,
          `SemanticMatch: ${semanticScore > 0 ? "Yes" : "No"}`,
          `Recency: ${recencyStrength.toFixed(1)}`,
          `Intent: ${scoreIntent.toFixed(1)}`,
          `Reinforce: ${scoreReinforce.toFixed(1)}`,
        ];
        return {
          shouldRecall: true,
          reason: `Multi-factor recall [${factors.join(" | ")}]`,
        };
      }

      return { shouldRecall: false };
    },
  },
];

export function registerRecallRule(rule: RecallRule) {
  recallRules.unshift(rule);
}
