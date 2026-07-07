import {
  observePerson,
  updateRelationshipStatus,
  recordInteraction,
  applyUserCorrection,
  buildRelationshipContext,
  relationshipService,
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

test("observePerson sets initial unpromoted status and low confidence", () => {
  const rel = observePerson("p-1", "Alice");

  assertEquals(rel.id, "p-1", "Person ID matches");
  assertEquals(rel.name, "Alice", "Name matches");
  assertEquals(rel.status, "PersonObserved", "Initial status must be PersonObserved");
  assertEquals(rel.confidence, 0.2, "Initial confidence should be 0.20");
  assertEquals(rel.significance, 1, "Initial significance is 1");
});

test("duplicate mentions increment frequency but do not auto-promote status (evidence-driven)", () => {
  let rel = observePerson("p-2", "Bob");
  assertEquals(rel.status, "PersonObserved", "Bob starts as PersonObserved");

  // Interactions should merely increment frequency, not auto-promote
  for (let i = 0; i < 5; i++) {
    rel = recordInteraction(rel);
  }

  assertEquals(rel.interactionFrequency, 6, "Bob interaction frequency is 6");
  assertEquals(
    rel.status,
    "PersonObserved",
    "Bob remains PersonObserved (no fixed numeric threshold)",
  );

  // Explicit user correction serves as sufficient supporting evidence
  rel = applyUserCorrection(rel, "status", "RelationshipIdentified");
  assertEquals(rel.status, "RelationshipIdentified", "Explicit correction promotes Bob");
  assertEquals(rel.confidence, 1.0, "Verified user evidence locks confidence at 1.0");
});

test("lifecycle transitions match baseline specification values", () => {
  let rel = observePerson("p-3", "Charlie");

  rel = updateRelationshipStatus(rel, "RelationshipUnderstood");
  assertEquals(rel.confidence, 0.7, "RelationshipUnderstood confidence is 0.70");

  rel = updateRelationshipStatus(rel, "RelationshipRefined");
  assertEquals(rel.confidence, 0.85, "RelationshipRefined confidence is 0.85");

  rel = updateRelationshipStatus(rel, "RelationshipEvolved");
  assertEquals(rel.confidence, 0.9, "RelationshipEvolved confidence is 0.90");

  rel = updateRelationshipStatus(rel, "RelationshipArchived");
  assertEquals(rel.confidence, 0.3, "RelationshipArchived confidence is 0.30");
});

test("archived connections are omitted from active relationship context properties", () => {
  const rel1 = observePerson("p-4", "David");
  let rel2 = observePerson("p-5", "Eve");
  rel2 = updateRelationshipStatus(rel2, "RelationshipArchived");

  const context = buildRelationshipContext([rel1, rel2], []);

  assertEquals(
    context.importantPeople.length,
    1,
    "Archived contacts are excluded from importantPeople",
  );
  assertEquals(context.importantPeople[0].id, "p-4", "Only active contact David is returned");
});

test("user correction overrides values and locks confidence to 1.00", () => {
  let rel = observePerson("p-6", "Frank");
  rel = applyUserCorrection(rel, "role", "Lead Compiler Engineer");

  assertEquals(rel.role, "Lead Compiler Engineer", "User corrected role matches");
  assertEquals(rel.confidence, 1.0, "Verified user correction sets confidence to 1.00");
});

test("relationship neutrality constraint is preserved", () => {
  const rel = observePerson("p-7", "Grace");

  // Assert that no emotional or sentiment judgment properties exist
  const keys = Object.keys(rel);
  const judgmentKeys = ["healthy", "toxic", "good", "bad", "successful", "failed"];

  judgmentKeys.forEach((key) => {
    assertEquals(
      keys.includes(key),
      false,
      `Neutrality violated: relationship must not contain judgment parameter "${key}"`,
    );
  });
});

test("relationshipService handles duplicate observations and user overrides", () => {
  relationshipService.initialize();

  // Initial observation
  const r1 = relationshipService.recordObservation("Heidi");
  assertEquals(r1.status, "PersonObserved", "Heidi starts as PersonObserved");

  // Duplicate observation
  const r2 = relationshipService.recordObservation("Heidi");
  assertEquals(r2.interactionFrequency, 2, "Interaction frequency incremented");
  assertEquals(
    relationshipService.getContext()?.importantPeople.length,
    1,
    "Only one contact Heidi exists",
  );

  // User correction override
  relationshipService.correctRelationship(
    r1.id,
    "role",
    "Lead Mentor",
    "Heidi is guiding my compiler project studies",
  );

  const context = relationshipService.getContext();
  const updatedNode = context?.importantPeople.find((p) => p.id === r1.id);
  assertEquals(updatedNode?.role, "Lead Mentor", "Override role saved");
  assertEquals(updatedNode?.confidence, 1.0, "Corrected contact has 1.00 confidence");

  // Shutdown service
  relationshipService.shutdown();
});

// ----------------------------------------------------

console.log(`\nTest Run Completed: ${passedTests} / ${totalTests} Passed.`);
if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
