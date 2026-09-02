import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  getDatabasePath,
  getDatabaseConnection,
  closeDatabaseConnection,
  TEST_DATABASE_PATH,
} from "../src/persistence/connection";
import { initializeDatabase } from "../src/persistence/initializer";

/**
 * Regression protection for the test/production database boundary.
 *
 * Defect this guards against (Stage 1C): `getDatabasePath()` fell back to the
 * user's persistent database (%APPDATA%/AKIRA/akira.db) whenever
 * AKIRA_DATABASE_PATH was unset. Test files tried to protect themselves by
 * assigning that variable at the top of the module, but ESM evaluates every
 * `import` declaration before any statement in the module body — and several
 * imported modules open the database at module scope. A test therefore wrote
 * the event `evt-async-1` / `source: "tasks-test"` into the real database.
 */

/** Snapshot of an environment variable so it can be restored exactly. */
type EnvSnapshot = Record<string, string | undefined>;

const KEYS = ["AKIRA_DATABASE_PATH", "APPDATA", "NODE_ENV", "VITEST"] as const;

function snapshotEnv(): EnvSnapshot {
  const snap: EnvSnapshot = {};
  for (const k of KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const k of KEYS) {
    const v = snap[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("Database path safety boundary", () => {
  let env: EnvSnapshot;
  let tempRoot: string;

  beforeEach(() => {
    env = snapshotEnv();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "akira-dbsafety-"));
  });

  afterEach(() => {
    // Never leave a cached connection behind for the next test file.
    closeDatabaseConnection();
    restoreEnv(env);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe("Test isolation", () => {
    it("resolves to the isolated test database when no override is set", () => {
      delete process.env.AKIRA_DATABASE_PATH;

      expect(getDatabasePath()).toBe(TEST_DATABASE_PATH);
      expect(TEST_DATABASE_PATH).toBe(":memory:");
    });

    it("never resolves to a persistent user database path under the test runner", () => {
      delete process.env.AKIRA_DATABASE_PATH;
      // Point the production location at an isolated fixture directory so the
      // real user database is never involved in this assertion.
      process.env.APPDATA = tempRoot;

      const resolved = getDatabasePath();
      const productionDir = path.join(tempRoot, "AKIRA");

      expect(resolved).not.toContain("akira.db");
      expect(resolved.startsWith(productionDir)).toBe(false);
      expect(path.isAbsolute(resolved)).toBe(false);
    });

    it("resolves to a non-filesystem target, so parallel workers cannot contend for one file", () => {
      delete process.env.AKIRA_DATABASE_PATH;

      const resolved = getDatabasePath();

      // ":memory:" is private per connection: two workers resolving the same
      // value still get two independent databases, and nothing is written to disk.
      expect(resolved).toBe(":memory:");
      expect(fs.existsSync(resolved)).toBe(false);
      expect(path.isAbsolute(resolved)).toBe(false);
    });

    it("does not create the production application-data directory", () => {
      delete process.env.AKIRA_DATABASE_PATH;
      process.env.APPDATA = tempRoot;
      const productionDir = path.join(tempRoot, "AKIRA");
      expect(fs.existsSync(productionDir)).toBe(false);

      getDatabasePath();

      expect(fs.existsSync(productionDir)).toBe(false);
    });

    it("still isolates when only NODE_ENV signals a test environment", () => {
      delete process.env.AKIRA_DATABASE_PATH;
      delete process.env.VITEST;
      process.env.NODE_ENV = "test";
      process.env.APPDATA = tempRoot;

      expect(getDatabasePath()).toBe(TEST_DATABASE_PATH);
    });

    it("still isolates when only VITEST signals a test environment", () => {
      delete process.env.AKIRA_DATABASE_PATH;
      delete process.env.NODE_ENV;
      process.env.VITEST = "true";
      process.env.APPDATA = tempRoot;

      expect(getDatabasePath()).toBe(TEST_DATABASE_PATH);
    });
  });

  describe("Explicit override behaviour", () => {
    it("honours an explicit AKIRA_DATABASE_PATH, which takes precedence over test isolation", () => {
      const explicit = path.join(tempRoot, "explicit-choice.db");
      process.env.AKIRA_DATABASE_PATH = explicit;

      // Documented and intentional: a test or tool that needs a real file on
      // disk opts in by naming it. Isolation only governs the *fallback*.
      expect(getDatabasePath()).toBe(explicit);
    });

    it("honours an explicit in-memory override", () => {
      process.env.AKIRA_DATABASE_PATH = ":memory:";

      expect(getDatabasePath()).toBe(":memory:");
    });
  });

  describe("Production preservation", () => {
    it("leaves an existing production-location database byte-identical while the DB stack runs", () => {
      // Build an isolated stand-in for the user's persistent database.
      const productionDir = path.join(tempRoot, "AKIRA");
      fs.mkdirSync(productionDir, { recursive: true });
      const productionDb = path.join(productionDir, "akira.db");
      const sentinel = "AKIRA-PRODUCTION-FIXTURE-DO-NOT-TOUCH";
      fs.writeFileSync(productionDb, sentinel, "utf8");

      const before = {
        content: fs.readFileSync(productionDb, "utf8"),
        size: fs.statSync(productionDb).size,
        entries: fs.readdirSync(productionDir).sort(),
      };

      process.env.APPDATA = tempRoot;
      delete process.env.AKIRA_DATABASE_PATH;

      // Exercise the real database stack the way the application does.
      expect(getDatabasePath()).toBe(TEST_DATABASE_PATH);
      const db = getDatabaseConnection();
      initializeDatabase();

      // The isolated database is genuinely usable — schema really was created.
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
        .all();
      expect(tables).toHaveLength(1);

      const after = {
        content: fs.readFileSync(productionDb, "utf8"),
        size: fs.statSync(productionDb).size,
        entries: fs.readdirSync(productionDir).sort(),
      };

      expect(after.content).toBe(before.content);
      expect(after.content).toBe(sentinel);
      expect(after.size).toBe(before.size);
      // No WAL/SHM sidecars, no new files: nothing opened the fixture at all.
      expect(after.entries).toEqual(before.entries);
      expect(after.entries).toEqual(["akira.db"]);
    });

    it("writes nothing to the production location even after repository writes", async () => {
      const productionDir = path.join(tempRoot, "AKIRA");
      fs.mkdirSync(productionDir, { recursive: true });
      const productionDb = path.join(productionDir, "akira.db");
      fs.writeFileSync(productionDb, "SENTINEL", "utf8");

      process.env.APPDATA = tempRoot;
      delete process.env.AKIRA_DATABASE_PATH;

      getDatabaseConnection();
      initializeDatabase();

      const { projectRepository } = await import("../src/persistence/repositories");
      const id = projectRepository.add({ name: "Isolation Probe", tag: "Test" });
      expect(id).toBeTruthy();

      // The write landed in the isolated database…
      expect(projectRepository.getAll().some((p) => p.id === id)).toBe(true);

      // …and not in the production fixture.
      expect(fs.readFileSync(productionDb, "utf8")).toBe("SENTINEL");
      expect(fs.readdirSync(productionDir).sort()).toEqual(["akira.db"]);
    });
  });
});
