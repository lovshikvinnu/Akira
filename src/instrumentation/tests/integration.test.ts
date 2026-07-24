/* eslint-disable @typescript-eslint/no-explicit-any */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { initializeDatabase } from "../../persistence/initializer";
import { getDatabaseConnection } from "../../persistence/connection";
import { SqliteTimelineRepository } from "../../persistence/repositories/SqliteTimelineRepository";
import { SqliteEventRepository } from "../event-store/sqlite-event-repository";
import { TimelineSubscriber } from "../subscribers/timeline-subscriber";
import { PersistenceSubscriber } from "../event-store/persistence-subscriber";
import { EventBus } from "../event-bus";
import { Publisher } from "../publisher";
import { publish } from "../index";

let totalTests = 0;
let passedTests = 0;

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertExists(val: any, message: string) {
  if (val === null || val === undefined) {
    throw new Error(`${message} -> Expected value to exist, got ${val}`);
  }
}

// ----------------------------------------------------

test("Sprint 2.1 & 2.2 - End-to-end event mapping and subscriber flow", async () => {
  // Initialize Database
  initializeDatabase();
  const db = getDatabaseConnection();

  // Instantiate Repositories
  const eventRepository = new SqliteEventRepository(db);
  const timelineRepository = new SqliteTimelineRepository();

  // Instantiate Event Bus
  const bus = new EventBus();

  // Instantiate and register Subscribers
  const persistenceSubscriber = new PersistenceSubscriber(eventRepository);
  const timelineSubscriber = new TimelineSubscriber(timelineRepository);

  bus.subscribe(persistenceSubscriber);
  bus.subscribe(timelineSubscriber);

  // Instantiate Publisher
  const publisher = new Publisher(bus);

  // Insert a project row into the projects table to satisfy foreign key constraints
  db.prepare(
    `
    INSERT INTO projects (id, name, color, icon, tag, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    "proj-1",
    "Integration Project",
    "blue",
    "briefcase",
    "Work",
    new Date().toISOString(),
    new Date().toISOString(),
  );

  // 1. Publish project.created
  const projEvent = publisher.publish({
    type: "project.created",
    source: "projects-test",
    payload: { id: "proj-1", name: "Integration Project", tag: "Work" },
    version: 1,
  });

  // Verify event persisted in Event Store
  const storedEvent = eventRepository.findById(projEvent.id);
  assertExists(storedEvent, "Project created event must be saved in Event Store");
  assertEquals(storedEvent!.type, "project.created", "Event type must match");

  // Verify timeline entry created
  const timelineEvents = timelineRepository.findPaged({ limit: 10 });
  assertEquals(timelineEvents.items.length, 1, "Should have 1 timeline entry");
  assertEquals(
    timelineEvents.items[0].eventType,
    "project.created",
    "Timeline entry eventType must match",
  );
  assertEquals(
    timelineEvents.items[0].id,
    projEvent.id,
    "Timeline entry ID must match Event ID (Duplicate protection)",
  );

  // 2. Publish task.completed
  const taskEvent = publisher.publish({
    type: "task.completed",
    source: "tasks-test",
    payload: { id: "task-1", title: "Verify integration", projectId: "proj-1" },
    version: 1,
  });

  // Verify timeline entry created with projectId mapped correctly
  const updatedTimeline = timelineRepository.findPaged({ limit: 10 });
  assertEquals(updatedTimeline.items.length, 2, "Should have 2 timeline entries");
  // Sort direction is desc by default, so index 0 is the latest (task.completed)
  assertEquals(
    updatedTimeline.items[0].eventType,
    "task.completed",
    "Latest entry must be task.completed",
  );
  assertEquals(
    updatedTimeline.items[0].projectId,
    "proj-1",
    "Project ID must map correctly from payload",
  );

  // 3. Publish unsupported event
  publisher.publish({
    type: "unsupported.event.type",
    source: "unsupported-test",
    payload: { key: "val" },
    version: 1,
  });

  // Event should be persisted in Event Store
  const latestEvents = eventRepository.latest(1);
  assertEquals(latestEvents[0].type, "unsupported.event.type", "Event should exist in Event Store");

  // Event should NOT create a timeline entry
  const finalTimeline = timelineRepository.findPaged({ limit: 10 });
  assertEquals(
    finalTimeline.items.length,
    2,
    "Timeline entries count must remain 2 (unsupported event ignored)",
  );
});

test("Sprint 2.2 - Dynamic publish() bridging and E2E integration verification", async () => {
  // Test direct publish() entrypoint
  const result = publish({
    type: "note.created",
    source: "notes-test",
    payload: { id: "note-1", title: "E2E Test Note" },
    version: 1,
  });

  assertExists(result.id, "Generated ID must be returned");
  assertExists(result.timestamp, "Generated timestamp must be returned");
  assertEquals(result.type, "note.created", "Type must match");
});

// ----------------------------------------------------

async function runAll() {
  console.log("=== STARTING TIMELINE & MODULE INTEGRATION TESTS (Sprint 2.1 & 2.2) ===");
  for (const t of tests) {
    totalTests++;
    console.log(`Running: ${t.name}`);
    try {
      await t.fn();
      passedTests++;
    } catch (error) {
      console.error(`  ✗ Failed: ${t.name}`);
      console.error(error);
    }
  }

  console.log(
    `\nTimeline & Module Integration Tests Completed: ${passedTests} / ${totalTests} Passed.`,
  );

  if (passedTests < totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll();
