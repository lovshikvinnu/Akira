import { AkiraEvent, EventInput } from "./event-types";
import { EventBus, globalEventBus } from "./event-bus";
import { defaultMiddlewarePipeline } from "./middleware";

// Dynamically reference the server function on the client
let persistPublishEventRpc: any = null;

if (typeof window !== "undefined") {
  import("./server/index")
    .then((mod) => {
      persistPublishEventRpc = mod.persistPublishEvent;
    })
    .catch(() => {});
}

export class Publisher {
  constructor(
    private eventBus: EventBus = globalEventBus,
    private middleware = defaultMiddlewarePipeline,
  ) {}

  publish(event: EventInput): AkiraEvent {
    // 1. Run raw event inputs through our composable middleware pipeline
    const processedEvent = this.middleware(event) as AkiraEvent;

    // 2. Publish the fully validated event to the event bus
    this.eventBus.publish(processedEvent);

    return processedEvent;
  }
}

// Default instance for application-wide direct imports
const defaultPublisher = new Publisher();

/**
 * Simplest possible client API for publishing instrumentation events.
 * E.g., import { publish } from "src/instrumentation"
 */
export const publish = (event: EventInput): AkiraEvent => {
  if (typeof window !== "undefined") {
    // 1. Run local client pipeline so we have a synchronous ID and timestamp locally
    const clientProcessed = defaultPublisher.publish(event);

    // 2. Send the processed event to the server RPC for SQLite storage
    if (persistPublishEventRpc) {
      persistPublishEventRpc({ data: clientProcessed }).catch((err: any) => {
        console.error("[Publisher] Failed to persist event on server:", err);
      });
    } else {
      import("./server/index")
        .then((mod) => {
          mod.persistPublishEvent({ data: clientProcessed }).catch((err: any) => {
            console.error("[Publisher] Failed to persist event on server via fallback:", err);
          });
        })
        .catch(() => {});
    }

    return clientProcessed;
  } else {
    // We are on the server: run synchronous publisher
    return defaultPublisher.publish(event);
  }
};
