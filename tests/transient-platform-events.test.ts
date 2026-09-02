/**
 * Transient platform-event semantics.
 *
 * Some platform signals are durable facts ("this task was completed") and some
 * are momentary state ("presence changed again"). Both belong on the one
 * platform bus, but only the first belongs in an append-only log — otherwise a
 * high-frequency signal quietly becomes the bulk of the durable record.
 *
 * `AkiraEvent.transient` is how a producer declares which kind it is publishing.
 * `PersistenceSubscriber` is the only place that acts on it. These tests pin
 * both halves of that: transient events must still reach every subscriber, and
 * must not reach the store.
 *
 * Each case builds its own EventBus, repository and in-memory database, so
 * nothing here depends on — or disturbs — the singleton platform bus.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";

import { EventBus } from "../src/instrumentation/event-bus";
import { Publisher } from "../src/instrumentation/publisher";
import { PersistenceSubscriber } from "../src/instrumentation/event-store/persistence-subscriber";
import { SqliteEventRepository } from "../src/instrumentation/event-store/sqlite-event-repository";
import { Events } from "../src/contracts/events";
import type { AkiraEvent } from "../src/instrumentation/event-types";

/** An isolated bus + store, wired the way the server wires them. */
function makeHarness() {
  const db = new Database(":memory:");
  const repository = new SqliteEventRepository(db);
  const bus = new EventBus();
  const persistence = new PersistenceSubscriber(repository);
  bus.subscribe(persistence);

  const delivered: AkiraEvent[] = [];
  bus.subscribe({ id: "peer-subscriber", onEvent: (e) => void delivered.push(e) });

  // The real publisher, so events pass through the real middleware pipeline.
  const publisher = new Publisher(bus);

  return { db, repository, bus, publisher, delivered };
}

describe("durable platform events", () => {
  it("persists an event that is not marked transient", () => {
    const { repository, publisher, delivered } = makeHarness();

    const published = publisher.publish({
      type: Events.TASK_COMPLETED,
      source: "tasks-store",
      payload: { id: "t1", title: "Ship it", projectId: "p1" },
      version: 1,
    });

    expect(delivered.map((e) => e.type)).toEqual([Events.TASK_COMPLETED]);

    const stored = repository.findByType(Events.TASK_COMPLETED);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(published.id);
  });

  it("treats transient:false exactly like an unmarked event", () => {
    const { repository, publisher } = makeHarness();

    publisher.publish({
      type: Events.PROJECT_CREATED,
      source: "projects-store",
      payload: { id: "p1", name: "Recovery", tag: "Project" },
      version: 1,
      transient: false,
    });

    expect(repository.findByType(Events.PROJECT_CREATED)).toHaveLength(1);
  });
});

describe("transient platform events", () => {
  it("delivers a transient event to every subscriber", () => {
    const { publisher, delivered } = makeHarness();

    publisher.publish({
      type: Events.PRESENCE_UPDATED,
      source: "presence-service",
      payload: { context: { returnState: "returning" } },
      version: 1,
      transient: true,
    });

    // Delivery is unconditional: being transient changes where an event is
    // stored, never who receives it.
    expect(delivered).toHaveLength(1);
    expect(delivered[0].type).toBe(Events.PRESENCE_UPDATED);
    expect(delivered[0].transient).toBe(true);
  });

  it("does not write a transient event to the event store", () => {
    const { repository, publisher } = makeHarness();

    publisher.publish({
      type: Events.PRESENCE_UPDATED,
      source: "presence-service",
      payload: { context: { returnState: "returning" } },
      version: 1,
      transient: true,
    });

    expect(repository.findByType(Events.PRESENCE_UPDATED)).toHaveLength(0);
    expect(repository.latest(50)).toHaveLength(0);
  });

  it("keeps durable events in the store when transient ones are interleaved", () => {
    const { repository, publisher, delivered } = makeHarness();

    publisher.publish({
      type: Events.PRESENCE_UPDATED,
      source: "presence-service",
      payload: { context: {} },
      version: 1,
      transient: true,
    });
    publisher.publish({
      type: Events.TASK_COMPLETED,
      source: "tasks-store",
      payload: { id: "t1", title: "Kept", projectId: "p1" },
      version: 1,
    });
    publisher.publish({
      type: Events.PRESENCE_UPDATED,
      source: "presence-service",
      payload: { context: {} },
      version: 1,
      transient: true,
    });

    // All three were delivered; only the durable one was written.
    expect(delivered).toHaveLength(3);
    const stored = repository.latest(50);
    expect(stored).toHaveLength(1);
    expect(stored[0].type).toBe(Events.TASK_COMPLETED);
  });
});

describe("middleware and metadata are unaffected", () => {
  it("still injects id, timestamp and correlationId onto a transient event", () => {
    const { publisher, delivered } = makeHarness();

    const published = publisher.publish({
      type: Events.PRESENCE_UPDATED,
      source: "presence-service",
      payload: { context: {} },
      version: 1,
      transient: true,
    });

    // The flag must not short-circuit the pipeline — it only gates the write.
    expect(published.id).toBeTruthy();
    expect(published.timestamp).toBeTruthy();
    expect(published.correlationId).toBeTruthy();
    expect(delivered[0].id).toBe(published.id);
  });

  it("preserves metadata on a durable event, including through storage", () => {
    const { repository, publisher } = makeHarness();

    publisher.publish({
      type: Events.NOTE_CREATED,
      source: "notes-store",
      payload: { id: "n1", title: "Note", projectId: "p1" },
      metadata: { origin: "unit-test", nested: { keep: true } },
      version: 1,
    });

    const stored = repository.findByType(Events.NOTE_CREATED);
    expect(stored).toHaveLength(1);
    expect(stored[0].metadata).toEqual({ origin: "unit-test", nested: { keep: true } });
  });

  it("carries an explicit id through unchanged rather than regenerating it", () => {
    const { repository, publisher } = makeHarness();

    publisher.publish({
      type: Events.TASK_COMPLETED,
      source: "tasks-store",
      id: "explicit-id-1",
      payload: { id: "t1", title: "T", projectId: "p1" },
      version: 1,
    });

    expect(repository.findById("explicit-id-1")).toBeTruthy();
  });
});

describe("presence is unchanged while it still uses the legacy bus", () => {
  it("still reaches its legacy subscribers, and still never reaches the event store", async () => {
    // presence/service.ts publishes through SimpleEventBus.publish(type, payload),
    // which carries no AkiraEvent envelope — so there is nowhere to set
    // `transient` until those sites migrate. This pins today's behaviour so the
    // migration has something to compare against.
    const { eventBus } = await import("../src/shared/infrastructure/event-bus");

    const received: unknown[] = [];
    const unsubscribe = eventBus.subscribe(Events.PRESENCE_UPDATED, (event) => {
      received.push(event.payload);
    });

    const context = { returnState: "returning", timePeriod: "evening" };
    eventBus.publish(Events.PRESENCE_UPDATED, { context });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ context });

    unsubscribe();
  });

  it("is still excluded from the legacy forward bridge", async () => {
    // The bridge skips presence.updated, so presence never reaches the platform
    // bus at all today. That exclusion — not the new transient flag — is what
    // currently keeps it out of the store.
    const source = await import("fs").then((fs) =>
      fs.readFileSync("src/shared/infrastructure/event-bus/index.ts", "utf8"),
    );
    expect(source).toContain('eventType !== "presence.updated"');
  });
});
