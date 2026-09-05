/**
 * A persisted blob that is valid JSON but the wrong type must not be hydrated.
 *
 * WHY THIS EXISTS
 * ---------------
 * `chat` and `genesis_memories` are persisted by whole-blob replacement, not by
 * append: `akira.record()` writes `applyDurableRetention([event, ...s.memories])`
 * and `addChatMessage` writes `[...s.chat, msg]`. If the store was hydrated with
 * a non-array, spreading it either throws or -- for a string -- silently spreads
 * its characters, and that junk array is written over the real history.
 *
 * Measured before this guard existed, against a healthy 7-event stream, one
 * note added after hydration:
 *
 *   {"not":"an array"}   write threw TypeError    disk intact (7)
 *   null                 write threw TypeError    disk intact (7)
 *   "hello"              write completed          disk clobbered  7 -> 6
 *   [{"no":"fields"}]    write completed          disk clobbered  7 -> 2
 *
 * The dangerous cases are the ones where the *loader succeeds*, because then
 * `hydrated` becomes true, `__root.tsx` renders `{hydrated ? <Outlet/> : null}`,
 * and the user works normally while their cognitive history is replaced.
 *
 * WHAT IS ASSERTED, AND WHY IT CAN FAIL
 * -------------------------------------
 * `getInitialState` is a `createServerFn`. Called from a test it executes its
 * handler -- so a throw from inside is observable -- but its *return value* is
 * RPC transport and comes back undefined. Every assertion here is therefore
 * about throwing or not throwing, never about the returned state; asserting on
 * the return would silently pass against `undefined` and prove nothing.
 *
 * The negative arms are the control: absent and well-formed values must still
 * load, or this test would also "pass" against a loader that rejected
 * everything.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeAll } from "vitest";
import { initializeDatabase } from "../src/persistence/initializer";
import { getInitialState } from "../src/persistence/store-init";
import { settingsRepository } from "../src/persistence/repositories";
import { runWithStartContext } from "@tanstack/start-storage-context";

/** Mirrors `runInServerRuntime` in akira-store: the handler needs a Start context. */
const loadState = () => runWithStartContext({} as never, () => getInitialState());

const ARRAY_KEYS = ["chat", "streaks", "genesis_memories"] as const;

/** Valid JSON, wrong type. `[]` is deliberately absent -- it is the valid case. */
const WRONG_SHAPES: readonly [string, string][] = [
  ["object", '{"not":"an array"}'],
  ["string", '"hello"'],
  ["null", "null"],
  ["number", "42"],
  ["boolean", "true"],
];

beforeAll(() => {
  initializeDatabase();
});

/** Clears every array key, so one case cannot leak into the next. */
function clearArrayKeys(): void {
  for (const k of ARRAY_KEYS) settingsRepository.delete(k);
}

describe("persisted array blobs are shape-validated before hydration", () => {
  for (const key of ARRAY_KEYS) {
    for (const [label, blob] of WRONG_SHAPES) {
      it(`rejects ${key} holding a ${label}`, async () => {
        clearArrayKeys();
        settingsRepository.set(key, blob);
        await expect(loadState()).rejects.toThrow(/Corrupt persisted state/);
      });
    }

    it(`accepts ${key} holding a well-formed array`, async () => {
      clearArrayKeys();
      settingsRepository.set(key, "[]");
      await expect(loadState()).resolves.not.toThrow();
    });
  }

  it("accepts a first run, where the keys are absent entirely", async () => {
    clearArrayKeys();
    await expect(loadState()).resolves.not.toThrow();
  });

  it("still rejects malformed bytes, which was already the behaviour", async () => {
    clearArrayKeys();
    settingsRepository.set("genesis_memories", "{ not json at all");
    // A SyntaxError from JSON.parse, not the shape guard -- asserted separately
    // so a regression that replaced parsing with the guard would be visible.
    await expect(loadState()).rejects.toThrow(SyntaxError);
  });

  it("leaves the corrupt value on disk rather than repairing it", async () => {
    // The point of refusing to hydrate is that the bytes survive for recovery.
    clearArrayKeys();
    settingsRepository.set("genesis_memories", '"hello"');
    await expect(loadState()).rejects.toThrow(/Corrupt persisted state/);
    expect(settingsRepository.get("genesis_memories")).toBe('"hello"');
  });
});
