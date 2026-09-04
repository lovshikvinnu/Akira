import { AkiraEvent } from "./event-types";
import { EventSubscriber } from "./subscriber";

/** The outcome of delivering one event to one subscriber. */
export interface EventDelivery {
  readonly subscriberId: string;
  readonly event: AkiraEvent;
  /** Wall time spent inside the subscriber, in milliseconds. */
  readonly durationMs: number;
  /** Present when the subscriber threw or its promise rejected. */
  readonly error?: unknown;
}

/**
 * Watches delivery outcomes without participating in them.
 *
 * The bus deliberately isolates subscribers from each other by catching
 * everything they throw, which means a subscriber can fail on every single
 * event and nothing outside the console ever learns about it. That swallowed
 * outcome is the most valuable health signal in the system, so the bus offers
 * it here.
 *
 * An observer must never publish: it is called from inside `publish`, so
 * publishing would recurse. It is also called on the hot path, so it must be
 * cheap. Failures inside an observer are contained and never reach the
 * publisher.
 */
export interface EventDeliveryObserver {
  onDelivery(delivery: EventDelivery): void;
}

export class EventBus {
  private subscribers = new Set<EventSubscriber>();
  private deliveryObserver: EventDeliveryObserver | null = null;

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

  /**
   * Installs the delivery observer, or clears it with `null`.
   *
   * A single slot rather than a set: this is instrumentation, and one owner
   * (the observability subsystem) keeps the hot path predictable and makes
   * "is it being watched?" a yes/no question. Installing twice replaces rather
   * than accumulating, so a repeated initialization cannot double-count.
   */
  setDeliveryObserver(observer: EventDeliveryObserver | null): void {
    this.deliveryObserver = observer;
  }

  getDeliveryObserver(): EventDeliveryObserver | null {
    return this.deliveryObserver;
  }

  /** Reports one delivery outcome. Never throws into the publisher. */
  private reportDelivery(delivery: EventDelivery): void {
    const observer = this.deliveryObserver;
    if (!observer) return;
    try {
      observer.onDelivery(delivery);
    } catch (error) {
      console.error("[EventBus] Delivery observer failed:", error);
    }
  }

  publish(event: AkiraEvent): void {
    for (const subscriber of this.subscribers) {
      // Only read the clock when someone is watching, so an unobserved bus
      // pays nothing for this.
      const start = this.deliveryObserver ? Date.now() : 0;
      try {
        const result = subscriber.onEvent(event);
        if (result instanceof Promise) {
          result.then(
            () => {
              this.reportDelivery({
                subscriberId: subscriber.id,
                event,
                durationMs: Date.now() - start,
              });
            },
            (error) => {
              console.error(`[EventBus] Async subscriber "${subscriber.id}" failed:`, error);
              this.reportDelivery({
                subscriberId: subscriber.id,
                event,
                durationMs: Date.now() - start,
                error,
              });
            },
          );
        } else {
          this.reportDelivery({
            subscriberId: subscriber.id,
            event,
            durationMs: Date.now() - start,
          });
        }
      } catch (error) {
        console.error(`[EventBus] Synchronous subscriber "${subscriber.id}" failed:`, error);
        this.reportDelivery({
          subscriberId: subscriber.id,
          event,
          durationMs: Date.now() - start,
          error,
        });
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
