/**
 * Observability integration and lifecycle.
 *
 * A subsystem sitting in `src/observability/` is not complete until something
 * reaches it. Before this work nothing outside that directory imported it at
 * all, and its pipeline was built with zero stages and a null sink, so every
 * record it produced was validated and dropped.
 *
 * These tests drive the production composition -- `initializeObservability()`,
 * the same call the application makes -- and then publish real events on the
 * real platform bus. Health and latency here are derived from actual delivery
 * outcomes, so a subscriber that genuinely throws is what turns a component
 * degraded; nothing is injected directly into the health registry.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const { globalEventBus } = await import("../src/instrumentation/event-bus");
const { publish } = await import("../src/instrumentation/publisher");
const observability = await import("../src/observability/composition");
const { healthRegistry } = await import("../src/observability/health/health-registry");
const { performanceMonitor } = await import("../src/observability/performance/performance-monitor");
const { telemetryStore } = await import("../src/observability/store/telemetry-store");
const { telemetryService } = await import("../src/observability/services/telemetry-service");

/** A bus subscriber whose success or failure the test controls. */
function makeSubscriber(id: string) {
  const state = { shouldThrow: false, received: 0 };
  return {
    state,
    subscriber: {
      id,
      onEvent() {
        state.received += 1;
        if (state.shouldThrow) throw new Error(id + " is broken");
      },
    },
  };
}

function emit(type = "test.event") {
  return publish({
    type,
    source: "observability-integration-test",
    payload: { at: Date.now() },
    version: 1,
    // Client-local: the server RPC has no runtime context under vitest, and the
    // bus delivery being measured happens before persistence either way.
    transient: true,
  });
}

describe("observability is reachable through the production composition", () => {
  beforeEach(() => {
    observability.shutdownObservability();
    globalEventBus.clearSubscribers();
    healthRegistry.clear();
    performanceMonitor.clear();
    telemetryStore.clear();
    observability.initializeObservability();
  });

  afterEach(() => {
    observability.shutdownObservability();
    globalEventBus.clearSubscribers();
  });

  it("terminates the telemetry pipeline in the store, so records survive", async () => {
    const { factory, TelemetrySeverity } = await import("../src/observability/index");
    await telemetryService.record(
      factory.createLog("test", "test", TelemetrySeverity.INFO, "reachable"),
    );

    // Before this work the default pipeline had a null sink and this was empty.
    const logs = telemetryStore.query({ type: "log" });
    expect(logs.length).toBeGreaterThan(0);
    expect((logs[logs.length - 1] as any).message).toBe("reachable");
  });

  it("observes a real event travelling the real bus, end to end", () => {
    const { subscriber } = makeSubscriber("healthy-subscriber");
    globalEventBus.subscribe(subscriber);

    emit();

    // 1. The subscriber is now a known, observed component...
    const health = healthRegistry.get("healthy-subscriber");
    expect(health, "the delivery should have registered the subscriber").toBeDefined();
    expect(health!.status).toBe("healthy");
    expect(health!.evidence.successes).toBe(1);

    // 2. ...its delivery latency was measured...
    const perf = performanceMonitor.get("event.delivery.healthy-subscriber");
    expect(perf, "delivery latency should have been measured").toBeDefined();
    expect(perf!.count).toBe(1);

    // 3. ...and the health transition reached the telemetry store as a record.
    const healthRecords = telemetryStore.query({ type: "health" });
    expect(healthRecords.length).toBeGreaterThan(0);
    expect((healthRecords[healthRecords.length - 1] as any).componentId).toBe("healthy-subscriber");
  });

  it("turns a genuinely failing subscriber degraded, then critical", () => {
    const { state, subscriber } = makeSubscriber("failing-subscriber");
    globalEventBus.subscribe(subscriber);

    emit();
    expect(healthRegistry.get("failing-subscriber")!.status).toBe("healthy");

    state.shouldThrow = true;
    emit();
    expect(healthRegistry.get("failing-subscriber")!.status).toBe("degraded");

    emit();
    emit();
    const health = healthRegistry.get("failing-subscriber")!;
    expect(health.status).toBe("critical");
    expect(health.evidence.consecutiveFailures).toBe(3);
    expect(health.evidence.lastError).toContain("failing-subscriber is broken");
  });

  it("returns a recovered subscriber to healthy", () => {
    const { state, subscriber } = makeSubscriber("recovering-subscriber");
    globalEventBus.subscribe(subscriber);

    state.shouldThrow = true;
    emit();
    emit();
    emit();
    expect(healthRegistry.get("recovering-subscriber")!.status).toBe("critical");

    state.shouldThrow = false;
    emit();

    const health = healthRegistry.get("recovering-subscriber")!;
    expect(health.status).toBe("healthy");
    expect(health.evidence.consecutiveFailures).toBe(0);
    expect(health.evidence.failures).toBe(3);
  });

  it("does not let one subscriber's failure hide another's health", () => {
    const good = makeSubscriber("good-one");
    const bad = makeSubscriber("bad-one");
    bad.state.shouldThrow = true;
    globalEventBus.subscribe(good.subscriber);
    globalEventBus.subscribe(bad.subscriber);

    emit();

    expect(healthRegistry.get("good-one")!.status).toBe("healthy");
    expect(healthRegistry.get("bad-one")!.status).toBe("degraded");
    // The failure must not have stopped delivery to the other subscriber.
    expect(good.state.received).toBe(1);
  });

  it("reports overall health as the worst component", () => {
    const good = makeSubscriber("ok-a");
    const bad = makeSubscriber("bad-b");
    globalEventBus.subscribe(good.subscriber);
    globalEventBus.subscribe(bad.subscriber);

    emit();
    expect(healthRegistry.overall()).toBe("healthy");

    bad.state.shouldThrow = true;
    emit();
    expect(healthRegistry.overall()).toBe("degraded");
  });
});

describe("lifecycle is safe to repeat", () => {
  beforeEach(() => {
    observability.shutdownObservability();
    globalEventBus.clearSubscribers();
    healthRegistry.clear();
    performanceMonitor.clear();
    telemetryStore.clear();
  });

  afterEach(() => {
    observability.shutdownObservability();
    globalEventBus.clearSubscribers();
  });

  it("reports itself initialized only once actually initialized", () => {
    expect(observability.isObservabilityInitialized()).toBe(false);
    observability.initializeObservability();
    expect(observability.isObservabilityInitialized()).toBe(true);
    observability.shutdownObservability();
    expect(observability.isObservabilityInitialized()).toBe(false);
  });

  it("does not double-count when initialized twice", () => {
    observability.initializeObservability();
    observability.initializeObservability();
    observability.initializeObservability();

    const { subscriber } = makeSubscriber("once-only");
    globalEventBus.subscribe(subscriber);
    emit();

    // Three initializations, one delivery: exactly one observation. A duplicated
    // observer would record three successes and three latency samples.
    expect(healthRegistry.get("once-only")!.evidence.successes).toBe(1);
    expect(performanceMonitor.get("event.delivery.once-only")!.count).toBe(1);
  });

  it("stops observing after shutdown", () => {
    observability.initializeObservability();
    const { subscriber } = makeSubscriber("stop-me");
    globalEventBus.subscribe(subscriber);

    emit();
    expect(healthRegistry.get("stop-me")!.evidence.successes).toBe(1);

    observability.shutdownObservability();
    emit();
    emit();

    // The subscriber still ran; observability simply stopped watching.
    expect(healthRegistry.get("stop-me")!.evidence.successes).toBe(1);
  });

  it("survives a full restart cycle", () => {
    observability.initializeObservability();
    const { subscriber } = makeSubscriber("restart-me");
    globalEventBus.subscribe(subscriber);
    emit();

    observability.shutdownObservability();
    observability.initializeObservability();
    emit();

    expect(healthRegistry.get("restart-me")!.evidence.successes).toBe(2);
    expect(performanceMonitor.get("event.delivery.restart-me")!.count).toBe(2);
  });

  it("leaves no bus subscriber of its own behind", () => {
    // Observability watches deliveries rather than subscribing, precisely so it
    // cannot observe itself or publish from inside a delivery. Nothing it does
    // should add a subscriber to the bus.
    const before = (globalEventBus as any).subscribers.size;
    observability.initializeObservability();
    expect((globalEventBus as any).subscribers.size).toBe(before);
    observability.shutdownObservability();
    expect((globalEventBus as any).subscribers.size).toBe(before);
  });

  it("shutdown is safe to call when never initialized, and twice", () => {
    expect(() => observability.shutdownObservability()).not.toThrow();
    observability.initializeObservability();
    observability.shutdownObservability();
    expect(() => observability.shutdownObservability()).not.toThrow();
  });

  it("leaks no health listener when initialized repeatedly", () => {
    // The subtle half of idempotency. Each initialize subscribes a health
    // listener and stores the one function that can remove it, so without a
    // guard a second initialize orphans the first listener permanently:
    // shutdown can only unsubscribe the most recent one, and every later health
    // transition is still recorded by listeners nobody can reach.
    observability.initializeObservability();
    observability.initializeObservability();
    observability.initializeObservability();
    observability.shutdownObservability();

    telemetryStore.clear();

    // Drive a real transition directly at the registry: the bus observer is
    // detached by now, so this isolates the listener leak from delivery.
    healthRegistry.register("leak-probe");
    healthRegistry.recordSuccess("leak-probe");

    expect(
      telemetryStore.query({ type: "health" }),
      "a detached observability must record nothing",
    ).toHaveLength(0);
  });
});

describe("observing must not disturb what it observes", () => {
  beforeEach(() => {
    observability.shutdownObservability();
    globalEventBus.clearSubscribers();
    healthRegistry.clear();
    telemetryStore.clear();
    observability.initializeObservability();
  });

  afterEach(() => {
    observability.shutdownObservability();
    globalEventBus.clearSubscribers();
  });

  it("publishes no events of its own, so it cannot recurse", () => {
    let deliveries = 0;
    globalEventBus.subscribe({
      id: "delivery-counter",
      onEvent() {
        deliveries += 1;
      },
    });

    emit();

    // One publish, one delivery. If observability published telemetry back onto
    // the platform bus this would run away.
    expect(deliveries).toBe(1);
  });

  it("keeps the event pipeline working when telemetry itself fails", async () => {
    // Force the telemetry sink to fail, then confirm the bus is unaffected.
    const failingSink = {
      name: "exploding-sink",
      write: async () => {
        throw new Error("sink is down");
      },
    };
    telemetryService.getPipeline().setSink(failingSink);

    const { state, subscriber } = makeSubscriber("unaffected");
    globalEventBus.subscribe(subscriber);

    expect(() => emit()).not.toThrow();
    expect(state.received).toBe(1);

    // Restore, so later suites see a working store.
    telemetryService.getPipeline().setSink(telemetryStore);
  });

  it("bounds the telemetry it produces under sustained event traffic", () => {
    const { subscriber } = makeSubscriber("chatty");
    globalEventBus.subscribe(subscriber);

    for (let i = 0; i < 500; i++) emit();

    // 500 successful deliveries are one health fact, not 500 records.
    expect(telemetryStore.query({ type: "health" }).length).toBeLessThan(10);
    expect(telemetryStore.count()).toBeLessThanOrEqual(telemetryStore.stats().capacity);
  });
});
