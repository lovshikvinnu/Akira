import { AbstractTelemetryService } from "../services/abstract-telemetry-service";
import { telemetryFactory } from "../services/telemetry-factory";
import { TelemetrySeverity } from "../models/severity";
import { TelemetryMetadata, deepFreeze } from "../models/metadata";
import { DiagnosticsValidator } from "../validation/diagnostics-validator";
import { DiagnosticRegistry } from "./diagnostic-registry";
import {
  DiagnosticRegistrationError,
  DiagnosticsValidationError,
} from "../errors/telemetry-errors";
import { getObservabilityRetention } from "../store/retention";

/** One entry in the in-memory diagnostic trail returned by `list()`. */
export interface ReportedDiagnostic {
  readonly code: string;
  readonly severity: TelemetrySeverity;
  readonly component: string;
  readonly message: string;
  readonly suggestedAction?: string;
  readonly metadata: TelemetryMetadata;
}

/**
 * DiagnosticsService – immutable diagnostic reporting.
 * Diagnostics are recorded as DiagnosticRecord via the Telemetry pipeline.
 * The service also tracks reported diagnostics in‑memory for the `list()` API.
 */
export class DiagnosticsService extends AbstractTelemetryService {
  /**
   * Bounded: this is a process-lifetime trail, and a component reporting a
   * recurring fault would otherwise grow it forever. Oldest entries are dropped
   * first, so the most recent diagnostics -- the ones being investigated -- are
   * the ones retained.
   */
  private readonly reported: ReportedDiagnostic[] = [];

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
    const overflow = this.reported.length - getObservabilityRetention().maxDiagnostics;
    if (overflow > 0) this.reported.splice(0, overflow);

    await this.record(record);
  }

  /** The most recent diagnostics reported during this process lifetime, oldest first. */
  list(): ReadonlyArray<ReportedDiagnostic> {
    return this.reported;
  }

  /** Drops the in-memory trail. Registered codes are unaffected. */
  clear(): void {
    this.reported.length = 0;
  }
}
