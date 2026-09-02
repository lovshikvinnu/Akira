import { RuntimeAdapter } from "../../compatibility/interfaces/runtime-adapter";
import { RuntimeReport } from "./diagnostics-report";
import { DiagnosticWarning, DiagnosticError } from "./diagnostics-report";

/**
 * DiagnosticsContext holds runtime metadata and latest collected metrics.
 * It is read‑only for consumers; the DiagnosticsManager updates it internally.
 */
export class DiagnosticsContext {
  // Runtime metadata
  runtimeVersion: string;
  startTimestamp: number = Date.now();

  constructor(public readonly runtimeAdapter: RuntimeAdapter) {
    // Assigned in the constructor body: class field initializers run before parameter
    // properties are assigned under ES2022 class-fields semantics.
    this.runtimeVersion = runtimeAdapter.runtimeVersion;
  }

  // Snapshots of collected metrics (filled by DiagnosticsManager)
  runtimeReport: RuntimeReport | null = null;

  // Accumulated warnings and errors (immutable after report generation)
  warnings: DiagnosticWarning[] = [];
  errors: DiagnosticError[] = [];
}
