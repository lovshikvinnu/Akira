/**
 * The telemetry store: observability's collection layer.
 *
 * The instrumentation layer shipped complete -- factory, validator, serializer,
 * correlation context, metrics, logger, tracer, diagnostics -- terminating in
 * `TelemetryPipelineImpl`, which was constructed with zero stages and a null
 * sink. Every record it produced was validated and then dropped on the floor.
 * That is why no subsystem outside `src/observability/` ever imported it: there
 * was nothing to read back.
 *
 * This is the sink that closes the loop. It is a bounded ring buffer, not the
 * SQLite table ADR-021 described; ADR-022 records why.
 */

import { TelemetryRecord, TelemetrySink } from "../contracts/telemetry";
import { TelemetrySeverity, severityToNumber } from "../models/severity";
import { getObservabilityRetention } from "./retention";

/** Narrows a query to a subset of what the store holds. All fields combine with AND. */
export interface TelemetryQuery {
  /** Record discriminator: "log", "metric", "trace", "health", "resource", ... */
  readonly type?: string;
  readonly moduleId?: string;
  readonly source?: string;
  /** Inclusive floor, compared on the ordered severity scale rather than by equality. */
  readonly minSeverity?: TelemetrySeverity;
  /** ISO-8601. Records at or after this instant. */
  readonly since?: string;
  /** Keeps the newest N of whatever matched. */
  readonly limit?: number;
}

export interface TelemetryStoreStats {
  readonly retained: number;
  readonly dropped: number;
  readonly capacity: number;
  readonly byType: Readonly<Record<string, number>>;
}

export class TelemetryStore implements TelemetrySink {
  readonly name = "telemetry-store";

  private records: TelemetryRecord[] = [];
  private droppedCount = 0;
  private readonly overrideMax?: number;

  /**
   * @param options.maxRecords pins the capacity for this instance. Omit it and
   * the store follows the ambient policy, which is what the production singleton
   * wants; tests pass a small explicit number to reach the boundary cheaply.
   */
  constructor(options?: { maxRecords?: number }) {
    this.overrideMax = options?.maxRecords;
  }

  private get capacity(): number {
    return this.overrideMax ?? getObservabilityRetention().maxRecords;
  }

  /**
   * Terminal sink. Never throws: a failure to store telemetry must not surface
   * in the caller, which is executing business logic. The contract is async to
   * match `TelemetrySink`, but the work is synchronous -- there is no I/O.
   */
  async write(record: TelemetryRecord): Promise<void> {
    this.records.push(record);
    const overflow = this.records.length - this.capacity;
    if (overflow > 0) {
      this.records.splice(0, overflow);
      this.droppedCount += overflow;
    }
  }

  /** Oldest-first. With a `limit`, the newest `limit` of what matched. */
  query(filter: TelemetryQuery = {}): readonly TelemetryRecord[] {
    const floor =
      filter.minSeverity !== undefined ? severityToNumber(filter.minSeverity) : undefined;

    let matched = this.records.filter((r) => {
      if (filter.type !== undefined && r.type !== filter.type) return false;
      if (filter.moduleId !== undefined && r.moduleId !== filter.moduleId) return false;
      if (filter.source !== undefined && r.source !== filter.source) return false;
      if (floor !== undefined && severityToNumber(r.severity) < floor) return false;
      if (filter.since !== undefined && r.timestamp < filter.since) return false;
      return true;
    });

    if (filter.limit !== undefined && matched.length > filter.limit) {
      matched = matched.slice(matched.length - filter.limit);
    }
    return matched;
  }

  count(): number {
    return this.records.length;
  }

  stats(): TelemetryStoreStats {
    const byType: Record<string, number> = {};
    for (const r of this.records) {
      byType[r.type] = (byType[r.type] ?? 0) + 1;
    }
    return {
      retained: this.records.length,
      dropped: this.droppedCount,
      capacity: this.capacity,
      byType,
    };
  }

  clear(): void {
    this.records = [];
    this.droppedCount = 0;
  }
}

/** The store the composed production pipeline terminates in. */
export const telemetryStore = new TelemetryStore();
