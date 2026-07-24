/* eslint-disable @typescript-eslint/no-explicit-any */
export interface EventBusEvent<T = any> {
  type: string;
  payload: T;
  timestamp: string;
}

export type EventBusSubscriber<T = any> = (event: EventBusEvent<T>) => void;

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

    // Forward to the new instrumentation publisher (Sprint 2.1 fallback bridge)
    try {
      import("../../../instrumentation")
        .then(({ publish }) => {
          if (eventType !== "presence.updated") {
            publish({
              type: eventType,
              source: this.deriveSourceFromEventType(eventType),
              payload: payload || {},
              version: 1,
            });
          }
        })
        .catch(() => {});
    } catch {
      // ignore
    }
  }

  private deriveSourceFromEventType(type: string): string {
    if (type.startsWith("project.")) return "projects-legacy-bus";
    if (type.startsWith("task.")) return "tasks-legacy-bus";
    if (type.startsWith("note.")) return "notes-legacy-bus";
    if (type.startsWith("session.")) return "sessions-legacy-bus";
    if (type.startsWith("vault.")) return "vault-legacy-bus";
    return "legacy-event-bus";
  }
}

export const eventBus = new SimpleEventBus();
export type { SimpleEventBus };
