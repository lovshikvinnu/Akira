import { TelemetrySeverity } from "../models/severity";
import { TelemetryMetadata } from "../models/metadata";
import { TelemetryCorrelation } from "../models/correlation";

export interface TelemetryRecord {
  readonly id: string;
  readonly timestamp: string;
  readonly monotonicTimestamp: string;
  readonly source: string;
  readonly moduleId: string;
  readonly correlation: TelemetryCorrelation;
  readonly severity: TelemetrySeverity;
  readonly version: string;
  readonly metadata: TelemetryMetadata;
  readonly type: string;
}

export interface TelemetryClock {
  now(): Date;
  nowIso(): string;
  monotonicNow(): bigint;
  elapsedMs(start: bigint, end: bigint): number;
}

export interface TelemetryIdGenerator {
  generateId(): string;
}

export interface TelemetryContext {
  getCorrelation(): TelemetryCorrelation;
  runWith<T>(correlation: Partial<TelemetryCorrelation>, fn: () => T): T;
  runWithAsync<T>(correlation: Partial<TelemetryCorrelation>, fn: () => Promise<T>): Promise<T>;
}

export interface TelemetryValidator {
  validate(record: TelemetryRecord): void;
}

export interface TelemetrySerializer {
  serialize(record: TelemetryRecord): string;
  deserialize(data: string): TelemetryRecord;
}

export interface TelemetryPipelineStage {
  readonly name: string;
  process(record: TelemetryRecord, next: (record: TelemetryRecord) => Promise<void>): Promise<void>;
}

export interface TelemetrySink {
  readonly name: string;
  write(record: TelemetryRecord): Promise<void>;
}

export interface TelemetryPipeline {
  use(stage: TelemetryPipelineStage): this;
  setSink(sink: TelemetrySink): this;
  execute(record: TelemetryRecord): Promise<void>;
}

export interface TelemetryFactory {
  createMetric(
    moduleId: string,
    source: string,
    metricName: string,
    metricType: "counter" | "gauge" | "histogram",
    value: number,
    severity: TelemetrySeverity,
    metadata?: TelemetryMetadata,
  ): TelemetryRecord;

  createLog(
    moduleId: string,
    source: string,
    severity: TelemetrySeverity,
    message: string,
    stackTrace?: string,
    metadata?: TelemetryMetadata,
  ): TelemetryRecord;

  createTrace(
    moduleId: string,
    source: string,
    spanId: string,
    parentSpanId: string | null,
    spanName: string,
    durationMs: number,
    status: "ok" | "error",
    events: ReadonlyArray<any>,
    severity: TelemetrySeverity,
    metadata?: TelemetryMetadata,
  ): TelemetryRecord;

  createAudit(
    moduleId: string,
    source: string,
    actorId: string,
    action: string,
    targetId: string,
    auditStatus: "success" | "denied" | "error",
    payloadHash: string,
    chainHash: string,
    severity: TelemetrySeverity,
    metadata?: TelemetryMetadata,
  ): TelemetryRecord;

  createDiagnostic(
    moduleId: string,
    source: string,
    snapshotId: string,
    triggerReason: string,
    statePayload: Record<string, any>,
    severity: TelemetrySeverity,
    metadata?: TelemetryMetadata,
  ): TelemetryRecord;

  createHealth(
    moduleId: string,
    source: string,
    componentId: string,
    healthStatus: "healthy" | "degraded" | "critical",
    failureRationale?: string,
    detailsPayload?: Record<string, any>,
    severity?: TelemetrySeverity,
    metadata?: TelemetryMetadata,
  ): TelemetryRecord;

  createResource(
    moduleId: string,
    source: string,
    cpuLoadPercentage: number,
    memoryRssBytes: number,
    memoryHeapBytes: number,
    eventLoopLagMs: number,
    diskFreeBytes: number,
    severity?: TelemetrySeverity,
    metadata?: TelemetryMetadata,
  ): TelemetryRecord;
}

export interface TelemetryProvider {
  getRecord(): TelemetryRecord;
}
