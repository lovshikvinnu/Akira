/**
 * Observability reachability.
 *
 * The defect this guards against is the one the subsystem shipped with: 34
 * files of working telemetry code that nothing outside `src/observability/`
 * imported, terminating in a pipeline built with zero stages and a null sink.
 * Every unit test passed. The system recorded nothing, and could not have.
 *
 * The rule that makes this file meaningful, borrowed from
 * `genesis-production-composition.test.ts`:
 *
 *     THIS FILE MAY REACH OBSERVABILITY ONLY THROUGH `src/akira-os/index.ts`.
 *
 * Importing `../src/observability/composition` directly would supply the very
 * composition step production might be missing, and silently void the test.
 * Reading a singleton back through a second import path is fine -- it is the
 * same module instance -- but nothing here may *cause* composition.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The one permitted entry point: exactly what src/routes/*.tsx imports.
const akiraOs = await import("../src/akira-os/index");

const REPO_ROOT = path.resolve(__dirname, "..");

describe("importing AKIRA OS activates observability", () => {
  it("is already initialized, without this test composing anything", () => {
    // Nothing above called initializeObservability(). If this passes, the
    // production entry point did it.
    expect(akiraOs.isObservabilityInitialized()).toBe(true);
  });

  it("exposes the lifecycle through the AKIRA OS public surface", () => {
    expect(typeof akiraOs.initializeObservability).toBe("function");
    expect(typeof akiraOs.shutdownObservability).toBe("function");
  });

  it("carries a real AKIRA OS action all the way to a health conclusion", async () => {
    // The full production path, driven from the top: an OS store action
    // publishes a platform event, the bus delivers it to its subscribers, the
    // delivery observer sees the outcomes, and health and latency follow.
    const { globalEventBus } = await import("../src/instrumentation/event-bus");
    const { healthRegistry } = await import("../src/observability/health/health-registry");
    const { performanceMonitor } =
      await import("../src/observability/performance/performance-monitor");

    const seen: string[] = [];
    globalEventBus.subscribe({
      id: "reachability-witness",
      onEvent(event) {
        seen.push(event.type);
      },
    });

    akiraOs.akira.addTaskDetails({ title: "reachability-probe", projectId: "proj-reach" });
    const task = akiraOs.akira
      .getState()
      .tasks.find((t: { title: string }) => t.title === "reachability-probe");
    expect(task, "the store action must have created a task").toBeDefined();
    akiraOs.akira.toggleTask(task!.id);

    expect(seen.length, "a real OS action must publish a platform event").toBeGreaterThan(0);

    const health = healthRegistry.get("reachability-witness");
    expect(health, "observability must have observed the delivery").toBeDefined();
    expect(health!.status).toBe("healthy");
    expect(health!.evidence.successes).toBeGreaterThan(0);

    const perf = performanceMonitor.get("event.delivery.reachability-witness");
    expect(perf, "delivery latency must have been measured").toBeDefined();
    expect(perf!.count).toBeGreaterThan(0);
  });

  it("records health conclusions into the telemetry store", async () => {
    const { telemetryStore } = await import("../src/observability/store/telemetry-store");
    const records = telemetryStore.query({ type: "health" });
    expect(records.length, "health transitions must reach the store").toBeGreaterThan(0);
  });
});

describe("the composition wiring is structurally present", () => {
  it("AKIRA OS calls the observability composition at its entry point", () => {
    // A behavioural check alone would pass if some *other* import happened to
    // compose. This pins the wiring itself, so deleting the call fails here
    // rather than mysteriously somewhere else.
    const entry = fs.readFileSync(path.join(REPO_ROOT, "src/akira-os/index.ts"), "utf8");
    expect(entry).toMatch(/import\s+["']\.\.\/observability\/auto-compose["']/);
  });

  it("the server runtime composes observability on its own bus", () => {
    // Client and server have separate module instances, so a single call site
    // would leave the persistence and timeline deliveries unobserved.
    const server = fs.readFileSync(
      path.join(REPO_ROOT, "src/instrumentation/server/index.ts"),
      "utf8",
    );
    expect(server).toMatch(/observability\/auto-compose/);
  });

  it("the side-effect entry point actually composes", () => {
    const auto = fs.readFileSync(path.join(REPO_ROOT, "src/observability/auto-compose.ts"), "utf8");
    expect(auto).toMatch(/initializeObservability\(\)/);
  });
});

describe("observability stays out of the browser's way", () => {
  /** Every .ts file in the subsystem. */
  function observabilityFiles(): string[] {
    const root = path.join(REPO_ROOT, "src/observability");
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".ts")) out.push(full);
      }
    };
    walk(root);
    return out;
  }

  it("imports no Node-only or server-only module anywhere in the subsystem", () => {
    // async_hooks, better-sqlite3 and friends must not be pulled into the
    // client bundle. The telemetry context reaches AsyncLocalStorage through a
    // guarded runtime require precisely so this stays true; a static import
    // would defeat that.
    const offenders: string[] = [];
    for (const file of observabilityFiles()) {
      const source = fs.readFileSync(file, "utf8");
      if (
        /^\s*import\s+[^;]*["'](node:|better-sqlite3|async_hooks|fs|path|os|crypto)["']/m.test(
          source,
        )
      ) {
        offenders.push(path.relative(REPO_ROOT, file));
      }
    }
    expect(offenders, "static Node-only imports in observability").toEqual([]);
  });

  it("does not depend on GENESIS", () => {
    // Ownership boundary: observability belongs to AKIRA OS. GENESIS may be
    // observed -- its reality adapter is a bus subscriber like any other -- but
    // observability must not import it.
    const offenders: string[] = [];
    for (const file of observabilityFiles()) {
      const source = fs.readFileSync(file, "utf8");
      if (/from\s+["'][^"']*genesis/i.test(source)) {
        offenders.push(path.relative(REPO_ROOT, file));
      }
    }
    expect(offenders, "observability must not import GENESIS").toEqual([]);
  });
});
