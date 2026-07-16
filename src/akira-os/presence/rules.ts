import { TimePeriod, ReturnState } from "./types";
import * as CONSTANTS from "./constants";

/**
 * Classifies the local hour of the day into a general TimePeriod category.
 */
export function classifyTimePeriod(hour: number): TimePeriod {
  const normalizedHour = ((hour % 24) + 24) % 24;
  if (
    normalizedHour >= CONSTANTS.MORNING_START_HOUR &&
    normalizedHour < CONSTANTS.AFTERNOON_START_HOUR
  ) {
    return "Morning";
  }
  if (
    normalizedHour >= CONSTANTS.AFTERNOON_START_HOUR &&
    normalizedHour < CONSTANTS.EVENING_START_HOUR
  ) {
    return "Afternoon";
  }
  if (
    normalizedHour >= CONSTANTS.EVENING_START_HOUR &&
    normalizedHour < CONSTANTS.NIGHT_START_HOUR
  ) {
    return "Evening";
  }
  return "Night";
}

/**
 * Classifies the return state based on the gap duration since the last session.
 */
export function classifyReturnState(gap: number, hasPriorHistory: boolean): ReturnState {
  if (!hasPriorHistory) {
    return "New";
  }
  if (gap <= CONSTANTS.SAME_DAY_GAP_THRESHOLD) {
    return "Same Day Return";
  }
  if (gap <= CONSTANTS.NEXT_DAY_GAP_THRESHOLD) {
    return "Next Day Return";
  }
  return "Long Absence";
}

/**
 * Classifies whether this is the first session today based on current hour and temporal difference.
 */
export function isFirstSessionToday(
  currentStart: number,
  lastStart?: number,
  localHour?: number,
): boolean {
  if (lastStart === undefined) {
    return true;
  }

  const gap = currentStart - lastStart;
  if (gap < 0) {
    return false; // chronological inconsistency clamped
  }

  // If local hour of day is provided, we can evaluate if the gap crossed midnight
  if (localHour !== undefined) {
    // If the gap in milliseconds is larger than the hours elapsed since midnight, midnight was crossed
    const msSinceMidnight = localHour * 60 * 60 * 1000;
    return gap > msSinceMidnight;
  }

  // Fallback if localHour is not available (assumes standard 24h day boundary)
  return gap > 24 * 60 * 60 * 1000;
}

/**
 * Resolves if the access hour is unusual.
 */
export function isUnusualAccessTime(hour: number): boolean {
  const normalizedHour = ((hour % 24) + 24) % 24;
  return (
    normalizedHour >= CONSTANTS.UNUSUAL_ACCESS_START_HOUR ||
    normalizedHour < CONSTANTS.UNUSUAL_ACCESS_END_HOUR
  );
}

/**
 * Computes continuity confidence decaying from 1.0 to 0.0 as absence gap increases.
 */
export function calculateContinuityConfidence(gap: number): number {
  if (gap <= 0) {
    return 1.0;
  }
  if (gap >= CONSTANTS.CONTINUITY_MAX_DECAY_GAP) {
    return 0.0;
  }
  return Number((1 - gap / CONSTANTS.CONTINUITY_MAX_DECAY_GAP).toFixed(2));
}

/**
 * Computes active presence confidence decaying from 1.0 to 0.0 as idle gap increases.
 */
export function calculatePresenceConfidence(idleTime: number): number {
  if (idleTime <= 0) {
    return 1.0;
  }
  if (idleTime >= CONSTANTS.PRESENCE_MAX_IDLE_GAP) {
    return 0.0;
  }
  return Number((1 - idleTime / CONSTANTS.PRESENCE_MAX_IDLE_GAP).toFixed(2));
}
