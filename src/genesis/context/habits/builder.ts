import { ObservedHabit, HabitContext, HabitEvidence } from "./types";

/**
 * Compiles a list of ObservedHabits and their aggregate evidence log into a HabitContext.
 */
export function buildHabitContext(
  habits: ObservedHabit[],
  evidenceLog: HabitEvidence[],
): HabitContext {
  // Filter out archived ones
  const activeHabits = habits.filter((h) => h.status !== "HabitArchived");

  const habitConfidence = activeHabits.map((h) => ({
    habitId: h.id,
    value: h.confidence,
  }));

  const habitStability = activeHabits.map((h) => ({
    habitId: h.id,
    rating: h.stability,
  }));

  const supportingEvidence = activeHabits.map((h) => ({
    habitId: h.id,
    evidenceCount: h.evidence.length,
  }));

  const habitEvolution = activeHabits.map((h) => ({
    habitId: h.id,
    lastUpdated: h.updatedAt,
    statusHistory: [...h.statusHistory],
  }));

  const contextDependence = activeHabits.map((h) => ({
    habitId: h.id,
    projectId: h.contextDependency?.projectId,
    domainId: h.contextDependency?.domainId,
    timeOfDay: h.contextDependency?.timeOfDay,
  }));

  const emergingHabits = activeHabits.filter((h) =>
    ["BehaviorObserved", "RepeatedEvidence", "PatternDetected"].includes(h.status),
  );

  const weakeningHabits = activeHabits.filter((h) => h.status === "HabitWeakens");

  // Calculate aggregated active confidence
  let confidence = 1.0;
  if (activeHabits.length > 0) {
    const totalConfidence = activeHabits.reduce((sum, h) => sum + h.confidence, 0);
    confidence = Number((totalConfidence / activeHabits.length).toFixed(2));
  }

  return {
    origin: "HabitIntelligenceEngine",
    evidence: {
      evidenceLog: [...evidenceLog],
      habitsSnapshot: [...habits],
    },
    confidence,
    observedHabits: activeHabits,
    habitConfidence,
    habitStability,
    supportingEvidence,
    habitEvolution,
    contextDependence,
    emergingHabits,
    weakeningHabits,
  };
}
