import { evaluateInitiative, applyUserInitiativeCorrection, initiativeService } from "./index";
import { ResolvedContext } from "../context-resolution/types";

let totalTests = 0;
let passedTests = 0;

function test(name: string, fn: () => void) {
  totalTests++;
  console.log(`Running: ${name}`);
  try {
    fn();
    passedTests++;
  } catch (error) {
    console.error(`  ✗ Failed: ${name}`);
    console.error(error);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// Helper to create basic Resolved Context mocks
function createMockResolvedContext(overrides: Partial<ResolvedContext> = {}): ResolvedContext {
  return {
    origin: "ContextResolutionEngine",
    status: "ResolvedContextConstructed",
    overallConfidence: 0.8,
    provenance: {},
    currentPriorities: [],
    relevantContext: [],
    supportingEvidence: [],
    activeGoals: [],
    currentFocus: null,
    importantRelationships: [],
    relevantHabits: [],
    knowledgeRelevance: [],
    reflectionRelevance: [],
    conflictsExposed: [],
    ...overrides,
  };
}

// ----------------------------------------------------

test("defaults to Silence when resolved context is null or empty", () => {
  const decisionNull = evaluateInitiative(null);
  assertEquals(decisionNull.decisionOutcome, "Silence", "Outcome is Silence for null context");
  assertEquals(
    decisionNull.userBenefit.includes("Preserving user focus"),
    true,
    "Preserves user focus",
  );

  const contextEmpty = createMockResolvedContext();
  const decisionEmpty = evaluateInitiative(contextEmpty);
  assertEquals(decisionEmpty.decisionOutcome, "Silence", "Outcome is Silence for empty context");
});

test("suppresses initiative during deep user focus", () => {
  const contextFocus = createMockResolvedContext({
    currentFocus: "Writing Code",
    overallConfidence: 0.9, // high confidence focus -> deep work
  });

  const decision = evaluateInitiative(contextFocus);
  assertEquals(decision.decisionOutcome, "Silence", "Deep focus suppresses proactive alerts");
});

test("suppresses initiative when overall confidence is too low", () => {
  const contextLowConf = createMockResolvedContext({
    overallConfidence: 0.6, // below MIN_CONFIDENCE_FOR_PROACTIVE_INITIATIVE
    conflictsExposed: ["Mismatched priority"], // would otherwise trigger a question
  });

  const decision = evaluateInitiative(contextLowConf);
  assertEquals(decision.decisionOutcome, "Silence", "Weak confidence forces Silence fallback");
  assertEquals(
    decision.interventionNecessity.includes("suppressed due to low context confidence"),
    true,
    "Explains low confidence suppression",
  );
});

test("triggers a Question when conflicts are exposed", () => {
  const contextConflict = createMockResolvedContext({
    overallConfidence: 0.8,
    conflictsExposed: ["Focus state parser mismatch"],
  });

  const decision = evaluateInitiative(contextConflict);
  assertEquals(decision.decisionOutcome, "Question", "Exposed conflict triggers Question");
  assertEquals(
    decision.userBenefit.includes("Resolving subsystem contradictions"),
    true,
    "Clarifies contradictions",
  );
  assertEquals(decision.supportingEvidence.length, 1, "Exposed conflict is added as evidence");
});

test("triggers a Reminder when goals are blocked or paused", () => {
  const contextBlocked = createMockResolvedContext({
    overallConfidence: 0.8,
    activeGoals: [
      {
        id: "g-1",
        title: "Finish Compiler",
        description: "Write recursive descent parser",
        status: "Paused",
        parentId: null,
        prerequisites: [],
        progressPercentage: 40,
        blockers: ["Missing LLVM bindings"],
        supportedTaskIds: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  });

  const decision = evaluateInitiative(contextBlocked);
  assertEquals(decision.decisionOutcome, "Reminder", "Blocked goal triggers Reminder");
  assertEquals(decision.supportingEvidence.length, 1, "Blocked goal becomes supporting evidence");
});

test("triggers a Suggestion when active focus aligns with active goals", () => {
  const contextSuggestion = createMockResolvedContext({
    overallConfidence: 0.8,
    currentFocus: "Parsing",
    activeGoals: [
      {
        id: "g-1",
        title: "Build Parsing engine",
        description: "Construct parsing blocks",
        status: "Active",
        parentId: null,
        prerequisites: [],
        progressPercentage: 10,
        blockers: [],
        supportedTaskIds: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  });

  const decision = evaluateInitiative(contextSuggestion);
  assertEquals(decision.decisionOutcome, "Suggestion", "Matching goal triggers Suggestion");
});

test("user correction overrides the outcome and sets confidence to 1.00", () => {
  const context = createMockResolvedContext();
  const decision = evaluateInitiative(context);

  const corrected = applyUserInitiativeCorrection(
    decision,
    "Suggestion",
    "User wants a proactive project suggestion.",
  );

  assertEquals(corrected.decisionOutcome, "Suggestion", "Outcome is overridden");
  assertEquals(corrected.confidence, 1.0, "Confidence is locked to 1.0");
  assertEquals(corrected.supportingEvidence.length, 1, "Adds user correction as evidence");
});

test("initiativeService evaluates context on events and publishes evaluations", () => {
  initiativeService.initialize();

  const decision = initiativeService.getDecision();
  assertEquals(decision !== null, true, "Service starts initialized");
  assertEquals(decision?.decisionOutcome, "Silence", "Defaults to Silence");

  // Run manually
  initiativeService.reevaluateInitiative();
  const current = initiativeService.getDecision();
  assertEquals(current !== null, true, "Reevaluation compiles");

  initiativeService.shutdown();
});

// ----------------------------------------------------

console.log(`\nTest Run Completed: ${passedTests} / ${totalTests} Passed.`);
if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
