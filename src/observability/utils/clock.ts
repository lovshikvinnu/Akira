import { TelemetryClock } from "../contracts/telemetry";

export class SystemTelemetryClock implements TelemetryClock {
  public now(): Date {
    return new Date();
  }

  public nowIso(): string {
    return this.now().toISOString();
  }

  public monotonicNow(): bigint {
    if (
      typeof process !== "undefined" &&
      process.hrtime &&
      typeof process.hrtime.bigint === "function"
    ) {
      return process.hrtime.bigint();
    }
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      // performance.now() is in milliseconds with microsecond precision.
      // Convert to nanoseconds.
      return BigInt(Math.floor(performance.now() * 1_000_000));
    }
    return BigInt(Date.now() * 1_000_000);
  }

  public elapsedMs(start: bigint, end: bigint): number {
    const diffNano = end - start;
    // division of bigint, cast to number for millisecond representation
    return Number(diffNano) / 1_000_000;
  }
}

export const telemetryClock = new SystemTelemetryClock();
