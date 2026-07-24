/**
 * DiagnosticsReport – immutable snapshot of runtime diagnostics.
 */
export interface RuntimeReport {
  runtimeVersion: string;
  uptime: number; // milliseconds
  startupDuration: number; // milliseconds
  moduleCount: number;
  runningModules: number;
  failedModules: number;
  capabilities: number;
  permissions: number;
  eventsPerSecond: number;
  memoryUsage: number; // bytes
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
  healthScore: number; // 0‑100
}

/** Simple warning/error interfaces */
export interface DiagnosticWarning {
  code: string;
  message: string;
}

export interface DiagnosticError {
  code: string;
  message: string;
}
