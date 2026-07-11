/* eslint-disable @typescript-eslint/no-explicit-any */
// Mock DOM / Browser environment variables needed by services
const mockLocalStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) {
    return this.store[key] || null;
  },
  setItem(key: string, value: string) {
    this.store[key] = value;
  },
  removeItem(key: string) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  },
};

const mockSessionStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) {
    return this.store[key] || null;
  },
  setItem(key: string, value: string) {
    this.store[key] = value;
  },
  removeItem(key: string) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  },
};

global.window = global as any;
global.localStorage = mockLocalStorage as any;
global.sessionStorage = mockSessionStorage as any;

// Import our new understanding subsystem and existing services
import { memoryService } from "../memory/validation/memory-service";
import { storyService } from "../stories/story-service";
import { understandingEngine } from "./engine";
import { buildUnderstandingGraph } from "./builder";
import { insightEngine } from "./insight-engine";
import { serializeUnderstanding, serializeUnderstandings } from "./serializer";
import { getUnderstandingContext } from "./context-provider";
import { getInsightContext } from "./insight-context-provider";
import { serializeInsight } from "./insight-serializer";
import { MemoryCandidate } from "../memory/candidate";

let totalTests = 0;
let passedTests = 0;

function test(name: string, fn: () => void) {
  totalTests++;
  console.log(`Running: ${name}`);
  try {
    fn();
    passedTests++;
    console.log(`  ✓ Passed`);
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

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function resetEnvironment() {
  memoryService.clearHistory();
  storyService.clearHistory();
  understandingEngine.dispose();
  insightEngine.dispose();

  // Clear any internal variables in the store
  const state = (global as any).localStorage?.clear?.();
}

// ----------------------------------------------------

test("Goal Rule clusters goal progress memories and stories deterministically", () => {
  resetEnvironment();

  // 1. Process memory candidate
  const candidate: MemoryCandidate = {
    id: "mem-1",
    sourceEventId: "evt-1",
    timestamp: new Date().toISOString(),
    reason: "Goal Progress",
    explanation: "User made progress on pilot goal",
    title: "Aviation Study",
    description: "Preparing for CPL Meteorology",
    metadata: {
      goalId: "pilot-license",
      category: "Goal",
    },
  };

  const memory = memoryService.processCandidate(candidate);
  assert(memory !== null, "Memory should be promoted");

  // 2. Create a story
  const story = storyService.createStory({
    title: "My Aviation Goal Story",
    summary: "Goal ID: pilot-license. Tracking aviation milestones.",
    status: "Active",
    ruleProvenance: "Goal Clustering",
  });

  // 3. Build graph
  const graph = buildUnderstandingGraph(memoryService.getMemories(), storyService.getStories());

  const goalUnderstanding = graph.find((u) => u.canonicalKey === "goal:pilot-license");
  assert(goalUnderstanding !== undefined, "Should form goal understanding");
  assertEquals(goalUnderstanding?.category, "Goal", "Category should be Goal");
  assert(!!goalUnderstanding?.supportingMemoryIds.includes(memory!.id), "Should link memory");
  assert(!!goalUnderstanding?.supportingStoryIds.includes(story.id), "Should link story");
});

test("Project Rule clusters project memories and stories deterministically", () => {
  resetEnvironment();

  const candidate: MemoryCandidate = {
    id: "mem-2",
    sourceEventId: "evt-2",
    timestamp: new Date().toISOString(),
    reason: "Milestone",
    explanation: "Project milestone reached",
    title: "Akira UI",
    description: "Completed dashboard interface",
    relatedProjectId: "akira-core",
  };

  const memory = memoryService.processCandidate(candidate);
  assert(memory !== null, "Memory should be promoted");

  const story = storyService.createStory({
    title: "Project Arc: Akira UI",
    summary: "Evolving narrative tracking milestones for Project ID: akira-core.",
    status: "Active",
    ruleProvenance: "Project Clustering Rule",
  });

  const graph = buildUnderstandingGraph(memoryService.getMemories(), storyService.getStories());

  const projectUnderstanding = graph.find((u) => u.canonicalKey === "project:akira-core");
  assert(projectUnderstanding !== undefined, "Should form project understanding");
  assertEquals(projectUnderstanding?.category, "Project", "Category should be Project");
  assert(!!projectUnderstanding?.supportingMemoryIds.includes(memory!.id), "Should link memory");
  assert(!!projectUnderstanding?.supportingStoryIds.includes(story.id), "Should link story");
});

test("Knowledge, Habit, Relationship, and Preference rules cluster their respective types", () => {
  resetEnvironment();

  // Knowledge candidate
  const memKnowledge = memoryService.processCandidate({
    id: "mem-k",
    sourceEventId: "evt-k",
    timestamp: new Date().toISOString(),
    reason: "Milestone",
    explanation: "Research note saved",
    title: "Aerodynamics Notes",
    description: "Notes on lift physics",
    relatedNoteId: "note-123",
  })!;

  // Habit candidate
  const memHabit = memoryService.processCandidate({
    id: "mem-h",
    sourceEventId: "evt-h",
    timestamp: new Date().toISOString(),
    reason: "Milestone",
    explanation: "Gym streak recorded",
    title: "Workout Habit",
    description: "Went to gym",
    metadata: { habitId: "gym-streak", category: "Habit" },
  })!;

  // Relationship candidate
  const memRel = memoryService.processCandidate({
    id: "mem-r",
    sourceEventId: "evt-r",
    timestamp: new Date().toISOString(),
    reason: "Milestone",
    explanation: "Discussion with flight instructor",
    title: "Instructor sync",
    description: "Flight instructor alignment",
    metadata: { relationshipId: "instructor-john", category: "Relationship" },
  })!;

  // Preference candidate
  const memPref = memoryService.processCandidate({
    id: "mem-p",
    sourceEventId: "evt-p",
    timestamp: new Date().toISOString(),
    reason: "Milestone",
    explanation: "Theme changed",
    title: "UI Preference",
    description: "Set theme to dark mode",
    metadata: { preferenceKey: "dark-mode-theme", isPreference: true },
  })!;

  const graph = buildUnderstandingGraph(memoryService.getMemories(), storyService.getStories());

  const knowU = graph.find((u) => u.canonicalKey === "knowledge:note-123");
  const habU = graph.find((u) => u.canonicalKey === "habit:gym-streak");
  const relU = graph.find((u) => u.canonicalKey === "relationship:instructor-john");
  const prefU = graph.find((u) => u.canonicalKey === "preference:dark-mode-theme");

  assert(knowU !== undefined, "Should form knowledge understanding");
  assertEquals(knowU?.category, "Knowledge", "Category must be Knowledge");

  assert(habU !== undefined, "Should form habit understanding");
  assertEquals(habU?.category, "Habit", "Category must be Habit");

  assert(relU !== undefined, "Should form relationship understanding");
  assertEquals(relU?.category, "Relationship", "Category must be Relationship");

  assert(prefU !== undefined, "Should form preference understanding");
  assertEquals(prefU?.category, "Preference", "Category must be Preference");
});

test("Builder preserves identity and updates only affected understandings", () => {
  resetEnvironment();

  // Create initial state
  const candidate1: MemoryCandidate = {
    id: "mem-1",
    sourceEventId: "evt-1",
    timestamp: new Date().toISOString(),
    reason: "Milestone",
    explanation: "Initial milestone",
    title: "Akira UI",
    description: "Description 1",
    relatedProjectId: "akira-core",
  };
  const mem1 = memoryService.processCandidate(candidate1)!;

  const graphV1 = buildUnderstandingGraph([mem1], []);
  assertEquals(graphV1.length, 1, "Graph should have one project understanding");
  const pV1 = graphV1[0];

  // Run build again with NO changes
  const graphV2 = buildUnderstandingGraph([mem1], [], graphV1);
  assertEquals(graphV2.length, 1, "Graph should still have one item");
  assert(graphV2[0] === pV1, "Graph object reference MUST be preserved if nothing changed");

  // Run build again WITH changes (add supporting memory)
  const candidate2: MemoryCandidate = {
    id: "mem-2",
    sourceEventId: "evt-2",
    timestamp: new Date().toISOString(),
    reason: "Milestone",
    explanation: "Secondary milestone",
    title: "Akira Backend",
    description: "Description 2",
    relatedProjectId: "akira-core",
  };
  const mem2 = memoryService.processCandidate(candidate2)!;

  const graphV3 = buildUnderstandingGraph([mem1, mem2], [], graphV2);
  assertEquals(graphV3.length, 1, "Graph should still have one item");
  const pV3 = graphV3[0];
  assert(pV3 !== pV1, "Object reference must change when supporting memories update");
  assertEquals(pV3.id, pV1.id, "ID must be preserved across graph updates");
  assert(typeof pV3.updatedAt === "string", "updatedAt must be a string");
  assertEquals(
    pV3.supportingMemoryIds.length,
    2,
    "Supporting memories should now include both items",
  );
});

test("Engine subscribes to memory/story updates and publishes graph updates", () => {
  resetEnvironment();

  let publishCount = 0;
  let latestGraph: any[] = [];

  // Initialize engine
  understandingEngine.initialize();

  // Subscribe to engine
  const unsub = understandingEngine.subscribe((g) => {
    publishCount++;
    latestGraph = g;
  });

  // Initial subscription callback triggers publishCount to be 1
  assertEquals(publishCount, 1, "Should emit initial state on subscribe");
  assertEquals(latestGraph.length, 0, "Initial graph should be empty");

  // Process a milestone memory
  const candidate: MemoryCandidate = {
    id: "mem-3",
    sourceEventId: "evt-3",
    timestamp: new Date().toISOString(),
    reason: "Milestone",
    explanation: "New milestone",
    title: "Akira UI",
    description: "Subsystem added",
    relatedProjectId: "akira-core",
  };
  memoryService.processCandidate(candidate);

  // Engine is event-driven and should automatically rebuild and notify
  assertEquals(publishCount, 2, "Engine should publish update on memory validation");
  assertEquals(latestGraph.length, 1, "Graph should now contain the new project understanding");
  assertEquals(latestGraph[0].canonicalKey, "project:akira-core", "Canonical key matches");

  // Clean up
  unsub();
  understandingEngine.dispose();
});

test("Serializer renders understandings into natural-language summaries correctly", () => {
  const u1: any = {
    id: "und-1",
    canonicalKey: "goal:pilot",
    category: "Goal",
    confidence: 0.95,
    status: "Active",
    supportingMemoryIds: ["mem-1"],
    supportingStoryIds: ["story-1"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const u2: any = {
    id: "und-2",
    canonicalKey: "project:akira",
    category: "Project",
    confidence: 0.91,
    status: "Active",
    supportingMemoryIds: ["mem-2"],
    supportingStoryIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const u3: any = {
    id: "und-3",
    canonicalKey: "knowledge:embedded-systems",
    category: "Knowledge",
    confidence: "Medium",
    status: "Active",
    supportingMemoryIds: ["mem-3"],
    supportingStoryIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const output1 = serializeUnderstanding(u1);
  assertEquals(
    output1,
    "Goal\n• Pilot\nThe user has consistently demonstrated a long-term commitment toward becoming a pilot.\nConfidence: High (0.95)",
    "Goal serialization match",
  );

  const output2 = serializeUnderstanding(u2);
  assertEquals(
    output2,
    "Project\n• AKIRA\nThe user is actively building AKIRA.\nConfidence: High (0.91)",
    "Project serialization match",
  );

  const output3 = serializeUnderstanding(u3);
  assertEquals(
    output3,
    "Knowledge\n• Embedded Systems\nThe user is actively learning Embedded Systems.\nConfidence: Medium",
    "Knowledge string confidence serialization match",
  );

  const composite = serializeUnderstandings([u1, u2]);
  assertEquals(
    composite,
    "UNDERSTANDINGS\n\nGoal\n• Pilot\nThe user has consistently demonstrated a long-term commitment toward becoming a pilot.\nConfidence: High (0.95)\n\nProject\n• AKIRA\nThe user is actively building AKIRA.\nConfidence: High (0.91)",
    "Composite output match",
  );
});

test("Understanding Context Provider returns empty or formatted context correctly", () => {
  resetEnvironment();

  // 1. Should be empty initially
  assertEquals(getUnderstandingContext(), "", "Initial context should be empty string");

  // 2. Add a memory to form an understanding
  const candidate: MemoryCandidate = {
    id: "mem-test-provider",
    sourceEventId: "evt-test-provider",
    timestamp: new Date().toISOString(),
    reason: "Goal Progress",
    explanation: "User made progress on pilot goal",
    title: "Aviation Study",
    description: "Preparing for CPL Meteorology",
    metadata: {
      goalId: "pilot-license",
      category: "Goal",
    },
  };
  memoryService.processCandidate(candidate);

  // Initialize engine to capture updates
  understandingEngine.initialize();

  const context = getUnderstandingContext();
  assert(context.startsWith("[UNDERSTANDINGS]"), "Context should have [UNDERSTANDINGS] header");
  assert(context.includes("Goal\n• Pilot"), "Context should include serialized goal");
  assert(context.includes("Confidence: Low"), "Context should include confidence");

  // Clean up
  understandingEngine.dispose();
});

test("Insight Engine builds parallel-commitments, learning-momentum, and goal-alignment insights deterministically", () => {
  resetEnvironment();

  // Seed two memories to trigger both a project and a goal understanding
  const memGoal = memoryService.processCandidate({
    id: "mem-g-1",
    sourceEventId: "evt-g-1",
    timestamp: new Date().toISOString(),
    reason: "Goal Progress",
    explanation: "Goal progress made",
    title: "Pilot Training",
    description: "Meteorology DGCA test preparation",
    metadata: { goalId: "pilot", category: "Goal" },
  })!;

  const memProj = memoryService.processCandidate({
    id: "mem-p-1",
    sourceEventId: "evt-p-1",
    timestamp: new Date().toISOString(),
    reason: "Milestone",
    explanation: "Project milestone",
    title: "AKIRA UI",
    description: "Dashboard layout built",
    relatedProjectId: "akira",
  })!;

  const memKnow1 = memoryService.processCandidate({
    id: "mem-k-1",
    sourceEventId: "evt-k-1",
    timestamp: new Date().toISOString(),
    reason: "Milestone",
    explanation: "Study session notes",
    title: "Aviation meteorology note",
    description: "Notes on meteorology and DGCA exams",
    relatedNoteId: "aviation-meteorology",
  })!;

  // Boot understandingEngine & insightEngine
  understandingEngine.initialize();
  insightEngine.initialize();

  const currentInsights = insightEngine.getInsights();
  assert(currentInsights.length >= 3, "Should trigger all 3 initial insight rules");

  const parallel = currentInsights.find(
    (ins) => ins.canonicalKey === "insight:parallel-commitments",
  );
  const momentum = currentInsights.find((ins) => ins.canonicalKey === "insight:learning-momentum");
  const alignment = currentInsights.find(
    (ins) => ins.canonicalKey === "insight:goal-alignment:pilot",
  );

  assert(parallel !== undefined, "Parallel Commitments insight should exist");
  assertEquals(parallel?.category, "Parallel Commitments", "Correct parallel commitments category");

  assert(momentum !== undefined, "Learning Momentum insight should exist");
  assertEquals(momentum?.category, "Learning Momentum", "Correct learning momentum category");

  assert(alignment !== undefined, "Goal Alignment insight should exist");
  assertEquals(alignment?.category, "Goal Alignment", "Correct goal alignment category");

  // Clean up
  insightEngine.dispose();
  understandingEngine.dispose();
});

test("Insight Serializer and Context Provider format outputs correctly", () => {
  resetEnvironment();

  // 1. Should be empty initially
  assertEquals(getInsightContext(), "", "Initial insight context should be empty string");

  // 2. Add an insight manually and serialize it
  const ins: any = {
    id: "ins-test-1",
    canonicalKey: "insight:parallel-commitments",
    category: "Parallel Commitments",
    confidence: 0.93,
    supportingUnderstandingIds: ["und-1", "und-2"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const output = serializeInsight(ins);
  assertEquals(
    output,
    "Parallel Commitments\nThe user is actively pursuing multiple long-term commitments simultaneously.\nConfidence: High (0.93)",
    "Insight serialization matches template",
  );
});

test("Intent-Aware retrieval filters understandings based on query keywords", () => {
  resetEnvironment();

  // Seed goal, project, and knowledge memories to populate understandings
  memoryService.processCandidate({
    id: "mem-g-route",
    sourceEventId: "evt-g-route",
    timestamp: new Date().toISOString(),
    reason: "Goal Progress",
    explanation: "Goal progress made",
    title: "Pilot Training",
    description: "Meteorology DGCA test preparation",
    metadata: { goalId: "pilot", category: "Goal" },
  });

  memoryService.processCandidate({
    id: "mem-p-route",
    sourceEventId: "evt-p-route",
    timestamp: new Date().toISOString(),
    reason: "Milestone",
    explanation: "Project milestone",
    title: "AKIRA UI",
    description: "Dashboard layout built",
    relatedProjectId: "akira",
  });

  memoryService.processCandidate({
    id: "mem-k-route",
    sourceEventId: "evt-k-route",
    timestamp: new Date().toISOString(),
    reason: "Reflection Worthy",
    explanation: "Knowledge gained",
    title: "Meteorology Study",
    description: "Learned cloud types",
    relatedNoteId: "note-meteo",
  });

  understandingEngine.initialize();

  // 1. Goal queries -> should filter for Goal understandings (returns Goal: Pilot)
  const goalQueries = ["What's my goal?", "What's my dream?", "What is my dream goal?"];
  for (const q of goalQueries) {
    const goalContext = getUnderstandingContext(q);
    assert(
      goalContext.includes("Goal\n• Pilot"),
      `Goal query '${q}' should return pilot goal understanding`,
    );
    assert(
      !goalContext.includes("Project\n• AKIRA"),
      `Goal query '${q}' should NOT return project understanding`,
    );
    assert(
      !goalContext.includes("Knowledge\n• Note Meteo"),
      `Goal query '${q}' should NOT return knowledge understanding`,
    );
  }

  // 2. Project queries -> should filter for Project understandings (returns Project: AKIRA)
  const projectQueries = ["What projects am I have?", "What am I building?"];
  for (const q of projectQueries) {
    const projectContext = getUnderstandingContext(q);
    assert(
      projectContext.includes("Project\n• AKIRA"),
      `Project query '${q}' should return AKIRA project understanding`,
    );
    assert(
      !projectContext.includes("Goal\n• Pilot"),
      `Project query '${q}' should NOT return goal understanding`,
    );
    assert(
      !projectContext.includes("Knowledge\n• Note Meteo"),
      `Project query '${q}' should NOT return knowledge understanding`,
    );
  }

  // 3. Knowledge queries -> should filter for Knowledge understandings
  const knowledgeQueries = [
    "What am I learning?",
    "What skills am I developing?",
    "What subjects am I studying?",
  ];
  for (const q of knowledgeQueries) {
    const knowledgeContext = getUnderstandingContext(q);
    assert(
      knowledgeContext.includes("Knowledge\n• Note Meteo"),
      `Knowledge query '${q}' should return meteorology knowledge understanding`,
    );
    assert(
      !knowledgeContext.includes("Goal\n• Pilot"),
      `Knowledge query '${q}' should NOT return goal understanding`,
    );
    assert(
      !knowledgeContext.includes("Project\n• AKIRA"),
      `Knowledge query '${q}' should NOT return project understanding`,
    );
  }

  // 4. Preference queries -> should filter for Preference understandings (empty here)
  const preferenceContext = getUnderstandingContext("What are my settings and preferences?");
  assertEquals(
    preferenceContext,
    "",
    "Preference query should return empty since no Preference understandings exist",
  );

  // 5. Habit queries -> should filter for Habit understandings (empty here)
  const habitContext = getUnderstandingContext("What are my habits?");
  assertEquals(
    habitContext,
    "",
    "Habit query should return empty since no Habit understandings exist",
  );

  // 6. Relationship queries -> should filter for Relationship understandings (empty here)
  const relationshipContext = getUnderstandingContext("Who are my contacts?");
  assertEquals(
    relationshipContext,
    "",
    "Relationship query should return empty since no Relationship understandings exist",
  );

  // 7. General query -> should return all understandings
  const generalQueries = ["What do you understand about me?", "Hello there!", "What do you understand?"];
  for (const q of generalQueries) {
    const generalContext = getUnderstandingContext(q);
    assert(
      generalContext.includes("Goal\n• Pilot"),
      `General query '${q}' should return pilot goal understanding`,
    );
    assert(
      generalContext.includes("Project\n• AKIRA"),
      `General query '${q}' should return AKIRA project understanding`,
    );
    assert(
      generalContext.includes("Knowledge\n• Note Meteo"),
      `General query '${q}' should return knowledge understanding`,
    );
  }

  understandingEngine.dispose();
});

test("R2 - Noise Immunity blocks generation from trivial events but preserves existing understandings", () => {
  resetEnvironment();

  // 1. Seed a trivial memory -> should NOT generate any understandings
  memoryService.processCandidate({
    id: "mem-noise-1",
    sourceEventId: "evt-noise-1",
    timestamp: new Date().toISOString(),
    reason: "Milestone",
    explanation: "Conversational filler",
    title: "Good Morning",
    description: "Ok",
  });

  understandingEngine.initialize();
  assertEquals(
    understandingEngine.getUnderstandings().length,
    0,
    "Noise memory should not generate any understandings",
  );
  understandingEngine.dispose();

  // 2. Seed a non-trivial memory -> should generate understandings
  memoryService.processCandidate({
    id: "mem-real-1",
    sourceEventId: "evt-real-1",
    timestamp: new Date().toISOString(),
    reason: "Goal Progress",
    explanation: "User made progress on pilot goal",
    title: "Aviation Study",
    description: "Preparing for CPL Meteorology",
    metadata: {
      goalId: "pilot-license",
      category: "Goal",
    },
  });

  understandingEngine.initialize();
  assertEquals(
    understandingEngine.getUnderstandings().length,
    1,
    "Real memory should generate a Goal understanding",
  );
  understandingEngine.dispose();
});

test("R3 - Insight Freshness Mode A (stable) and Mode B (recent) return correct insight context blocks", () => {
  resetEnvironment();
  insightEngine.dispose();

  // 1. Initial should be empty
  assertEquals(getInsightContext(), "", "Initial insights context is empty");

  // 2. Seed understandings to trigger insights
  memoryService.processCandidate({
    id: "mem-g-fresh",
    sourceEventId: "evt-g-fresh",
    timestamp: new Date().toISOString(),
    reason: "Goal Progress",
    explanation: "Goal progress made",
    title: "Pilot Training",
    description: "Meteorology DGCA test preparation",
    metadata: { goalId: "pilot", category: "Goal" },
  });

  memoryService.processCandidate({
    id: "mem-p-fresh",
    sourceEventId: "evt-p-fresh",
    timestamp: new Date().toISOString(),
    reason: "Milestone",
    explanation: "Project milestone",
    title: "AKIRA UI",
    description: "Dashboard layout built",
    relatedProjectId: "akira",
  });

  understandingEngine.initialize();
  insightEngine.initialize();

  // Mode A: Stable insights (What insights have you formed?) -> returns active insights
  const stableContext = getInsightContext("What insights have you formed?");
  assert(stableContext.includes("[INSIGHTS]"), "Mode A should return insights context");
  assert(
    stableContext.includes("Parallel Commitments"),
    "Mode A should include Parallel Commitments insight",
  );

  // Mode B: Recent insights (What new insights have you formed?) -> since they were just created now, they should be in Mode B too
  const recentContext = getInsightContext("What new insights have you formed?");
  assert(recentContext.includes("[INSIGHTS]"), "Mode B should return recently updated insights");
  assert(
    recentContext.includes("Parallel Commitments"),
    "Mode B should include Parallel Commitments in recent window",
  );

  // Mock-simulate past insights by setting updatedAt to 10 minutes ago
  const currentInsights = insightEngine.getInsights();
  if (currentInsights.length > 0) {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    currentInsights.forEach((ins) => {
      ins.updatedAt = tenMinutesAgo;
    });
  }

  // Now Mode B should omit them as they are not recent
  const coldRecentContext = getInsightContext("What new insights have you formed?");
  assertEquals(
    coldRecentContext,
    "",
    "Mode B should be empty because insights are older than 5 minutes",
  );

  // Mode A (Stable) should still return them
  const coldStableContext = getInsightContext("What insights have you formed?");
  assert(
    coldStableContext.includes("Parallel Commitments"),
    "Mode A should still return older active insights",
  );

  insightEngine.dispose();
  understandingEngine.dispose();
});

// ----------------------------------------------------

console.log(`\nTest Run Completed: ${passedTests} / ${totalTests} Passed.`);
if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
