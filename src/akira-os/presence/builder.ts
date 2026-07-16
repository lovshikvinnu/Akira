import { PresenceInputs, PresenceContext } from "./types";
import {
  classifyTimePeriod,
  classifyReturnState,
  isFirstSessionToday,
  isUnusualAccessTime,
  calculateContinuityConfidence,
  calculatePresenceConfidence,
} from "./rules";
import * as CONSTANTS from "./constants";

/**
 * Builds the immutable PresenceContext using deterministic rules.
 */
export function buildPresenceContext(inputs: PresenceInputs): PresenceContext {
  const currentStart = inputs.currentTemporalReference;
  const lastEnd = inputs.lastSessionEndReference;

  // Calculate absence duration (clamp to 0 if temporal reference fluctuates backward)
  const absenceDuration = lastEnd !== undefined ? Math.max(0, currentStart - lastEnd) : 0;

  // Classify return state
  const returnState = classifyReturnState(absenceDuration, inputs.hasPriorHistory);

  // Classify time period of the day
  const timePeriod = classifyTimePeriod(inputs.localHourOfDay);

  // Classify if this is the first session of the day
  const firstSessionToday = isFirstSessionToday(
    currentStart,
    inputs.lastSessionStartReference,
    inputs.localHourOfDay,
  );

  // Determine unusual access
  const unusualAccessTime = isUnusualAccessTime(inputs.localHourOfDay);

  // Continuity logic
  const resumedConversation =
    inputs.hasPriorHistory &&
    inputs.recentConversationEnded !== true &&
    absenceDuration <= CONSTANTS.CONVERSATION_CONTINUITY_THRESHOLD;

  // Continuity confidence (decays with absence gap)
  const continuityConfidence = calculateContinuityConfidence(absenceDuration);

  // Presence confidence (decays with idle duration since last event)
  const idleTime =
    inputs.lastEventTemporalReference !== undefined
      ? Math.max(0, currentStart - inputs.lastEventTemporalReference)
      : 0;
  const presenceConfidence = calculatePresenceConfidence(idleTime);

  // Aggregate confidence score representing baseline context reliability
  const confidence = Number(((continuityConfidence + presenceConfidence) / 2).toFixed(2));

  return {
    origin: "PresenceEngine",
    evidence: {
      lastSessionEnd: lastEnd,
      currentSessionStart: currentStart,
      lastEventTime: inputs.lastEventTemporalReference,
      recentProjectId: inputs.recentProjectId,
    },
    confidence,
    sessionType: inputs.activeSessionType || "Unknown",
    returnState,
    timePeriod,
    absenceDuration,
    firstSessionToday,
    resumedConversation,
    recentProjectReference: inputs.recentProjectId || null,
    unusualAccessTime,
    continuityConfidence,
    presenceConfidence,
    generatedAt: currentStart,
  };
}
