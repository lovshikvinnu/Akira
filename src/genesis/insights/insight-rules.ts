import { Understanding } from "../understanding/types";
import { InsightRule, InsightFragment } from "./insight-types";

// Helper to check if an understanding is active
const isActive = (u: Understanding) => u.status === "Active";

/**
 * Parallel Commitments Rule:
 * Triggers if the user is pursuing 2 or more active Goals/Projects simultaneously.
 */
export const parallelCommitmentsRule: InsightRule = {
  name: "Parallel Commitments Rule",
  evaluate(understandings) {
    const activeCommitments = understandings.filter(
      (u) => isActive(u) && (u.category === "Goal" || u.category === "Project"),
    );

    if (activeCommitments.length >= 2) {
      const confidence = activeCommitments.length >= 3 ? "High" : "Medium";
      return [
        {
          canonicalKey: "insight:parallel-commitments",
          category: "Parallel Commitments",
          confidence,
          supportingUnderstandingIds: activeCommitments.map((u) => u.id),
        },
      ];
    }

    return [];
  },
};

/**
 * Learning Momentum Rule:
 * Triggers if there is at least one active Project and at least one active Knowledge item.
 */
export const learningMomentumRule: InsightRule = {
  name: "Learning Momentum Rule",
  evaluate(understandings) {
    const activeProjects = understandings.filter((u) => isActive(u) && u.category === "Project");
    const activeKnowledge = understandings.filter((u) => isActive(u) && u.category === "Knowledge");

    if (activeProjects.length >= 1 && activeKnowledge.length >= 1) {
      const confidence = activeKnowledge.length >= 2 ? "High" : "Medium";
      const supportingIds = [
        ...activeProjects.map((u) => u.id),
        ...activeKnowledge.map((u) => u.id),
      ];
      return [
        {
          canonicalKey: "insight:learning-momentum",
          category: "Learning Momentum",
          confidence,
          supportingUnderstandingIds: supportingIds,
        },
      ];
    }

    return [];
  },
};

// Keyword mapping matching goals to knowledge subjects
const goalKeywordMap: Record<string, string[]> = {
  pilot: [
    "dgca",
    "meteorology",
    "aerodynamics",
    "air-regulations",
    "flight",
    "flying",
    "cpl",
    "navigation",
    "bali",
  ],
  "pilot-license": [
    "dgca",
    "meteorology",
    "aerodynamics",
    "air-regulations",
    "flight",
    "flying",
    "cpl",
    "navigation",
    "bali",
  ],
  aviation: [
    "dgca",
    "meteorology",
    "aerodynamics",
    "air-regulations",
    "flight",
    "flying",
    "cpl",
    "navigation",
    "bali",
  ],
};

/**
 * Goal Alignment Rule:
 * Triggers if there is an active Goal and active Knowledge understandings
 * whose keys share conceptual overlaps (e.g. pilot goals aligning with meteorology studies).
 */
export const goalAlignmentRule: InsightRule = {
  name: "Goal Alignment Rule",
  evaluate(understandings) {
    const activeGoals = understandings.filter((u) => isActive(u) && u.category === "Goal");
    const activeKnowledge = understandings.filter((u) => isActive(u) && u.category === "Knowledge");
    const fragments: InsightFragment[] = [];

    for (const goal of activeGoals) {
      const goalKey = goal.canonicalKey.includes(":")
        ? goal.canonicalKey.split(":")[1]
        : goal.canonicalKey;
      const keywords = goalKeywordMap[goalKey.toLowerCase()] || [goalKey.toLowerCase()];

      // Find any knowledge item whose key matches a keyword
      const matchingKnowledge = activeKnowledge.filter((k) => {
        const kKey = k.canonicalKey.includes(":") ? k.canonicalKey.split(":")[1] : k.canonicalKey;
        const kKeyLower = kKey.toLowerCase();
        return keywords.some((kw) => kKeyLower.includes(kw));
      });

      if (matchingKnowledge.length >= 1) {
        const confidence = matchingKnowledge.length >= 2 ? "High" : "Medium";
        fragments.push({
          canonicalKey: `insight:goal-alignment:${goalKey}`,
          category: "Goal Alignment",
          confidence,
          supportingUnderstandingIds: [goal.id, ...matchingKnowledge.map((u) => u.id)],
        });
      }
    }

    return fragments;
  },
};

export const insightRules: InsightRule[] = [
  parallelCommitmentsRule,
  learningMomentumRule,
  goalAlignmentRule,
];
