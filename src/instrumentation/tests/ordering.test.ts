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

// ----------------------------------------------------

test("Event Ordering - Sequential Flow Verification", async () => {
  // Initialize Database
  initializeDatabase();
  const db = getDatabaseConnection();

  // Satisfy project FK constraint
  db.prepare(
    `
    INSERT INTO projects (id, name, color, icon, tag, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    "proj-1",
    "Ordering Project",
    "blue",
    "briefcase",
    "Work",
    new Date().toISOString(),
    new Date().toISOString(),
  );

  const eventRepository = new SqliteEventRepository(db);
  const timelineRepository = new SqliteTimelineRepository();

  const bus = new EventBus();
  bus.subscribe(new PersistenceSubscriber(eventRepository));
  bus.subscribe(new TimelineSubscriber(timelineRepository));

  const publisher = new Publisher(bus);

  // Publish a sequential workflow
  const e1 = publisher.publish({
    type: "task.created",
    source: "tasks-store",
    payload: { id: "task-1", title: "Original Task", projectId: "proj-1" },
    version: 1,
  });

  const e2 = publisher.publish({
    type: "task.updated",
    source: "tasks-store",
    payload: { id: "task-1", title: "Updated Task", projectId: "proj-1" },
    version: 1,
  });

  const e3 = publisher.publish({
    type: "task.completed",
    source: "tasks-store",
    payload: { id: "task-1", title: "Completed Task", projectId: "proj-1" },
    version: 1,
  });

  // 1. Verify Event Store order
  const storedEvents = eventRepository.latest(10);
  // latest() returns descending order (latest first), so e3, e2, e1
  assertEquals(storedEvents.length, 3, "Should contain 3 stored events");
  assertEquals(storedEvents[0].type, "task.completed", "Latest event must be task.completed");
  assertEquals(storedEvents[1].type, "task.updated", "Second latest must be task.updated");
  assertEquals(storedEvents[2].type, "task.created", "Third latest must be task.created");

  // 2. Verify Timeline order
  const timelineResult = timelineRepository.findPaged({ limit: 10 });
  // findPaged returns latest events first (descending timestamp order)
  assertEquals(timelineResult.items.length, 3, "Should contain 3 timeline entries");
  assertEquals(
    timelineResult.items[0].eventType,
    "task.completed",
    "Latest timeline entry must be task.completed",
  );
  assertEquals(
    timelineResult.items[1].eventType,
    "task.updated",
    "Second latest timeline entry must be task.updated",
  );
  assertEquals(
    timelineResult.items[2].eventType,
    "task.created",
    "Third latest timeline entry must be task.created",
  );
});

test("Event Ordering - Concurrent High Volume Publishing Verification", async () => {
  const db = getDatabaseConnection();
  const eventRepository = new SqliteEventRepository(db);
  const bus = new EventBus();
  bus.subscribe(new PersistenceSubscriber(eventRepository));
  const publisher = new Publisher(bus);

  const count = 100;
  const promises: Promise<any>[] = [];

  for (let i = 0; i < count; i++) {
    promises.push(
      new Promise<void>((resolve) => {
        publisher.publish({
          type: "highvolume.event",
          source: "stress-test",
          payload: { index: i },
          version: 1,
        });
        resolve();
      }),
    );
  }

  await Promise.all(promises);

  // Fetch events from repository
  const stored = eventRepository.latest(count);
  assertEquals(stored.length, count, `Should have stored ${count} high volume events`);

  // Verify timestamps are in non-decreasing order (latest returns desc, so we check backwards)
  for (let i = 0; i < count - 1; i++) {
    const tNext = new Date(stored[i].timestamp).getTime();
    const tPrev = new Date(stored[i + 1].timestamp).getTime();
    assertEquals(tNext >= tPrev, true, "Chronological order must be preserved");
  }
});

// ----------------------------------------------------

async function runAll() {
  console.log("=== STARTING INSTRUMENTATION ORDERING TESTS ===");
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

  console.log(`\nOrdering Unit Tests Completed: ${passedTests} / ${totalTests} Passed.`);
  if (passedTests < totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll();
