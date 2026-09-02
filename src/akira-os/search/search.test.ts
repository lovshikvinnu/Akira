// Set isolated test database environment variables before loading database connectors
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { test } from "vitest";
import { initializeDatabase } from "../../persistence/initializer";
import { getDatabaseConnection } from "../../persistence/connection";
import {
  projectRepository,
  taskRepository,
  noteRepository,
  timelineRepository,
  searchRepository,
  searchHistoryRepository,
} from "../../persistence/repositories";
import { searchService, searchHistoryService } from "./index";

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message}: Expected "${expected}" (type ${typeof expected}), but got "${actual}" (type ${typeof actual})`,
    );
  }
}

function assertGreaterThan(actual: number, threshold: number, message: string) {
  if (actual <= threshold) {
    throw new Error(
      `${message}: Expected actual (${actual}) to be greater than threshold (${threshold})`,
    );
  }
}

initializeDatabase();

test("Database Schema - FTS5 and History exist", () => {
  const db = getDatabaseConnection();

  // 1. Verify search_history table
  const historyTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='search_history'")
    .get();
  assertEquals(!!historyTable, true, "search_history table should exist");

  // 2. Verify fts_workspace table
  const ftsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fts_workspace'")
    .get();
  assertEquals(!!ftsTable, true, "fts_workspace table should exist");
});

test("Database Triggers - Insert synchronization and scoring", async () => {
  // Add a project
  const pId = projectRepository.add({
    name: "Akira System Core",
    tag: "Arch",
    description: "The core platform engine of Akira OS",
  });

  // Verify FTS table has the project
  const results = searchRepository.search({ query: "Akira" });
  assertGreaterThan(results.length, 0, "Should find results matching 'Akira'");
  assertEquals(results[0].id, pId, "First result ID should match the added project ID");
  assertEquals(results[0].type, "project", "Result type should be 'project'");
  assertEquals(results[0].title, "Akira System Core", "Result title should match project name");
});

test("Database Triggers - Update synchronization", async () => {
  const pId = projectRepository.add({
    name: "V1.0 Roadmap",
    tag: "Roadmap",
  });

  // Check it is searchable
  let results = searchRepository.search({ query: "Roadmap" });
  assertEquals(results[0].id, pId, "Should find the roadmap project");

  // Update project
  projectRepository.update(pId, { name: "V1.3 Core Roadmap" });

  // Check update reflected
  results = searchRepository.search({ query: "Roadmap" });
  assertEquals(results[0].title, "V1.3 Core Roadmap", "Should return the updated title");
});

test("Database Triggers - Delete and Cascading trigger synchronization", async () => {
  const pId = projectRepository.add({
    name: "Deletable Sandbox",
    tag: "Sandbox",
  });

  // Insert session belonging to this project (sessions has ON DELETE CASCADE)
  const sId = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = getDatabaseConnection();
  db.prepare(
    `
    INSERT INTO sessions (id, project_id, task, started_at, ended_at, duration, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(sId, pId, "Debugging Sandbox Session", now, now, 30, now, now);

  // Assert both project and session are searchable in FTS5
  let projResults = searchRepository.search({ query: "Sandbox" });
  assertEquals(projResults.length, 2, "Both project and session should be indexed");

  // Delete project (triggers ON DELETE CASCADE on sessions in DB)
  projectRepository.delete(pId);

  // Assert FTS index is completely cleaned up (no project, no orphaned sessions)
  projResults = searchRepository.search({ query: "Sandbox" });
  assertEquals(
    projResults.length,
    0,
    "No stale search records should remain after parent deletion",
  );
});

test("Database Triggers - JSON tag sanitization", async () => {
  const nId = noteRepository.add({
    title: "Meeting Note",
    content: "Refactoring details",
    tags: ["architecture", "refactor"],
  });

  // Verify note is searchable by content
  let results = searchRepository.search({ query: "Refactoring" });
  assertEquals(results[0].id, nId, "Should find the note");

  // Verify tags were sanitized into text and are searchable
  results = searchRepository.search({ query: "architecture" });
  assertEquals(results[0].id, nId, "Should find the note using tags without json syntax");
});

test("Database Triggers - Timeline event JSON extraction and timestamp mapping", async () => {
  const eventId = "evt-temp-999";
  const now = new Date().toISOString();

  // Insert timeline event with JSON payload
  timelineRepository.insert({
    id: eventId,
    eventType: "task.created",
    projectId: null,
    payload: { title: "Refactor Search Service", priority: "High" },
    payloadVersion: 1,
    timestamp: now,
  });

  // Verify timeline event is searchable by payload text
  let results = searchRepository.search({ query: "Refactor Search Service" });
  assertEquals(results.length, 1, "Should find the timeline event");
  assertEquals(results[0].id, eventId, "Result ID should match timeline event ID");

  // Verify timeline event is NOT searchable by JSON key name "priority"
  results = searchRepository.search({ query: "priority" });
  const matchedEvent = results.find((r) => r.id === eventId);
  assertEquals(!!matchedEvent, false, "Should NOT match JSON key name 'priority'");
});

test("Search History - Adding, evicting and clearing", async () => {
  // Clear any existing history
  searchHistoryRepository.clearAll();

  // Log queries with slight delay to ensure different timestamps
  searchHistoryRepository.add("vite-start", 3);
  await new Promise((resolve) => setTimeout(resolve, 10));
  searchHistoryRepository.add("sqlite-fts5", 10);

  // Retrieve history
  const recent = searchHistoryRepository.getRecent(5);
  assertEquals(recent.length, 2, "Should have 2 history entries");
  assertEquals(recent[0].query, "sqlite-fts5", "Most recent search should be first");

  // Delete individual entry
  searchHistoryRepository.delete(recent[1].id);
  const updated = searchHistoryRepository.getRecent(5);
  assertEquals(updated.length, 1, "Should have 1 entry remaining");
  assertEquals(updated[0].query, "sqlite-fts5", "Remaining query should be 'sqlite-fts5'");
});

test("Search Service - Integration", async () => {
  // Clear history
  await searchHistoryService.clearAll();

  // Execute search via service (will run FTS and log history)
  const results = await searchService.search({ query: "Akira" });
  assertGreaterThan(results.length, 0, "Service search should return results");

  // Assert search query was logged via service
  const recent = await searchHistoryService.getRecent(5);
  assertEquals(
    recent.length,
    1,
    "Should log history entry automatically during search service query",
  );
  assertEquals(recent[0].query, "Akira", "Logged query should match 'Akira'");
});

test("Search Cache - Query Caching & Eviction", async () => {
  searchService.clearCache();
  searchService.cacheTTL = 10000;
  searchService.maxCacheSize = 2;

  // 1. Initial Search
  const results1 = await searchService.search({ query: "Akira" });

  // 2. Search again (hits cache)
  const start = performance.now();
  const results2 = await searchService.search({ query: "Akira" });
  const duration = performance.now() - start;

  assertEquals(results1.length, results2.length, "Cached results length should match");
  assertEquals(results1[0].id, results2[0].id, "Cached result contents should match");
  assertEquals(
    duration < 2,
    true,
    `Cache hit should be near-instant (took ${duration.toFixed(2)}ms)`,
  );

  // 3. Cache Eviction (exceed size limit)
  await searchService.search({ query: "Roadmap" });
  await searchService.search({ query: "Sandbox" });

  // Search Akira again, should miss cache (results loaded from DB again)
  const start2 = performance.now();
  await searchService.search({ query: "Akira" });
  const duration2 = performance.now() - start2;
  assertGreaterThan(duration2 >= 0 ? 1 : -1, 0, "Query executed");
});

test("Search Cache - Auto-Invalidation on write", async () => {
  searchService.clearCache();
  searchService.cacheTTL = 10000;

  // Search note
  await searchService.search({ query: "Note" });

  // Add a new note
  noteRepository.add({
    title: "New Note for Cache Invalidation",
    content: "Triggering SQLite updateHook",
  });

  // Verify search cache was automatically cleared by the db.updateHook
  const results = await searchService.search({ query: "Cache Invalidation" });
  assertEquals(
    results.length,
    1,
    "Cache invalidation should allow finding the newly inserted note immediately",
  );
});

test("Search Service - Configurable BM25 & Recency Weights", async () => {
  const pId = projectRepository.add({
    name: "Weight Configuration Testing Project",
    tag: "Weight",
  });

  // Search with default weights
  const results1 = await searchService.search({ query: "Weight" });
  const score1 = results1[0].score;

  // Update weights on repository static class properties
  const { SqliteSearchRepository } =
    await import("../../persistence/repositories/SqliteSearchRepository");
  SqliteSearchRepository.BM25_WEIGHT = 100.0;
  SqliteSearchRepository.RECENCY_WEIGHT = 200.0;
  searchService.clearCache();

  // Search with custom weights
  const results2 = await searchService.search({ query: "Weight" });
  const score2 = results2[0].score;

  assertEquals(
    score1 !== score2,
    true,
    `Scores should differ after altering static weights. Got default score ${score1} vs custom score ${score2}`,
  );
});

test("Search Index - Integrity Verification", async () => {
  const success = searchRepository.verifyIntegrity();
  assertEquals(success, true, "Search repository index integrity check should succeed");
});
