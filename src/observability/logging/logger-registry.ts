import { LoggerConfigurationError, CategoryRegistrationError } from "../errors/telemetry-errors";
import { Logger } from "./logger";
import { TelemetryMetadata } from "../models/metadata";

/**
 * Registry for log categories and named loggers.
 * Supports hierarchical categories (e.g. "Runtime.Repository.SQLite").
 */
export class LoggerRegistry {
  private static _instance: LoggerRegistry | null = null;
  static get instance(): LoggerRegistry {
    if (!this._instance) {
      this._instance = new LoggerRegistry();
    }
    return this._instance;
  }

  private readonly categories = new Set<string>();
  private readonly loggers = new Map<string, Logger>();

  /** Register a hierarchical category (dot‑separated). */
  registerCategory(category: string): void {
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(category)) {
      throw new LoggerConfigurationError(`Invalid category name: ${category}`);
    }
    this.categories.add(category);
  }

  unregisterCategory(category: string): void {
    this.categories.delete(category);
  }

  exists(category: string): boolean {
    return this.categories.has(category);
  }

  listCategories(): string[] {
    return Array.from(this.categories).sort();
  }

  /** Create or retrieve a named logger.
   *  If a logger with the same name exists, the existing instance is returned.
   */
  getLogger(
    name: string,
    moduleId: string,
    source: string,
    baseMeta: TelemetryMetadata = Object.freeze({}),
  ): Logger {
    if (this.loggers.has(name)) {
      return this.loggers.get(name)!;
    }
    const logger = new Logger(moduleId, source, baseMeta);
    this.loggers.set(name, logger);
    return logger;
  }

  createLogger(
    name: string,
    moduleId: string,
    source: string,
    baseMeta: TelemetryMetadata = Object.freeze({}),
  ): Logger {
    if (this.loggers.has(name)) {
      throw new LoggerConfigurationError(`Logger with name ${name} already exists`);
    }
    const logger = new Logger(moduleId, source, baseMeta);
    this.loggers.set(name, logger);
    return logger;
  }
}
