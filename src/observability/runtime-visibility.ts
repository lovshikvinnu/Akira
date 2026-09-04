import { Logger } from "./logging/logger";
import { LoggerRegistry } from "./logging/logger-registry";
import { TraceService } from "./tracing/trace-service";
import { DiagnosticsService } from "./diagnostics/diagnostics-service";

/**
 * RuntimeVisibility provides a unified facade for the visibility subsystem.
 * It exposes a logger, tracer, and diagnostics service that all use the frozen
 * Telemetry Core. No extra dependencies are introduced.
 */
export class RuntimeVisibility {
  /** Default logger instance (shared). */
  static readonly logger: Logger = LoggerRegistry.instance.getLogger(
    "runtime",
    "runtime",
    "runtime",
    Object.freeze({}),
  );

  /** Tracer service for creating spans. */
  static readonly tracer: TraceService = new TraceService();

  /** Diagnostics service for reporting snapshots. */
  static readonly diagnostics: DiagnosticsService = new DiagnosticsService();
}

// Convenience exports for consumers
export const logger = RuntimeVisibility.logger;
export const tracer = RuntimeVisibility.tracer;
export const diagnostics = RuntimeVisibility.diagnostics;
