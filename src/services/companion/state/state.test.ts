import {
  initializeState,
  addEvidence,
  applyUserCorrection,
  buildCompanionState,
  validateStateSnapshot,
  companionStateService,
  stateEvents,
} from "./index.ts";
import { PresenceContext } from "../presence/types";
import { presenceService } from "../presence/index.ts";

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

const mockPresence: PresenceContext = {
  origin: "PresenceEngine",
  evidence: { currentSessionStart: Date.now() },
  confidence: 1.0,
  sessionType: "Focus",
  returnState: "Same Day Return",
  timePeriod: "Afternoon",
  absenceDuration: 10000,
  firstSessionToday: false,
  resumedConversation: false,
  recentProjectReference: null,
  unusualAccessTime: false,
  continuityConfidence: 1.0,
  presenceConfidence: 1.0,
  generatedAt: Date.now(),
};

// ----------------------------------------------------

test("validateStateSnapshot detects incomplete variables", () => {
  const incompleteSnapshot = {
    sessionIdentifier: "snap-1",
    temporalReference: Date.now(),
    sessionIntent: "Unknown" as const,
    activeStories: [],
    activeGoals: [],
    relevantMemories: [],
    identityObservations: [],
    currentConstraints: [],
    recentActivity: [],
    initialProject: null,
  };

  const validation = validateStateSnapshot(incompleteSnapshot);
  assertEquals(validation.valid, false, "Unknown intent and empty projects must be invalid");
  assertEquals(
    validation.clarificationsRequired.includes("sessionIntent"),
    true,
    "Should require sessionIntent clarification",
  );
});

test("state initialization maps snapshot intent and sets initial confidence", () => {
  const snapshot = {
    sessionIdentifier: "snap-2",
    temporalReference: Date.now(),
    sessionIntent: "Building" as const,
    activeStories: [],
    activeGoals: ["Implement parser"],
    relevantMemories: [],
    identityObservations: [],
    currentConstraints: [],
    recentActivity: [],
    initialProject: { id: "akira-core", name: "AKIRA Core" },
  };

  const state = initializeState(snapshot, mockPresence);

  assertEquals(state.origin, "CompanionStateEngine", "State origin must match");
  assertEquals(state.currentFocus, "Building", "Focus should be Building");
  assertEquals(state.activeGoal, "Implement parser", "Goal should map correctly");
  assertEquals(state.activeProject?.name, "AKIRA Core", "Project should map correctly");
  assertEquals(state.contextConfidence, 0.7, "Valid initial snapshot has 0.70 confidence");
});

test("evidence verification logic preserves previous inferences and updates confidence", () => {
  const snapshot = {
    sessionIdentifier: "snap-3",
    temporalReference: Date.now(),
    sessionIntent: "Casual" as const,
    activeStories: [],
    activeGoals: [],
    relevantMemories: [],
    identityObservations: [],
    currentConstraints: [],
    recentActivity: [],
    initialProject: null,
  };

  let state = initializeState(snapshot, mockPresence);
  assertEquals(state.currentFocus, "Casual", "Initial focus should be Casual");
  assertEquals(state.contextConfidence, 0.5, "Incomplete baseline snapshot has 0.50 confidence");

  // User explicitly corrects the focus state to Problem Solving
  state = applyUserCorrection(
    state,
    "currentFocus",
    "Problem Solving",
    "Actually, I am debugging a memory leak right now.",
  );

  assertEquals(state.currentFocus, "Problem Solving", "Focus should update to Problem Solving");
  assertEquals(state.contextConfidence, 1.0, "Verified user correction yields 1.00 confidence");

  // Check that the previous inference is preserved and marked corrected
  const inferences = state.evidence.inferences;
  const oldInference = inferences.find(
    (inf) => inf.field === "currentFocus" && inf.value === "Casual",
  );
  const newInference = inferences.find(
    (inf) => inf.field === "currentFocus" && inf.value === "Problem Solving",
  );

  assertEquals(oldInference !== undefined, true, "Previous inference should be preserved");
  assertEquals(oldInference?.status, "corrected", "Previous inference status should be corrected");
  assertEquals(newInference !== undefined, true, "New focus inference should be present");
  assertEquals(newInference?.status, "active", "New focus inference should be active");
});

test("companionStateService lifecycle handoff, update, and close", () => {
  const snapshot = {
    sessionIdentifier: "snap-4",
    temporalReference: Date.now(),
    sessionIntent: "Planning" as const,
    activeStories: [],
    activeGoals: [],
    relevantMemories: [],
    identityObservations: [],
    currentConstraints: [],
    recentActivity: [],
    initialProject: null,
  };

  // Pre-initialize presence service for the test harness
  presenceService.initialize();

  // Bootstrap state
  assertEquals(companionStateService.getState(), null, "State service should be empty initially");
  companionStateService.bootstrap(snapshot);

  const activeState = companionStateService.getState();
  assertEquals(activeState !== null, true, "State should be bootstrapped");
  assertEquals(
    companionStateService.isSnapshotLocked(),
    true,
    "Handoff complete, snapshot should be locked",
  );

  // Update State via workspace evidence
  companionStateService.recordWorkspaceEvidence(
    "activeGoal",
    "Write AST builder",
    "User added new task to daily checklist",
  );

  const updatedState = companionStateService.getState();
  assertEquals(updatedState?.activeGoal, "Write AST builder", "Goal should update dynamically");

  // Close session
  const finalState = companionStateService.closeSession();
  assertEquals(finalState !== null, true, "Final state should be returned");
  assertEquals(companionStateService.getState(), null, "State service should be cleared");
  assertEquals(companionStateService.isSnapshotLocked(), false, "Snapshot lock reset");

  // Wind down presence
  presenceService.shutdown();
});

// ----------------------------------------------------

console.log(`\nTest Run Completed: ${passedTests} / ${totalTests} Passed.`);
if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
