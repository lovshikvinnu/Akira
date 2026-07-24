import { RuntimeAdapter } from "../interfaces/runtime-adapter";
import { RuntimeReport } from "./diagnostics-report";
import { DiagnosticWarning, DiagnosticError } from "./diagnostics-report";

/**
 * DiagnosticsContext holds runtime metadata and latest collected metrics.
 * It is read‑only for consumers; the DiagnosticsManager updates it internally.
 */
export class DiagnosticsContext {
  constructor(public readonly runtimeAdapter: RuntimeAdapter) {}

  // Runtime metadata
  runtimeVersion: string = this.runtimeAdapter.runtimeVersion;
  startTimestamp: number = Date.now();

  // Snapshots of collected metrics (filled by DiagnosticsManager)
  runtimeReport: RuntimeReport | null = null;

  // Accumulated warnings and errors (immutable after report generation)
  warnings: DiagnosticWarning[] = [];
  errors: DiagnosticError[] = [];
}
