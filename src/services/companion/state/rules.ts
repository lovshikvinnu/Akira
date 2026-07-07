import {
  CompanionState,
  AwarenessSnapshot,
  StateEvidence,
  InferenceRecord,
  FocusArea,
} from "./types";
import { PresenceContext } from "../presence/types";
import * as CONSTANTS from "./constants";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Bootstraps the CompanionState from initial Awareness Snapshot and Presence Context.
 */
export function initializeState(
  snapshot: AwarenessSnapshot,
  presence: PresenceContext,
): CompanionState {
  const currentStart = Date.now();

  // Evaluate initial confidence level
  const hasMinContext = snapshot.sessionIntent !== "Unknown" && snapshot.activeGoals.length > 0;
  const initialConfidence = hasMinContext
    ? CONSTANTS.INITIAL_SNAPSHOT_CONFIDENCE
    : CONSTANTS.INSUFFICIENT_CONTEXT_CONFIDENCE;

  const initialFocus = mapIntentToFocus(snapshot.sessionIntent);

  const activeProject = snapshot.initialProject || null;

  // Build baseline inferences
  const inferences: InferenceRecord[] = [
    {
      id: uid(),
      field: "currentFocus",
      value: initialFocus,
      timestamp: currentStart,
      status: "active",
    },
  ];

  if (activeProject) {
    inferences.push({
      id: uid(),
      field: "activeProject",
      value: activeProject.name,
      timestamp: currentStart,
      status: "active",
    });
  }

  const initialEvidence: StateEvidence = {
    id: uid(),
    source: "awareness_snapshot",
    timestamp: currentStart,
    description: "Hydrated initial state from Awareness Snapshot",
    verified: false,
    targetField: "currentFocus",
    value: initialFocus,
  };

  return {
    origin: "CompanionStateEngine",
    evidence: {
      snapshot,
      presence,
      evidenceLog: [initialEvidence],
      inferences,
    },
    contextConfidence: initialConfidence,
    activeProject,
    activeGoal: snapshot.activeGoals[0] || null,
    currentDiscussion: "",
    currentFocus: initialFocus,
    workingContext: {},
    pendingQuestions: [],
    activeTasks: [],
  };
}

/**
 * Process new evidence log, update confidence, and apply state modifications.
 */
export function addEvidence(state: CompanionState, evidence: StateEvidence): CompanionState {
  const updatedLog = [...state.evidence.evidenceLog, evidence];
  let confidence = state.contextConfidence;

  // Recalculate confidence based on evidence source
  if (evidence.verified) {
    confidence = CONSTANTS.VERIFIED_EVIDENCE_CONFIDENCE;
  } else if (evidence.source === "workspace_event") {
    confidence = Math.min(1.0, confidence + 0.05); // slight increment on verified workspace actions
  } else if (evidence.source === "dialogue_analysis") {
    confidence = Math.max(0.0, confidence - CONSTANTS.TOPIC_SHIFT_CONFIDENCE_DECAY);
  }

  // Build target field updates and preserve previous inferences
  const inferences = [...state.evidence.inferences];
  const field = evidence.targetField;

  // Find current active inference for this field and mark as replaced/corrected
  inferences.forEach((inf) => {
    if (inf.field === field && inf.status === "active") {
      inf.status = evidence.verified ? "corrected" : "replaced";
      inf.correctedByEvidenceId = evidence.id;
    }
  });

  // Add the new inference
  if (field !== "workingContext") {
    inferences.push({
      id: uid(),
      field: field as "activeProject" | "activeGoal" | "currentDiscussion" | "currentFocus",
      value: evidence.value,
      timestamp: evidence.timestamp,
      status: "active",
    });
  }

  // Update target field in state
  const updatedState: CompanionState = {
    ...state,
    evidence: {
      ...state.evidence,
      evidenceLog: updatedLog,
      inferences,
    },
    contextConfidence: Number(confidence.toFixed(2)),
  };

  if (field === "activeProject") {
    updatedState.activeProject = JSON.parse(evidence.value);
  } else if (field === "activeGoal") {
    updatedState.activeGoal = evidence.value;
  } else if (field === "currentDiscussion") {
    updatedState.currentDiscussion = evidence.value;
  } else if (field === "currentFocus") {
    updatedState.currentFocus = evidence.value as FocusArea;
  }

  return updatedState;
}

/**
 * Applies explicit user correction to a field, preserving trace explainability.
 */
export function applyUserCorrection(
  state: CompanionState,
  field: "activeProject" | "activeGoal" | "currentDiscussion" | "currentFocus",
  value: unknown,
  description: string,
): CompanionState {
  const timestamp = Date.now();
  const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);

  const evidence: StateEvidence = {
    id: uid(),
    source: "user_correction",
    timestamp,
    description,
    verified: true,
    targetField: field,
    value: stringValue,
  };

  return addEvidence(state, evidence);
}

/**
 * Maps SessionIntent categories to FocusArea states.
 */
function mapIntentToFocus(intent: string): FocusArea {
  switch (intent) {
    case "Planning":
      return "Planning";
    case "Learning":
      return "Learning";
    case "Building":
      return "Building";
    case "Reflection":
      return "Reflection";
    case "Casual Conversation":
    case "Casual":
      return "Casual";
    case "Problem Solving":
      return "Problem Solving";
    default:
      return "Unknown";
  }
}
