// Set isolated test database environment variables before loading database connectors
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { test, expect, beforeEach } from "vitest";
import { initializeDatabase } from "../initializer";
import { getDatabaseConnection } from "../connection";
import { SqliteTimelineRepository } from "./SqliteTimelineRepository";
import { TimelineEvent } from "../../akira-os/timeline/types";

initializeDatabase();
const repo = new SqliteTimelineRepository();

const TIED = "2026-09-03T10:00:00.000Z";

function evt(id: string, over: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id,
    eventType: "task.created",
    projectId: null,
    payload: { id },
    payloadVersion: 1,
    timestamp: TIED,
    ...over,
  };
}

function persistedIds(): string[] {
  return (
    getDatabaseConnection().prepare(`SELECT id FROM timeline_events ORDER BY seq ASC`).all() as {
      id: string;
    }[]
  ).map((r) => r.id);
}

/**
 * Simulates the database being unavailable for writes the way a lock or a
 * read-only filesystem does, so the test drives insert()'s real failure path
 * rather than pushing onto the queue by hand.
 */
function withDatabaseUnavailable(fn: () => void) {
  const proto = SqliteTimelineRepository.prototype as any;
  const original = proto.getDb;
  proto.getDb = () => {
    const err: any = new Error("database is locked");
    err.code = "SQLITE_BUSY";
    throw err;
  };
  try {
    fn();
  } finally {
    proto.getDb = original;
  }
}

beforeEach(() => {
  repo.clearAll();
  getDatabaseConnection().prepare(`DELETE FROM timeline_events`).run();
});

test("Fallback durability - queued events persist once the database returns", () => {
  withDatabaseUnavailable(() => repo.insert(evt("outage-1")));

  expect(repo.pendingCount()).toBe(1);
  expect(persistedIds()).toEqual([]);

  // Recovery is driven by ordinary repository activity, not a timer.
  repo.insert(evt("after-1"));

  expect(repo.pendingCount()).toBe(0);
  expect(persistedIds()).toEqual(["outage-1", "after-1"]);
});

test("Fallback durability - flush() recovers without any further writes", () => {
  withDatabaseUnavailable(() => {
    repo.insert(evt("outage-1"));
    repo.insert(evt("outage-2"));
  });
  expect(repo.pendingCount()).toBe(2);

  repo.flush();

  expect(repo.pendingCount()).toBe(0);
  expect(persistedIds()).toEqual(["outage-1", "outage-2"]);
});

test("Fallback durability - recovered events are persisted exactly once", () => {
  withDatabaseUnavailable(() => repo.insert(evt("once-1")));

  repo.flush();
  repo.flush();
  repo.insert(evt("after-1"));
  repo.flush();

  const rows = getDatabaseConnection()
    .prepare(`SELECT COUNT(*) AS n FROM timeline_events WHERE id = 'once-1'`)
    .get() as { n: number };
  expect(rows.n).toBe(1);
  expect(repo.findPaged({ limit: 50 }).items.filter((e) => e.id === "once-1")).toHaveLength(1);
});

test("Fallback durability - queued events stay visible before recovery", () => {
  repo.insert(evt("persisted-1"));
  withDatabaseUnavailable(() => {
    repo.insert(evt("queued-1"));

    // Visible through the normal read path while the database is still down.
    const items = repo.findPaged({ limit: 50 }).items;
    expect(items.map((e) => e.id)).toEqual(["queued-1"]);
  });

  // Still visible once the database is back but before anything drains it.
  const both = repo.findPaged({ limit: 50 }).items.map((e) => e.id);
  expect(both).toContain("queued-1");
  expect(both).toContain("persisted-1");
});

test("Fallback durability - recovery preserves same-millisecond ordering", () => {
  repo.insert(evt("a-persisted"));
  withDatabaseUnavailable(() => {
    repo.insert(evt("b-queued"));
    repo.insert(evt("c-queued"));
  });
  repo.insert(evt("d-after"));

  // Every event shares one timestamp, so only seq distinguishes them.
  expect(persistedIds()).toEqual(["a-persisted", "b-queued", "c-queued", "d-after"]);

  const newestFirst = repo.findPaged({ limit: 50 }).items.map((e) => e.id);
  expect(newestFirst).toEqual(["d-after", "c-queued", "b-queued", "a-persisted"]);

  const seqs = (
    getDatabaseConnection().prepare(`SELECT seq FROM timeline_events ORDER BY seq ASC`).all() as {
      seq: number;
    }[]
  ).map((r) => r.seq);
  expect(new Set(seqs).size).toBe(4);
  for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
});

test("Fallback durability - a partial drain keeps the remainder queued and ordered", () => {
  withDatabaseUnavailable(() => {
    repo.insert(evt("p-1"));
    repo.insert(evt("p-2"));
    repo.insert(evt("p-3"));
  });
  expect(repo.pendingCount()).toBe(3);

  // Let exactly one event through, then fail the next write.
  const proto = SqliteTimelineRepository.prototype as any;
  const realGetDb = proto.getDb;
  let writes = 0;
  proto.getDb = function (this: any) {
    const db = realGetDb.call(this);
    return new Proxy(db, {
      get(target, prop, recv) {
        if (prop === "prepare") {
          return (sql: string) => {
            if (/^\s*INSERT/i.test(sql) && writes++ >= 1) {
              const err: any = new Error("database is locked");
              err.code = "SQLITE_BUSY";
              throw err;
            }
            return target.prepare(sql);
          };
        }
        return Reflect.get(target, prop, recv);
      },
    });
  };
  try {
    repo.flush();
  } finally {
    proto.getDb = realGetDb;
  }

  expect(persistedIds()).toEqual(["p-1"]);
  expect(repo.pendingCount()).toBe(2);

  repo.flush();
  expect(repo.pendingCount()).toBe(0);
  expect(persistedIds()).toEqual(["p-1", "p-2", "p-3"]);
});

test("Fallback durability - a permanently unwritable event never loops", () => {
  // A foreign key violation can never succeed on retry, so it must not be
  // parked in the queue where it would be attempted forever.
  repo.insert(evt("fk-1", { projectId: "no-such-project" }));

  expect(repo.pendingCount()).toBe(0);
  expect(persistedIds()).toEqual([]);

  // The repository stays usable afterwards.
  repo.insert(evt("after-1"));
  expect(persistedIds()).toEqual(["after-1"]);
});

test("Fallback durability - writes keep working while the queue is stuck", () => {
  withDatabaseUnavailable(() => repo.insert(evt("stuck-1")));

  // The database is back; ordinary operation continues and recovers the queue.
  for (let i = 0; i < 5; i++) repo.insert(evt(`live-${i}`));

  expect(repo.pendingCount()).toBe(0);
  expect(persistedIds()).toEqual(["stuck-1", "live-0", "live-1", "live-2", "live-3", "live-4"]);
  expect(repo.count()).toBe(6);
});
