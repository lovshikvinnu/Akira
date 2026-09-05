import { ReflectionReport, ReflectionEvidence } from "./types";
import { HabitContext } from "../../context/habits/types";
import { RelationshipContext } from "../../context/relationships/types";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Retrospectively synthesizes finalized intelligence engine contexts into an immutable ReflectionReport.
 * Preserves Reflection Neutrality: descriptive, objective, non-judgmental statements only.
 */
export function synthesizeReflectionReport(
  habits: HabitContext | null,
  relationships: RelationshipContext | null,
): ReflectionReport {
  const now = Date.now();
  const evidence: ReflectionEvidence[] = [];

  // 1. Progress analysis (Goal Engine)
  const progressSummary = "No active goal data recorded during this session.";
  const achievements: string[] = [];
  const challenges: string[] = [];

  // 2. Growth analysis (Knowledge Engine)
  const growthSummary = "No skill acquisition progress recorded during this session.";
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

  // Calculate composite confidence rating.
  //
  // The second place these four context confidences get averaged -- the other
  // is `resolveUnifiedContext` -- and it had the same flaw plus a different
  // invented number. An engine with nothing in it reports `confidence: 1` and
  // was counted, and when none of the four existed the result defaulted to
  // `0.8`, a figure with no derivation at all. This report's confidence then
  // flows into `ReflectionContext.confidence` and back into the resolver's
  // average, so a manufactured number did not stay local.
  //
  // Contributors are now the engines with a `basis`, and the fallback is
  // stated rather than picked: with nothing to average, the report is as
  // uncertain as this scale can say. Fixing it in one place would have left
  // this path producing the old answer.
  const contributing = [habits, relationships].filter(
    (ctx): ctx is NonNullable<typeof ctx> => Boolean(ctx) && ctx!.basis > 0,
  );

  const confidence =
    contributing.length > 0
      ? Number(
          (
            contributing.reduce((sum, ctx) => sum + ctx.confidence, 0) / contributing.length
          ).toFixed(2),
        )
      : 0;

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
