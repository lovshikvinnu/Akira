import { AbstractTelemetryService } from "../services/abstract-telemetry-service";
import { telemetryFactory } from "../telemetry-service";
import { TelemetrySeverity } from "../models/severity";
import { TelemetryMetadata, deepFreeze } from "../models/metadata";
import { DiagnosticsValidator } from "../validation/diagnostics-validator";
import { DiagnosticRegistry } from "./diagnostic-registry";
import {
  DiagnosticRegistrationError,
  DiagnosticsValidationError,
} from "../errors/telemetry-errors";

/**
 * DiagnosticsService – immutable diagnostic reporting.
 * Diagnostics are recorded as DiagnosticRecord via the Telemetry pipeline.
 * The service also tracks reported diagnostics in‑memory for the `list()` API.
 */
export class DiagnosticsService extends AbstractTelemetryService {
  private readonly reported: any[] = [];

  constructor() {
    super(new DiagnosticsValidator());
  }

  /** Register a diagnostic code before it can be reported. */
  registerCode(code: string): void {
    if (DiagnosticRegistry.instance.exists(code)) {
      throw new DiagnosticRegistrationError(`Diagnostic code already registered: ${code}`);
    }
    DiagnosticRegistry.instance.registerCode(code);
  }

  /** Report a diagnostic.
   *  snapshotId  -> diagnostic code
   *  triggerReason -> human readable message
   *  statePayload   -> arbitrary structured payload (including component, suggestedAction)
   */
  async report(
    code: string,
    severity: TelemetrySeverity,
    component: string,
    message: string,
    suggestedAction?: string,
    metadata?: TelemetryMetadata,
  ): Promise<void> {
    if (!DiagnosticRegistry.instance.exists(code)) {
      throw new DiagnosticsValidationError(`Unregistered diagnostic code: ${code}`);
    }
    const payload: Record<string, any> = { component, suggestedAction };
    const frozenMeta = metadata ? deepFreeze(metadata) : Object.freeze({});
    const record = telemetryFactory.createDiagnostic(
      "runtime", // moduleId – generic for visibility core
      "diagnostics-service",
      code, // snapshotId used as code
      message, // triggerReason
      payload,
      severity,
      frozenMeta,
    );
    // Store in‑memory for listing; this does not affect platform execution.
    this.reported.push({
      code,
      severity,
      component,
      message,
      suggestedAction,
      metadata: frozenMeta,
    });
    await this.record(record);
  }

  /** List all diagnostics reported during this process lifetime. */
  list(): ReadonlyArray<any> {
    return this.reported;
  }
}
