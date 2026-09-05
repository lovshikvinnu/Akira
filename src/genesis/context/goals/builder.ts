import { Goal, GoalContext, GoalEvidence } from "./types";

/**
 * Builds the GoalContext from the in-memory goals list and evidence history.
 */
export function buildGoalContext(goals: Goal[], evidenceLog: GoalEvidence[]): GoalContext {
  // Filter active goals (everything that isn't completed or archived)
  const activeGoals = goals.filter((g) => g.status !== "Completed" && g.status !== "Archived");

  // Determine current priorities (active or in-progress goals)
  const currentPriorities = activeGoals.filter(
    (g) => g.status === "Active" || g.status === "Progress",
  );

  // Resolve hierarchy relationships
  const hierarchyMap = new Map<string | null, string[]>();
  goals.forEach((g) => {
    const parent = g.parentId;
    if (!hierarchyMap.has(parent)) {
      hierarchyMap.set(parent, []);
    }
    hierarchyMap.get(parent)!.push(g.id);
  });
  const goalHierarchy = Array.from(hierarchyMap.entries()).map(([parentId, childIds]) => ({
    parentId,
    childIds,
  }));

  // Resolve dependencies
  const dependencies: { goalId: string; requiresGoalId: string }[] = [];
  goals.forEach((g) => {
    g.prerequisites.forEach((prereqId) => {
      dependencies.push({ goalId: g.id, requiresGoalId: prereqId });
    });
  });

  // Resolve progress and blockers
  const progress: { goalId: string; progressPercentage: number }[] = [];
  const blockers: { goalId: string; description: string }[] = [];

  activeGoals.forEach((g) => {
    progress.push({ goalId: g.id, progressPercentage: g.progressPercentage });
    g.blockers.forEach((blockerDesc) => {
      blockers.push({ goalId: g.id, description: blockerDesc });
    });
  });

  // Compile completed history
  const completionState = goals
    .filter((g) => g.status === "Completed")
    .map((g) => ({
      goalId: g.id,
      completedAt: g.updatedAt,
    }));

  // Calculate aggregated confidence rating across active goals
  // `confidence` here is a mean over active goals, so with none of them it is
  // an average of nothing. It stays 1.0 for the readers that only ever look at
  // it when there is something to look at, and `basis` is what tells an
  // aggregate whether that number was measured or defaulted.
  let confidence = 1.0;
  if (activeGoals.length > 0) {
    const totalConfidence = activeGoals.reduce((sum, g) => sum + g.confidence, 0);
    confidence = Number((totalConfidence / activeGoals.length).toFixed(2));
  }

  return {
    origin: "GoalEngine",
    evidence: {
      evidenceLog,
      goalsSnapshot: [...goals],
    },
    confidence,
    basis: activeGoals.length,
    activeGoals,
    currentPriorities,
    goalHierarchy,
    dependencies,
    progress,
    blockers,
    completionState,
  };
}
