import { Database } from "better-sqlite3";
import { AkiraEvent } from "../event-types";
import { EventRepository } from "./event-repository";
import { runEventStoreMigration } from "./migration";
import { isSerializable } from "../event";

export class SqliteEventRepository implements EventRepository {
  constructor(private db: Database) {
    // Automatically perform database bootstrap on init
    runEventStoreMigration(db);
  }

  insert(event: AkiraEvent): void {
    // 1. Verify payload and metadata serializability before writing
    if (event.payload === undefined) {
      throw new Error("Validation Error: Event payload is missing or undefined");
    }
    const payloadCheck = isSerializable(event.payload);
    if (!payloadCheck.serializable) {
      throw new Error(
        `Validation Error: Payload is not serializable. Reason: ${payloadCheck.reason}`,
      );
    }

    if (event.metadata !== undefined && event.metadata !== null) {
      const metadataCheck = isSerializable(event.metadata);
      if (!metadataCheck.serializable) {
        throw new Error(
          `Validation Error: Metadata is not serializable. Reason: ${metadataCheck.reason}`,
        );
      }
    }

    // 2. Map structures to SQLite table format
    const timestampMs = new Date(event.timestamp).getTime();
    if (isNaN(timestampMs)) {
      throw new Error(`Validation Error: Invalid event timestamp: ${event.timestamp}`);
    }

    const versionInt =
      typeof event.version === "number" ? event.version : parseInt(event.version as string, 10);
    if (isNaN(versionInt)) {
      throw new Error(
        `Validation Error: Event version must resolve to an integer: ${event.version}`,
      );
    }

    const payloadJson = JSON.stringify(event.payload);
    const metadataJson = event.metadata ? JSON.stringify(event.metadata) : null;

    // 3. Persist atomically
    const stmt = this.db.prepare(`
      INSERT INTO events (
        id, type, source, timestamp, version, entity_id, actor, correlation_id, payload_json, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.type,
      event.source,
      timestampMs,
      versionInt,
      event.entityId || null,
      event.actor || null,
      event.correlationId || null,
      payloadJson,
      metadataJson,
    );
  }

  findById(id: string): AkiraEvent | null {
    const stmt = this.db.prepare(`SELECT * FROM events WHERE id = ?`);
    const row = stmt.get(id);
    if (!row) return null;
    return this.mapRowToEvent(row);
  }

  findByType(type: string): AkiraEvent[] {
    const stmt = this.db.prepare(
      `SELECT * FROM events WHERE type = ? ORDER BY timestamp DESC, rowid DESC`,
    );
    const rows = stmt.all(type);
    return rows.map((row) => this.mapRowToEvent(row));
  }

  findBySource(source: string): AkiraEvent[] {
    const stmt = this.db.prepare(
      `SELECT * FROM events WHERE source = ? ORDER BY timestamp DESC, rowid DESC`,
    );
    const rows = stmt.all(source);
    return rows.map((row) => this.mapRowToEvent(row));
  }

  findByCorrelationId(correlationId: string): AkiraEvent[] {
    const stmt = this.db.prepare(
      `SELECT * FROM events WHERE correlation_id = ? ORDER BY timestamp DESC, rowid DESC`,
    );
    const rows = stmt.all(correlationId);
    return rows.map((row) => this.mapRowToEvent(row));
  }

  findBetween(startTimestamp: string | number, endTimestamp: string | number): AkiraEvent[] {
    const startMs =
      typeof startTimestamp === "string" ? new Date(startTimestamp).getTime() : startTimestamp;
    const endMs =
      typeof endTimestamp === "string" ? new Date(endTimestamp).getTime() : endTimestamp;

    if (isNaN(startMs) || isNaN(endMs)) {
      throw new Error("Invalid start or end timestamp provided for boundary search.");
    }

    const stmt = this.db.prepare(`
      SELECT * FROM events 
      WHERE timestamp >= ? AND timestamp <= ? 
      ORDER BY timestamp ASC, rowid ASC
    `);
    const rows = stmt.all(startMs, endMs);
    return rows.map((row) => this.mapRowToEvent(row));
  }

  latest(limit: number): AkiraEvent[] {
    if (limit <= 0) return [];
    const stmt = this.db.prepare(
      `SELECT * FROM events ORDER BY timestamp DESC, rowid DESC LIMIT ?`,
    );
    const rows = stmt.all(limit);
    return rows.map((row) => this.mapRowToEvent(row));
  }

  /**
   * Helper mapping database SQLite row format back to strongly typed AkiraEvent objects.
   */
  private mapRowToEvent(row: any): AkiraEvent {
    let payload: any;
    try {
      payload = JSON.parse(row.payload_json);
    } catch (err) {
      console.error(`Database Corruption: Malformed payload JSON for event ${row.id}:`, err);
      payload = {};
    }

    let metadata: any = undefined;
    if (row.metadata_json) {
      try {
        metadata = JSON.parse(row.metadata_json);
      } catch (err) {
        console.error(`Database Corruption: Malformed metadata JSON for event ${row.id}:`, err);
        metadata = {};
      }
    }

    return {
      id: row.id,
      type: row.type,
      source: row.source,
      timestamp: new Date(row.timestamp).toISOString(),
      version: row.version,
      ...(row.entity_id ? { entityId: row.entity_id } : {}),
      ...(row.actor ? { actor: row.actor } : {}),
      ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
      payload,
      ...(metadata ? { metadata } : {}),
    };
  }
}
