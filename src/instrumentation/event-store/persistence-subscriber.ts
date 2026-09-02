import { AkiraEvent } from "../event-types";
import { EventSubscriber } from "../subscriber";
import { EventRepository } from "./event-repository";

export class PersistenceSubscriber implements EventSubscriber {
  readonly id = "persistence-subscriber";

  constructor(private repository: EventRepository) {}

  onEvent(event: AkiraEvent): void {
    // Transient events are delivered to every subscriber like any other event;
    // they are simply not part of the durable record. This is the only place
    // the distinction is enforced.
    if (event.transient) return;

    // Pipe the received event directly into repository storage
    this.repository.insert(event);
  }
}
