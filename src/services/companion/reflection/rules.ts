import { ReflectionReport, ReflectionEvidence } from "./types";
import { GoalContext } from "../goals/types";
import { KnowledgeContext } from "../knowledge/types";
import { HabitContext } from "../habits/types";
import { RelationshipContext } from "../relationships/types";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Retrospectively synthesizes finalized intelligence engine contexts into an immutable ReflectionReport.
 * Preserves Reflection Neutrality: descriptive, objective, non-judgmental statements only.
 */
export function synthesizeReflectionReport(
  goals: GoalContext | null,
  knowledge: KnowledgeContext | null,
  habits: HabitContext | null,
  relationships: RelationshipContext | null,
): ReflectionReport {
  const now = Date.now();
  const evidence: ReflectionEvidence[] = [];

  // 1. Progress analysis (Goal Engine)
  let progressSummary = "No active goal data recorded during this session.";
  const achievements: string[] = [];
  const challenges: string[] = [];

  if (goals && goals.activeGoals.length > 0) {
    const total = goals.activeGoals.length;
    const completed = goals.activeGoals.filter((g) => g.status === "Completed").length;
    progressSummary = `Observed ${total} active goal(s) with ${completed} completed milestone(s).`;

    goals.activeGoals.forEach((g) => {
      evidence.push({
        id: uid(),
        timestamp: g.updatedAt,
        description: `Goal "${g.title}" status is "${g.status}".`,
        source: "goals",
        verified: g.confidence === 1.0,
      });

      if (g.status === "Completed") {
        achievements.push(`Goal Completed: ${g.title}`);
      } else if (g.status === "Paused" || g.progressPercentage < 20) {
        challenges.push(`Stagnated Goal: ${g.title}`);
      }
    });
  }

  // 2. Growth analysis (Knowledge Engine)
  let growthSummary = "No skill acquisition progress recorded during this session.";
  if (knowledge && knowledge.knownDomains.length > 0) {
    const allNodes = [...knowledge.knownDomains, ...knowledge.skills, ...knowledge.concepts];
    const mastered = allNodes.filter(
      (n) => n.type === "Concept" && n.status === "Reinforced",
    ).length;
    growthSummary = `Domain understanding evaluated across ${knowledge.knownDomains.length} technical field(s). Mastered concepts: ${mastered}.`;

    allNodes.forEach((n) => {
      if (n.status === "Reinforced") {
        achievements.push(`Concept Mastered: ${n.name}`);
      }
      evidence.push({
        id: uid(),
        timestamp: n.lastSeenAt,
        description: `Concept "${n.name}" mastery is at status "${n.status}".`,
        source: "knowledge",
        verified: n.confidence === 1.0,
      });
    });

    knowledge.areasRequiringClarification.forEach((gap) => {
      challenges.push(`Knowledge Gap: Missing prerequisite concepts for goal execution.`);
    });
  }

  // 3. Pattern analysis (Habit Engine)
  let patternSummary = "No behavioral routine patterns identified during this session.";
  if (habits && habits.observedHabits.length > 0) {
    const established = habits.observedHabits.filter((h) => h.status === "HabitEstablished").length;
    const weakening = habits.weakeningHabits.length;
    patternSummary = `Routine tracking logs ${habits.observedHabits.length} observed focus pattern(s) (${established} established, ${weakening} weakening).`;

    habits.observedHabits.forEach((h) => {
      evidence.push({
        id: uid(),
        timestamp: h.updatedAt,
        description: `Pattern "${h.name}" status: "${h.status}", stability: ${h.stability}.`,
        source: "habits",
        verified: h.confidence === 1.0,
      });

      if (h.status === "HabitEstablished") {
        achievements.push(`Established Focus Pattern: ${h.name}`);
      } else if (h.status === "HabitWeakens") {
        challenges.push(`Weakening Routine Pattern: ${h.name}`);
      }
    });
  }

  // Calculate composite confidence rating
  let confidence = 0.8;
  const confidenceRatings: number[] = [];
  if (goals) confidenceRatings.push(goals.confidence);
  if (knowledge) confidenceRatings.push(knowledge.confidence);
  if (habits) confidenceRatings.push(habits.confidence);
  if (relationships) confidenceRatings.push(relationships.confidence);

  if (confidenceRatings.length > 0) {
    const sum = confidenceRatings.reduce((a, b) => a + b, 0);
    confidence = Number((sum / confidenceRatings.length).toFixed(2));
  }

  return {
    id: uid(),
    timePeriod: {
      startedAt: now - 1000 * 60 * 60, // approximate session duration placeholder
      endedAt: now,
    },
    progressSummary,
    growthSummary,
    patternSummary,
    achievements,
    challenges,
    evidence,
    confidence,
    createdAt: now,
  };
}

/**
 * Applies explicit user overrides to a reflection report.
 */
export function applyUserReflectionCorrection(
  report: ReflectionReport,
  property: "progressSummary" | "growthSummary" | "patternSummary",
  value: string,
): ReflectionReport {
  return {
    ...report,
    [property]: value,
    confidence: 1.0,
    evidence: [
      ...report.evidence,
      {
        id: uid(),
        timestamp: Date.now(),
        description: `User corrected ${property} summary content.`,
        source: "user_correction",
        verified: true,
      },
    ],
  };
}
