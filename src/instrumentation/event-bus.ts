import { AkiraEvent } from "./event-types";
import { EventSubscriber } from "./subscriber";

export class EventBus {
  private subscribers = new Set<EventSubscriber>();

  subscribe(subscriber: EventSubscriber): void {
    if (!subscriber) {
      throw new Error("Subscriber cannot be null or undefined");
    }
    if (typeof subscriber.onEvent !== "function") {
      throw new Error("Subscriber must implement onEvent method");
    }
    if (!subscriber.id || typeof subscriber.id !== "string" || subscriber.id.trim() === "") {
      throw new Error("Subscriber must have a valid unique ID");
    }
    this.subscribers.add(subscriber);
  }

  unsubscribe(subscriber: EventSubscriber): void {
    this.subscribers.delete(subscriber);
  }

  publish(event: AkiraEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        const result = subscriber.onEvent(event);
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error(`[EventBus] Async subscriber "${subscriber.id}" failed:`, error);
          });
        }
      } catch (error) {
        console.error(`[EventBus] Synchronous subscriber "${subscriber.id}" failed:`, error);
      }
    }
  }

  // Debug & test helper
  hasSubscriber(subscriber: EventSubscriber): boolean {
    return this.subscribers.has(subscriber);
  }

  // Debug & test helper
  clearSubscribers(): void {
    this.subscribers.clear();
  }
}

// Singleton event bus instance for global subsystem activity
export const globalEventBus = new EventBus();
