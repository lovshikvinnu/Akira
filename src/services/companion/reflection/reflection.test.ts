import {
  synthesizeReflectionReport,
  applyUserReflectionCorrection,
  buildReflectionContext,
  reflectionService,
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

test("synthesizeReflectionReport compiles goals, knowledge, and habits objectively", () => {
  const goalCtx = {
    origin: "GoalEngine" as const,
    evidence: { evidenceLog: [], goalsSnapshot: [] },
    confidence: 0.9,
    activeGoals: [
      {
        id: "g-1",
        title: "Build Lexer",
        description: "Develop lexical analyzer",
        status: "Completed" as const,
        parentId: null,
        prerequisites: [],
        progressPercentage: 100,
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

  const knowledgeCtx = {
    origin: "KnowledgeEngine" as const,
    evidence: { evidenceLog: [], nodesSnapshot: [] },
    confidence: 0.8,
    knownDomains: [
      {
        id: "d-1",
        name: "Compiler Design",
        type: "Domain" as const,
        description: "Lexing and parsing",
        status: "Observed" as const,
        domainId: null,
        confidence: 0.8,
        evidenceIds: [],
        lastSeenAt: Date.now(),
      },
    ],
    skills: [],
    concepts: [
      {
        id: "n-1",
        name: "Lexing rules",
        type: "Concept" as const,
        description: "Regex patterns",
        status: "Reinforced" as const,
        domainId: "d-1",
        confidence: 0.8,
        evidenceIds: [],
        lastSeenAt: Date.now(),
      },
    ],
    relationships: [],
    learningProgress: [],
    areasRequiringClarification: [],
    knowledgeGaps: [],
  };

  const habitCtx = {
    origin: "HabitIntelligenceEngine" as const,
    evidence: { evidenceLog: [], habitsSnapshot: [] },
    confidence: 0.7,
    observedHabits: [
      {
        id: "h-1",
        name: "Morning Focus block",
        status: "HabitEstablished" as const,
        confidence: 0.7,
        stability: 0.85,
        evidence: [],
        statusHistory: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    habitConfidence: [],
    habitStability: [],
    supportingEvidence: [],
    habitEvolution: [],
    contextDependence: [],
    emergingHabits: [],
    weakeningHabits: [],
  };

  const report = synthesizeReflectionReport(goalCtx, knowledgeCtx, habitCtx, null);

  assertEquals(report.confidence, 0.8, "Composite confidence matches average");
  assertEquals(
    report.progressSummary.includes("Lexer"),
    false,
    "Summaries are descriptive and high-level",
  );
  assertEquals(
    report.achievements.length,
    3,
    "Goal completed, concept mastered, habit established",
  );
  assertEquals(report.achievements[0], "Goal Completed: Build Lexer", "Completed goal recognized");
});

test("reflection neutrality constraint is strictly preserved", () => {
  const report = synthesizeReflectionReport(null, null, null, null);

  // Assert that summaries do not contain judgmental or motivational words
  const checkWords = [
    "great",
    "fantastic",
    "awesome",
    "terrible",
    "lazy",
    "failed",
    "improve",
    "should",
    "must",
    "good job",
  ];

  checkWords.forEach((word) => {
    assertEquals(
      report.progressSummary.toLowerCase().includes(word),
      false,
      `Progress summary must be neutral, containing no subjective advice or motivational tags: "${word}"`,
    );
  });
});

test("temporal decoupling guarantees active sessions consume only read-only historical context", () => {
  reflectionService.initialize();

  const contextBefore = reflectionService.getContext();
  assertEquals(
    contextBefore?.activeReflection,
    null,
    "No active reflection is compiled during active interaction",
  );

  // finalization occurs retrospectively
  reflectionService.finalizeSession(null, null, null, null);

  const contextAfter = reflectionService.getContext();
  assertEquals(
    contextAfter?.activeReflection !== null,
    true,
    "Reflection report becomes available after finalization",
  );

  reflectionService.shutdown();
});

test("user correction overrides reflection summaries and sets confidence to 1.00", () => {
  const initialReport = synthesizeReflectionReport(null, null, null, null);

  const corrected = applyUserReflectionCorrection(
    initialReport,
    "progressSummary",
    "User completed the compiler project tasks.",
  );

  assertEquals(
    corrected.progressSummary,
    "User completed the compiler project tasks.",
    "User summary override matches",
  );
  assertEquals(corrected.confidence, 1.0, "Verified user correction sets confidence to 1.00");
  assertEquals(
    corrected.evidence.some((e) => e.source === "user_correction"),
    true,
    "User correction evidence log recorded",
  );
});

test("interrupted sessions or sparse context logs default cleanly", () => {
  const report = synthesizeReflectionReport(null, null, null, null);
  assertEquals(
    report.progressSummary,
    "No active goal data recorded during this session.",
    "Goal default matches",
  );
  assertEquals(
    report.growthSummary,
    "No skill acquisition progress recorded during this session.",
    "Knowledge default matches",
  );
  assertEquals(
    report.patternSummary,
    "No behavioral routine patterns identified during this session.",
    "Habits default matches",
  );
});

// ----------------------------------------------------

console.log(`\nTest Run Completed: ${passedTests} / ${totalTests} Passed.`);
if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
