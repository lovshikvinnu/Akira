import { TelemetryValidator, TelemetryRecord } from "../contracts/telemetry";
import { TelemetryValidationError } from "../models/errors";
import { validateMetadata } from "../models/metadata";

export class SimpleTelemetryValidator implements TelemetryValidator {
  private readonly SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

  public validate(record: TelemetryRecord): void {
    if (!record) {
      throw new TelemetryValidationError("Telemetry record is null or undefined");
    }

    // Required fields check
    this.assertString(record.id, "id");
    this.assertString(record.timestamp, "timestamp");
    this.assertString(record.monotonicTimestamp, "monotonicTimestamp");
    this.assertString(record.source, "source");
    this.assertString(record.moduleId, "moduleId");
    this.assertString(record.type, "type");
    this.assertString(record.version, "version");

    if (!record.correlation) {
      throw new TelemetryValidationError("Field 'correlation' is required");
    }
    this.assertString(record.correlation.correlationId, "correlation.correlationId");

    if (!record.severity) {
      throw new TelemetryValidationError("Field 'severity' is required");
    }

    // Timestamp format validation
    const date = new Date(record.timestamp);
    if (isNaN(date.getTime())) {
      throw new TelemetryValidationError(`Invalid ISO-8601 timestamp: ${record.timestamp}`);
    }

    // Version format validation
    if (!this.SEMVER_REGEX.test(record.version)) {
      throw new TelemetryValidationError(
        `Invalid version format (must be semver): ${record.version}`,
      );
    }

    // Metadata validation
    if (record.metadata) {
      try {
        validateMetadata(record.metadata);
      } catch (err: any) {
        throw new TelemetryValidationError(`Invalid metadata structure: ${err.message}`);
      }
    } else {
      throw new TelemetryValidationError("Field 'metadata' is required");
    }

    // Type-specific field validations
    this.validateTypeFields(record);
  }

  private assertString(val: any, fieldName: string): void {
    if (typeof val !== "string" || val.trim() === "") {
      throw new TelemetryValidationError(`Field '${fieldName}' must be a non-empty string`);
    }
  }

  private validateTypeFields(record: any): void {
    switch (record.type) {
      case "metric":
        this.assertString(record.metricName, "metricName");
        if (
          record.metricType !== "counter" &&
          record.metricType !== "gauge" &&
          record.metricType !== "histogram"
        ) {
          throw new TelemetryValidationError(`Invalid metricType: ${record.metricType}`);
        }
        if (typeof record.value !== "number" || isNaN(record.value)) {
          throw new TelemetryValidationError("Metric value must be a valid number");
        }
        break;

      case "log":
        this.assertString(record.message, "message");
        break;

      case "trace":
        this.assertString(record.spanId, "spanId");
        this.assertString(record.spanName, "spanName");
        if (
          typeof record.durationMs !== "number" ||
          isNaN(record.durationMs) ||
          record.durationMs < 0
        ) {
          throw new TelemetryValidationError("Trace durationMs must be a non-negative number");
        }
        if (record.status !== "ok" && record.status !== "error") {
          throw new TelemetryValidationError(`Invalid trace status: ${record.status}`);
        }
        if (!Array.isArray(record.events)) {
          throw new TelemetryValidationError("Trace events must be an array");
        }
        break;

      case "audit":
        this.assertString(record.actorId, "actorId");
        this.assertString(record.action, "action");
        this.assertString(record.targetId, "targetId");
        if (
          record.auditStatus !== "success" &&
          record.auditStatus !== "denied" &&
          record.auditStatus !== "error"
        ) {
          throw new TelemetryValidationError(`Invalid auditStatus: ${record.auditStatus}`);
        }
        this.assertString(record.payloadHash, "payloadHash");
        this.assertString(record.chainHash, "chainHash");
        break;

      case "diagnostic":
        this.assertString(record.snapshotId, "snapshotId");
        this.assertString(record.triggerReason, "triggerReason");
        if (!record.statePayload || typeof record.statePayload !== "object") {
          throw new TelemetryValidationError("Diagnostic statePayload must be a non-null object");
        }
        break;

      case "health":
        this.assertString(record.componentId, "componentId");
        if (
          record.healthStatus !== "healthy" &&
          record.healthStatus !== "degraded" &&
          record.healthStatus !== "critical"
        ) {
          throw new TelemetryValidationError(`Invalid healthStatus: ${record.healthStatus}`);
        }
        break;

      case "resource":
        if (
          typeof record.cpuLoadPercentage !== "number" ||
          record.cpuLoadPercentage < 0 ||
          record.cpuLoadPercentage > 100
        ) {
          throw new TelemetryValidationError(
            "Resource cpuLoadPercentage must be a number between 0 and 100",
          );
        }
        if (typeof record.memoryRssBytes !== "number" || record.memoryRssBytes < 0) {
          throw new TelemetryValidationError(
            "Resource memoryRssBytes must be a non-negative number",
          );
        }
        if (typeof record.memoryHeapBytes !== "number" || record.memoryHeapBytes < 0) {
          throw new TelemetryValidationError(
            "Resource memoryHeapBytes must be a non-negative number",
          );
        }
        if (typeof record.eventLoopLagMs !== "number" || record.eventLoopLagMs < 0) {
          throw new TelemetryValidationError(
            "Resource eventLoopLagMs must be a non-negative number",
          );
        }
        if (typeof record.diskFreeBytes !== "number" || record.diskFreeBytes < 0) {
          throw new TelemetryValidationError(
            "Resource diskFreeBytes must be a non-negative number",
          );
        }
        break;

      default:
        throw new TelemetryValidationError(`Unknown telemetry record type: ${record.type}`);
    }
  }
}

export const simpleTelemetryValidator = new SimpleTelemetryValidator();
