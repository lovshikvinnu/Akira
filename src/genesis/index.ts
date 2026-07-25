// Memory Graph & Validation
export { memoryService } from "./memory/memory-service";
export { validator } from "./validation/validator";
export * from "./validation/types";
export { candidateService } from "./candidate/candidate-service";
export * from "./candidate/candidate";
export { relationshipService as memoryRelationshipService } from "./memory/relationships/relationship-service";
export type { MemoryRelationship } from "./memory/relationships/types";

// Recall Engine
export { recallService } from "./recall/recall-service";
export { recallBuilder } from "./recall/recall-builder";
export * from "./recall/types";

// Narrative Arcs / Stories
export { storyService } from "./stories/story-service";
export * from "./stories/types";

// Importance Signals
export { importanceService } from "./importance/importance-service";
export * from "./importance/types";

// Cognitive Understanding & Identity
export { identityService } from "./understanding/identity-service";
export { hypothesesService } from "./understanding/hypotheses";
export * from "./understanding/types";
export * from "./understanding/identity-types";

// Identity Foundation & Graph module
export {
  identityService as identityFoundationService,
  identityGraphService,
  identityEvolutionService,
  identityInterestService,
  identitySkillService,
  identityGoalService,
  identityHabitService,
  identityPreferenceService,
  identityValueService,
  identityRelationshipService,
  identityPersonalityService,
  identityValidationService,
  identityContextProvider,
} from "./identity";
export * from "./identity/types";
export * from "./identity/repositories/IdentityRepository";
export * from "./identity/repositories/InMemoryIdentityRepository";

// Insights & Reflection
export { insightEngine } from "./insights/insight-engine";
export { reflectionService } from "./insights/reflection/service";
export * from "./insights/reflection/types";
export * from "./insights/reflection/engine";


// Context Subsystem & Subsystem Contexts
export { contextService } from "./context/context-service";
export { contextBuilder } from "./context/context-builder";
export * from "./context/types";
export * from "./context/intelligence";
export * from "./context/relevance";
export * from "./context/assembly";




export { goalService } from "./context/goals/service";
export * from "./context/goals/types";

export { habitService } from "./context/habits/service";
export * from "./context/habits/types";

export { knowledgeService } from "./context/knowledge/service";
export * from "./context/knowledge/types";

export { initiativeService } from "./context/initiative/service";
export * from "./context/initiative/types";

export { relationshipService } from "./context/relationships/service";
export * from "./context/relationships/types";

export { companionStateService } from "./context/state/service";
export * from "./context/state/types";

export { contextResolutionService } from "./context/context-resolution/service";
export * from "./context/context-resolution/types";

// AI Subsystem — import from barrel to trigger provider registration side-effects
export { aiContextEngine } from "./context/ai";
export { aiProviderManager, useAIProviderManager } from "./context/ai";
export type { AIRequest, StandardAIResponse } from "./context/ai/types";

// Events
export { eventService } from "./events/event-service";
export type { MemoryEvent } from "../shared/types/event-types";

// Planning Foundation
export {
  planningService,
  milestoneService,
  taskService,
  dependencyService,
  progressService,
  planningValidationService,
  goalDecompositionService,
  goalClassifier,
  blockerAnalysisService,
  nextActionService,
  planAnalysisService,
  planningGraphBuilder,
  recommendationService,
  recommendationRuleEngine,
  adaptivePlanningService,
  InMemoryPlanRepository,
  InMemoryBlockerRepository,
  InMemoryMilestoneRepository,
  InMemoryTaskRepository,
  InMemoryDependencyRepository,
  InMemoryTemplateRepository,
} from "./planning";
export * from "./planning/types";
export * from "./planning/repositories/PlanRepository";
export * from "./planning/repositories/BlockerRepository";
export * from "./planning/repositories/MilestoneRepository";
export * from "./planning/repositories/TaskRepository";
export * from "./planning/repositories/DependencyRepository";
export * from "./planning/repositories/TemplateRepository";
