import { TelemetryContext } from "../contracts/telemetry";
import { TelemetryCorrelation } from "../models/correlation";

let storage: any = null;
let initialized = false;

function getStorage() {
  if (!initialized) {
    initialized = true;
    if (typeof window === "undefined") {
      try {
        // Use eval to prevent bundlers like Vite from statically analyzing and attempting to package Node-only modules
        const hooks = eval("require")("node:async_hooks");
        if (hooks && hooks.AsyncLocalStorage) {
          storage = new hooks.AsyncLocalStorage();
        }
      } catch (err) {
        // Fallback silently if not in a standard CommonJS/Node environment
      }
    }
  }
  return storage;
}

export class AsyncTelemetryContext implements TelemetryContext {
  private fallbackStore: TelemetryCorrelation = { correlationId: "default" };

  public getCorrelation(): TelemetryCorrelation {
    const store = getStorage();
    if (store) {
      const active = store.getStore();
      if (active) {
        return active;
      }
    }
    return this.fallbackStore;
  }

  public runWith<T>(correlation: Partial<TelemetryCorrelation>, fn: () => T): T {
    const parent = this.getCorrelation();
    const merged: TelemetryCorrelation = {
      ...parent,
      ...correlation,
    };

    const store = getStorage();
    if (store) {
      return store.run(merged, fn);
    } else {
      const prev = this.fallbackStore;
      this.fallbackStore = merged;
      try {
        return fn();
      } finally {
        this.fallbackStore = prev;
      }
    }
  }

  public async runWithAsync<T>(
    correlation: Partial<TelemetryCorrelation>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const parent = this.getCorrelation();
    const merged: TelemetryCorrelation = {
      ...parent,
      ...correlation,
    };

    const store = getStorage();
    if (store) {
      return store.run(merged, fn);
    } else {
      const prev = this.fallbackStore;
      this.fallbackStore = merged;
      try {
        return await fn();
      } finally {
        this.fallbackStore = prev;
      }
    }
  }
}

export const telemetryContext = new AsyncTelemetryContext();
