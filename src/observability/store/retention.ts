/**
 * Observability retention.
 *
 * ADR-021 assumed a SQLite-backed telemetry database with sliding-window
 * retention (7 days of logs, 24 hours of spans). That is not what this
 * subsystem builds -- see ADR-022 for the reasoning -- so the bound is a record
 * count rather than an age.
 *
 * The shape of the caps mirrors `src/genesis/retention/policy.ts`: one cap per
 * growth axis, declared here rather than left as magic numbers at the call
 * sites, because the axes grow for different reasons and a single global limit
 * would be wrong for all of them.
 */

export interface ObservabilityRetentionPolicy {
  /** Telemetry records held by the store. The dominant axis: every signal lands here. */
  readonly maxRecords: number;
  /**
   * Components tracked by the health registry.
   *
   * Grows with distinct component ids, not with traffic, so it is small -- but
   * a component id derived from user data would otherwise be an unbounded key.
   */
  readonly maxHealthComponents: number;
  /** Distinct operations tracked for performance. Bounded for the same reason. */
  readonly maxPerformanceOperations: number;
  /**
   * Duration samples kept per operation.
   *
   * This is the axis that grows with traffic: one operation measured a million
   * times must not retain a million numbers. Percentiles are computed from this
   * window, so it is the accuracy/quantity tradeoff made explicit.
   */
  readonly maxSamplesPerOperation: number;
  /** Diagnostics retained in memory by `DiagnosticsService.list()`. */
  readonly maxDiagnostics: number;
}

export const DEFAULT_OBSERVABILITY_RETENTION: ObservabilityRetentionPolicy = {
  maxRecords: 1000,
  maxHealthComponents: 64,
  maxPerformanceOperations: 64,
  maxSamplesPerOperation: 256,
  maxDiagnostics: 200,
};

let activePolicy: ObservabilityRetentionPolicy = DEFAULT_OBSERVABILITY_RETENTION;

export function getObservabilityRetention(): ObservabilityRetentionPolicy {
  return activePolicy;
}

/** Overrides the policy. Intended for tests, which need small caps to reach a boundary cheaply. */
export function setObservabilityRetention(policy: Partial<ObservabilityRetentionPolicy>): void {
  activePolicy = { ...activePolicy, ...policy };
}

export function resetObservabilityRetention(): void {
  activePolicy = DEFAULT_OBSERVABILITY_RETENTION;
}
