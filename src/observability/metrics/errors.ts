import { TelemetryError } from "../models/errors";

export class MetricRegistrationError extends TelemetryError {
  constructor(message: string) {
    super(message);
    this.name = "MetricRegistrationError";
  }
}

export class MetricValidationError extends TelemetryError {
  constructor(message: string) {
    super(message);
    this.name = "MetricValidationError";
  }
}

export class MetricNotFoundError extends TelemetryError {
  constructor(message: string) {
    super(message);
    this.name = "MetricNotFoundError";
  }
}

export class MetricTypeError extends TelemetryError {
  constructor(message: string) {
    super(message);
    this.name = "MetricTypeError";
  }
}

export class MetricOverflowError extends TelemetryError {
  constructor(message: string) {
    super(message);
    this.name = "MetricOverflowError";
  }
}
