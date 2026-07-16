import { CompanionState, AwarenessSnapshot } from "./types";
import { PresenceContext } from "../../../akira-os/presence/types";
import { initializeState } from "./rules";

/**
 * Builds the initial volatile CompanionState using the Awareness Snapshot and Presence Context.
 */
export function buildCompanionState(
  snapshot: AwarenessSnapshot,
  presence: PresenceContext,
): CompanionState {
  return initializeState(snapshot, presence);
}

/**
 * Validates whether the initial snapshot is sufficient or if clarifying questions are needed.
 */
export function validateStateSnapshot(snapshot: AwarenessSnapshot): {
  valid: boolean;
  clarificationsRequired: string[];
} {
  const clarificationsRequired: string[] = [];

  if (snapshot.sessionIntent === "Unknown") {
    clarificationsRequired.push("sessionIntent");
  }

  if (!snapshot.initialProject && (!snapshot.activeGoals || snapshot.activeGoals.length === 0)) {
    clarificationsRequired.push("activeProjectOrGoal");
  }

  return {
    valid: clarificationsRequired.length === 0,
    clarificationsRequired,
  };
}
