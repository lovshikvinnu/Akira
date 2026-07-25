import {
  DiagnosticRegistrationError,
  DiagnosticsValidationError,
} from "../errors/telemetry-errors";
import { LoggerConfigurationError } from "../errors/telemetry-errors"; // reuse for duplicate registration

/** Registry for diagnostic codes. */
export class DiagnosticRegistry {
  private static _instance: DiagnosticRegistry | null = null;
  static get instance(): DiagnosticRegistry {
    if (!this._instance) {
      this._instance = new DiagnosticRegistry();
    }
    return this._instance;
  }

  private readonly codes = new Set<string>();

  registerCode(code: string): void {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(code)) {
      throw new LoggerConfigurationError(`Invalid diagnostic code: ${code}`);
    }
    this.codes.add(code);
  }

  unregisterCode(code: string): void {
    this.codes.delete(code);
  }

  exists(code: string): boolean {
    return this.codes.has(code);
  }

  listCodes(): string[] {
    return Array.from(this.codes).sort();
  }
}
