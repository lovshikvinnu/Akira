/**
 * Health evaluation for AKIRA OS components.
 *
 * The easy way to build this is a registry of check functions returning a
 * boolean, and the easy way for that to be useless is for every check to return
 * true because nothing told it otherwise. This registry cannot be written that
 * way: it has no notion of a "check". Status is *derived* from counted
 * observations of real work, and there is no API to set a status directly.
 *
 * The states, and the evidence that produces each:
 *
 *   unknown   registered, but nothing has been observed. Explicitly NOT healthy
 *             -- absence of failure is not evidence of health, and reporting a
 *             silent component as healthy is the exact failure mode that makes
 *             a health dashboard worthless.
 *   healthy   the last observation succeeded.
 *   degraded  at least one consecutive failure, below the critical threshold.
 *   critical  consecutive failures reached the threshold.
 *
 * Recovery is a first-class transition: one success clears the consecutive
 * count and returns the component to healthy, while the cumulative failure
 * total is retained so the history explaining the recovery is not erased.
 */

import { getObservabilityRetention } from "../store/retention";

/** Includes `unknown`, which the `HealthRecord` wire model deliberately does not. */
export type ComponentHealthStatus = "unknown" | "healthy" | "degraded" | "critical";

export interface HealthEvidence {
  readonly successes: number;
  readonly failures: number;
  readonly consecutiveFailures: number;
  readonly lastError?: string;
  readonly lastSuccessAt?: string;
  readonly lastFailureAt?: string;
}

export interface ComponentHealth {
  readonly componentId: string;
  readonly status: ComponentHealthStatus;
  readonly evidence: HealthEvidence;
  /** ISO-8601 instant of the most recent observation, or of registration. */
  readonly updatedAt: string;
  /** Human-readable justification naming the evidence that produced the status. */
  readonly rationale: string;
}

export interface ComponentHealthOptions {
  /** Consecutive failures at which the component is considered critical. */
  readonly criticalAfterConsecutiveFailures?: number;
}

export type HealthListener = (health: ComponentHealth) => void;

const DEFAULT_CRITICAL_THRESHOLD = 3;

interface ComponentState {
  componentId: string;
  criticalThreshold: number;
  status: ComponentHealthStatus;
  successes: number;
  failures: number;
  consecutiveFailures: number;
  lastError?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  updatedAt: string;
  rationale: string;
}

/** Worst-first, so `overall()` can pick a winner by index. */
const SEVERITY_ORDER: ComponentHealthStatus[] = ["critical", "degraded", "unknown", "healthy"];

export class HealthRegistry {
  private readonly components = new Map<string, ComponentState>();
  private readonly listeners = new Set<HealthListener>();
  private readonly overrideMaxComponents?: number;

  constructor(options?: { maxComponents?: number }) {
    this.overrideMaxComponents = options?.maxComponents;
  }

  private get maxComponents(): number {
    return this.overrideMaxComponents ?? getObservabilityRetention().maxHealthComponents;
  }

  /**
   * Declares a component as observable.
   *
   * Returns false when the cap is reached. Registration is required before any
   * observation counts: ids arrive from event sources, and auto-creating a
   * component from a stray id would let a typo produce a permanently-unknown
   * entry and let an unbounded id space grow the map.
   *
   * Re-registering a known component is idempotent and preserves its evidence.
   */
  register(componentId: string, options?: ComponentHealthOptions): boolean {
    const existing = this.components.get(componentId);
    if (existing) {
      if (options?.criticalAfterConsecutiveFailures !== undefined) {
        existing.criticalThreshold = options.criticalAfterConsecutiveFailures;
      }
      return true;
    }
    if (this.components.size >= this.maxComponents) return false;

    this.components.set(componentId, {
      componentId,
      criticalThreshold: options?.criticalAfterConsecutiveFailures ?? DEFAULT_CRITICAL_THRESHOLD,
      status: "unknown",
      successes: 0,
      failures: 0,
      consecutiveFailures: 0,
      updatedAt: new Date().toISOString(),
      rationale: "Registered; no observations yet.",
    });
    return true;
  }

  unregister(componentId: string): void {
    this.components.delete(componentId);
  }

  isRegistered(componentId: string): boolean {
    return this.components.has(componentId);
  }

  /** Observes one successful unit of work. */
  recordSuccess(componentId: string): void {
    const state = this.components.get(componentId);
    if (!state) return;

    state.successes += 1;
    state.consecutiveFailures = 0;
    state.lastSuccessAt = new Date().toISOString();
    state.updatedAt = state.lastSuccessAt;
    state.rationale =
      state.failures > 0
        ? "Last observation succeeded; recovered after " + state.failures + " total failure(s)."
        : "Last observation succeeded (" + state.successes + " total).";

    this.transitionTo(state, "healthy");
  }

  /** Observes one failed unit of work. `error` becomes the retained evidence. */
  recordFailure(componentId: string, error: unknown): void {
    const state = this.components.get(componentId);
    if (!state) return;

    state.failures += 1;
    state.consecutiveFailures += 1;
    state.lastError = error instanceof Error ? error.message : String(error);
    state.lastFailureAt = new Date().toISOString();
    state.updatedAt = state.lastFailureAt;

    const next: ComponentHealthStatus =
      state.consecutiveFailures >= state.criticalThreshold ? "critical" : "degraded";
    state.rationale =
      state.consecutiveFailures +
      " consecutive failure(s), threshold " +
      state.criticalThreshold +
      ". Last error: " +
      state.lastError;

    this.transitionTo(state, next);
  }

  get(componentId: string): ComponentHealth | undefined {
    const state = this.components.get(componentId);
    return state ? this.snapshot(state) : undefined;
  }

  getAll(): readonly ComponentHealth[] {
    return Array.from(this.components.values(), (s) => this.snapshot(s));
  }

  /** The worst status across all registered components. */
  overall(): ComponentHealthStatus {
    if (this.components.size === 0) return "unknown";
    let worstIndex = SEVERITY_ORDER.length - 1;
    for (const state of this.components.values()) {
      const index = SEVERITY_ORDER.indexOf(state.status);
      if (index < worstIndex) worstIndex = index;
    }
    return SEVERITY_ORDER[worstIndex];
  }

  /**
   * Notifies on status *transitions* only.
   *
   * A component processing a thousand events a second is a thousand successes
   * but one health fact. Emitting a record per observation would turn the store
   * into a log of "still fine" and evict everything of interest.
   */
  subscribe(listener: HealthListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.components.clear();
  }

  private transitionTo(state: ComponentState, next: ComponentHealthStatus): void {
    if (state.status === next) return;
    state.status = next;

    const snapshot = this.snapshot(state);
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        // A health listener must never break the component it observes.
        console.error("[Observability] Health listener failed:", err);
      }
    }
  }

  private snapshot(state: ComponentState): ComponentHealth {
    return Object.freeze({
      componentId: state.componentId,
      status: state.status,
      evidence: Object.freeze({
        successes: state.successes,
        failures: state.failures,
        consecutiveFailures: state.consecutiveFailures,
        lastError: state.lastError,
        lastSuccessAt: state.lastSuccessAt,
        lastFailureAt: state.lastFailureAt,
      }),
      updatedAt: state.updatedAt,
      rationale: state.rationale,
    });
  }
}

/** The registry the composed production system observes into. */
export const healthRegistry = new HealthRegistry();
