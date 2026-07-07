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

  // 1. Evaluate Timing: If focus metrics indicate deep focus, block all proactive actions
  if (resolved.currentFocus && resolved.overallConfidence > 0.85) {
    return defaultDecision;
  }

  // 2. Assess Subsystem Confidence: If overall context confidence is below threshold, default to Silence
  if (resolved.overallConfidence < CONSTANTS.MIN_CONFIDENCE_FOR_PROACTIVE_INITIATIVE) {
    return {
      ...defaultDecision,
      interventionNecessity: `Proactive action suppressed due to low context confidence (${resolved.overallConfidence}).`,
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

  // 4. Evaluate Goal Progress Blockers -> Helpful Reminder
  const blockedGoals = resolved.activeGoals.filter(
    (g) => g.blockers.length > 0 || g.status === "Paused",
  );
  if (blockedGoals.length > 0) {
    blockedGoals.forEach((goal) => {
      evidence.push({
        id: uid(),
        timestamp: goal.updatedAt,
        description: `Goal "${goal.title}" is blocked or paused.`,
        source: "context_resolution",
        verified: goal.confidence === 1.0,
      });
    });

    return {
      origin: "InitiativeEngine",
      decisionOutcome: "Reminder",
      confidence: CONSTANTS.CONFIDENCE_REMINDER,
      supportingEvidence: evidence,
      userBenefit: "Highlighting stagnated milestones to check for blockers.",
      timingSuitability: 0.8,
      interventionNecessity: "Proactive reminder is justified by blocked milestone evidence.",
      createdAt: now,
    };
  }

  // 5. Evaluate Project return and goal links -> Gentle Suggestion
  if (resolved.currentFocus && resolved.activeGoals.length > 0) {
    const matchingGoal = resolved.activeGoals.find((g) =>
      g.title.toLowerCase().includes(resolved.currentFocus!.toLowerCase()),
    );

    if (matchingGoal && matchingGoal.status === "Active") {
      evidence.push({
        id: uid(),
        timestamp: matchingGoal.updatedAt,
        description: `Active goal "${matchingGoal.title}" aligns with current focus "${resolved.currentFocus}".`,
        source: "context_resolution",
        verified: matchingGoal.confidence === 1.0,
      });

      return {
        origin: "InitiativeEngine",
        decisionOutcome: "Suggestion",
        confidence: CONSTANTS.CONFIDENCE_SUGGESTION,
        supportingEvidence: evidence,
        userBenefit: "Quietly linking active work focus with target goals.",
        timingSuitability: 0.75,
        interventionNecessity: "Opportunity found to align focus with active goal milestones.",
        createdAt: now,
      };
    }
  }

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
