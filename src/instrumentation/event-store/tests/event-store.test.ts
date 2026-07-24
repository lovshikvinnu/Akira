/* eslint-disable @typescript-eslint/no-explicit-any */
import Database from "better-sqlite3";
import { SqliteEventRepository } from "../sqlite-event-repository";
import { AkiraEvent } from "../../event-types";
import { EventService } from "../event-service";
import { EventBus } from "../../event-bus";
import { Publisher } from "../../publisher";

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

function assertThrows(fn: () => void, message: string) {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
  }
  if (!threw) {
    throw new Error(`${message} -> Expected function to throw an error, but it succeeded.`);
  }
}

// Helper to create an isolated DB and repository for each test
function createTestContext() {
  const db = new Database(":memory:");
  const repository = new SqliteEventRepository(db);
  return { db, repository };
}

// ----------------------------------------------------

test("Sprint 1.2 - Schema & Indexes validation", () => {
  const { db } = createTestContext();

  // 1. Verify table exists
  const tableCheck = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
    .get();
  assertExists(tableCheck, "Table 'events' must exist");

  // 2. Verify all indexes exist
  const indexes: any = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='events'")
    .all();
  const indexNames = indexes.map((idx: any) => idx.name);

  const requiredIndexes = [
    "idx_events_timestamp",
    "idx_events_type",
    "idx_events_source",
    "idx_events_entity_id",
    "idx_events_correlation_id",
  ];

  for (const name of requiredIndexes) {
    const exists = indexNames.includes(name);
    assertEquals(exists, true, `Index ${name} must be created on events table`);
  }
});

test("Sprint 1.2 - Event insertion and retrieval by ID", () => {
  const { repository } = createTestContext();

  const event: AkiraEvent = {
    id: "evt-a1",
    type: "TEST_INSERT",
    source: "tests",
    timestamp: "2026-07-18T12:00:00.000Z",
    version: 1,
    payload: { details: "all good" },
    metadata: { env: "test" },
    entityId: "entity-123",
    actor: "system-test",
    correlationId: "corr-123",
  };

  repository.insert(event);

  const retrieved = repository.findById("evt-a1");
  assertExists(retrieved, "Event should be retrieved by ID");
  assertEquals(retrieved!.id, event.id, "ID must match");
  assertEquals(retrieved!.type, event.type, "Type must match");
  assertEquals(retrieved!.source, event.source, "Source must match");
  assertEquals(
    retrieved!.timestamp,
    event.timestamp,
    "Timestamp must match and round-trip to ISO string",
  );
  assertEquals(retrieved!.version, event.version, "Version must match");
  assertEquals(retrieved!.entityId, event.entityId, "EntityId must match");
  assertEquals(retrieved!.actor, event.actor, "Actor must match");
  assertEquals(retrieved!.correlationId, event.correlationId, "CorrelationId must match");
  assertEquals(
    JSON.stringify(retrieved!.payload),
    JSON.stringify(event.payload),
    "Payload must round-trip correctly",
  );
  assertEquals(
    JSON.stringify(retrieved!.metadata),
    JSON.stringify(event.metadata),
    "Metadata must round-trip correctly",
  );
});

test("Sprint 1.2 - Duplicate ID rejection (Immutability)", () => {
  const { repository } = createTestContext();

  const event: AkiraEvent = {
    id: "evt-duplicate",
    type: "TEST_TYPE",
    source: "tests",
    timestamp: new Date().toISOString(),
    version: 1,
    payload: {},
  };

  repository.insert(event);

  // Attempt to insert another event with the same ID
  assertThrows(() => {
    repository.insert({
      ...event,
      type: "DIFFERENT_TYPE", // Attempting modification
    });
  }, "Inserting an event with a duplicate ID must throw an error due to primary key constraint");

  // Verify it did not overwrite the original
  const retrieved = repository.findById("evt-duplicate");
  assertEquals(retrieved!.type, "TEST_TYPE", "Event type must remain unchanged (immutable)");
});

test("Sprint 1.2 - Query retrieval by Type, Source, and Correlation ID", () => {
  const { repository } = createTestContext();

  const events: AkiraEvent[] = [
    {
      id: "e1",
      type: "TYPE_A",
      source: "src_1",
      timestamp: "2026-07-18T10:00:00.000Z",
      version: 1,
      payload: {},
      correlationId: "corr_x",
    },
    {
      id: "e2",
      type: "TYPE_B",
      source: "src_1",
      timestamp: "2026-07-18T11:00:00.000Z",
      version: 1,
      payload: {},
      correlationId: "corr_y",
    },
    {
      id: "e3",
      type: "TYPE_A",
      source: "src_2",
      timestamp: "2026-07-18T12:00:00.000Z",
      version: 1,
      payload: {},
      correlationId: "corr_x",
    },
  ];

  for (const e of events) {
    repository.insert(e);
  }

  // 1. By Type
  const byType = repository.findByType("TYPE_A");
  assertEquals(byType.length, 2, "Should find 2 events of TYPE_A");
  assertEquals(byType[0].id, "e3", "Results should be sorted descending by timestamp");
  assertEquals(byType[1].id, "e1", "Results should be sorted descending by timestamp");

  // 2. By Source
  const bySource = repository.findBySource("src_1");
  assertEquals(bySource.length, 2, "Should find 2 events of src_1");
  assertEquals(bySource[0].id, "e2", "Should be sorted descending by timestamp");

  // 3. By Correlation ID
  const byCorrelation = repository.findByCorrelationId("corr_x");
  assertEquals(byCorrelation.length, 2, "Should find 2 events of corr_x");
});

test("Sprint 1.2 - Query retrieval by timestamp range (findBetween)", () => {
  const { repository } = createTestContext();

  const events: AkiraEvent[] = [
    {
      id: "e1",
      type: "T",
      source: "S",
      timestamp: "2026-07-18T10:00:00.000Z",
      version: 1,
      payload: {},
    },
    {
      id: "e2",
      type: "T",
      source: "S",
      timestamp: "2026-07-18T11:00:00.000Z",
      version: 1,
      payload: {},
    },
    {
      id: "e3",
      type: "T",
      source: "S",
      timestamp: "2026-07-18T12:00:00.000Z",
      version: 1,
      payload: {},
    },
    {
      id: "e4",
      type: "T",
      source: "S",
      timestamp: "2026-07-18T13:00:00.000Z",
      version: 1,
      payload: {},
    },
  ];

  for (const e of events) {
    repository.insert(e);
  }

  // Find between 10:30 and 12:30
  const range = repository.findBetween("2026-07-18T10:30:00.000Z", "2026-07-18T12:30:00.000Z");
  assertEquals(range.length, 2, "Should return 2 events in range");
  assertEquals(range[0].id, "e2", "Should sort chronologically ascending");
  assertEquals(range[1].id, "e3", "Should sort chronologically ascending");
});

test("Sprint 1.2 - Latest(limit) function", () => {
  const { repository } = createTestContext();

  for (let i = 1; i <= 5; i++) {
    repository.insert({
      id: `evt-${i}`,
      type: "T",
      source: "S",
      // Incremental hours
      timestamp: `2026-07-18T0${i}:00:00.000Z`,
      version: 1,
      payload: { index: i },
    });
  }

  const latestEvents = repository.latest(3);
  assertEquals(latestEvents.length, 3, "Should return exactly 3 events");
  assertEquals(latestEvents[0].id, "evt-5", "First event should be the latest (evt-5)");
  assertEquals(latestEvents[1].id, "evt-4", "Second event should be (evt-4)");
  assertEquals(latestEvents[2].id, "evt-3", "Third event should be (evt-3)");
});

test("Sprint 1.2 - Malformed / circular payload insertion rejection", () => {
  const { repository } = createTestContext();

  const circular: any = {};
  circular.self = circular;

  // 1. Rejects circular payloads
  assertThrows(() => {
    repository.insert({
      id: "e-circ",
      type: "T",
      source: "S",
      timestamp: new Date().toISOString(),
      version: 1,
      payload: circular,
    });
  }, "Should reject circular payload insertion");

  // 2. Rejects unsupported value types (function)
  assertThrows(() => {
    repository.insert({
      id: "e-func",
      type: "T",
      source: "S",
      timestamp: new Date().toISOString(),
      version: 1,
      payload: { run: () => {} },
    });
  }, "Should reject payload containing functions");
});

test("Sprint 1.2 - Transaction rollback on insert failure", () => {
  const { db, repository } = createTestContext();

  // Insert initial baseline event
  repository.insert({
    id: "evt-baseline",
    type: "TEST",
    source: "tests",
    timestamp: new Date().toISOString(),
    version: 1,
    payload: { state: "clean" },
  });

  // Attempt transactional execution of multiple queries where one fails
  const transaction = db.transaction(() => {
    repository.insert({
      id: "evt-tx-1",
      type: "TX",
      source: "tests",
      timestamp: new Date().toISOString(),
      version: 1,
      payload: { value: 1 },
    });

    // Fails because id duplicates the baseline
    repository.insert({
      id: "evt-baseline",
      type: "TX",
      source: "tests",
      timestamp: new Date().toISOString(),
      version: 1,
      payload: { value: 2 },
    });
  });

  // Execute transaction and verify it throws
  assertThrows(() => {
    transaction();
  }, "Transaction execution must fail due to duplicate ID constraint");

  // Verify rolled back state: evt-tx-1 should NOT exist in the repository
  const tx1 = repository.findById("evt-tx-1");
  assertEquals(tx1, null, "evt-tx-1 must be rolled back and not exist in database");

  const baseline = repository.findById("evt-baseline");
  assertExists(baseline, "Baseline event must remain intact");
  assertEquals(baseline!.payload.state, "clean", "Baseline payload must not have changed");
});

test("Sprint 1.2 - Persistence Subscriber Integration through Publisher", () => {
  const { repository } = createTestContext();
  const bus = new EventBus();

  // Set up event store service with custom bus & repository
  const service = new EventService(repository, bus);
  service.start();

  const publisher = new Publisher(bus);

  publisher.publish({
    type: "PERSISTED_VIA_BUS",
    source: "app-service",
    payload: { data: "hello persistent world" },
    version: "1.0",
  });

  // Query database to check if subscriber persisted the event
  const events = repository.findByType("PERSISTED_VIA_BUS");
  assertEquals(events.length, 1, "Should find 1 event persisted via the subscriber");
  assertEquals(events[0].source, "app-service", "Correct source should be stored");
  assertEquals(
    events[0].payload.data,
    "hello persistent world",
    "Correct payload should be stored",
  );

  // Stop service and verify it no longer persists
  service.stop();

  publisher.publish({
    type: "PERSISTED_VIA_BUS",
    source: "app-service",
    payload: { data: "should not be saved" },
    version: "1.0",
  });

  const eventsAfter = repository.findByType("PERSISTED_VIA_BUS");
  assertEquals(eventsAfter.length, 1, "Should still have only 1 event in storage");
});

test("Sprint 1.2 - Stress testing with large number of inserts (1000 events)", () => {
  const { repository } = createTestContext();

  const start = Date.now();
  const count = 1000;

  for (let i = 0; i < count; i++) {
    repository.insert({
      id: `stress-evt-${i}`,
      type: "STRESS_TEST",
      source: "stress-loader",
      timestamp: new Date().toISOString(),
      version: 1,
      payload: { index: i, text: "some stress text payload string that takes space" },
      metadata: { run: 1, batch: "A" },
    });
  }
  const duration = Date.now() - start;
  console.log(`  [STRESS TEST] Inserted ${count} events in ${duration}ms`);

  // Verify count
  const allEvents = repository.findByType("STRESS_TEST");
  assertEquals(allEvents.length, count, `Should have successfully saved all ${count} events`);

  // Verify a random middle record
  const middle = repository.findById("stress-evt-500");
  assertExists(middle, "Middle stress event must exist");
  assertEquals(middle!.payload.index, 500, "Index must match");
});

// ----------------------------------------------------

async function runAll() {
  console.log("=== STARTING INSTRUMENTATION EVENT STORE UNIT TESTS (Sprint 1.2) ===");
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
    `\nInstrumentation Event Store Unit Tests Completed: ${passedTests} / ${totalTests} Passed.`,
  );

  if (passedTests < totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll();
