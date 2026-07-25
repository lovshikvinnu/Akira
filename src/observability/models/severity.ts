export enum TelemetrySeverity {
  TRACE = "TRACE",
  DEBUG = "DEBUG",
  INFO = "INFO",
  NOTICE = "NOTICE",
  WARN = "WARN",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL",
  FATAL = "FATAL",
}

export function severityToNumber(severity: TelemetrySeverity): number {
  switch (severity) {
    case TelemetrySeverity.TRACE:
      return 0;
    case TelemetrySeverity.DEBUG:
      return 1;
    case TelemetrySeverity.INFO:
      return 2;
    case TelemetrySeverity.NOTICE:
      return 3;
    case TelemetrySeverity.WARN:
      return 4;
    case TelemetrySeverity.ERROR:
      return 5;
    case TelemetrySeverity.CRITICAL:
      return 6;
    case TelemetrySeverity.FATAL:
      return 7;
    default:
      return 2;
  }
}
