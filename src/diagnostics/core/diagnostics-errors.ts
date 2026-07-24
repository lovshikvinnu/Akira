export class DiagnosticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiagnosticsError";
  }
}

export class MetricCollectionError extends DiagnosticsError {
  constructor(message: string) {
    super(message);
    this.name = "MetricCollectionError";
  }
}

export class ExporterError extends DiagnosticsError {
  constructor(message: string) {
    super(message);
    this.name = "ExporterError";
  }
}

export class HealthCalculationError extends DiagnosticsError {
  constructor(message: string) {
    super(message);
    this.name = "HealthCalculationError";
  }
}
