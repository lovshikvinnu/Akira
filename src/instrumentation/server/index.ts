import { createServerFn } from "@tanstack/react-start";

// Composes observability on the *server's* module instances.
//
// Client and server are separate runtimes with separate module registries, so
// the `globalEventBus` reached here is a different object from the browser's
// and needs its own observer. Without this the deliveries that matter most --
// the SQLite persistence write and the timeline write, both of which happen
// only on the server -- would be the ones nobody was watching.
//
// A side-effect import rather than a call: see the note in auto-compose.ts.
// Composition is idempotent, so composing here and in AKIRA OS is harmless.
import "../../observability/auto-compose";

/**
 * Server function RPC to persist and process client-published events.
 */
export const persistPublishEvent = createServerFn({ method: "POST" })
  .validator((input: any) => input)
  .handler(async ({ data: event }) => {
    // 1. Dynamic imports to keep server repositories out of client assets
    const { globalEventBus } = await import("../event-bus");
    const { defaultMiddlewarePipeline } = await import("../middleware");
    const { SqliteEventRepository } = await import("../event-store/sqlite-event-repository");
    const { PersistenceSubscriber } = await import("../event-store/persistence-subscriber");
    const { getDatabaseConnection } = await import("../../persistence/connection");

    // 2. Dynamically ensure PersistenceSubscriber is registered on the server EventBus
    let hasPersistence = false;
    const subsArray = Array.from((globalEventBus as any).subscribers || []);
    for (const sub of subsArray) {
      if ((sub as any).id === "persistence-subscriber") {
        hasPersistence = true;
        break;
      }
    }

    if (!hasPersistence) {
      const db = getDatabaseConnection();
      const repo = new SqliteEventRepository(db);
      const persistenceSub = new PersistenceSubscriber(repo);
      globalEventBus.subscribe(persistenceSub);
    }

    // 3. Dynamically ensure TimelineSubscriber is registered on the server EventBus
    let hasTimeline = false;
    for (const sub of subsArray) {
      if ((sub as any).id === "timeline-subscriber") {
        hasTimeline = true;
        break;
      }
    }

    if (!hasTimeline) {
      const { timelineRepository } = await import("../../persistence/repositories");
      const { TimelineSubscriber } = await import("../subscribers/timeline-subscriber");
      const timelineSub = new TimelineSubscriber(timelineRepository);
      globalEventBus.subscribe(timelineSub);
    }

    // 4. Run the event through the middleware pipeline
    const processedEvent = defaultMiddlewarePipeline(event);

    // 5. Broadcast to all server-side subscribers
    globalEventBus.publish(processedEvent);

    return processedEvent;
  });
