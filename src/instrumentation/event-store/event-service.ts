import { EventBus, globalEventBus } from "../event-bus";
import { EventRepository } from "./event-repository";
import { PersistenceSubscriber } from "./persistence-subscriber";

export class EventService {
  private subscriber: PersistenceSubscriber | null = null;

  constructor(
    private repository: EventRepository,
    private eventBus: EventBus = globalEventBus,
  ) {}

  /**
   * Starts the event store listener service by subscribing the persistence subscriber to the Event Bus.
   */
  start(): void {
    if (this.subscriber) {
      return; // Already active
    }
    this.subscriber = new PersistenceSubscriber(this.repository);
    this.eventBus.subscribe(this.subscriber);
  }

  /**
   * Stops the event store listener service.
   */
  stop(): void {
    if (this.subscriber) {
      this.eventBus.unsubscribe(this.subscriber);
      this.subscriber = null;
    }
  }

  /**
   * Accesses the underlying event repository.
   */
  getRepository(): EventRepository {
    return this.repository;
  }
}
