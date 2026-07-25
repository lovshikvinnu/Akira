export class TelemetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelemetryError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TelemetryValidationError extends TelemetryError {
  constructor(message: string) {
    super(message);
    this.name = "TelemetryValidationError";
  }
}

export class TelemetrySerializationError extends TelemetryError {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "TelemetrySerializationError";
  }
}

export class PipelineError extends TelemetryError {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

export class ContextError extends TelemetryError {
  constructor(message: string) {
    super(message);
    this.name = "ContextError";
  }
}
