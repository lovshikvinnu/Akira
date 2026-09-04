/**
 * The bridge from real platform activity into observability.
 *
 * This is where observability gets its evidence. Every AKIRA OS action --
 * completing a task, writing a note, touching the vault -- becomes an
 * `AkiraEvent` on the platform bus, which fans it out to the persistence
 * subscriber, the timeline subscriber and the GENESIS reality adapter. The bus
 * catches everything those subscribers throw so one failure cannot stop the
 * others, with the side effect that a subscriber can fail on every event
 * forever and nothing notices.
 *
 * The observer watches those outcomes and turns them into the two signals worth
 * having:
 *
 *   health       per subscriber, derived from real successes and failures.
 *   performance  per subscriber, the latency of actual delivery -- which is
 *                where SQLite persistence and GENESIS cognition really run.
 *
 * It observes rather than subscribing. A subscriber would see events but not
 * other subscribers' outcomes, would observe itself, and would sit one
 * `publish` away from recursion. An observer sees exactly the delivery outcomes
 * and publishes nothing.
 *
 * Ownership note: this lives under `src/observability/` and depends on the
 * instrumentation bus. The dependency does not run the other way -- the bus
 * knows only the `EventDeliveryObserver` interface, not this class -- and
 * nothing here belongs to or depends on GENESIS.
 */

import type { EventDelivery, EventDeliveryObserver } from "../../instrumentation/event-bus";
import { HealthRegistry, ComponentHealth } from "../health/health-registry";
import { PerformanceMonitor } from "../performance/performance-monitor";

/** Prefix for the per-subscriber delivery latency operation name. */
export const DELIVERY_OPERATION_PREFIX = "event.delivery.";

export class EventBusObserver implements EventDeliveryObserver {
  constructor(
    private readonly health: HealthRegistry,
    private readonly performance: PerformanceMonitor,
  ) {}

  onDelivery(delivery: EventDelivery): void {
    const { subscriberId, durationMs, error } = delivery;

    // Subscriber ids are code-defined and few, so registering on first sight is
    // safe; the registry's own cap is the backstop if that ever stops being true.
    this.health.register(subscriberId);

    if (error === undefined) {
      this.health.recordSuccess(subscriberId);
    } else {
      this.health.recordFailure(subscriberId, error);
    }

    this.performance.record(DELIVERY_OPERATION_PREFIX + subscriberId, durationMs, {
      failed: error !== undefined,
    });
  }
}

/** Builds the health-transition listener that writes `HealthRecord`s to telemetry. */
export function createHealthRecorder(
  emit: (health: ComponentHealth) => void,
): (health: ComponentHealth) => void {
  return (health: ComponentHealth) => {
    try {
      emit(health);
    } catch (err) {
      // Telemetry must never break the component whose health it reports.
      console.error("[Observability] Failed to record health transition:", err);
    }
  };
}
