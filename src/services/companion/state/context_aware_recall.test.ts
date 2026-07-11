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

// Import services and store using relative paths matching companionStateService imports
import { akira } from "../../akira-store";
import { companionStateService } from "./service";
import { memoryService } from "../../memory/validation/memory-service";
import { recallBuilder } from "../../recall/recall-builder";
import { recallService } from "../../recall/recall-service";
import { eventService } from "../../events/event-service";

import { presenceService } from "../presence/service";
import { goalService } from "../goals/service";
import { knowledgeService } from "../knowledge/service";
import { relationshipService } from "../relationships/service";
import { habitService } from "../habits/service";
import { reflectionService } from "../reflection/service";
import { contextResolutionService } from "../context-resolution/service";
import { initiativeService } from "../initiative/service";

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

// Helper to fully reset state between runs
function resetEnvironment() {
  localStorage.clear();
  akira.clearChat();
  memoryService.clearHistory();

  // Clean store arrays directly to avoid residuals
  const state = akira.getState();
  state.memories = [];
  state.projects = [];
  state.tasks = [];
  state.sessions = [];
  state.activeSession = null;
  state.lastProjectId = null;

  presenceService.initialize();
  companionStateService.closeSession();
}

// Perform initial system boot once
presenceService.initialize();
companionStateService.bootstrap();
goalService.initialize();
knowledgeService.initialize();
relationshipService.initialize();
habitService.initialize();
reflectionService.initialize();
contextResolutionService.initialize();
initiativeService.initialize();

// ----------------------------------------------------

test("Scenario 1: Long-term dream (Goal memory) is recalled on Bootstrap", () => {
  resetEnvironment();

  // Conversation A: User submits their dream
  akira.addChatMessage("user", "My dream is to become a pilot.");

  // Record the workspace/chat interaction which promotes the memory
  eventService.record(
    "note_created",
    "Workspace Interaction",
    'User query submitted to AKIRA: "My dream is to become a pilot."',
  );

  // Re-run builder to process memory
  recallBuilder.rebuildRecallCandidates();

  // Restart / New Chat: Clear active chat logs and bootstrap a brand-new session
  akira.clearChat();
  companionStateService.closeSession();

  // Bootstrap runs in BOOTSTRAP context because chat is empty
  const state = companionStateService.bootstrap();

  // Retrieve the snapshot built during bootstrap
  const snapshot = (companionStateService as any).compileSnapshotFromStore();

  const hasDreamMemory = snapshot.relevantMemories.some((desc: string) =>
    desc.includes("My dream is to become a pilot"),
  );

  assertEquals(
    hasDreamMemory,
    true,
    "Dream memory must be resolved and present in the initial bootstrap snapshot",
  );
});

test("Scenario 2: Project building (Project memory) is recalled on Bootstrap", () => {
  resetEnvironment();

  // Add the project 'AKIRA' to the store so context match alignment can evaluate it
  akira.addProject({
    name: "AKIRA",
    tag: "AKI",
    description: "Personal AI Companion",
  });
  const proj = akira.getState().projects[0];
  akira.touchProject(proj.id);

  // Conversation A: Continuous work logged on AKIRA
  eventService.record(
    "project_continued",
    "Project Arc: Project Continued",
    'Continuous work logged on project "AKIRA".',
    proj.id,
    null,
    { name: "AKIRA" },
  );

  // Re-run builder to process memory
  recallBuilder.rebuildRecallCandidates();

  // Restart / New Chat
  akira.clearChat();
  companionStateService.closeSession();

  // Bootstrap the session
  const state = companionStateService.bootstrap();
  const snapshot = (companionStateService as any).compileSnapshotFromStore();

  const hasProjectMemory = snapshot.relevantMemories.some((desc: string) =>
    desc.includes('Continuous work logged on project "AKIRA"'),
  );

  assertEquals(
    hasProjectMemory,
    true,
    "Project building memory must be present in the initial bootstrap snapshot",
  );
});

test("Scenario 3: Coffee preference (low significance) is excluded on Bootstrap", () => {
  resetEnvironment();

  // Conversation A: User states a simple preference
  akira.addChatMessage("user", "I like coffee.");
  eventService.record(
    "note_created",
    "Workspace Interaction",
    'User query submitted to AKIRA: "I like coffee."',
  );

  // Re-run builder to process memory
  recallBuilder.rebuildRecallCandidates();

  // Restart / New Chat
  akira.clearChat();
  companionStateService.closeSession();

  // Bootstrap the session
  const state = companionStateService.bootstrap();
  const snapshot = (companionStateService as any).compileSnapshotFromStore();

  console.log(
    "Bootstrap Recall Candidates:",
    JSON.stringify(
      (companionStateService as any).compileSnapshotFromStore().relevantMemories,
      null,
      2,
    ),
  );
  console.log(
    "Memory List inside memoryService:",
    JSON.stringify(memoryService.getMemories(), null, 2),
  );
  console.log(
    "Recall Session candidates:",
    JSON.stringify(recallBuilder.rebuildRecallCandidates("BOOTSTRAP"), null, 2),
  ); // wait, rebuildRecallCandidates returns void but we can check recallService
  console.log(
    "Active Recall Candidates:",
    JSON.stringify(recallService.getRecallCandidates(), null, 2),
  );

  const hasCoffeeMemory = snapshot.relevantMemories.some((desc: string) =>
    desc.includes("I like coffee"),
  );

  assertEquals(
    hasCoffeeMemory,
    false,
    "Coffee preference memory must be excluded from the initial bootstrap snapshot",
  );
});

console.log(`\nValidation Complete: ${passedTests} / ${totalTests} Passed.`);
if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
