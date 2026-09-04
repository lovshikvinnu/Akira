/**
 * AI provider configuration persistence.
 *
 * Saving an OpenRouter model updated the UI and then vanished on refresh. The
 * store, the settings repository and the SQLite table were all verified correct
 * in isolation; the loss happened in AIProviderManager, for two reasons that
 * both hinge on its config load being a single unawaited call made in the
 * constructor:
 *
 *   - saveConfig() returned early whenever `configLoaded` was false, and
 *     `configLoaded` is assigned in exactly one place inside that one load. A
 *     load that failed left every later save a silent no-op for the lifetime of
 *     the page, while the setters still updated memory and emitted, so the UI
 *     showed the new value and the toast claimed success.
 *   - when the load did arrive it merged stored values *over* the in-memory
 *     ones, so anything typed while it was in flight was overwritten by exactly
 *     the stale value the user was trying to replace.
 *
 * These tests drive the real manager with a controllable settings service, so
 * the ordering that produces the bug can be reproduced deliberately rather than
 * waited for.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => {
  const values = new Map<string, string>();
  let gate: (() => void) | null = null;
  return {
    values,
    /** Blocks the next reads until `release()` is called. */
    hold() {
      return new Promise<void>((resolve) => {
        gate = resolve;
      });
    },
    release() {
      gate?.();
      gate = null;
    },
    get isHeld() {
      return gate !== null;
    },
    settingsService: {
      async get(key: string): Promise<string | null> {
        if (gate) {
          await new Promise<void>((resolve) => {
            const prev = gate!;
            gate = () => {
              prev();
              resolve();
            };
          });
        }
        return values.has(key) ? (values.get(key) as string) : null;
      },
      async set(key: string, value: string): Promise<void> {
        values.set(key, value);
      },
    },
  };
});

vi.mock("../src/akira-os/index.ts", () => ({ settingsService: store.settingsService }));

// The manager is browser-only by guard; both loadConfig and saveConfig return
// immediately when `window` is undefined.
(globalThis as unknown as { window: unknown }).window = globalThis;

async function freshManager() {
  vi.resetModules();
  const mod = await import("../src/genesis/context/ai/provider-manager");
  return mod.aiProviderManager;
}

function storedModels(): Record<string, string> {
  const raw = store.values.get("akira:ai:models");
  return raw ? JSON.parse(raw) : {};
}

describe("AI provider config survives a save", () => {
  beforeEach(() => {
    store.values.clear();
    store.release();
  });

  it("persists a model chosen after the config finished loading", async () => {
    const manager = await freshManager();
    await manager.configLoadedPromise;

    await manager.setModel("OpenRouter", "deepseek/deepseek-r1:free");

    expect(storedModels().OpenRouter).toBe("deepseek/deepseek-r1:free");
  });

  it("returns a promise that resolves only once the write has happened", async () => {
    const manager = await freshManager();
    await manager.configLoadedPromise;

    const result = manager.setModel("OpenRouter", "meta/llama-3:free");
    expect(result).toBeInstanceOf(Promise);

    await result;
    // Awaiting the setter must be sufficient; no extra ticks.
    expect(storedModels().OpenRouter).toBe("meta/llama-3:free");
  });

  it("does not silently discard a save issued while the config is still loading", async () => {
    store.values.set("akira:ai:models", JSON.stringify({ OpenRouter: "old/model" }));

    const held = store.hold();
    const manager = await freshManager();

    // The user saves before the initial load has come back.
    const saving = manager.setModel("OpenRouter", "new/model");

    store.release();
    await held.catch(() => undefined);
    await manager.configLoadedPromise;
    await saving;

    expect(storedModels().OpenRouter).toBe("new/model");
  });

  it("does not let a late config load overwrite what the user just entered", async () => {
    store.values.set("akira:ai:models", JSON.stringify({ OpenRouter: "old/model" }));
    store.values.set("akira:ai:keys", JSON.stringify({ OpenRouter: "old-key" }));

    const held = store.hold();
    const manager = await freshManager();

    manager.setModel("OpenRouter", "new/model");
    manager.setApiKey("OpenRouter", "new-key");

    store.release();
    await held.catch(() => undefined);
    await manager.configLoadedPromise;

    expect(manager.getModel("OpenRouter")).toBe("new/model");
    expect(manager.getApiKey("OpenRouter")).toBe("new-key");
  });

  it("still hydrates stored values the user has not touched", async () => {
    store.values.set("akira:ai:models", JSON.stringify({ OpenRouter: "stored/model" }));
    store.values.set("akira:ai:keys", JSON.stringify({ OpenRouter: "stored-key" }));
    store.values.set("akira:ai:active_provider", "OpenRouter");

    const manager = await freshManager();
    await manager.configLoadedPromise;

    expect(manager.getModel("OpenRouter")).toBe("stored/model");
    expect(manager.getApiKey("OpenRouter")).toBe("stored-key");
    expect(manager.getActiveProviderName()).toBe("OpenRouter");
    expect(manager.getStatus("OpenRouter")).not.toBe("Missing API Key");
  });

  it("round-trips a saved model into the next page load", async () => {
    const first = await freshManager();
    await first.configLoadedPromise;
    await first.setApiKey("OpenRouter", "sk-or-key");
    await first.setModel("OpenRouter", "deepseek/deepseek-r1:free");

    // A refresh: a brand new singleton reading the same store.
    const second = await freshManager();
    await second.configLoadedPromise;

    expect(second.getModel("OpenRouter")).toBe("deepseek/deepseek-r1:free");
    expect(second.getApiKey("OpenRouter")).toBe("sk-or-key");
    expect(second.getStatus("OpenRouter")).toBe("Connected");
  });
});
