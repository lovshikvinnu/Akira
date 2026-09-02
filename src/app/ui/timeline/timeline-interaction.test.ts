import { test } from "vitest";
import { Route } from "../../../routes/timeline";

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
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
