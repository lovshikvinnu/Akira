import { ObservedHabit, HabitEvidence, HabitStatus } from "./types";
import * as CONSTANTS from "./constants";

/**
 * Evaluates whether the collected evidence qualifies as "Sufficient Supporting Evidence"
 * to trigger habit promotions. Conforms to the Habit Observation Constraint (no hardcoded frequencies).
 */
export function hasSufficientSupportingEvidence(evidence: HabitEvidence[]): boolean {
  if (evidence.some((e) => e.verified)) {
    return true;
  }

  // Evaluate diversity of evidence sources and distribution across distinct timestamps/sessions
  const uniqueSources = new Set(evidence.map((e) => e.source));
  const distinctIntervals = new Set(
    evidence.map((e) => Math.floor(e.timestamp / (1000 * 60 * 5))), // 5-minute session windows
  );

  // Sufficient evidence is defined as having records from multiple distinct systems/sources,
  // or recurring across multiple distinct time intervals/sessions.
  return uniqueSources.size >= 2 || distinctIntervals.size >= 3;
}

/**
 * Initializes a new ObservedHabit with status "BehaviorObserved".
 */
export function createObservedBehavior(
  id: string,
  name: string,
  initialEvidence: HabitEvidence,
): ObservedHabit {
  const now = Date.now();
  return {
    id,
    name: name.trim(),
    status: "BehaviorObserved",
    confidence: CONSTANTS.CONFIDENCE_BEHAVIOR_OBSERVED,
    stability: 0.1,
    evidence: [initialEvidence],
    statusHistory: ["BehaviorObserved"],
    contextDependency: initialEvidence.contextDependency,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transition the habit to a new status, recording the history.
 */
export function transitionHabitStatus(habit: ObservedHabit, newStatus: HabitStatus): ObservedHabit {
  if (habit.status === newStatus) {
    return habit;
  }

  let confidence = habit.confidence;
  switch (newStatus) {
    case "BehaviorObserved":
      confidence = CONSTANTS.CONFIDENCE_BEHAVIOR_OBSERVED;
      break;
    case "RepeatedEvidence":
      confidence = CONSTANTS.CONFIDENCE_REPEATED_EVIDENCE;
      break;
    case "PatternDetected":
      confidence = CONSTANTS.CONFIDENCE_PATTERN_DETECTED;
      break;
    case "HabitEstablished":
      confidence = CONSTANTS.CONFIDENCE_HABIT_ESTABLISHED;
      break;
    case "HabitEvolves":
      confidence = CONSTANTS.CONFIDENCE_HABIT_EVOLVES;
      break;
    case "HabitWeakens":
      confidence = CONSTANTS.CONFIDENCE_HABIT_WEAKENS;
      break;
    case "HabitArchived":
      confidence = CONSTANTS.CONFIDENCE_HABIT_ARCHIVED;
      break;
  }

  return {
    ...habit,
    status: newStatus,
    confidence,
    statusHistory: [...habit.statusHistory, newStatus],
    updatedAt: Date.now(),
  };
}

/**
 * Appends new evidence and evaluates lifecycle progressions.
 */
export function addHabitEvidence(habit: ObservedHabit, newEvidence: HabitEvidence): ObservedHabit {
  const updatedEvidence = [...habit.evidence, newEvidence];
  const now = Date.now();

  let updated: ObservedHabit = {
    ...habit,
    evidence: updatedEvidence,
    updatedAt: now,
  };

  // Determine stability dynamically based on the frequency and spacing of evidence
  const intervals = updatedEvidence.map((e) => e.timestamp);
  if (intervals.length > 1) {
    const span = Math.max(1, intervals[intervals.length - 1] - intervals[0]);
    const rate = (intervals.length / span) * (1000 * 60 * 60); // events per hour
    updated.stability = Math.min(1.0, Math.max(0.1, rate));
  }

  // Lifecycle Progression based on "Sufficient Supporting Evidence"
  const sufficient = hasSufficientSupportingEvidence(updatedEvidence);

  if (sufficient) {
    if (updated.status === "BehaviorObserved") {
      updated = transitionHabitStatus(updated, "RepeatedEvidence");
    } else if (updated.status === "RepeatedEvidence") {
      updated = transitionHabitStatus(updated, "PatternDetected");
    } else if (updated.status === "PatternDetected") {
      updated = transitionHabitStatus(updated, "HabitEstablished");
    } else if (updated.status === "HabitEstablished" && updated.stability > 0.8) {
      updated = transitionHabitStatus(updated, "HabitEvolves");
    }
  }

  return updated;
}

export interface HabitDecayConfig {
  weakeningHours: number;
  archivalHours: number;
}

export const DEFAULT_DECAY_CONFIG: HabitDecayConfig = {
  weakeningHours: 72,
  archivalHours: 168,
};

/**
 * Checks for sufficient supporting absence of the habit's execution.
 */
export function hasSufficientSupportingAbsence(
  habit: ObservedHabit,
  currentTimestamp: number,
  config: HabitDecayConfig = DEFAULT_DECAY_CONFIG,
): boolean {
  if (habit.evidence.some((e) => e.verified && e.source === "user_correction")) {
    return false;
  }
  const lastEvidence = habit.evidence[habit.evidence.length - 1];
  if (!lastEvidence) return true;

  const hoursSinceLastActivity = (currentTimestamp - lastEvidence.timestamp) / (1000 * 60 * 60);
  return hoursSinceLastActivity > config.weakeningHours;
}

/**
 * Checks for continued supporting absence of the habit's execution.
 */
export function hasContinuedSupportingAbsence(
  habit: ObservedHabit,
  currentTimestamp: number,
  config: HabitDecayConfig = DEFAULT_DECAY_CONFIG,
): boolean {
  if (habit.evidence.some((e) => e.verified && e.source === "user_correction")) {
    return false;
  }
  const lastEvidence = habit.evidence[habit.evidence.length - 1];
  if (!lastEvidence) return true;

  const hoursSinceLastActivity = (currentTimestamp - lastEvidence.timestamp) / (1000 * 60 * 60);
  return hoursSinceLastActivity > config.archivalHours;
}

/**
 * Evaluates whether a habit has weakened due to lack of recent evidence.
 * Conforms to Habit Decay Refinement: relies on abstract supporting absence checks.
 */
export function evaluateHabitDecay(
  habit: ObservedHabit,
  currentTimestamp: number,
  config: HabitDecayConfig = DEFAULT_DECAY_CONFIG,
): ObservedHabit {
  if (habit.status === "HabitArchived") {
    return habit;
  }

  // Check for continued supporting absence -> HabitArchived
  if (hasContinuedSupportingAbsence(habit, currentTimestamp, config)) {
    const updated = transitionHabitStatus(habit, "HabitArchived");
    updated.stability = 0.0;
    return updated;
  }

  // Check for sufficient supporting absence -> HabitWeakens
  if (hasSufficientSupportingAbsence(habit, currentTimestamp, config)) {
    if (habit.status !== "HabitWeakens") {
      const updated = transitionHabitStatus(habit, "HabitWeakens");
      updated.stability = Math.max(0.0, updated.stability - 0.2);
      return updated;
    }
  }

  return habit;
}

/**
 * Applies explicit user corrections in accordance with the Evidence Verification principle.
 */
export function applyUserHabitCorrection(
  habit: ObservedHabit,
  property: "status" | "name" | "projectId" | "domainId" | "timeOfDay",
  value: string,
): ObservedHabit {
  const updated: ObservedHabit = {
    ...habit,
    confidence: CONSTANTS.CONFIDENCE_HABIT_VERIFIED,
    updatedAt: Date.now(),
  };

  if (property === "status") {
    updated.status = value as HabitStatus;
    updated.statusHistory = [...updated.statusHistory, value as HabitStatus];
  } else if (property === "name") {
    updated.name = value;
  } else {
    updated.contextDependency = {
      ...updated.contextDependency,
      [property]: value,
    };
  }

  return updated;
}
