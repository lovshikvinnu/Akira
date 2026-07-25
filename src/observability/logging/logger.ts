import { TelemetrySeverity } from "../models/severity";
import { TelemetryMetadata, deepFreeze } from "../models/metadata";
import { TelemetryValidationError } from "../models/errors";
import { TelemetryRecord } from "../contracts/telemetry";
import {
  LoggerConfigurationError,
  LoggerValidationError,
  CategoryRegistrationError,
} from "../errors/telemetry-errors";
import { AbstractTelemetryService } from "./abstract-telemetry-service";
import { LoggerRegistry } from "./logger-registry";
/**
 * Simple validator for log records.
 * Ensures the message is a non‑empty string, severity is a valid enum value,
 * metadata is immutable (deep‑frozen) and that the category (if provided)
 * has been registered in the LoggerRegistry.
 */
export class LoggingValidator implements TelemetryValidator {
  validate(record: TelemetryRecord): void {
    // Record type must be "log"
    if ((record as any).type !== "log") {
      throw new LoggerValidationError("Record is not a LogRecord");
    }
    const log = record as any; // LogRecord fields are known but not exported as type here
    if (typeof log.message !== "string" || log.message.length === 0) {
      throw new LoggerValidationError("Log message must be a non‑empty string");
    }
    // Severity must be a valid TelemetrySeverity value
    if (!Object.values(TelemetrySeverity).includes(log.severity)) {
      throw new LoggerValidationError(`Invalid log severity: ${log.severity}`);
    }
    // Metadata, if present, must be frozen (deepFreeze does this when created)
    if (log.metadata && !Object.isFrozen(log.metadata)) {
      throw new LoggerValidationError("Log metadata must be immutable (frozen)");
    }
    // Category validation – the logger passes category via metadata under key "category"
    if (log.metadata && (log.metadata as any).category) {
      const category = (log.metadata as any).category as string;
      // Use imported LoggerRegistry
      if (!LoggerRegistry.instance.exists(category)) {
        throw new CategoryRegistrationError(`Unregistered log category: ${category}`);
      }
    }
  }
}

/**
 * Structured logger implementation.
 * Each logger instance carries its own immutable metadata, category and module.
 * Child loggers inherit and extend these values.
 */
export class Logger extends AbstractTelemetryService {
  private readonly moduleId: string;
  private readonly source: string;
  private readonly defaultMetadata: TelemetryMetadata;
  private readonly category?: string;

  constructor(
    moduleId: string,
    source: string,
    defaultMetadata: TelemetryMetadata = Object.freeze({}),
    category?: string,
  ) {
    super(new LoggingValidator());
    this.moduleId = moduleId;
    this.source = source;
    this.defaultMetadata = defaultMetadata;
    this.category = category;
  }

  /** Internal helper to build and record a log */
  private async log(
    severity: TelemetrySeverity,
    message: string,
    stackTrace?: string,
    extraMetadata?: TelemetryMetadata,
  ): Promise<void> {
    // Merge metadata (category is stored inside metadata for validator)
    const combinedMeta: TelemetryMetadata = {
      ...this.defaultMetadata,
      ...(extraMetadata ?? {}),
      ...(this.category ? { category: this.category } : {}),
    };
    const frozenMeta = deepFreeze(combinedMeta);
    const record = this.factory.createLog(
      this.moduleId,
      this.source,
      severity,
      message,
      stackTrace,
      frozenMeta,
    );
    await this.record(record);
  }

  // Public severity methods
  trace(message: string, meta?: TelemetryMetadata) {
    return this.log(TelemetrySeverity.TRACE, message, undefined, meta);
  }
  debug(message: string, meta?: TelemetryMetadata) {
    return this.log(TelemetrySeverity.DEBUG, message, undefined, meta);
  }
  info(message: string, meta?: TelemetryMetadata) {
    return this.log(TelemetrySeverity.INFO, message, undefined, meta);
  }
  notice(message: string, meta?: TelemetryMetadata) {
    return this.log(TelemetrySeverity.NOTICE, message, undefined, meta);
  }
  warn(message: string, meta?: TelemetryMetadata) {
    return this.log(TelemetrySeverity.WARN, message, undefined, meta);
  }
  error(message: string, meta?: TelemetryMetadata) {
    return this.log(TelemetrySeverity.ERROR, message, undefined, meta);
  }
  critical(message: string, meta?: TelemetryMetadata) {
    return this.log(TelemetrySeverity.CRITICAL, message, undefined, meta);
  }
  fatal(message: string, meta?: TelemetryMetadata) {
    return this.log(TelemetrySeverity.FATAL, message, undefined, meta);
  }

  /**
   * Returns a child logger that inherits current metadata and can add overrides.
   */
  child(extraMeta: TelemetryMetadata = {}): Logger {
    const mergedMeta = deepFreeze({ ...this.defaultMetadata, ...extraMeta });
    return new Logger(this.moduleId, this.source, mergedMeta, this.category);
  }

  /** Add or replace context metadata (does not affect the original instance). */
  withContext(contextMeta: TelemetryMetadata): Logger {
    const mergedMeta = deepFreeze({ ...this.defaultMetadata, ...contextMeta });
    return new Logger(this.moduleId, this.source, mergedMeta, this.category);
  }

  /** Assign a category to the logger (must be registered beforehand). */
  withCategory(category: string): Logger {
    if (!LoggerRegistry.instance.exists(category)) {
      throw new CategoryRegistrationError(`Category not registered: ${category}`);
    }
    const mergedMeta = deepFreeze({ ...this.defaultMetadata, category });
    return new Logger(this.moduleId, this.source, mergedMeta, category);
  }

  /** Override the module identifier. */
  withModule(moduleId: string): Logger {
    return new Logger(moduleId, this.source, this.defaultMetadata, this.category);
  }

  /** Flush is a no‑op – logging is fire‑and‑forget via the Telemetry pipeline. */
  async flush(): Promise<void> {
    // In a real system this could await pending pipeline promises; here we resolve instantly.
    return;
  }
}
