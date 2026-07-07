import {
  observeNode,
  updateNodeStatus,
  applyUserCorrection,
  buildKnowledgeContext,
  knowledgeService,
} from "./index.ts";
import { goalService } from "../goals/index.ts";

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

test("knowledge observation creates node with correct status and confidence", () => {
  const node = observeNode("n-1", "Concept", "Parsing", "Syntax checking");

  assertEquals(node.id, "n-1", "Node ID matches");
  assertEquals(node.status, "Observed", "Status should be Observed");
  assertEquals(node.confidence, 0.3, "Initial confidence is 0.30");
});

test("knowledge lifecycle transitions adjust confidence levels", () => {
  let node = observeNode("n-2", "Skill", "AST construction", "desc");

  node = updateNodeStatus(node, "Inferred");
  assertEquals(node.status, "Inferred", "Status transitions to Inferred");
  assertEquals(node.confidence, 0.5, "Inferred confidence is 0.50");

  node = updateNodeStatus(node, "Refined");
  assertEquals(node.status, "Refined", "Status transitions to Refined");
  assertEquals(node.confidence, 0.75, "Refined confidence is 0.75");

  node = updateNodeStatus(node, "Reinforced");
  assertEquals(node.status, "Reinforced", "Status transitions to Reinforced");
  assertEquals(node.confidence, 0.9, "Reinforced confidence is 0.90");

  node = updateNodeStatus(node, "Updated");
  assertEquals(node.status, "Updated", "Status transitions to Updated");
  assertEquals(node.confidence, 0.85, "Updated confidence is 0.85");

  node = updateNodeStatus(node, "Deprecated");
  assertEquals(node.status, "Deprecated", "Status transitions to Deprecated");
  assertEquals(node.confidence, 0.1, "Deprecated confidence is 0.10");
});

test("user correction overrides values and locks confidence to 1.00", () => {
  let node = observeNode("n-3", "Concept", "PEG Parsing", "PEG rules");
  node = applyUserCorrection(node, "status", "Reinforced");

  assertEquals(node.status, "Reinforced", "User corrected status to Reinforced");
  assertEquals(node.confidence, 1.0, "Verified user correction sets confidence to 1.00");
});

test("context builder compiles domains, progress, gaps and clarifications", () => {
  const domain = observeNode("d-1", "Domain", "Compilers", "Compiler systems");
  const concept1 = observeNode("c-1", "Concept", "Lexer", "Lexical parsing", "d-1");
  const concept2 = observeNode("c-2", "Concept", "Parser", "AST parsing", "d-1");

  // Mark Lexer as prerequisite of Parser
  const relationships = [{ fromId: "c-1", toId: "c-2", type: "prerequisite" as const }];

  // Lexer is Observed (low confidence < 0.60), so it should represent a knowledge gap for Parser
  const context = buildKnowledgeContext([domain, concept1, concept2], relationships, []);

  assertEquals(context.origin, "KnowledgeEngine", "Context origin matches");
  assertEquals(context.knownDomains.length, 1, "Only 1 domain should be output");
  assertEquals(context.concepts.length, 2, "2 concepts should be output");
  assertEquals(context.knowledgeGaps.length, 1, "1 knowledge gap should be detected");
  assertEquals(context.knowledgeGaps[0].nodeId, "c-2", "Parser is missing prerequisites");
  assertEquals(
    context.knowledgeGaps[0].missingPrerequisiteNodeIds.includes("c-1"),
    true,
    "Lexer is the missing prerequisite",
  );
});

test("areas requiring clarification flags Deprecated or low confidence nodes", () => {
  const node1 = observeNode("n-4", "Concept", "Obsolete API", "details");
  const node2 = updateNodeStatus(node1, "Deprecated");

  const context = buildKnowledgeContext([node2], [], []);
  assertEquals(
    context.areasRequiringClarification.includes("n-4"),
    true,
    "Deprecated node requires clarification",
  );
});

test("Goal-Task separation is preserved throughout Knowledge Engine interactions", () => {
  // Initialize services
  goalService.initialize();
  knowledgeService.initialize();

  // Confirm that seeding default knowledge did NOT implicitly create any goals in the Goal Engine
  const goalContext = goalService.getContext();
  assertEquals(goalContext !== null, true, "Goal context is available");
  assertEquals(
    goalContext?.activeGoals.length,
    0,
    "No goals should be created implicitly by the Knowledge Engine",
  );

  // Shutdown services
  knowledgeService.shutdown();
  goalService.shutdown();
});

// ----------------------------------------------------

console.log(`\nTest Run Completed: ${passedTests} / ${totalTests} Passed.`);
if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
