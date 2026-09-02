// Set isolated test database environment variables before loading database connectors
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { test } from "vitest";
import { initializeDatabase } from "../../persistence/initializer";
import { timelineRepository } from "../../persistence/repositories";
import { timelineService } from "./service";
import { eventBus } from "../../shared/infrastructure/event-bus";
import { Events } from "../../contracts/events";
import { getDatabaseConnection } from "../../persistence/connection";

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// Helper to seed projects needed to satisfy SQLite foreign keys
function setupMockProjects() {
  const db = getDatabaseConnection();
  db.prepare("DELETE FROM timeline_events").run();
  db.prepare("DELETE FROM projects").run();

  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO projects (id, name, tag, description, progress, color, created_at, updated_at, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run("proj-1", "Project One", "P1", "Desc", 0, "blue", now, now, "folder");

  db.prepare(
    `
    INSERT INTO projects (id, name, tag, description, progress, color, created_at, updated_at, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run("proj-2", "Project Two", "P2", "Desc", 0, "green", now, now, "folder");

  db.prepare(
    `
    INSERT INTO projects (id, name, tag, description, progress, color, created_at, updated_at, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run("proj-new", "New Project", "PN", "Desc", 0, "blue", now, now, "folder");
}

// Bootstrap schema in isolated in-memory DB
initializeDatabase();

test("TimelineRepository - Insert and Count", () => {
  setupMockProjects();
  assertEquals(timelineRepository.count(), 0, "Initial count should be 0");

  timelineRepository.insert({
    id: "evt-1",
    eventType: "task.created",
    projectId: "proj-1",
    payload: { title: "Test Task" },
    payloadVersion: 1,
    timestamp: new Date().toISOString(),
  });

  assertEquals(timelineRepository.count(), 1, "Count should be 1 after insert");
});

test("TimelineRepository - Keyset Pagination and Sorting", () => {
  setupMockProjects();

  // Insert 3 events with explicit timestamps
  const baseTime = new Date("2026-07-17T02:00:00.000Z").getTime();

  timelineRepository.insert({
    id: "evt-1",
    eventType: "task.created",
    projectId: "proj-1",
    payload: { title: "First Task" },
    payloadVersion: 1,
    timestamp: new Date(baseTime).toISOString(), // oldest
  });

  timelineRepository.insert({
    id: "evt-2",
    eventType: "task.completed",
    projectId: "proj-1",
    payload: { title: "Second Task" },
    payloadVersion: 1,
    timestamp: new Date(baseTime + 1000).toISOString(), // middle
  });

  timelineRepository.insert({
    id: "evt-3",
    eventType: "session.started",
    projectId: "proj-1",
    payload: { task: "Third Task" },
    payloadVersion: 1,
    timestamp: new Date(baseTime + 2000).toISOString(), // newest
  });

  // Test DESC sorting (default)
  const descResult = timelineRepository.findPaged({ limit: 2, sortDirection: "desc" });
  assertEquals(descResult.items.length, 2, "Should return 2 items");
  assertEquals(descResult.items[0].id, "evt-3", "First item should be newest (evt-3)");
  assertEquals(descResult.items[1].id, "evt-2", "Second item should be middle (evt-2)");

  // Test pagination cursor
  const nextCursor = descResult.nextCursor;
  if (!nextCursor) throw new Error("Cursor should be defined");

  const page2Result = timelineRepository.findPaged({
    limit: 2,
    cursor: nextCursor,
    sortDirection: "desc",
  });
  assertEquals(page2Result.items.length, 1, "Page 2 should return remaining 1 item");
  assertEquals(page2Result.items[0].id, "evt-1", "Remaining item should be oldest (evt-1)");

  // Test ASC sorting
  const ascResult = timelineRepository.findPaged({ limit: 2, sortDirection: "asc" });
  assertEquals(ascResult.items[0].id, "evt-1", "First item should be oldest (evt-1)");
});

test("TimelineRepository - Category and Project Filters", () => {
  setupMockProjects();

  timelineRepository.insert({
    id: "evt-1",
    eventType: "task.created",
    projectId: "proj-1",
    payload: { title: "Task on Proj 1" },
    payloadVersion: 1,
    timestamp: new Date().toISOString(),
  });

  timelineRepository.insert({
    id: "evt-2",
    eventType: "note.created",
    projectId: "proj-2",
    payload: { title: "Note on Proj 2" },
    payloadVersion: 1,
    timestamp: new Date().toISOString(),
  });

  // Filter by project ID
  const proj1Result = timelineRepository.findPaged({ limit: 10, filterProjectIds: ["proj-1"] });
  assertEquals(proj1Result.items.length, 1, "Should find 1 item for proj-1");
  assertEquals(proj1Result.items[0].id, "evt-1", "Should match evt-1");

  // Filter by category (notes)
  const noteResult = timelineRepository.findPaged({ limit: 10, filterCategories: ["notes"] });
  assertEquals(noteResult.items.length, 1, "Should find 1 notes event");
  assertEquals(noteResult.items[0].id, "evt-2", "Should match note event evt-2");
});

test("TimelineService - EventBus Integration", async () => {
  setupMockProjects();
  await timelineService.initialize();

  // Publish a project.created event to the eventBus
  eventBus.publish(Events.PROJECT_CREATED, {
    id: "proj-new",
    name: "Subsystem Refactor",
    icon: "cpu",
  });

  // Wait a small moment for async database logging to complete
  await new Promise((resolve) => setTimeout(resolve, 50));

  const count = timelineRepository.count();
  assertEquals(count, 1, "Count should increase after eventBus publish");

  const result = await timelineService.getEvents({ limit: 1 });
  assertEquals(result.items[0].eventType, Events.PROJECT_CREATED, "Logged event type should match");
  assertEquals(
    result.items[0].projectId,
    "proj-new",
    "Extracted project ID should match payload ID",
  );

  timelineService.shutdown();
});

// ---------------------------------------------------------------------------
// Ordering coordinate regression suite.
//
// timeline_events rows carry an ISO timestamp with millisecond resolution, so a
// burst of events written inside one millisecond ties on timestamp alone. The
// tiebreaker must be the order the events were actually recorded in.
//
// Every case below uses explicitly controlled ids, timestamps and insertion
// order. Nothing here depends on how fast the machine is or on how random ids
// happen to sort -- the ids are deliberately chosen so that ordering by `id`
// produces exactly the wrong answer.
// ---------------------------------------------------------------------------

const TIED = "2026-09-03T10:00:00.000Z";

// Lexically DESCENDING, so ordering by id descending reproduces insertion order
// (oldest first) -- the exact inverse of what a newest-first query promises.
const TIED_IDS = ["eee", "ddd", "ccc", "bbb", "aaa"];

function seedTied(timestamp = TIED) {
  setupMockProjects();
  TIED_IDS.forEach((id, index) => {
    timelineRepository.insert({
      id,
      eventType: "task.created",
      projectId: "proj-1",
      payload: { order: index },
      payloadVersion: 1,
      timestamp,
    });
  });
}

test("TimelineRepository - Same-millisecond events display newest-first", () => {
  seedTied();

  const items = timelineRepository.findPaged({ limit: 10 }).items;
  assertEquals(items.length, 5, "Should return all 5 tied events");
  assertEquals(
    items.map((e) => e.id).join(","),
    [...TIED_IDS].reverse().join(","),
    "Tied events must be ordered newest-recorded first",
  );
  assertEquals(
    items.map((e) => e.payload.order).join(","),
    "4,3,2,1,0",
    "Insertion order must be recoverable from display order",
  );
});

test("TimelineRepository - Ascending order mirrors insertion order", () => {
  seedTied();

  const items = timelineRepository.findPaged({ limit: 10, sortDirection: "asc" }).items;
  assertEquals(
    items.map((e) => e.id).join(","),
    TIED_IDS.join(","),
    "Ascending order must return oldest-recorded first",
  );
});

test("TimelineRepository - Insertion sequence is exposed and monotonic", () => {
  seedTied();

  const ascending = timelineRepository.findPaged({ limit: 10, sortDirection: "asc" }).items;
  const seqs = ascending.map((e) => e.seq);

  seqs.forEach((s, i) => {
    assertEquals(typeof s, "number", `Event ${i} must carry a numeric sequence`);
  });
  for (let i = 1; i < seqs.length; i++) {
    assertEquals(
      (seqs[i] as number) > (seqs[i - 1] as number),
      true,
      `Sequence must strictly increase with insertion (index ${i})`,
    );
  }
});

test("TimelineRepository - Cursor continuation across identical timestamps", () => {
  seedTied();

  const singleShot = timelineRepository.findPaged({ limit: 10 }).items.map((e) => e.id);

  const paged: string[] = [];
  let cursor: { timestamp: string; seq: number } | undefined;
  for (let page = 0; page < 10; page++) {
    const result = timelineRepository.findPaged({ limit: 2, cursor });
    paged.push(...result.items.map((e) => e.id));
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }

  assertEquals(paged.length, 5, "Paging must yield every event exactly once");
  assertEquals(
    new Set(paged).size,
    5,
    "Paging across identical timestamps must not duplicate events",
  );
  assertEquals(
    TIED_IDS.every((id) => paged.includes(id)),
    true,
    "Paging across identical timestamps must not skip events",
  );
  assertEquals(paged.join(","), singleShot.join(","), "Paged order must match single-shot order");
});

test("TimelineRepository - Fallback in-memory rows order against persisted rows", () => {
  setupMockProjects();

  // Persisted row.
  timelineRepository.insert({
    id: "persisted-1",
    eventType: "task.created",
    projectId: "proj-1",
    payload: { order: 0 },
    payloadVersion: 1,
    timestamp: TIED,
  });

  // Force the SQL write to fail so the repository buffers in memory. A project
  // id with no matching row violates the foreign key, and foreign_keys is ON.
  timelineRepository.insert({
    id: "buffered-1",
    eventType: "task.created",
    projectId: "no-such-project",
    payload: { order: 1 },
    payloadVersion: 1,
    timestamp: TIED,
  });

  assertEquals(timelineRepository.count(), 2, "Buffered event must still be counted");

  const items = timelineRepository.findPaged({ limit: 10 }).items;
  assertEquals(items.length, 2, "Buffered event must appear alongside persisted rows");
  assertEquals(
    items.map((e) => e.id).join(","),
    "buffered-1,persisted-1",
    "Buffered event was recorded later, so it must sort newer",
  );

  // Do not leak the buffered event into later tests.
  timelineRepository.clearAll();
});
