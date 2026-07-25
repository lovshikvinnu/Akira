import { TelemetryRecord } from "../contracts/telemetry";
import { TelemetrySeverity } from "./severity";
import { TelemetryMetadata, deepFreeze } from "./metadata";
import { TelemetryCorrelation } from "./correlation";

export abstract class TelemetryRecordBase implements TelemetryRecord {
  public abstract readonly type: string;

  constructor(
    public readonly id: string,
    public readonly timestamp: string,
    public readonly monotonicTimestamp: string,
    public readonly source: string,
    public readonly moduleId: string,
    public readonly correlation: TelemetryCorrelation,
    public readonly severity: TelemetrySeverity,
    public readonly version: string,
    public readonly metadata: TelemetryMetadata,
  ) {
    // Note: Concrete classes call deepFreeze on themselves after initialization
  }
}

export class MetricRecord extends TelemetryRecordBase {
  public readonly type = "metric";

  constructor(
    id: string,
    timestamp: string,
    monotonicTimestamp: string,
    source: string,
    moduleId: string,
    correlation: TelemetryCorrelation,
    public readonly metricName: string,
    public readonly metricType: "counter" | "gauge" | "histogram",
    public readonly value: number,
    severity: TelemetrySeverity,
    version: string,
    metadata: TelemetryMetadata,
  ) {
    super(
      id,
      timestamp,
      monotonicTimestamp,
      source,
      moduleId,
      correlation,
      severity,
      version,
      metadata,
    );
    Object.freeze(this);
  }
}

export class LogRecord extends TelemetryRecordBase {
  public readonly type = "log";

  constructor(
    id: string,
    timestamp: string,
    monotonicTimestamp: string,
    source: string,
    moduleId: string,
    correlation: TelemetryCorrelation,
    public readonly message: string,
    public readonly stackTrace: string | undefined,
    severity: TelemetrySeverity,
    version: string,
    metadata: TelemetryMetadata,
  ) {
    super(
      id,
      timestamp,
      monotonicTimestamp,
      source,
      moduleId,
      correlation,
      severity,
      version,
      metadata,
    );
    Object.freeze(this);
  }
}

export class TraceRecord extends TelemetryRecordBase {
  public readonly type = "trace";

  constructor(
    id: string,
    timestamp: string,
    monotonicTimestamp: string,
    source: string,
    moduleId: string,
    correlation: TelemetryCorrelation,
    public readonly spanId: string,
    public readonly parentSpanId: string | null,
    public readonly spanName: string,
    public readonly durationMs: number,
    public readonly status: "ok" | "error",
    public readonly events: ReadonlyArray<any>,
    severity: TelemetrySeverity,
    version: string,
    metadata: TelemetryMetadata,
  ) {
    super(
      id,
      timestamp,
      monotonicTimestamp,
      source,
      moduleId,
      correlation,
      severity,
      version,
      metadata,
    );
    deepFreeze(this); // Events is nested array, needs deepFreeze
  }
}

export class AuditRecord extends TelemetryRecordBase {
  public readonly type = "audit";

  constructor(
    id: string,
    timestamp: string,
    monotonicTimestamp: string,
    source: string,
    moduleId: string,
    correlation: TelemetryCorrelation,
    public readonly actorId: string,
    public readonly action: string,
    public readonly targetId: string,
    public readonly auditStatus: "success" | "denied" | "error",
    public readonly payloadHash: string,
    public readonly chainHash: string,
    severity: TelemetrySeverity,
    version: string,
    metadata: TelemetryMetadata,
  ) {
    super(
      id,
      timestamp,
      monotonicTimestamp,
      source,
      moduleId,
      correlation,
      severity,
      version,
      metadata,
    );
    Object.freeze(this);
  }
}

export class DiagnosticRecord extends TelemetryRecordBase {
  public readonly type = "diagnostic";

  constructor(
    id: string,
    timestamp: string,
    monotonicTimestamp: string,
    source: string,
    moduleId: string,
    correlation: TelemetryCorrelation,
    public readonly snapshotId: string,
    public readonly triggerReason: string,
    public readonly statePayload: Record<string, any>,
    severity: TelemetrySeverity,
    version: string,
    metadata: TelemetryMetadata,
  ) {
    super(
      id,
      timestamp,
      monotonicTimestamp,
      source,
      moduleId,
      correlation,
      severity,
      version,
      metadata,
    );
    deepFreeze(this); // statePayload contains nested objects
  }
}

export class HealthRecord extends TelemetryRecordBase {
  public readonly type = "health";

  constructor(
    id: string,
    timestamp: string,
    monotonicTimestamp: string,
    source: string,
    moduleId: string,
    correlation: TelemetryCorrelation,
    public readonly componentId: string,
    public readonly healthStatus: "healthy" | "degraded" | "critical",
    public readonly failureRationale: string | undefined,
    public readonly detailsPayload: Record<string, any> | undefined,
    severity: TelemetrySeverity,
    version: string,
    metadata: TelemetryMetadata,
  ) {
    super(
      id,
      timestamp,
      monotonicTimestamp,
      source,
      moduleId,
      correlation,
      severity,
      version,
      metadata,
    );
    deepFreeze(this);
  }
}

export class ResourceRecord extends TelemetryRecordBase {
  public readonly type = "resource";

  constructor(
    id: string,
    timestamp: string,
    monotonicTimestamp: string,
    source: string,
    moduleId: string,
    correlation: TelemetryCorrelation,
    public readonly cpuLoadPercentage: number,
    public readonly memoryRssBytes: number,
    public readonly memoryHeapBytes: number,
    public readonly eventLoopLagMs: number,
    public readonly diskFreeBytes: number,
    severity: TelemetrySeverity,
    version: string,
    metadata: TelemetryMetadata,
  ) {
    super(
      id,
      timestamp,
      monotonicTimestamp,
      source,
      moduleId,
      correlation,
      severity,
      version,
      metadata,
    );
    Object.freeze(this);
  }
}
