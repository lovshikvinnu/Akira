import { TelemetrySeverity } from "../models/severity";
import { TelemetryRecord } from "../contracts/telemetry";
import { TelemetryValidationError } from "../models/errors";
import { DiagnosticsValidationError } from "../errors/telemetry-errors";
import { DiagnosticRegistry } from "../diagnostics/diagnostic-registry";

/** Validator for DiagnosticRecord */
export class DiagnosticsValidator implements TelemetryValidator {
  validate(record: TelemetryRecord): void {
    if ((record as any).type !== "diagnostic") {
      throw new DiagnosticsValidationError("Record is not a DiagnosticRecord");
    }
    const diag = record as any;
    // Use snapshotId as diagnostic code (per current model) and triggerReason as message
    const code = diag.snapshotId as string;
    if (!code || typeof code !== "string") {
      throw new DiagnosticsValidationError("Diagnostic code (snapshotId) missing");
    }
    if (!DiagnosticRegistry.instance.exists(code)) {
      throw new DiagnosticsValidationError(`Unregistered diagnostic code: ${code}`);
    }
    // Severity must be a valid enum value
    if (!Object.values(TelemetrySeverity).includes(diag.severity)) {
      throw new DiagnosticsValidationError(`Invalid severity: ${diag.severity}`);
    }
    // Message (triggerReason) must be non‑empty
    if (typeof diag.triggerReason !== "string" || diag.triggerReason.length === 0) {
      throw new DiagnosticsValidationError("Diagnostic message (triggerReason) must be non‑empty");
    }
    // Metadata, if present, must be frozen
    if (diag.metadata && !Object.isFrozen(diag.metadata)) {
      throw new DiagnosticsValidationError("Diagnostic metadata must be immutable (frozen)");
    }
  }
}
