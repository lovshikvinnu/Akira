import { AkiraEvent } from "./event-types";

export interface EventSubscriber {
  readonly id: string;
  onEvent(event: AkiraEvent): void | Promise<void>;
}
