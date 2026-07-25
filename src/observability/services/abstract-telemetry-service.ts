import { telemetryService, telemetryFactory } from "../telemetry-service";
import { telemetryContext } from "./context";
import { TelemetryRecord, TelemetryValidator } from "../contracts/telemetry";
import { TelemetryCorrelation } from "../models/correlation";

/**
 * Base class for Runtime Visibility services (logger, tracer, diagnostics).
 * Provides shared helpers for accessing the Telemetry core components,
 * retrieving the current correlation context, validating records, and
 * safely recording them without propagating errors to the platform.
 */
export abstract class AbstractTelemetryService {
  protected readonly service = telemetryService;
  protected readonly factory = telemetryFactory;
  protected readonly context = telemetryContext;

  /**
   * Concrete services must supply a validator that matches the record type
   * they produce. The validator is injected to keep the base class agnostic.
   */
  protected constructor(protected readonly validator: TelemetryValidator) {}

  /** Retrieve the current correlation (including trace/span IDs). */
  protected getCorrelation(): TelemetryCorrelation {
    return this.context.getCorrelation();
  }

  /** Validate a TelemetryRecord using the injected validator. */
  protected validate(record: TelemetryRecord): void {
    this.validator.validate(record);
  }

  /** Record a TelemetryRecord via the TelemetryService.
   *  Errors are caught to guarantee the Runtime Visibility layer never
   *  crashes the platform; failures are silently ignored per architecture.
   */
  protected async record(record: TelemetryRecord): Promise<void> {
    try {
      this.validate(record);
      await this.service.record(record);
    } catch (_) {
      // Swallow telemetry failures – visibility must not impact execution.
    }
  }
}
