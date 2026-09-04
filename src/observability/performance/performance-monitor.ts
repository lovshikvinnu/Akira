/**
 * Performance measurement for real AKIRA operations.
 *
 * Deliberately small. The temptation in a performance subsystem is to time
 * everything, which produces thousands of numbers nobody can act on and buries
 * the handful that matter. This measures *named* operations chosen because
 * latency there is worth knowing -- event delivery to each subscriber, which is
 * where SQLite persistence and GENESIS cognition actually run.
 *
 * Two bounds, for two different growth axes:
 *   - `maxOperations` bounds distinct names, because a name derived from data
 *     would otherwise be an unbounded key.
 *   - `maxSamplesPerOperation` bounds a single operation measured a million
 *     times. `count` still totals every call; only the statistics window is
 *     trimmed, so a hot path keeps an accurate call count and recent latencies
 *     without retaining a million numbers.
 *
 * The clock is the shared telemetry clock, so measurements use the same
 * monotonic source as the rest of the subsystem and are immune to wall-clock
 * adjustment.
 */

import { telemetryClock } from "../utils/clock";
import { getObservabilityRetention } from "../store/retention";

export interface OperationStats {
  readonly operation: string;
  /** Total measured calls, including those trimmed out of the sample window. */
  readonly count: number;
  /** Calls that failed. */
  readonly failures: number;
  /** failures / count, or 0 when nothing has been measured. */
  readonly errorRate: number;
  /** Samples currently retained, i.e. what the statistics below are computed from. */
  readonly sampleCount: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly p95: number;
  /** ISO-8601 instant of the most recent measurement. */
  readonly lastMeasuredAt: string;
}

export interface RecordOptions {
  readonly failed?: boolean;
}

interface OperationState {
  operation: string;
  count: number;
  failures: number;
  samples: number[];
  lastMeasuredAt: string;
}

export class PerformanceMonitor {
  private readonly operations = new Map<string, OperationState>();
  private readonly overrideMaxOperations?: number;
  private readonly overrideMaxSamples?: number;

  constructor(options?: { maxOperations?: number; maxSamplesPerOperation?: number }) {
    this.overrideMaxOperations = options?.maxOperations;
    this.overrideMaxSamples = options?.maxSamplesPerOperation;
  }

  private get maxOperations(): number {
    return this.overrideMaxOperations ?? getObservabilityRetention().maxPerformanceOperations;
  }

  private get maxSamples(): number {
    return this.overrideMaxSamples ?? getObservabilityRetention().maxSamplesPerOperation;
  }

  /**
   * Starts a measurement. Call the returned function to finish it.
   *
   * Returned rather than paired with an `end(name)` so a caller cannot mismatch
   * the two, and so concurrent measurements of the same operation do not
   * interfere.
   */
  begin(operation: string): (options?: RecordOptions) => void {
    const start = telemetryClock.monotonicNow();
    let finished = false;
    return (options?: RecordOptions) => {
      // Guard against a double call, which would otherwise record the operation
      // twice with a longer second duration and quietly skew the statistics.
      if (finished) return;
      finished = true;
      const elapsed = telemetryClock.elapsedMs(start, telemetryClock.monotonicNow());
      this.record(operation, elapsed, options);
    };
  }

  /**
   * Measures a synchronous block.
   *
   * A throwing block is still measured and is counted as a failure -- an
   * operation that fails fast would otherwise look like the fastest operation
   * in the system.
   */
  measure<T>(operation: string, fn: () => T): T {
    const done = this.begin(operation);
    try {
      const result = fn();
      done();
      return result;
    } catch (err) {
      done({ failed: true });
      throw err;
    }
  }

  /** Measures an async block, with the same failure semantics as `measure`. */
  async measureAsync<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const done = this.begin(operation);
    try {
      const result = await fn();
      done();
      return result;
    } catch (err) {
      done({ failed: true });
      throw err;
    }
  }

  /** Records a duration measured elsewhere. */
  record(operation: string, durationMs: number, options?: RecordOptions): void {
    let state = this.operations.get(operation);
    if (!state) {
      if (this.operations.size >= this.maxOperations) return;
      state = {
        operation,
        count: 0,
        failures: 0,
        samples: [],
        lastMeasuredAt: telemetryClock.nowIso(),
      };
      this.operations.set(operation, state);
    }

    state.count += 1;
    if (options?.failed) state.failures += 1;
    state.lastMeasuredAt = telemetryClock.nowIso();

    state.samples.push(durationMs);
    const overflow = state.samples.length - this.maxSamples;
    if (overflow > 0) state.samples.splice(0, overflow);
  }

  get(operation: string): OperationStats | undefined {
    const state = this.operations.get(operation);
    return state ? this.summarise(state) : undefined;
  }

  getAll(): readonly OperationStats[] {
    return Array.from(this.operations.values(), (s) => this.summarise(s));
  }

  clear(): void {
    this.operations.clear();
  }

  private summarise(state: OperationState): OperationStats {
    const samples = state.samples;
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = samples.reduce((acc, v) => acc + v, 0);

    return Object.freeze({
      operation: state.operation,
      count: state.count,
      failures: state.failures,
      errorRate: state.count === 0 ? 0 : state.failures / state.count,
      sampleCount: samples.length,
      min: sorted.length === 0 ? 0 : sorted[0],
      max: sorted.length === 0 ? 0 : sorted[sorted.length - 1],
      mean: samples.length === 0 ? 0 : sum / samples.length,
      p95: percentile(sorted, 0.95),
      lastMeasuredAt: state.lastMeasuredAt,
    });
  }
}

/** Nearest-rank percentile over an already-sorted array. */
function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = Math.ceil(fraction * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index];
}

/** The monitor the composed production system measures into. */
export const performanceMonitor = new PerformanceMonitor();
