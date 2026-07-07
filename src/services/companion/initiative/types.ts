export type InitiativeOutcome = "Silence" | "Suggestion" | "Question" | "Reminder";

export type InitiativeLifecycleStatus =
  | "ResolvedContextAvailable"
  | "EvaluateOpportunity"
  | "AssessConfidence"
  | "AssessUserBenefit"
  | "ChooseDecision"
  | "DecisionPublished";

export interface InitiativeEvidence {
  id: string;
  timestamp: number;
  description: string;
  source: "context_resolution" | "user_correction";
  verified: boolean;
}

export interface InitiativeDecision {
  origin: "InitiativeEngine";
  decisionOutcome: InitiativeOutcome;
  confidence: number; // 0.0 to 1.0
  supportingEvidence: InitiativeEvidence[];
  userBenefit: string; // Documented reasoning explaining why the action is helpful
  timingSuitability: number; // 0.0 to 1.0 suitability score
  interventionNecessity: string; // Evaluation showing why remaining silent was overridden
  createdAt: number;
}
