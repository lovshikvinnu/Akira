import { AkiraEvent } from "../event-types";

export interface EventRepository {
  /**
   * Persists a strongly typed event in SQLite.
   * Throws an error if the ID is a duplicate or if insertion fails.
   */
  insert(event: AkiraEvent): void;

  /**
   * Retrieves an event by its unique ID.
   * Returns null if not found.
   */
  findById(id: string): AkiraEvent | null;

  /**
   * Retrieves all events matching a specific event type.
   */
  findByType(type: string): AkiraEvent[];

  /**
   * Retrieves all events originated by a specific source.
   */
  findBySource(source: string): AkiraEvent[];

  /**
   * Retrieves all events sharing a specific correlation ID.
   */
  findByCorrelationId(correlationId: string): AkiraEvent[];

  /**
   * Retrieves all events published between the start and end timestamp boundaries.
   * Start and end timestamps can be ISO strings or numeric epoch millisecond values.
   */
  findBetween(startTimestamp: string | number, endTimestamp: string | number): AkiraEvent[];

  /**
   * Retrieves the most recent events, sorted descending by timestamp, up to the given limit.
   */
  latest(limit: number): AkiraEvent[];
}
