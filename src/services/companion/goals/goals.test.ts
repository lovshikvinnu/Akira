import {
  createGoal,
  updateGoalStatus,
  updateGoalProgress,
  applyUserCorrection,
  buildGoalContext,
  goalService,
} from "./index.ts";
import { akira } from "../../akira-store";

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

test("goal creation sets correct default parameters", () => {
  const goal = createGoal("g-1", "Design compiler", "Implement AST rules");

  assertEquals(goal.id, "g-1", "Goal ID matches");
  assertEquals(goal.title, "Design compiler", "Goal title matches");
  assertEquals(goal.status, "Created", "Status should initially be Created");
  assertEquals(goal.progressPercentage, 0, "Progress should initially be 0");
  assertEquals(goal.confidence, 0.5, "Initial confidence should be 0.50");
});

test("goal clarification updates confidence to 0.80", () => {
  let goal = createGoal("g-2", "Design parser", "Implement PEG rules");
  goal = updateGoalStatus(goal, "Clarified");

  assertEquals(goal.status, "Clarified", "Status transitions to Clarified");
  assertEquals(goal.confidence, 0.8, "Clarified confidence transitions to 0.80");
});

test("progress updates auto-transition status", () => {
  let goal = createGoal("g-3", "Design builder", "Write visitor methods");

  // Progress to 50%
  goal = updateGoalProgress(goal, 50);
  assertEquals(goal.progressPercentage, 50, "Progress matches 50");
  assertEquals(goal.status, "Progress", "Partial progress shifts status to Progress");

  // Progress to 100%
  goal = updateGoalProgress(goal, 100);
  assertEquals(goal.progressPercentage, 100, "Progress matches 100");
  assertEquals(goal.status, "Completed", "Full progress shifts status to Completed");
});

test("pause and resume transitions status cleanly", () => {
  let goal = createGoal("g-4", "Test runner", "Implement suite assertions");
  goal = updateGoalStatus(goal, "Active");
  assertEquals(goal.status, "Active", "Goal status is Active");

  goal = updateGoalStatus(goal, "Paused");
  assertEquals(goal.status, "Paused", "Goal is Paused");

  goal = updateGoalStatus(goal, "Resumed");
  assertEquals(goal.status, "Resumed", "Goal is Resumed");
});

test("user correction overrides parameters and sets confidence to 1.00", () => {
  let goal = createGoal("g-5", "Task integration", "Connect with akira-store");

  goal = applyUserCorrection(goal, "status", "Completed");
  assertEquals(goal.status, "Completed", "User corrected status to Completed");
  assertEquals(goal.progressPercentage, 100, "Completed status sets progress to 100%");
  assertEquals(goal.confidence, 1.0, "User correction sets confidence to 1.00");
});

test("context builder aggregates goals progress and calculates confidence", () => {
  const g1 = createGoal("g-6", "Sub-goal 1", "desc 1");
  const g2 = createGoal("g-7", "Sub-goal 2", "desc 2");

  // Incomplete active goals
  const context = buildGoalContext([g1, g2], []);

  assertEquals(context.origin, "GoalEngine", "Context origin matches");
  assertEquals(context.activeGoals.length, 2, "Active goals count is 2");
  assertEquals(context.confidence, 0.5, "Average confidence is 0.50 (both 0.50)");
  assertEquals(context.progress.length, 2, "Progress indicators for active goals exists");
});

test("goalService syncs workspace tasks and allows user corrections", () => {
  // Initialize the service (uses store mock)
  goalService.initialize();

  // Tasks in store must not be automatically promoted to goals
  const initialContext = goalService.getContext();
  assertEquals(
    initialContext?.activeGoals.length,
    0,
    "No goals should be implicitly created from tasks",
  );

  // Create a custom goal
  const goal = goalService.addGoal("Core parser implementation", "Write AST grammar rules");
  assertEquals(
    goalService.getContext()?.activeGoals.some((g) => g.id === goal.id),
    true,
    "Manual goal exists in context",
  );

  // Link goal to a task in the store (mock store has tasks)
  const storeTasks = akira.getState().tasks;
  if (storeTasks.length > 0) {
    const targetTaskId = storeTasks[0].id;

    // Correct supportedTaskIds to point to this task
    goalService.correctGoal(
      goal.id,
      "supportedTaskIds",
      JSON.stringify([targetTaskId]),
      "Associate with workspace task",
    );

    // Verify task is associated
    const contextWithAssociation = goalService.getContext();
    const associatedGoal = contextWithAssociation?.activeGoals.find((g) => g.id === goal.id);
    assertEquals(
      associatedGoal?.supportedTaskIds.includes(targetTaskId),
      true,
      "Goal supports task association",
    );
  }

  // Correct goal parameters
  goalService.correctGoal(
    goal.id,
    "description",
    "Write parsing logic using PEG grammar rules",
    "More specific compiler instructions",
  );

  const context = goalService.getContext();
  const updatedGoal = context?.activeGoals.find((g) => g.id === goal.id);

  assertEquals(
    updatedGoal?.description,
    "Write parsing logic using PEG grammar rules",
    "Description updated",
  );
  assertEquals(updatedGoal?.confidence, 1.0, "Corrected goal has 1.00 confidence");

  // Check evidence logs
  const correctionEvidence = context?.evidence.evidenceLog.find(
    (ev) => ev.goalId === goal.id && ev.source === "user_correction",
  );
  assertEquals(correctionEvidence !== undefined, true, "Verified correction evidence preserved");

  // Shutdown service
  goalService.shutdown();
});

// ----------------------------------------------------

console.log(`\nTest Run Completed: ${passedTests} / ${totalTests} Passed.`);
if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
