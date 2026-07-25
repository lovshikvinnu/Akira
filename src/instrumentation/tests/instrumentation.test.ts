import { EventBus } from "../event-bus";
import { Publisher } from "../publisher";
import { EventSubscriber } from "../subscriber";
import { AkiraEvent } from "../event-types";
import {
  composeMiddleware,
  eventIdGenerator,
  timestampInjector,
  correlationIdGenerator,
  serializationValidator,
  validator,
} from "../middleware";

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

// ----------------------------------------------------

test("Sprint 1.1 - EventBus publish, subscribe, and unsubscribe", () => {
  const bus = new EventBus();
  const received: AkiraEvent[] = [];

  const sub: EventSubscriber = {
    id: "test-sub-1",
    onEvent(event) {
      received.push(event);
    },
  };

  bus.subscribe(sub);
  assertEquals(bus.hasSubscriber(sub), true, "Subscriber should be registered");

  const sampleEvent: AkiraEvent = {
    id: "evt-001",
    type: "TEST_EVENT",
    timestamp: new Date().toISOString(),
    source: "tests",
    version: 1,
    payload: { ok: true },
  };

  bus.publish(sampleEvent);
  assertEquals(received.length, 1, "Should have received one event");
  assertEquals(received[0].id, "evt-001", "Should carry correct event ID");

  bus.unsubscribe(sub);
  assertEquals(bus.hasSubscriber(sub), false, "Subscriber should be removed");

  bus.publish(sampleEvent);
  assertEquals(received.length, 1, "Should not receive events after unsubscribing");
});

test("Sprint 1.1 - ID and Timestamp Injection Middlewares", () => {
  const input = {
    type: "TEST_INJECTION",
    source: "tests",
    payload: { val: 42 },
    version: "1.0",
  };

  // Run generation middlewares
  const pipeline = composeMiddleware(eventIdGenerator, timestampInjector, correlationIdGenerator);
  const result = pipeline(input);

  assertExists(result.id, "ID should be injected");
  assertExists(result.timestamp, "Timestamp should be injected");
  assertExists(result.correlationId, "Correlation ID should be injected");
  assertEquals(result.type, "TEST_INJECTION", "Type should remain same");
});

test("Sprint 1.1 - Serialization Validator Middleware (Circular reference rejection)", () => {
  const circular: any = { a: 1 };
  circular.self = circular; // Circular link

  const eventInput = {
    id: "evt-002",
    type: "TEST_CIRCULAR",
    timestamp: new Date().toISOString(),
    source: "tests",
    payload: circular,
    version: "1.0",
  };

  assertThrows(() => {
    serializationValidator(eventInput);
  }, "Should reject circular payload");
});

test("Sprint 1.1 - Serialization Validator Middleware (Unsupported types rejection)", () => {
  // 1. Function in payload
  assertThrows(() => {
    serializationValidator({
      id: "evt-003",
      type: "TEST_FUNC",
      timestamp: new Date().toISOString(),
      source: "tests",
      payload: { handler: () => {} },
      version: 1,
    });
  }, "Should reject payload containing a function");

  // 2. Symbol in payload
  assertThrows(() => {
    serializationValidator({
      id: "evt-004",
      type: "TEST_SYMBOL",
      timestamp: new Date().toISOString(),
      source: "tests",
      payload: { sym: Symbol("foo") },
      version: 1,
    });
  }, "Should reject payload containing a symbol");

  // 3. Map in payload
  assertThrows(() => {
    serializationValidator({
      id: "evt-005",
      type: "TEST_MAP",
      timestamp: new Date().toISOString(),
      source: "tests",
      payload: { map: new Map() },
      version: 1,
    });
  }, "Should reject payload containing a Map");
});

test("Sprint 1.1 - Validator Middleware (Structural validation)", () => {
  // 1. Missing source
  assertThrows(() => {
    validator({
      id: "evt-006",
      type: "TEST_VAL",
      timestamp: new Date().toISOString(),
      payload: {},
      version: 1,
    });
  }, "Should reject event with missing source");

  // 2. Invalid timestamp format
  assertThrows(() => {
    validator({
      id: "evt-007",
      type: "TEST_VAL",
      timestamp: "not-a-timestamp",
      source: "tests",
      payload: {},
      version: 1,
    });
  }, "Should reject event with invalid timestamp format");

  // 3. Missing version
  assertThrows(() => {
    validator({
      id: "evt-008",
      type: "TEST_VAL",
      timestamp: new Date().toISOString(),
      source: "tests",
      payload: {},
    });
  }, "Should reject event with missing version");
});

test("Sprint 1.1 - Publisher integration with Default Pipeline", () => {
  const bus = new EventBus();
  const publisher = new Publisher(bus);

  let receivedEvent: AkiraEvent | null = null;
  const sub: EventSubscriber = {
    id: "publisher-test-sub",
    onEvent(event) {
      receivedEvent = event;
    },
  };
  bus.subscribe(sub);

  const eventInput = {
    type: "INTEGRATION_TEST",
    source: "tests",
    payload: { message: "hello" },
    version: "1.0",
  };

  const published = publisher.publish(eventInput);

  assertExists(receivedEvent, "Event should be received by subscriber");
  assertEquals(receivedEvent!.id, published.id, "Received event ID should match returned ID");
  assertEquals(
    receivedEvent!.correlationId,
    published.correlationId,
    "Received correlation ID should match",
  );
  assertExists(receivedEvent!.timestamp, "Received event should have timestamp");
});

// ----------------------------------------------------
