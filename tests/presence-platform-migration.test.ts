/**
 * Presence on the platform event bus.
 *
 * Presence used to travel the legacy `SimpleEventBus`, which offered topic
 * subscription but no envelope — so presence could never be marked transient,
 * and the forward bridge had to exclude it by name to keep it out of the event
 * store. It now publishes through instrumentation `publish()` with
 * `transient: true`, and its two consumers filter for it on `globalEventBus`.
 * The forward bridge that once had to exclude presence by name is gone.
 *
 * The invariant these tests exist to protect: `companionStateService.bootstrap()`
 * throws unless a presence context has already reached it. Presence delivery is
 * synchronous and its consumers subscribe at construction, which is what makes
 * `presenceService.initialize()` -> `bootstrap()` in `routes/__root.tsx` work.
 * A migration that made delivery asynchronous, or that subscribed at
 * initialize() time, would break app startup rather than any test below.
 *
 * Ordering note: the first case asserts the un-bootstrapped failure mode, so it
 * must run before anything publishes presence. Nothing publishes at import.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";

const { akira } = await import("../src/persistence/akira-store");
const { presenceService } = await import("../src/akira-os/presence/service");
const { companionStateService } = await import("../src/genesis/context/state/service");
const { contextResolutionService } =
  await import("../src/genesis/context/context-resolution/service");
const { contextResolutionEvents } =
  await import("../src/genesis/context/context-resolution/events");
const { globalEventBus } = await import("../src/instrumentation/event-bus");
const { publish } = await import("../src/instrumentation");
const { Events } = await import("../src/contracts/events");
const { PersistenceSubscriber } =
  await import("../src/instrumentation/event-store/persistence-subscriber");
const { SqliteEventRepository } =
  await import("../src/instrumentation/event-store/sqlite-event-repository");

import type { AkiraEvent } from "../src/instrumentation/event-types";

/** Watches the real platform bus for the duration of `fn`. */
function observeBus<T>(fn: () => T): { result: T; events: AkiraEvent[] } {
  const events: AkiraEvent[] = [];
  const monitor = {
    id: `presence-monitor-${Math.random()}`,
    onEvent: (e: AkiraEvent) => void events.push(e),
  };
  globalEventBus.subscribe(monitor);
  try {
    return { result: fn(), events };
  } finally {
    globalEventBus.unsubscribe(monitor);
  }
}

/** Counts resolved-context rebuilds while `fn` runs. */
function countRebuilds(fn: () => void): number {
  let rebuilds = 0;
  const unsubscribe = contextResolutionEvents.subscribe(() => {
    rebuilds += 1;
  });
  try {
    fn();
    return rebuilds;
  } finally {
    unsubscribe();
  }
}

describe("bootstrap invariant", () => {
  it("still refuses to bootstrap before any presence context has arrived", () => {
    // Declared first on purpose: no presence has been published yet in this
    // file. The guard must survive the migration, not be relaxed by it.
    expect(() => companionStateService.bootstrap()).toThrow(/Presence Engine is not initialized/);
  });

  it("bootstraps after the real startup sequence publishes presence", () => {
    // Exactly the order routes/__root.tsx uses.
    const published = presenceService.initialize();
    const state = companionStateService.bootstrap();

    expect(state).toBeDefined();
    expect(state.origin).toBe("CompanionStateEngine");

    // The state was built from the context that travelled the platform bus,
    // not from some default: this is the end-to-end proof of delivery.
    expect(state.evidence.presence).toBeDefined();
    expect(state.evidence.presence.generatedAt).toBe(published.generatedAt);
    expect(state.evidence.presence.sessionType).toBe(published.sessionType);
  });
});

describe("presence delivery on the platform bus", () => {
  it("publishes presence as a transient platform event", () => {
    const { events } = observeBus(() => presenceService.initialize());

    const presence = events.filter((e) => e.type === Events.PRESENCE_UPDATED);
    expect(presence.length).toBeGreaterThan(0);

    const event = presence[presence.length - 1];
    expect(event.transient).toBe(true);
    expect(event.source).toBe("presence-service");
    expect(event.id).toBeTruthy();
    expect((event.payload as { context: unknown }).context).toBeDefined();
  });

  it("reaches the companion state consumer, which can still bootstrap from it", () => {
    presenceService.initialize();
    expect(() => companionStateService.bootstrap()).not.toThrow();
  });

  it("reaches the context-resolution consumer and triggers exactly one rebuild", () => {
    contextResolutionService.initialize();

    const rebuilds = countRebuilds(() => {
      publish({
        type: Events.PRESENCE_UPDATED,
        source: "presence-service",
        payload: { context: { returnState: "returning", timePeriod: "evening" } },
        version: 1,
        transient: true,
      });
    });

    // One presence event, one rebuild. Two would mean the constructor-time
    // cache subscriber and the initialize() subscriber both rebuilt, or that a
    // stale subscription from a previous initialize() survived.
    expect(rebuilds).toBe(1);
  });

  it("does not accumulate subscriptions when initialize() is called repeatedly", () => {
    contextResolutionService.initialize();
    contextResolutionService.initialize();
    contextResolutionService.initialize();

    const rebuilds = countRebuilds(() => {
      publish({
        type: Events.PRESENCE_UPDATED,
        source: "presence-service",
        payload: { context: { returnState: "settled" } },
        version: 1,
        transient: true,
      });
    });

    expect(rebuilds).toBe(1);
  });
});

describe("the legacy presence path is no longer live", () => {
  it("produces no consumer processing when presence is published on the legacy bus", async () => {
    const { eventBus } = await import("../src/shared/infrastructure/event-bus");
    contextResolutionService.initialize();

    const rebuilds = countRebuilds(() => {
      eventBus.publish(Events.PRESENCE_UPDATED, {
        context: { returnState: "legacy", timePeriod: "night" },
      });
    });

    // The old path must be dead, not merely duplicated. If this ever returns 1,
    // a presence update is being processed twice in production.
    expect(rebuilds).toBe(0);
  });

  it("no longer imports the legacy bus in any presence producer or consumer", async () => {
    const fs = await import("fs");
    for (const file of [
      "src/akira-os/presence/service.ts",
      "src/genesis/context/state/service.ts",
      "src/genesis/context/context-resolution/service.ts",
    ]) {
      expect(fs.readFileSync(file, "utf8"), file).not.toContain("shared/infrastructure/event-bus");
    }
  });
});

describe("presence is delivered but never persisted", () => {
  it("skips the event store for presence while still storing ordinary events", () => {
    // A real PersistenceSubscriber on the real platform bus — the production
    // wiring, with only the database swapped for an in-memory one.
    const repository = new SqliteEventRepository(new Database(":memory:"));
    const persistence = new PersistenceSubscriber(repository);
    globalEventBus.subscribe(persistence);

    try {
      const { events } = observeBus(() => presenceService.initialize());

      // Delivered on the bus...
      expect(events.some((e) => e.type === Events.PRESENCE_UPDATED)).toBe(true);
      // ...and absent from the store.
      expect(repository.findByType(Events.PRESENCE_UPDATED)).toHaveLength(0);

      // An ordinary platform event on the same bus is still stored.
      akira.addProject({ name: "Persisted After Migration" });
      expect(repository.findByType(Events.PROJECT_CREATED).length).toBeGreaterThan(0);
    } finally {
      globalEventBus.unsubscribe(persistence);
    }
  });
});

describe("failure isolation", () => {
  it("keeps presence consumers working when an unrelated subscriber throws", () => {
    const hostile = {
      id: "hostile-platform-subscriber",
      onEvent: () => {
        throw new Error("unrelated subscriber exploded");
      },
    };
    globalEventBus.subscribe(hostile);
    contextResolutionService.initialize();

    try {
      let rebuilds = 0;
      const unsubscribe = contextResolutionEvents.subscribe(() => {
        rebuilds += 1;
      });

      expect(() => presenceService.initialize()).not.toThrow();
      // The presence consumer still ran despite the peer fault...
      expect(rebuilds).toBeGreaterThan(0);

      // ...and a later update still lands.
      const before = rebuilds;
      publish({
        type: Events.PRESENCE_UPDATED,
        source: "presence-service",
        payload: { context: { returnState: "after-fault" } },
        version: 1,
        transient: true,
      });
      expect(rebuilds).toBeGreaterThan(before);

      unsubscribe();
    } finally {
      globalEventBus.unsubscribe(hostile);
    }
  });

  it("still bootstraps after a peer subscriber has failed", () => {
    presenceService.initialize();
    expect(() => companionStateService.bootstrap()).not.toThrow();
  });
});
