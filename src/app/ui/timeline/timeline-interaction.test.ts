import { Route } from "../../../routes/timeline";

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
      `${message} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

test("URL Query Parameter Schema Validation", () => {
  const schema = (Route as any).options.validateSearch;

  // Valid default parsing
  const parsedEmpty = schema.parse({});
  assertEquals(parsedEmpty.sort, "desc", "Default sort should be desc");
  assertEquals(parsedEmpty.v, 1, "Default version should be v1");

  // Valid filters mapping
  const parsedFilters = schema.parse({
    search: "test",
    projectId: "proj-123",
    categories: ["tasks", "notes"],
  });
  assertEquals(parsedFilters.search, "test", "Search parameter should map correctly");
  assertEquals(parsedFilters.projectId, "proj-123", "Project ID should map correctly");
  assertEquals(parsedFilters.categories[0], "tasks", "Category array should map correctly");

  // Invalid fallback recovery
  const invalidSort = schema.parse({ sort: "invalid" });
  assertEquals(invalidSort.sort, "desc", "Invalid sort parameter should recover to desc");
});

console.log(`\nTimeline Interaction Test Run Completed: ${passedTests} / ${totalTests} Passed.`);
if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
