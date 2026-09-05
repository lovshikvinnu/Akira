import { InitiativeDecision, InitiativeOutcome, InitiativeEvidence } from "./types";
import { ResolvedContext } from "../context-resolution/types";
import * as CONSTANTS from "./constants";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Evaluates the Resolved Context retrospectively to decide whether a proactive initiative is justified.
 * Implements the No-Action Default principle: silence is the preferred state.
 */
export function evaluateInitiative(resolved: ResolvedContext | null): InitiativeDecision {
  const now = Date.now();
  const evidence: InitiativeEvidence[] = [];

  // Default No-Action Decision (Silence is the default)
  const defaultDecision: InitiativeDecision = {
    origin: "InitiativeEngine",
    decisionOutcome: "Silence",
    confidence: CONSTANTS.CONFIDENCE_SILENCE,
    supportingEvidence: [],
    userBenefit: "Preserving user focus and workspace silence.",
    timingSuitability: 1.0,
    interventionNecessity: "No proactive action is justified by current evidence.",
    createdAt: now,
  };

  if (!resolved) {
    return defaultDecision;
  }

  // 0. Nothing known about the *situation* means no grounds to interrupt.
  //
  // Situational certainty is presence plus companion state -- how well the
  // moment the user is in is understood. It used to be an average across every
  // engine, so a vaguely worded goal or an empty knowledge registry moved the
  // decision about whether to speak. Those are answers to other questions.
  //
  // This is the case the old scalar could not express. `overallConfidence` fell
  // back to 1.0 when no engine contributed, so an install with no user data
  // read as maximum certainty and sailed through the threshold below -- the
  // system was most willing to act proactively exactly when it knew least.
  //
  // Silence is the answer rather than a low score, because a low score is a
  // different claim: it says the evidence is weak, and there is no evidence.
  if (resolved.certainty.situational.score === null) {
    return {
      ...defaultDecision,
      interventionNecessity:
        "Nothing is known about the user's current situation, so there is no basis to interrupt.",
    };
  }

  const confidence = resolved.certainty.situational.score;

  // 1. Evaluate Timing: If focus metrics indicate deep focus, block all proactive actions
  if (resolved.currentFocus && confidence > 0.85) {
    return defaultDecision;
  }

  // 2. Assess Subsystem Confidence: If overall context confidence is below threshold, default to Silence
  if (confidence < CONSTANTS.MIN_CONFIDENCE_FOR_PROACTIVE_INITIATIVE) {
    return {
      ...defaultDecision,
      interventionNecessity: `Proactive action suppressed due to low context confidence (${confidence}).`,
    };
  }

  // 3. Evaluate Conflict Opportunity -> Clarifying Question
  if (resolved.conflictsExposed.length > 0) {
    resolved.conflictsExposed.forEach((conflict) => {
      evidence.push({
        id: uid(),
        timestamp: now,
        description: `Exposed conflict: ${conflict}`,
        source: "context_resolution",
        verified: false,
      });
    });

    return {
      origin: "InitiativeEngine",
      decisionOutcome: "Question",
      confidence: CONSTANTS.CONFIDENCE_QUESTION,
      supportingEvidence: evidence,
      userBenefit: "Resolving subsystem contradictions to align understanding.",
      timingSuitability: 0.85,
      interventionNecessity: "Understanding conflicts must be clarified before proceeding.",
      createdAt: now,
    };
  }

  // Steps 4 and 5 are gone with the Goal Engine.
  //
  // Both read `resolved.activeGoals`, which only the Goal Engine ever filled
  // and which no producer ever wrote to -- a blocked-goal reminder and a
  // focus-matches-goal suggestion that could not fire. The user's goals still
  // reach the model through `extractGoals`, as active projects and stated
  // aspirations; nothing in the prompt changed. What went is two branches that
  // had no input.

  // Fallback to default Silence
  return defaultDecision;
}

/**
 * Applies explicit user overrides/corrections to an InitiativeDecision.
 */
export function applyUserInitiativeCorrection(
  decision: InitiativeDecision,
  outcome: InitiativeOutcome,
  explanation: string,
): InitiativeDecision {
  const now = Date.now();
  return {
    ...decision,
    decisionOutcome: outcome,
    confidence: 1.0,
    userBenefit: `User corrected outcome to ${outcome}: ${explanation}`,
    supportingEvidence: [
      ...decision.supportingEvidence,
      {
        id: uid(),
        timestamp: now,
        description: `User corrected initiative decision: ${explanation}`,
        source: "user_correction",
        verified: true,
      },
    ],
    timingSuitability: 1.0,
  };
}
