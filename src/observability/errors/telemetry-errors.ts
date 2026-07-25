import { TelemetryError, TelemetryValidationError } from "../models/errors";

/** Logger specific errors */
export class LoggerConfigurationError extends TelemetryError {
  constructor(message: string) {
    super(message);
    this.name = "LoggerConfigurationError";
  }
}

export class LoggerValidationError extends TelemetryValidationError {
  constructor(message: string) {
    super(message);
    this.name = "LoggerValidationError";
  }
}

export class CategoryRegistrationError extends TelemetryError {
  constructor(message: string) {
    super(message);
    this.name = "CategoryRegistrationError";
  }
}

/** Tracing specific errors */
export class TraceStateError extends TelemetryError {
  constructor(message: string) {
    super(message);
    this.name = "TraceStateError";
  }
}

export class TraceValidationError extends TelemetryValidationError {
  constructor(message: string) {
    super(message);
    this.name = "TraceValidationError";
  }
}

/** Diagnostics specific errors */
export class DiagnosticsValidationError extends TelemetryValidationError {
  constructor(message: string) {
    super(message);
    this.name = "DiagnosticsValidationError";
  }
}

export class DiagnosticRegistrationError extends TelemetryError {
  constructor(message: string) {
    super(message);
    this.name = "DiagnosticRegistrationError";
  }
}
