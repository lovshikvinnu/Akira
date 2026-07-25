import { TelemetryValidationError } from "../models/errors";
import { TelemetryRecord } from "../contracts/telemetry";
import { TraceStateError, TraceValidationError } from "../errors/telemetry-errors";
import { TelemetrySeverity } from "../models/severity";

/** Validator for tracing records and span state transitions */
export class TracingValidator implements TelemetryValidator {
  /** Validate a TraceRecord before it is sent to the pipeline */
  validate(record: TelemetryRecord): void {
    if ((record as any).type !== "trace") {
      throw new TraceValidationError("Record is not a TraceRecord");
    }
    const trace = record as any;
    if (typeof trace.spanId !== "string" || trace.spanId.length === 0) {
      throw new TraceValidationError("Missing spanId");
    }
    if (typeof trace.durationMs !== "number" || trace.durationMs < 0) {
      throw new TraceValidationError("Invalid duration");
    }
    if (!["ok", "error"].includes(trace.status)) {
      throw new TraceValidationError(`Invalid status: ${trace.status}`);
    }
    // severity must be a valid enum value
    if (!Object.values(TelemetrySeverity).includes(trace.severity)) {
      throw new TraceValidationError(`Invalid severity: ${trace.severity}`);
    }
  }

  /** Validate span state transitions */
  validateState(spanId: string, currentState: string, newState: string): void {
    const allowed = {
      created: ["running", "cancelled"],
      running: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    } as Record<string, string[]>;
    if (!allowed[currentState]?.includes(newState)) {
      throw new TraceStateError(
        `Illegal transition from ${currentState} to ${newState} for span ${spanId}`,
      );
    }
  }
}
