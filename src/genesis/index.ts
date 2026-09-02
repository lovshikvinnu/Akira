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

// Reasoning Engine Foundation
export * from "./reasoning";

// Decision Subsystem Foundation
export * from "./decision";

// --- Explicit disambiguation of cross-subsystem name collisions ---
// These five names are declared by two subsystems each with genuinely different
// shapes, so `export *` left them ambiguous (TS2308) and therefore unusable through
// this barrel. The picks below match what the barrel's own consumers already rely on;
// the underlying collisions are a modelling issue recorded for a later decision
// (see docs/recovery/phase-a-build-recovery.md).
//
// Type-only picks — the identity variants remain available from ./identity/types.
// Chosen to match the services this barrel exports alongside them
// (goalService, habitService, relationshipService).
export type { GoalStatus } from "./context/goals/types";
export type { HabitStatus } from "./context/habits/types";
export type { RelationshipStatus } from "./context/relationships/types";

// Value pick — planning's GoalCategory is an enum and is the only one with a runtime
// binding, so this is already what consumers resolve to today.
export { GoalCategory } from "./planning/types";

// Value pick — keeps the committed Reflection factory on the unprefixed name and gives
// the newer Reasoning factory a distinct one, rather than silently changing either.
export { createDefaultStrategyRegistry } from "./insights/reflection/engine";
export { createDefaultStrategyRegistry as createDefaultReasoningStrategyRegistry } from "./reasoning";
