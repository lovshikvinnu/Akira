import { Goal, GoalStatus, GoalEvidence } from "./types";
import * as CONSTANTS from "./constants";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Instantiates a new Goal object in the initial "Created" stage.
 */
export function createGoal(
  id: string,
  title: string,
  description: string,
  parentId: string | null = null,
): Goal {
  const now = Date.now();
  return {
    id,
    title: title.trim(),
    description: description.trim(),
    status: "Created",
    parentId,
    prerequisites: [],
    supportedTaskIds: [],
    progressPercentage: 0,
    blockers: [],
    createdAt: now,
    updatedAt: now,
    confidence: CONSTANTS.GOAL_CREATED_CONFIDENCE,
  };
}

/**
 * Transitions a goal status through the lifecycle rules.
 */
export function updateGoalStatus(goal: Goal, newStatus: GoalStatus): Goal {
  if (goal.status === newStatus) {
    return goal;
  }

  const updated: Goal = {
    ...goal,
    status: newStatus,
    updatedAt: Date.now(),
  };

  // Automated progress adjustments based on status transitions
  if (newStatus === "Completed") {
    updated.progressPercentage = 100;
  } else if (newStatus === "Created" && updated.progressPercentage > 0) {
    updated.progressPercentage = 0;
  }

  // Automatic confidence adjustments
  if (newStatus === "Clarified" && updated.confidence < CONSTANTS.GOAL_CLARIFIED_CONFIDENCE) {
    updated.confidence = CONSTANTS.GOAL_CLARIFIED_CONFIDENCE;
  }

  return updated;
}

/**
 * Updates a goal's progress percentage and resolves side effects on status.
 */
export function updateGoalProgress(goal: Goal, percentage: number): Goal {
  const clampedProgress = Math.min(100, Math.max(0, Math.round(percentage)));
  if (goal.progressPercentage === clampedProgress) {
    return goal;
  }

  const updated: Goal = {
    ...goal,
    progressPercentage: clampedProgress,
    updatedAt: Date.now(),
  };

  // Auto-transition status based on progress changes
  if (clampedProgress === 100 && updated.status !== "Completed" && updated.status !== "Archived") {
    updated.status = "Completed";
  } else if (
    clampedProgress > 0 &&
    clampedProgress < 100 &&
    (updated.status === "Created" || updated.status === "Clarified")
  ) {
    updated.status = "Progress";
  }

  return updated;
}

/**
 * Handles explicit user corrections according to the Evidence Verification principle.
 */
export function applyUserCorrection(
  goal: Goal,
  property:
    | "status"
    | "progressPercentage"
    | "blockers"
    | "prerequisites"
    | "title"
    | "description"
    | "supportedTaskIds",
  value: string,
): Goal {
  const updated: Goal = {
    ...goal,
    updatedAt: Date.now(),
    confidence: CONSTANTS.GOAL_VERIFIED_CONFIDENCE, // sets confidence to verified
  };

  if (property === "status") {
    updated.status = value as GoalStatus;
    if (updated.status === "Completed") {
      updated.progressPercentage = 100;
    }
  } else if (property === "progressPercentage") {
    updated.progressPercentage = Math.min(100, Math.max(0, parseInt(value, 10) || 0));
    if (updated.progressPercentage === 100) {
      updated.status = "Completed";
    }
  } else if (property === "blockers") {
    updated.blockers = JSON.parse(value);
  } else if (property === "prerequisites") {
    updated.prerequisites = JSON.parse(value);
  } else if (property === "title") {
    updated.title = value;
  } else if (property === "description") {
    updated.description = value;
  } else if (property === "supportedTaskIds") {
    updated.supportedTaskIds = JSON.parse(value);
  }

  return updated;
}
