/**
 * Health evaluation.
 *
 * The trap in a health subsystem is a checker that reports "healthy" because
 * nothing told it otherwise. These tests are written so that such an
 * implementation fails: a component with no observations must NOT be healthy,
 * and every status must be traceable to counted evidence.
 *
 * Health here is derived, not declared. Nothing can set a component's status
 * directly -- the only inputs are observed successes and failures.
 */
import { describe, it, expect, beforeEach } from "vitest";

const { HealthRegistry } = await import("../src/observability/health/health-registry");

describe("health is derived from evidence, never assumed", () => {
  let health: InstanceType<typeof HealthRegistry>;
  beforeEach(() => {
    health = new HealthRegistry();
  });

  it("reports a registered but never-observed component as unknown, not healthy", () => {
    health.register("genesis-reality-adapter");
    const h = health.get("genesis-reality-adapter");
    expect(h).toBeDefined();
    // The whole point: absence of failure is not evidence of health.
    expect(h!.status).toBe("unknown");
    expect(h!.evidence.successes).toBe(0);
    expect(h!.evidence.failures).toBe(0);
  });

  it("knows nothing about a component that was never registered", () => {
    expect(health.get("never-seen")).toBeUndefined();
  });

  it("becomes healthy only after an observed success", () => {
    health.register("persistence-subscriber");
    health.recordSuccess("persistence-subscriber");

    const h = health.get("persistence-subscriber")!;
    expect(h.status).toBe("healthy");
    expect(h.evidence.successes).toBe(1);
    expect(h.updatedAt).toBeTruthy();
  });

  it("degrades on a failure and carries the reason as evidence", () => {
    health.register("timeline-subscriber");
    health.recordSuccess("timeline-subscriber");
    health.recordFailure("timeline-subscriber", new Error("SQLITE_BUSY: database is locked"));

    const h = health.get("timeline-subscriber")!;
    expect(h.status).toBe("degraded");
    expect(h.evidence.consecutiveFailures).toBe(1);
    expect(h.evidence.lastError).toContain("SQLITE_BUSY");
    expect(h.rationale).toBeTruthy();
  });

  it("escalates to critical once failures pass the threshold", () => {
    health.register("flaky", { criticalAfterConsecutiveFailures: 3 });
    for (let i = 0; i < 2; i++) health.recordFailure("flaky", new Error("boom"));
    expect(health.get("flaky")!.status).toBe("degraded");

    health.recordFailure("flaky", new Error("boom"));
    expect(health.get("flaky")!.status).toBe("critical");
    expect(health.get("flaky")!.evidence.consecutiveFailures).toBe(3);
  });

  it("recovers to healthy when the component succeeds again", () => {
    health.register("recovering", { criticalAfterConsecutiveFailures: 2 });
    health.recordFailure("recovering", new Error("down"));
    health.recordFailure("recovering", new Error("down"));
    expect(health.get("recovering")!.status).toBe("critical");

    health.recordSuccess("recovering");

    const h = health.get("recovering")!;
    expect(h.status).toBe("healthy");
    expect(h.evidence.consecutiveFailures).toBe(0);
    // Recovery must not erase the history that explains how it got there.
    expect(h.evidence.failures).toBe(2);
  });

  it("keeps per-component evidence separate", () => {
    health.register("a");
    health.register("b");
    health.recordSuccess("a");
    health.recordFailure("b", new Error("b is broken"));

    expect(health.get("a")!.status).toBe("healthy");
    expect(health.get("b")!.status).toBe("degraded");
  });

  it("ignores observations for components that were never registered", () => {
    // Silently inventing a component from a stray id would let a typo create a
    // permanently-unknown entry, and an attacker-controlled id grow the map.
    health.recordFailure("ghost", new Error("x"));
    expect(health.get("ghost")).toBeUndefined();
    expect(health.getAll()).toHaveLength(0);
  });
});

describe("overall health summarises the worst component", () => {
  let health: InstanceType<typeof HealthRegistry>;
  beforeEach(() => {
    health = new HealthRegistry();
  });

  it("is unknown when nothing has been observed yet", () => {
    health.register("a");
    expect(health.overall()).toBe("unknown");
  });

  it("is healthy only when every observed component is healthy", () => {
    health.register("a");
    health.register("b");
    health.recordSuccess("a");
    health.recordSuccess("b");
    expect(health.overall()).toBe("healthy");
  });

  it("reports the worst status present", () => {
    health.register("a", { criticalAfterConsecutiveFailures: 2 });
    health.register("b");
    health.recordSuccess("b");

    health.recordFailure("a", new Error("x"));
    expect(health.overall()).toBe("degraded");

    health.recordFailure("a", new Error("x"));
    expect(health.overall()).toBe("critical");
  });
});

describe("health status changes are observable as telemetry", () => {
  let health: InstanceType<typeof HealthRegistry>;
  beforeEach(() => {
    health = new HealthRegistry();
  });

  it("announces a transition, and only a transition", () => {
    const seen: Array<{ componentId: string; status: string }> = [];
    health.subscribe((h) => seen.push({ componentId: h.componentId, status: h.status }));

    health.register("a");
    health.recordSuccess("a"); // unknown -> healthy : announced
    health.recordSuccess("a"); // healthy -> healthy : silent
    health.recordSuccess("a"); // healthy -> healthy : silent
    health.recordFailure("a", new Error("x")); // healthy -> degraded : announced

    expect(seen).toEqual([
      { componentId: "a", status: "healthy" },
      { componentId: "a", status: "degraded" },
    ]);
  });

  it("stops announcing after unsubscribe", () => {
    let count = 0;
    const off = health.subscribe(() => count++);
    health.register("a");
    health.recordSuccess("a");
    expect(count).toBe(1);

    off();
    health.recordFailure("a", new Error("x"));
    expect(count).toBe(1);
  });
});

describe("the registry cannot grow without bound", () => {
  it("refuses new components past the configured cap", () => {
    const health = new HealthRegistry({ maxComponents: 2 });
    expect(health.register("a")).toBe(true);
    expect(health.register("b")).toBe(true);
    expect(health.register("c")).toBe(false);
    expect(health.getAll()).toHaveLength(2);
  });

  it("re-registering a known component is idempotent, not a new slot", () => {
    const health = new HealthRegistry({ maxComponents: 2 });
    health.register("a");
    health.recordSuccess("a");
    expect(health.register("a")).toBe(true);
    expect(health.getAll()).toHaveLength(1);
    // Re-registration must not silently wipe accumulated evidence.
    expect(health.get("a")!.evidence.successes).toBe(1);
  });
});
