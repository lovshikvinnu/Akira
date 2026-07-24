import { AkiraEvent } from "../../instrumentation/event-types";

export interface MetricCalculator<TResult = unknown> {
  /**
   * Unique name of the metric calculator (e.g., "daily-task-metric").
   */
  readonly name: string;

  /**
   * Declare the supported event types this calculator processes.
   */
  readonly supportedEventTypes: string[];

  /**
   * Consumes an event and updates internal accumulation state.
   * Assumes the event has been validated to match one of the supported event types.
   */
  processEvent(event: AkiraEvent): void;

  /**
   * Performs any final computation and returns the derived summary.
   */
  calculate(): TResult;

  /**
   * Resets the internal calculator state to prepare for a new aggregation cycle.
   */
  reset(): void;
}
