export interface EventBusEvent<T = any> {
  type: string;
  payload: T;
  timestamp: string;
}

export type EventBusSubscriber<T = any> = (event: EventBusEvent<T>) => void;

/**
 * String-topic pub/sub retained for the runtime/module subsystem.
 *
 * This bus used to forward everything it received to the instrumentation
 * publisher, with `presence.updated` excluded by name so that a high-frequency
 * signal would not fill the event store. Both halves of that are gone: the
 * workspace producers, GENESIS and presence all publish directly to the
 * platform bus now, so nothing needed forwarding and nothing needed excluding.
 *
 * What remains uses it as a plain in-process bus: `runtime/lifecycle`,
 * `runtime/registry`, and the `ModuleContext.eventBus` passthrough that the SDK
 * contract requires. Those are a separate architecture and are not dead code —
 * they carry tested behaviour — so this class stays. There is no longer any
 * path from here to the platform bus.
 */
class SimpleEventBus {
  private subscribers = new Map<string, Set<EventBusSubscriber>>();

  subscribe<T = any>(eventType: string, subscriber: EventBusSubscriber<T>): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(subscriber);
    return () => {
      this.unsubscribe(eventType, subscriber);
    };
  }

  unsubscribe<T = any>(eventType: string, subscriber: EventBusSubscriber<T>): void {
    const subs = this.subscribers.get(eventType);
    if (subs) {
      subs.delete(subscriber);
      if (subs.size === 0) {
        this.subscribers.delete(eventType);
      }
    }
  }

  publish<T = any>(eventType: string, payload: T): void {
    const event: EventBusEvent<T> = {
      type: eventType,
      payload,
      timestamp: new Date().toISOString(),
    };

    const subs = this.subscribers.get(eventType);
    if (subs) {
      subs.forEach((sub) => {
        try {
          sub(event);
        } catch (e) {
          console.error(`Error in event subscriber for type "${eventType}":`, e);
        }
      });
    }

    const wildcards = this.subscribers.get("*");
    if (wildcards) {
      wildcards.forEach((sub) => {
        try {
          sub(event);
        } catch (e) {
          console.error(`Error in wildcard event subscriber:`, e);
        }
      });
    }
  }
}

export const eventBus = new SimpleEventBus();
export type { SimpleEventBus };
