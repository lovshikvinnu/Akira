/**
 * A failed durable write, and whether anything holds that fact.
 *
 * `persist()` starts a write-through and does not await it, so the UI never
 * blocks on disk. That is deliberate and is not what these tests change. What
 * they pin is the consequence: the caller has already mutated in-memory state
 * and returned by the time the write fails, so *something* has to hold the
 * failure or it is gone.
 *
 * Before this, that something was a `console.error` and nothing else.
 *
 * HOW THE FAILURE IS INJECTED
 * ---------------------------
 * At the leaf -- the repository call that actually touches SQLite. Everything
 * above it stays real: `persist` -> `runInServerRuntime` -> `settingsService`
 * -> `persistUpdateMemories` -> repository. Mocking any higher would bypass the
 * path under test and the tests would pass against a build where it was broken.
 *
 * `initializeDatabase()` runs first so the success arm genuinely succeeds. It
 * is not decoration: without a schema every write fails with
 * "no such table", and a suite where nothing can succeed cannot tell a
 * regression from its own environment.
 *
 * WHAT IS NOT ASSERTED
 * --------------------
 * That the write is prevented, retried, or that the caller learns about it
 * synchronously. Observed failure is not the same as no failure, and making
 * `persist` await or throw would change the contract the UI depends on. These
 * assert only that a failure becomes findable.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

// Wires the cognitive pipeline, so a note becomes a MemoryEvent and the
// `settings.updateMemories` write-through actually happens. Without it the
// store mutates and no durable memory write is ever attempted, and every
// assertion here would pass or fail for the wrong reason.
await import("../src/genesis/index");

const { akira, settlePendingPersistence } = await import("../src/persistence/akira-store");
const { settingsRepository, noteRepository } = await import("../src/persistence/repositories");
const { healthRegistry } = await import("../src/observability/health/health-registry");
const { setObservabilityRetention, resetObservabilityRetention } =
  await import("../src/observability/store/retention");

const MEMORIES = "akira-store.persist.settings.updateMemories";
const NOTES_ADD = "akira-store.persist.notes.add";

/** The durable record, read back from SQLite rather than from the store. */
function durableMemoryCount(): number {
  const raw = settingsRepository.get("genesis_memories");
  return raw ? (JSON.parse(raw) as unknown[]).length : 0;
}

let consoleError: ReturnType<typeof vi.spyOn>;

// Hydrate once, because a durable memory write is now gated on it.
//
// `saveMemory` skips `settings.updateMemories` until `initializeState` has run:
// the write replaces the whole blob, so performing it against a store that has
// not yet been filled from the database puts a one-element array over the
// user's history. Reproduced at 7 events -> 1.
//
// This file drove `akira.addNote` on a module-fresh store, which no user can
// do -- the UI that calls it does not exist until hydration has resolved. So
// the fixture was modelling a state production cannot reach, and every
// assertion about a memory write here now needs the state production is
// actually in. Nothing else about these cases changes.
akira.initializeState(akira.getState());

beforeEach(() => {
  // Health state is a module singleton and accumulates across a file, so each
  // case starts from a component with no observations rather than inheriting
  // the previous one's verdict.
  healthRegistry.unregister(MEMORIES);
  healthRegistry.unregister(NOTES_ADD);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await settlePendingPersistence();
  vi.restoreAllMocks();
});

describe("a write that succeeds", () => {
  it("reports the operation healthy", async () => {
    akira.addNote({ content: "a note whose write lands" });
    await settlePendingPersistence();

    const health = healthRegistry.get(MEMORIES);
    expect(health, "the operation was never registered").toBeDefined();
    expect(health!.status).toBe("healthy");
    expect(health!.lastError).toBeUndefined();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("actually reaches the database", async () => {
    const before = durableMemoryCount();
    akira.addNote({ content: "another note whose write lands" });
    await settlePendingPersistence();
    expect(durableMemoryCount()).toBeGreaterThan(before);
  });
});

describe("a write that fails becomes observable", () => {
  /** Fails one operation at the repository and leaves every other write real. */
  function breakMemoriesWrite(): () => void {
    const real = settingsRepository.set.bind(settingsRepository);
    const spy = vi
      .spyOn(settingsRepository, "set")
      .mockImplementation((key: string, value: string) => {
        if (key === "genesis_memories") throw new Error("SQLITE_IOERR: disk I/O error");
        return real(key, value);
      });
    return () => spy.mockRestore();
  }

  it("records the failure against the operation, with the error as evidence", async () => {
    const restore = breakMemoriesWrite();
    akira.addNote({ content: "a note whose durable write fails" });
    await settlePendingPersistence();
    restore();

    const health = healthRegistry.get(MEMORIES);
    expect(health, "nothing held the failed write").toBeDefined();
    expect(health!.status, "a failed durable write left the operation healthy").not.toBe("healthy");
    expect(["degraded", "critical"]).toContain(health!.status);
    expect(health!.evidence.lastError).toContain("SQLITE_IOERR");
    expect(health!.evidence.failures).toBeGreaterThan(0);
  });

  it("still reports to the console, which this change does not replace", async () => {
    const restore = breakMemoriesWrite();
    akira.addNote({ content: "console still gets it" });
    await settlePendingPersistence();
    restore();

    expect(consoleError).toHaveBeenCalled();
    const messages = consoleError.mock.calls.map((c) => String(c[0]));
    expect(
      messages.some((m) => m.includes('Persistence write "settings.updateMemories" failed')),
    ).toBe(true);
  });

  it("does not turn a failed write into a thrown one", async () => {
    // The contract the UI depends on. The store action returns normally and
    // `settlePendingPersistence` resolves; the failure is held, not raised.
    const restore = breakMemoriesWrite();
    expect(() => akira.addNote({ content: "must not throw" })).not.toThrow();
    await expect(settlePendingPersistence()).resolves.toBeUndefined();
    restore();
  });

  it("leaves in-memory state ahead of the disk, which is why it must be observable", async () => {
    // Not a defect being asserted as correct -- the reason observability is the
    // repair. The caller cannot be told synchronously without changing the
    // contract, so the gap is real and the fix is that it stops being silent.
    const durableBefore = durableMemoryCount();
    const inMemoryBefore = akira.getState().memories.length;

    const restore = breakMemoriesWrite();
    akira.addNote({ content: "state moves, disk does not" });
    await settlePendingPersistence();
    restore();

    expect(akira.getState().memories.length).toBeGreaterThan(inMemoryBefore);
    expect(durableMemoryCount()).toBe(durableBefore);
    expect(healthRegistry.get(MEMORIES)?.status).not.toBe("healthy");
  });

  it("recovers to healthy when a later write lands", async () => {
    const restore = breakMemoriesWrite();
    akira.addNote({ content: "fails" });
    await settlePendingPersistence();
    restore();
    expect(healthRegistry.get(MEMORIES)?.status).not.toBe("healthy");

    akira.addNote({ content: "succeeds" });
    await settlePendingPersistence();
    expect(healthRegistry.get(MEMORIES)?.status).toBe("healthy");
  });
});

describe("the two kinds of write fail differently, which is why health is per operation", () => {
  /**
   * `settings.updateMemories` replaces the whole blob, so the next successful
   * write carries everything a failed one carried. `notes.add` writes one row,
   * and nothing ever rewrites it. A single health component would average a
   * permanent loss together with a self-healing one.
   */
  it("a blob write self-heals: the lost events return on the next write", async () => {
    akira.addNote({ content: "establish a baseline" });
    await settlePendingPersistence();
    const baseline = durableMemoryCount();

    const real = settingsRepository.set.bind(settingsRepository);
    const spy = vi.spyOn(settingsRepository, "set").mockImplementation((k: string, v: string) => {
      if (k === "genesis_memories") throw new Error("SQLITE_IOERR");
      return real(k, v);
    });
    akira.addNote({ content: "this one's blob write fails" });
    await settlePendingPersistence();
    spy.mockRestore();

    expect(durableMemoryCount(), "the failed write should not have landed").toBe(baseline);

    akira.addNote({ content: "a later write that lands" });
    await settlePendingPersistence();

    // Strictly more than baseline + 1: the later write carried the event the
    // failed one lost as well as its own.
    expect(durableMemoryCount()).toBeGreaterThan(baseline + 1);
  });

  it("a row write does not self-heal, and health is the only trace it leaves", async () => {
    const spy = vi.spyOn(noteRepository, "add").mockImplementation(() => {
      throw new Error("SQLITE_IOERR: disk I/O error");
    });
    const lostId = akira.addNote({ content: "this note's row is never written" });
    await settlePendingPersistence();
    spy.mockRestore();

    expect(noteRepository.getAll().some((n) => n.id === lostId)).toBe(false);

    // The verdict at the moment of failure, captured before the recovery write
    // below. `recordSuccess` moves the status back to healthy, which is correct
    // -- the operation is working again -- so the status is not what carries a
    // past permanent loss. The evidence counters are.
    const atFailure = healthRegistry.get(NOTES_ADD);
    expect(atFailure, "the permanent loss was not recorded anywhere").toBeDefined();
    expect(atFailure!.status).not.toBe("healthy");
    expect(atFailure!.evidence.lastError).toContain("SQLITE_IOERR");

    akira.addNote({ content: "a later note that writes fine" });
    await settlePendingPersistence();

    expect(
      noteRepository.getAll().some((n) => n.id === lostId),
      "a later write recovered a lost row, which would make this whole distinction moot",
    ).toBe(false);
    expect(
      akira.getState().notes.some((n) => n.id === lostId),
      "the note is gone from the database but still shown to the user",
    ).toBe(true);

    // The row is still gone and the operation now reports healthy, which is
    // exactly why the failure had to be recorded when it happened: nothing
    // about the current status would tell you a note was lost.
    const afterRecovery = healthRegistry.get(NOTES_ADD)!;
    expect(afterRecovery.status).toBe("healthy");
    expect(afterRecovery.evidence.failures, "the failure count was reset by a later success").toBe(
      1,
    );
    expect(afterRecovery.evidence.lastError).toContain("SQLITE_IOERR");
    expect(afterRecovery.evidence.lastFailureAt).toBeDefined();
  });

  it("keeps the two operations' verdicts independent", async () => {
    const spy = vi.spyOn(noteRepository, "add").mockImplementation(() => {
      throw new Error("SQLITE_IOERR: rows only");
    });
    akira.addNote({ content: "row write fails, blob write succeeds" });
    await settlePendingPersistence();
    spy.mockRestore();

    expect(healthRegistry.get(NOTES_ADD)?.status).not.toBe("healthy");
    expect(
      healthRegistry.get(MEMORIES)?.status,
      "one operation's failure was attributed to another",
    ).toBe("healthy");
  });
});

describe("when observability itself cannot observe", () => {
  /**
   * `register` returns false at `maxHealthComponents`, and `recordSuccess` /
   * `recordFailure` are silent no-ops for an unregistered component. A full
   * registry would therefore take this feature back to console-only with
   * nothing saying observability had stopped -- the failure this change exists
   * to prevent, one level up.
   *
   * Driven through the real cap rather than by mocking `register`, so what is
   * under test is the registry's actual behaviour at its limit.
   */
  afterEach(() => resetObservabilityRetention());

  it("says so, rather than silently recording nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Fill the registry with components that are not ours, then leave no room.
    setObservabilityRetention({ maxHealthComponents: 1 });
    healthRegistry.unregister(MEMORIES);
    healthRegistry.unregister(NOTES_ADD);
    expect(healthRegistry.register("occupant")).toBe(true);
    expect(healthRegistry.register("one-too-many")).toBe(false);

    akira.addNote({ content: "a write nobody can observe" });
    await settlePendingPersistence();

    expect(healthRegistry.get(MEMORIES), "the component should not exist").toBeUndefined();
    expect(warn, "a write became unobservable and said nothing").toHaveBeenCalled();
    const first = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('"settings.updateMemories" is not observable'));
    expect(first.length).toBe(1);

    // Said once per operation, not once per write. `register` is called on
    // every mutation, so without the bound a full registry would put a console
    // line on every store action -- noisier than the silence it exists to
    // break. Asserted here rather than trusted, and asserted in the same case
    // because the bound is module state that never resets: a separate test
    // would depend on running second, which is the kind of order coupling that
    // passes until someone reorders the file.
    warn.mockClear();
    akira.addNote({ content: "a second unobservable write" });
    await settlePendingPersistence();
    expect(
      warn.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes('"settings.updateMemories" is not observable')).length,
      "the warning repeated per write",
    ).toBe(0);

    healthRegistry.unregister("occupant");
    warn.mockRestore();
  });
});
