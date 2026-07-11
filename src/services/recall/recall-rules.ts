import { Memory } from "../memory/validation/types";
import { MemoryImportance } from "../importance/types";
import { Story } from "../stories/types";
import { getChat, getCompanionState } from "../genesis-provider";
import { RecallContext } from "./types";

export interface RecallRule {
  name: string;
  evaluate(
    memory: Memory,
    importance: MemoryImportance | null,
    stories: Story[],
    context?: RecallContext,
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
 * Classifies memory into one of the conceptual categories.
 */
export function classifyMemory(memory: Memory): MemoryCategory {
  const text = `${memory.title} ${memory.description}`.toLowerCase();
  
  if (
    memory.reason === "Goal Progress" ||
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
 * Computes semantic keyword match relevance against current discussion context.
 */
function computeSemanticRelevance(memory: Memory, currentContext: string): number {
  if (!currentContext) return 0;

  const ignoreWords = ["what", "whats", "where", "when", "your", "with", "that", "this", "have", "the", "and"];
  const queryWords = currentContext
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !ignoreWords.includes(w));

  if (queryWords.length === 0) return 0;

  const memoryText = `${memory.title} ${memory.description}`.toLowerCase();
  
  let matches = 0;
  for (const word of queryWords) {
    const stems = getStems(word);
    const hasMatch = stems.some((stem) => memoryText.includes(stem));
    if (hasMatch) {
      matches++;
    }
  }

  return matches / queryWords.length;
}

export const recallRules: RecallRule[] = [
  {
    name: "Active Story Recall Rule",
    evaluate(memory, importance, stories, context) {
      const parentStory = stories.find((s) => s.relatedMemoryIds.includes(memory.id));
      if (
        parentStory &&
        parentStory.status === "Active" &&
        !(context === "BOOTSTRAP" && parentStory.title === "Personal Growth Reflections")
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
    evaluate(memory, importance, stories, context) {
      const resolvedContext = context || "QUERY";

      // 1. Ingest Current User Intent & Chat Context
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

      // 2. Classify Memory & Calculate Stability Score
      const category = classifyMemory(memory);
      let stabilityScore = 0.1;
      if (category === "Goal") stabilityScore = 1.0;
      else if (category === "Project" || category === "Knowledge") stabilityScore = 0.8;
      else if (category === "Habit" || category === "Relationship") stabilityScore = 0.6;
      else if (category === "Reflection") stabilityScore = 0.4;
      else if (category === "Preference") stabilityScore = 0.2;

      // 3. Calculate Semantic Relevance Score
      const relevance = computeSemanticRelevance(memory, currentContextStr.trim());
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
      if (companionState && companionState.activeProject) {
        if (memory.relatedProjectId === companionState.activeProject.id) {
          contextMatchScore = 1.0;
        } else {
          const projName = companionState.activeProject.name.toLowerCase();
          const memoryText = `${memory.title} ${memory.description}`.toLowerCase();
          if (memoryText.includes(projName)) {
            contextMatchScore = 0.8;
          }
        }
      }

      // 6. Compute Multi-Factor Scoring Model with context-aware weights
      let wSemantic = 0.40;
      let wStability = 0.30;
      let wRecency = 0.10;
      let wIntent = 0.10;
      let wReinforce = 0.10;

      if (resolvedContext === "BOOTSTRAP") {
        wSemantic = 0.0;
        wStability = 0.60;
        wRecency = 0.10;
        wIntent = 0.15;
        wReinforce = 0.15;
      } else if (resolvedContext === "CONTINUATION") {
        wSemantic = 0.30;
        wStability = 0.30;
        wRecency = 0.15;
        wIntent = 0.10;
        wReinforce = 0.15;
      }

      const scoreIntent = Math.max(userIntentStrength, milestoneStrength);
      const scoreReinforce = Math.max(reinforcementStrength, relationshipStrength, contextMatchScore);

      const compositeScore =
        wSemantic * semanticScore +
        wStability * stabilityScore +
        wRecency * recencyStrength +
        wIntent * scoreIntent +
        wReinforce * scoreReinforce;

      const threshold = 0.60;
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
          `Reinforce: ${scoreReinforce.toFixed(1)}`
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

