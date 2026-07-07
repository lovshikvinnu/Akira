import { buildResolvedContext, contextResolutionService } from "./index.ts";
import { GoalContext } from "../goals/types";
import { CompanionState, FocusArea } from "../state/types";

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

// ----------------------------------------------------

function createMockState(focus: string, projectId: string | null = null): CompanionState {
  return {
    origin: "CompanionStateEngine" as const,
    evidence: {
      snapshot: {
        sessionIdentifier: "sess-1",
        temporalReference: Date.now(),
        sessionIntent: "Building",
        activeStories: [],
        activeGoals: [],
        relevantMemories: [],
        identityObservations: [],
        currentConstraints: [],
        recentActivity: [],
      },
      presence: {
        origin: "PresenceEngine" as const,
        evidence: { currentSessionStart: Date.now() },
        confidence: 0.9,
        sessionType: "Focus",
        returnState: "New",
        timePeriod: "Morning",
        absenceDuration: 0,
        firstSessionToday: true,
        resumedConversation: false,
        recentProjectReference: null,
        unusualAccessTime: false,
        continuityConfidence: 0.9,
        presenceConfidence: 0.9,
        generatedAt: Date.now(),
      },
      evidenceLog: [],
      inferences: [],
    },
    contextConfidence: 0.9,
    activeProject: projectId ? { id: projectId, name: "Project Name" } : null,
    activeGoal: null,
    currentDiscussion: "",
    currentFocus: focus as FocusArea,
    workingContext: {},
    pendingQuestions: [],
    activeTasks: [],
  };
}

test("buildResolvedContext aggregates multiple subsystems cleanly", () => {
  const mockState = createMockState("Building", "proj-1");
  const resolved = buildResolvedContext(null, mockState, null, null, null, null, null);

  assertEquals(resolved.origin, "ContextResolutionEngine", "Origin matches");
  assertEquals(resolved.currentFocus, "Building", "Active focus is extracted");
  assertEquals(resolved.overallConfidence, 0.9, "Aggregated confidence matches inputs");
});

test("missing subsystem contexts are handled gracefully", () => {
  const resolved = buildResolvedContext(null, null, null, null, null, null, null);

  assertEquals(resolved.currentFocus, null, "Focus is null when state is missing");
  assertEquals(resolved.activeGoals.length, 0, "Active goals are empty");
  assertEquals(resolved.overallConfidence, 1.0, "Defaults to 1.0 when no inputs exist");
});

test("conflicting contexts are exposed rather than discarded, and confidence decays", () => {
  const mockState = createMockState("Learning", "proj-1");

  const mockGoals: GoalContext = {
    origin: "GoalEngine" as const,
    evidence: { evidenceLog: [], goalsSnapshot: [] },
    confidence: 0.9,
    activeGoals: [
      {
        id: "g-1",
        title: "Learn Rust Coding",
        description: "Study compiler architectures",
        status: "Active" as const,
        parentId: null,
        prerequisites: [],
        progressPercentage: 50,
        blockers: [],
        supportedTaskIds: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    currentPriorities: [],
    goalHierarchy: [],
    dependencies: [],
    progress: [],
    blockers: [],
    completionState: [],
  };

  const resolved = buildResolvedContext(null, mockState, mockGoals, null, null, null, null);

  assertEquals(
    resolved.conflictsExposed.length,
    1,
    "One subsystem conflict is detected and exposed",
  );
  assertEquals(
    resolved.conflictsExposed[0].includes("differs"),
    true,
    "Conflict description lists mismatch details",
  );
  // Confidence sum is 0.9 + 0.9 = 1.8 / 2 = 0.90. But conflict lowers it by 0.15 -> 0.75
  assertEquals(resolved.overallConfidence, 0.75, "Conflict lowers composite confidence");
});

test("provenance metadata is preserved for all input subsystems", () => {
  const mockState = createMockState("Building", "proj-1");
  const resolved = buildResolvedContext(null, mockState, null, null, null, null, null);

  assertEquals(resolved.provenance.companionState !== null, true, "State context is preserved");
  assertEquals(
    resolved.provenance.companionState?.contextConfidence,
    0.9,
    "Input metadata confidence is kept",
  );
});

test("contextResolutionService subscribes and triggers updates successfully", () => {
  contextResolutionService.initialize();

  const initial = contextResolutionService.getContext();
  assertEquals(initial !== null, true, "Service starts initialized");

  // Rebuild manually
  contextResolutionService.rebuildResolvedContext();
  const rebuilt = contextResolutionService.getContext();
  assertEquals(rebuilt !== null, true, "Manual resolution completes");

  contextResolutionService.shutdown();
});

// ----------------------------------------------------

console.log(`\nTest Run Completed: ${passedTests} / ${totalTests} Passed.`);
if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
