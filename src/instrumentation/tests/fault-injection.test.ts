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
import { EventSubscriber } from "../subscriber";
import { AkiraEvent } from "../event-types";

const totalTests = 0;
const passedTests = 0;

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

// ----------------------------------------------------

test("Fault Injection - Subscriber Exception Isolation", () => {
  const bus = new EventBus();
  let normalSubscriberCalled = false;

  // 1. Throws an error when receiving event
  const faultySubscriber: EventSubscriber = {
    id: "faulty-subscriber",
    onEvent: async () => {
      throw new Error("Simulated subscriber crash");
    },
  };

  // 2. Normal subscriber
  const normalSubscriber: EventSubscriber = {
    id: "normal-subscriber",
    onEvent: async () => {
      normalSubscriberCalled = true;
    },
  };

  bus.subscribe(faultySubscriber);
  bus.subscribe(normalSubscriber);

  const publisher = new Publisher(bus);

  // Publish event: event bus must remain operational despite faulty subscriber throwing
  publisher.publish({
    type: "test.event",
    source: "fault-injection-test",
    payload: { hello: "world" },
    version: 1,
  });

  assertEquals(
    normalSubscriberCalled,
    true,
    "Normal subscriber must still receive event even if another subscriber throws",
  );
});

test("Fault Injection - Repository Insertion Failure & Atomicity", () => {
  initializeDatabase();
  const db = getDatabaseConnection();
  const repo = new SqliteEventRepository(db);

  const bus = new EventBus();
  bus.subscribe(new PersistenceSubscriber(repo));

  const publisher = new Publisher(bus);

  const eventInput = {
    id: "duplicate-id",
    type: "test.event",
    source: "fault-injection-test",
    payload: { data: "first" },
    version: 1,
  };

  // First insert succeeds
  publisher.publish(eventInput);

  // Second insert of same ID is captured and isolated by EventBus, preventing crash
  publisher.publish({
    ...eventInput,
    payload: { data: "second" },
  });

  // Verify that the payload is unchanged in the database (atomicity and immutability)
  const stored = repo.findById("duplicate-id");
  assertEquals(
    (stored?.payload as any).data,
    "first",
    "Database content must remain unchanged (no corruption)",
  );
});

// ----------------------------------------------------
