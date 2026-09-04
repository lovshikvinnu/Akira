/**
 * EventBus delivery observation.
 *
 * Two paths were added to `EventBus.publish` when observability was wired in,
 * and neither was covered:
 *
 *   1. The async branch. `result.then(ok, err)` reports the outcome once the
 *      subscriber's promise settles. This is not a hypothetical path --
 *      `TimelineSubscriber.onEvent` is `async`, so the SQLite timeline write is
 *      observed through it in production.
 *   2. The guard around the observer itself. Observability must stay
 *      observational: an observer that throws must not reach the publisher or
 *      disturb delivery to subscribers.
 *
 * These tests use a fresh `EventBus` rather than `globalEventBus`, so they
 * cannot perturb the composed singletons or leak state into other files.
 * Timing is driven by fake timers and manually settled promises -- no sleeps,
 * so the duration assertions are exact rather than "greater than roughly".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { EventBus } = await import("../src/instrumentation/event-bus");
const { EventBusObserver, DELIVERY_OPERATION_PREFIX } =
  await import("../src/observability/integration/event-bus-observer");
const { HealthRegistry } = await import("../src/observability/health/health-registry");
const { PerformanceMonitor } = await import("../src/observability/performance/performance-monitor");

type Delivery = {
  subscriberId: string;
  durationMs: number;
  error?: unknown;
};

/** Records what the bus reports, without doing anything else. */
function recordingObserver() {
  const deliveries: Delivery[] = [];
  return {
    deliveries,
    observer: {
      onDelivery(d: { subscriberId: string; durationMs: number; error?: unknown }) {
        deliveries.push({
          subscriberId: d.subscriberId,
          durationMs: d.durationMs,
          error: d.error,
        });
      },
    },
  };
}

/** A promise whose settlement this test controls. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Pre-attach a no-op rejection handler so a deliberately rejected deferred
  // cannot surface as an unhandled rejection in the test runner.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

/** Lets already-queued microtasks run. Fake timers do not fake microtasks. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function event(type = "test.event") {
  return {
    id: "evt-" + Math.random().toString(16).slice(2),
    type,
    timestamp: new Date().toISOString(),
    source: "eventbus-delivery-test",
    payload: {},
    version: 1,
  };
}

// ---------------------------------------------------------------------------
// C3.1 -- async subscriber delivery
// ---------------------------------------------------------------------------

describe("an async subscriber is observed when its promise settles", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports success only after the promise resolves, not when publish returns", async () => {
    const bus = new EventBus();
    const { deliveries, observer } = recordingObserver();
    bus.setDeliveryObserver(observer);

    const gate = deferred();
    bus.subscribe({ id: "async-ok", onEvent: () => gate.promise });

    bus.publish(event());

    // publish() has returned, but the subscriber has not finished. Nothing may
    // have been reported yet -- reporting here would mean the duration measured
    // nothing and a later failure would be missed entirely.
    await flushMicrotasks();
    expect(deliveries).toHaveLength(0);

    gate.resolve();
    await flushMicrotasks();

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].subscriberId).toBe("async-ok");
    expect(deliveries[0].error).toBeUndefined();
  });

  it("reports failure when the promise rejects, carrying the rejection reason", async () => {
    const bus = new EventBus();
    const { deliveries, observer } = recordingObserver();
    bus.setDeliveryObserver(observer);

    const gate = deferred();
    bus.subscribe({ id: "async-bad", onEvent: () => gate.promise });

    bus.publish(event());
    const boom = new Error("async subscriber exploded");
    gate.reject(boom);
    await flushMicrotasks();

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].subscriberId).toBe("async-bad");
    expect(deliveries[0].error).toBe(boom);
  });

  it("measures the duration up to settlement, not up to the synchronous return", async () => {
    const bus = new EventBus();
    const { deliveries, observer } = recordingObserver();
    bus.setDeliveryObserver(observer);

    const gate = deferred();
    bus.subscribe({ id: "async-slow", onEvent: () => gate.promise });

    bus.publish(event());
    // Fake timers move Date.now() deterministically; the subscriber is still
    // in flight across this advance.
    vi.advanceTimersByTime(250);
    gate.resolve();
    await flushMicrotasks();

    expect(deliveries).toHaveLength(1);
    // Exact, not approximate: this pins the documented semantics -- for an
    // async subscriber the measurement spans until the promise settles, which
    // is what makes it meaningful for the SQLite timeline write.
    expect(deliveries[0].durationMs).toBe(250);
  });

  it("keeps each subscriber's identity and outcome separate when both are async", async () => {
    const bus = new EventBus();
    const { deliveries, observer } = recordingObserver();
    bus.setDeliveryObserver(observer);

    const okGate = deferred();
    const badGate = deferred();
    bus.subscribe({ id: "async-first", onEvent: () => okGate.promise });
    bus.subscribe({ id: "async-second", onEvent: () => badGate.promise });

    bus.publish(event());

    // Settle out of subscription order, to prove the report is bound to the
    // subscriber rather than to the loop position.
    badGate.reject(new Error("second failed"));
    await flushMicrotasks();
    okGate.resolve();
    await flushMicrotasks();

    expect(deliveries.map((d) => d.subscriberId)).toEqual(["async-second", "async-first"]);
    expect(deliveries[0].error).toBeInstanceOf(Error);
    expect(deliveries[1].error).toBeUndefined();
  });

  it("drives real health and latency through the production observer", async () => {
    // The same async path, but terminating in the actual EventBusObserver
    // rather than a recording stub, so the health conclusion is exercised too.
    const bus = new EventBus();
    const health = new HealthRegistry();
    const performance = new PerformanceMonitor();
    bus.setDeliveryObserver(new EventBusObserver(health, performance));

    const gate = deferred();
    let shouldFail = false;
    bus.subscribe({
      id: "async-timeline",
      onEvent: () => (shouldFail ? Promise.reject(new Error("write failed")) : gate.promise),
    });

    bus.publish(event());
    vi.advanceTimersByTime(40);
    gate.resolve();
    await flushMicrotasks();

    expect(health.get("async-timeline")!.status).toBe("healthy");
    const stats = performance.get(DELIVERY_OPERATION_PREFIX + "async-timeline")!;
    expect(stats.count).toBe(1);
    expect(stats.max).toBe(40);

    // Now the async failure path reaches health as a real degradation.
    shouldFail = true;
    bus.publish(event());
    await flushMicrotasks();

    const degraded = health.get("async-timeline")!;
    expect(degraded.status).toBe("degraded");
    expect(degraded.evidence.lastError).toContain("write failed");
    expect(performance.get(DELIVERY_OPERATION_PREFIX + "async-timeline")!.failures).toBe(1);
  });

  it("produces no unhandled rejection when an async subscriber rejects", async () => {
    // The bus attaches its own rejection handler. If it ever stopped doing so,
    // a rejecting subscriber would surface as an unhandled rejection and, under
    // Node's default, could take the process down.
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const bus = new EventBus();
      bus.setDeliveryObserver(recordingObserver().observer);
      bus.subscribe({ id: "rejecter", onEvent: () => Promise.reject(new Error("nope")) });

      bus.publish(event());
      await flushMicrotasks();
      vi.useRealTimers();
      // Give the runtime a real macrotask turn to surface any unhandled rejection.
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    expect(unhandled).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C3.2 -- a throwing observer must not become operational
// ---------------------------------------------------------------------------

describe("a throwing delivery observer cannot disturb the bus", () => {
  it("still delivers the event, and the exception does not escape publish", () => {
    const bus = new EventBus();
    const received: string[] = [];

    bus.setDeliveryObserver({
      onDelivery() {
        throw new Error("observer is broken");
      },
    });
    bus.subscribe({
      id: "normal-subscriber",
      onEvent: (e) => {
        received.push(e.type);
      },
    });

    // The exception must be contained inside the bus.
    expect(() => bus.publish(event("first.event"))).not.toThrow();
    // ...and the subscriber must have run normally regardless.
    expect(received).toEqual(["first.event"]);
  });

  it("keeps working for later events after an observer failure", () => {
    const bus = new EventBus();
    const received: string[] = [];
    bus.setDeliveryObserver({
      onDelivery() {
        throw new Error("observer is broken");
      },
    });
    bus.subscribe({
      id: "normal-subscriber",
      onEvent: (e) => {
        received.push(e.type);
      },
    });

    bus.publish(event("a"));
    bus.publish(event("b"));
    bus.publish(event("c"));

    // A broken observer must not degrade into a broken bus.
    expect(received).toEqual(["a", "b", "c"]);
  });

  it("does not stop delivery to subscribers that come after it in the set", () => {
    const bus = new EventBus();
    const received: string[] = [];
    bus.setDeliveryObserver({
      onDelivery() {
        throw new Error("observer is broken");
      },
    });
    bus.subscribe({ id: "first", onEvent: () => received.push("first") });
    bus.subscribe({ id: "second", onEvent: () => received.push("second") });
    bus.subscribe({ id: "third", onEvent: () => received.push("third") });

    bus.publish(event());

    // The observer throws once per delivery; every subscriber must still run.
    expect(received).toEqual(["first", "second", "third"]);
  });

  it("contains an observer that throws on the async settlement path too", async () => {
    const bus = new EventBus();
    let settled = false;
    bus.setDeliveryObserver({
      onDelivery() {
        throw new Error("observer is broken");
      },
    });

    const gate = deferred();
    bus.subscribe({
      id: "async-subscriber",
      onEvent: () =>
        gate.promise.then(() => {
          settled = true;
        }),
    });

    expect(() => bus.publish(event())).not.toThrow();
    gate.resolve();
    await flushMicrotasks();

    // The subscriber's own work completed even though reporting it threw.
    expect(settled).toBe(true);
  });

  it("resumes observing normally once a working observer replaces the broken one", () => {
    const bus = new EventBus();
    bus.setDeliveryObserver({
      onDelivery() {
        throw new Error("observer is broken");
      },
    });
    bus.subscribe({ id: "s", onEvent: () => {} });
    bus.publish(event());

    const { deliveries, observer } = recordingObserver();
    bus.setDeliveryObserver(observer);
    bus.publish(event());

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].subscriberId).toBe("s");
  });
});
