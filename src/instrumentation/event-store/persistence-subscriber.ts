import { AkiraEvent } from "../event-types";
import { EventSubscriber } from "../subscriber";
import { EventRepository } from "./event-repository";

export class PersistenceSubscriber implements EventSubscriber {
  readonly id = "persistence-subscriber";

  constructor(private repository: EventRepository) {}

  onEvent(event: AkiraEvent): void {
    // Pipe the received event directly into repository storage
    this.repository.insert(event);
  }
}
