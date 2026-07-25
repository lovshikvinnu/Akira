import { TelemetryFactory, TelemetryRecord } from "../contracts/telemetry";
import { TelemetrySeverity } from "../models/severity";
import { TelemetryMetadata, deepFreeze } from "../models/metadata";
import { TelemetryCorrelation } from "../models/correlation";
import { telemetryClock } from "../utils/clock";
import { telemetryIdGenerator } from "../utils/id-generator";
import { telemetryContext } from "./context";
import {
  MetricRecord,
  LogRecord,
  TraceRecord,
  AuditRecord,
  DiagnosticRecord,
  HealthRecord,
  ResourceRecord,
} from "../models/record";

export class DefaultTelemetryFactory implements TelemetryFactory {
  private readonly version = "1.0.0";

  private getBaseFields(
    moduleId: string,
    source: string,
    severity: TelemetrySeverity,
    metadata?: TelemetryMetadata,
  ) {
    const id = telemetryIdGenerator.generateId();
    const timestamp = telemetryClock.nowIso();
    const monotonicTimestamp = telemetryClock.monotonicNow().toString();
    const correlation = telemetryContext.getCorrelation();
    const finalMetadata = metadata ? deepFreeze({ ...metadata }) : Object.freeze({});

    return {
      id,
      timestamp,
      monotonicTimestamp,
      correlation,
      version: this.version,
      finalMetadata,
    };
  }

  public createMetric(
    moduleId: string,
    source: string,
    metricName: string,
    metricType: "counter" | "gauge" | "histogram",
    value: number,
    severity: TelemetrySeverity,
    metadata?: TelemetryMetadata,
  ): TelemetryRecord {
    const base = this.getBaseFields(moduleId, source, severity, metadata);
    return new MetricRecord(
      base.id,
      base.timestamp,
      base.monotonicTimestamp,
      source,
      moduleId,
      base.correlation,
      metricName,
      metricType,
      value,
      severity,
      base.version,
      base.finalMetadata,
    );
  }

  public createLog(
    moduleId: string,
    source: string,
    severity: TelemetrySeverity,
    message: string,
    stackTrace?: string,
    metadata?: TelemetryMetadata,
  ): TelemetryRecord {
    const base = this.getBaseFields(moduleId, source, severity, metadata);
    return new LogRecord(
      base.id,
      base.timestamp,
      base.monotonicTimestamp,
      source,
      moduleId,
      base.correlation,
      message,
      stackTrace,
      severity,
      base.version,
      base.finalMetadata,
    );
  }

  public createTrace(
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
  ): TelemetryRecord {
    const base = this.getBaseFields(moduleId, source, severity, metadata);
    return new TraceRecord(
      base.id,
      base.timestamp,
      base.monotonicTimestamp,
      source,
      moduleId,
      base.correlation,
      spanId,
      parentSpanId,
      spanName,
      durationMs,
      status,
      events,
      severity,
      base.version,
      base.finalMetadata,
    );
  }

  public createAudit(
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
  ): TelemetryRecord {
    const base = this.getBaseFields(moduleId, source, severity, metadata);
    return new AuditRecord(
      base.id,
      base.timestamp,
      base.monotonicTimestamp,
      source,
      moduleId,
      base.correlation,
      actorId,
      action,
      targetId,
      auditStatus,
      payloadHash,
      chainHash,
      severity,
      base.version,
      base.finalMetadata,
    );
  }

  public createDiagnostic(
    moduleId: string,
    source: string,
    snapshotId: string,
    triggerReason: string,
    statePayload: Record<string, any>,
    severity: TelemetrySeverity,
    metadata?: TelemetryMetadata,
  ): TelemetryRecord {
    const base = this.getBaseFields(moduleId, source, severity, metadata);
    return new DiagnosticRecord(
      base.id,
      base.timestamp,
      base.monotonicTimestamp,
      source,
      moduleId,
      base.correlation,
      snapshotId,
      triggerReason,
      statePayload,
      severity,
      base.version,
      base.finalMetadata,
    );
  }

  public createHealth(
    moduleId: string,
    source: string,
    componentId: string,
    healthStatus: "healthy" | "degraded" | "critical",
    failureRationale?: string,
    detailsPayload?: Record<string, any>,
    severity: TelemetrySeverity = TelemetrySeverity.INFO,
    metadata?: TelemetryMetadata,
  ): TelemetryRecord {
    const base = this.getBaseFields(moduleId, source, severity, metadata);
    return new HealthRecord(
      base.id,
      base.timestamp,
      base.monotonicTimestamp,
      source,
      moduleId,
      base.correlation,
      componentId,
      healthStatus,
      failureRationale,
      detailsPayload,
      severity,
      base.version,
      base.finalMetadata,
    );
  }

  public createResource(
    moduleId: string,
    source: string,
    cpuLoadPercentage: number,
    memoryRssBytes: number,
    memoryHeapBytes: number,
    eventLoopLagMs: number,
    diskFreeBytes: number,
    severity: TelemetrySeverity = TelemetrySeverity.INFO,
    metadata?: TelemetryMetadata,
  ): TelemetryRecord {
    const base = this.getBaseFields(moduleId, source, severity, metadata);
    return new ResourceRecord(
      base.id,
      base.timestamp,
      base.monotonicTimestamp,
      source,
      moduleId,
      base.correlation,
      cpuLoadPercentage,
      memoryRssBytes,
      memoryHeapBytes,
      eventLoopLagMs,
      diskFreeBytes,
      severity,
      base.version,
      base.finalMetadata,
    );
  }
}

export const telemetryFactory = new DefaultTelemetryFactory();
