import {
  createObservedBehavior,
  addHabitEvidence,
  evaluateHabitDecay,
  applyUserHabitCorrection,
  buildHabitContext,
  habitService,
} from "./index.ts";

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

test("createObservedBehavior registers initial status and low confidence", () => {
  const initialEvidence = {
    id: "e-1",
    timestamp: Date.now(),
    description: "Initial observation",
    source: "state" as const,
    verified: false,
  };

  const habit = createObservedBehavior("h-1", "Coding focus", initialEvidence);

  assertEquals(habit.id, "h-1", "ID matches");
  assertEquals(habit.name, "Coding focus", "Name matches");
  assertEquals(habit.status, "BehaviorObserved", "Initial status is BehaviorObserved");
  assertEquals(habit.confidence, 0.15, "Initial confidence is 0.15");
  assertEquals(habit.stability, 0.1, "Initial stability rating is 0.1");
});

test("lifecycle transitions emerge dynamically using sufficient evidence without hardcoded thresholds", () => {
  const initial = {
    id: "e-1",
    timestamp: Date.now(),
    description: "Observation",
    source: "state" as const,
    verified: false,
  };
  let habit = createObservedBehavior("h-2", "Refactoring", initial);

  // Trigger repeated evidence by providing diversified source channels
  habit = addHabitEvidence(habit, {
    id: "e-2",
    timestamp: Date.now() + 5000,
    description: "Repeated reference",
    source: "presence" as const,
    verified: false,
  });

  assertEquals(habit.status, "RepeatedEvidence", "Diversified sources promote to RepeatedEvidence");
  assertEquals(habit.confidence, 0.35, "RepeatedEvidence confidence matches");

  // Add more evidence to trigger pattern detection (sufficient intervals)
  habit = addHabitEvidence(habit, {
    id: "e-3",
    timestamp: Date.now() + 1000 * 60 * 10, // 10 minutes later
    description: "Session 2",
    source: "state" as const,
    verified: false,
  });

  assertEquals(habit.status, "PatternDetected", "Interval accumulation triggers PatternDetected");
  assertEquals(habit.confidence, 0.6, "PatternDetected confidence matches");
});

test("user correction overrides parameters and locks confidence to 1.00", () => {
  const initial = {
    id: "e-1",
    timestamp: Date.now(),
    description: "Observation",
    source: "state" as const,
    verified: false,
  };
  let habit = createObservedBehavior("h-3", "Reviewing PRs", initial);

  habit = applyUserHabitCorrection(habit, "name", "Pull Request Reviewing");
  habit = applyUserHabitCorrection(habit, "status", "HabitEstablished");

  assertEquals(habit.name, "Pull Request Reviewing", "Name override matches");
  assertEquals(habit.status, "HabitEstablished", "Status override matches");
  assertEquals(habit.confidence, 1.0, "User verified corrections lock confidence to 1.00");
});

test("habit decay transition weakens and archives neglected patterns", () => {
  const initial = {
    id: "e-1",
    timestamp: Date.now() - 1000 * 60 * 60 * 80, // 80 hours ago
    description: "Observation",
    source: "state" as const,
    verified: false,
  };
  let habit = createObservedBehavior("h-4", "Coding late", initial);

  // Check decay after 80 hours -> HabitWeakens
  habit = evaluateHabitDecay(habit, Date.now());
  assertEquals(habit.status, "HabitWeakens", "Neglected habit transitions to HabitWeakens");

  // Check decay after 180 hours -> HabitArchived
  const oldHabit = {
    ...habit,
    evidence: [
      {
        ...initial,
        timestamp: Date.now() - 1000 * 60 * 60 * 180, // 180 hours ago
      },
    ],
    status: "BehaviorObserved" as const,
  };

  const archived = evaluateHabitDecay(oldHabit, Date.now());
  assertEquals(
    archived.status,
    "HabitArchived",
    "Long term neglected habit transitions to HabitArchived",
  );
});

test("habit neutrality constraint is strictly preserved", () => {
  const initial = {
    id: "e-1",
    timestamp: Date.now(),
    description: "Observation",
    source: "state" as const,
    verified: false,
  };
  const habit = createObservedBehavior("h-5", "Writing documentation", initial);

  const keys = Object.keys(habit);
  const judgmentKeys = [
    "good",
    "bad",
    "healthy",
    "unhealthy",
    "productive",
    "unproductive",
    "successful",
    "failed",
  ];

  judgmentKeys.forEach((key) => {
    assertEquals(
      keys.includes(key),
      false,
      `Neutrality violated: habit must not contain judgment parameter "${key}"`,
    );
  });
});

test("habitService handles workspace events, notifications, and user overrides", () => {
  habitService.initialize();

  // Record initial observation
  const h1 = habitService.recordBehaviorObservation("Morning Session Focus", "presence");
  assertEquals(h1.status, "BehaviorObserved", "Habit starts as BehaviorObserved");

  // Trigger duplicate observation
  const h2 = habitService.recordBehaviorObservation("Morning Session Focus", "state");
  assertEquals(h2.evidence.length, 2, "Second observation adds supporting evidence");

  // Explicit user correction override
  habitService.correctHabit(h1.id, "name", "Early Morning Deep Work", "Refined deep focus label");

  const context = habitService.getContext();
  const updatedHabit = context?.observedHabits.find((h) => h.id === h1.id);
  assertEquals(updatedHabit?.name, "Early Morning Deep Work", "User overridden name matches");
  assertEquals(updatedHabit?.confidence, 1.0, "Verified user correction has 1.00 confidence");

  // Shut down service
  habitService.shutdown();
});

// ----------------------------------------------------

console.log(`\nTest Run Completed: ${passedTests} / ${totalTests} Passed.`);
if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
