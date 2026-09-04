/**
 * Observability composition: the wiring seam for the subsystem.
 *
 * The observability core arrived complete but unreachable -- 34 files that
 * nothing outside the directory imported, whose pipeline was constructed with
 * zero stages and a null sink. This file is what makes it a running system, and
 * it is explicit for the same reason `src/genesis/composition.ts` is: a
 * subsystem that activates itself through module-scope import side effects is
 * one careless refactor away from being silently dead again, and nothing fails
 * when it is.
 *
 * What composing does, in order:
 *   1. terminates the telemetry pipeline in the bounded store, so records that
 *      were previously validated and dropped are now retrievable;
 *   2. forwards health transitions into that store as `HealthRecord`s;
 *   3. installs the delivery observer on the platform bus, which is where all
 *      the evidence comes from.
 *
 * Every step is idempotent and every step is undone by `shutdownObservability`.
 * There are no timers and no bus subscriptions, so there is nothing to leak: the
 * subsystem is entirely passive and does work only while an event is being
 * delivered.
 *
 * Ownership: observability belongs to AKIRA OS. It reads the instrumentation
 * bus and nothing else; it does not depend on GENESIS, and GENESIS does not
 * own, configure, or initialize any of it.
 */

import { globalEventBus } from "../instrumentation/event-bus";
import { telemetryService } from "./services/telemetry-service";
import { telemetryFactory } from "./services/telemetry-factory";
import { telemetryStore } from "./store/telemetry-store";
import { healthRegistry, ComponentHealth } from "./health/health-registry";
import { performanceMonitor } from "./performance/performance-monitor";
import { EventBusObserver } from "./integration/event-bus-observer";
import { TelemetrySeverity } from "./models/severity";

let observer: EventBusObserver | null = null;
let unsubscribeHealth: (() => void) | null = null;

/**
 * Maps a health transition onto the telemetry model.
 *
 * `ComponentHealth` carries an `unknown` state that `HealthRecord` deliberately
 * does not, because "no evidence yet" is not a health claim worth recording.
 * Such a transition is skipped rather than coerced into one of the three wire
 * states.
 */
function recordHealthTransition(health: ComponentHealth): void {
  if (health.status === "unknown") return;

  const severity =
    health.status === "critical"
      ? TelemetrySeverity.CRITICAL
      : health.status === "degraded"
        ? TelemetrySeverity.WARN
        : TelemetrySeverity.INFO;

  const record = telemetryFactory.createHealth(
    "akira-os",
    "observability",
    health.componentId,
    health.status,
    health.rationale,
    {
      successes: health.evidence.successes,
      failures: health.evidence.failures,
      consecutiveFailures: health.evidence.consecutiveFailures,
    },
    severity,
  );

  // Fire and forget: the pipeline is async, and a telemetry failure must never
  // surface in the component being observed.
  void telemetryService.record(record).catch((err) => {
    console.error("[Observability] Failed to record health transition:", err);
  });
}

/**
 * Activates observability. Safe to call repeatedly -- a second call replaces
 * the same single observer slot rather than adding another, so repeated
 * initialization cannot double-count a delivery.
 */
export function initializeObservability(): void {
  if (observer) return;

  // 1. Give the pipeline somewhere to put records.
  telemetryService.getPipeline().setSink(telemetryStore);

  // 2. Health transitions become telemetry records.
  unsubscribeHealth = healthRegistry.subscribe(recordHealthTransition);

  // 3. Watch real deliveries on the real bus.
  observer = new EventBusObserver(healthRegistry, performanceMonitor);
  globalEventBus.setDeliveryObserver(observer);
}

/**
 * Deactivates observability and releases everything it held.
 *
 * Safe when never initialized and safe to call twice. The bus observer slot is
 * cleared only if it still holds *our* observer, so a shutdown cannot detach an
 * observer installed by someone else.
 */
export function shutdownObservability(): void {
  if (unsubscribeHealth) {
    unsubscribeHealth();
    unsubscribeHealth = null;
  }
  if (observer && globalEventBus.getDeliveryObserver() === observer) {
    globalEventBus.setDeliveryObserver(null);
  }
  observer = null;
}

export function isObservabilityInitialized(): boolean {
  return observer !== null;
}
