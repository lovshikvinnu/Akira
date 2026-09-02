if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteTimelineRepository.ts must only be loaded on the server side.",
  );
}

import {
  TimelineCursor,
  TimelineEvent,
  TimelineQueryRequest,
  TimelineQueryResult,
} from "../../akira-os/timeline/types";
import { TimelineRepository } from "../../contracts/repositories/TimelineRepository";
import { getDatabaseConnection } from "../connection";

interface TimelineEventRow {
  id: string;
  event_type: string;
  project_id: string | null;
  payload: string;
  payload_version: number;
  timestamp: string;
  seq: number | null;
}

// In-memory fallback queue for offline/read-only resilience under database locks
const fallbackQueue: TimelineEvent[] = [];

/**
 * Ordering coordinate.
 *
 * Rows are ordered by (timestamp, seq). `timestamp` resolves only to the
 * millisecond, so a burst recorded inside one millisecond ties on it; `seq`
 * breaks the tie in the order the events were actually recorded. It replaces an
 * earlier tiebreak on `id`, which is a random UUID and therefore ordered tied
 * events arbitrarily.
 *
 * Persisted rows take their sequence from SQL so the database stays the single
 * source of truth, including for the vault audit triggers, which insert
 * timeline rows without going through this repository.
 */
const NEXT_SEQ_SQL = "(SELECT IFNULL(MAX(seq), 0) + 1 FROM timeline_events)";

export class SqliteTimelineRepository implements TimelineRepository {
  private getDb() {
    return getDatabaseConnection();
  }

  private mapRowToEvent(row: TimelineEventRow): TimelineEvent {
    return {
      id: row.id,
      eventType: row.event_type,
      projectId: row.project_id,
      payload: JSON.parse(row.payload),
      payloadVersion: row.payload_version,
      timestamp: row.timestamp,
      seq: row.seq ?? 0,
    };
  }

  /**
   * Sequence for an event the database refused to accept.
   *
   * A buffered event was recorded after everything currently persisted, so it
   * must sort newer than every stored row and newer than anything buffered
   * before it. Reading MAX(seq) keeps buffered and persisted rows on one scale;
   * if the database is unreachable entirely, the queue still orders among itself.
   */
  private nextFallbackSeq(): number {
    let persistedMax = 0;
    try {
      const row = this.getDb()
        .prepare(`SELECT IFNULL(MAX(seq), 0) AS maxSeq FROM timeline_events`)
        .get() as { maxSeq: number } | undefined;
      persistedMax = row ? row.maxSeq : 0;
    } catch {
      persistedMax = 0;
    }
    const bufferedMax = fallbackQueue.reduce((max, evt) => Math.max(max, evt.seq ?? 0), 0);
    return Math.max(persistedMax, bufferedMax) + 1;
  }

  /** Compares two events on the (timestamp, seq) coordinate, ascending. */
  private compareCoordinate(
    a: { timestamp: string; seq?: number },
    b: { timestamp: string; seq?: number },
  ): number {
    const byTimestamp = a.timestamp.localeCompare(b.timestamp);
    if (byTimestamp !== 0) return byTimestamp;
    return (a.seq ?? 0) - (b.seq ?? 0);
  }

  insert(event: TimelineEvent): void {
    // Attempt write transaction retry. SQLite natively blocks up to busy_timeout (5000ms),
    // but if it fails completely (locked/read-only), we store the event in-memory to prevent app crashes.
    try {
      this.getDb()
        .prepare(
          `
          INSERT INTO timeline_events (
            id, event_type, project_id, payload, timestamp, payload_version, seq
          ) VALUES (?, ?, ?, ?, ?, ?, ${NEXT_SEQ_SQL})
        `,
        )
        .run(
          event.id,
          event.eventType,
          event.projectId,
          JSON.stringify(event.payload),
          event.timestamp,
          event.payloadVersion,
        );
    } catch (err: any) {
      console.warn(
        "Timeline SQL write failed (DB locked/offline). Buffering event in-memory:",
        err,
      );
      fallbackQueue.push({ ...event, seq: this.nextFallbackSeq() });
    }
  }

  findPaged(request: TimelineQueryRequest): TimelineQueryResult {
    const { limit, cursor, filterProjectIds, filterCategories, sortDirection = "desc" } = request;
    const db = this.getDb();

    const conditions: string[] = [];
    const params: Record<string, any> = {};

    // 1. Keyset Cursor logic (composite key of timestamp + seq)
    if (cursor) {
      params.cursor_timestamp = cursor.timestamp;
      params.cursor_seq = cursor.seq;
      if (sortDirection === "desc") {
        conditions.push(
          "(timestamp < :cursor_timestamp OR (timestamp = :cursor_timestamp AND seq < :cursor_seq))",
        );
      } else {
        conditions.push(
          "(timestamp > :cursor_timestamp OR (timestamp = :cursor_timestamp AND seq > :cursor_seq))",
        );
      }
    }

    // 2. Project ID filtering
    if (filterProjectIds && filterProjectIds.length > 0) {
      const projParams = filterProjectIds
        .map((id, index) => {
          const keyName = `proj_${index}`;
          params[keyName] = id;
          return `:${keyName}`;
        })
        .join(", ");
      conditions.push(`project_id IN (${projParams})`);
    }

    // 3. Category filtering (translating UI categories into database event types)
    if (filterCategories && filterCategories.length > 0) {
      const targetTypes: string[] = [];
      filterCategories.forEach((cat) => {
        if (cat === "tasks") {
          targetTypes.push(
            "task.created",
            "task.completed",
            "task.updated",
            "task.deleted",
            "mission.completed",
          );
        } else if (cat === "notes") {
          targetTypes.push("note.created", "note.edited", "note.deleted");
        } else if (cat === "sessions") {
          targetTypes.push("session.started", "session.ended");
        }
      });

      if (targetTypes.length > 0) {
        const typeParams = targetTypes
          .map((type, index) => {
            const keyName = `type_${index}`;
            params[keyName] = type;
            return `:${keyName}`;
          })
          .join(", ");
        conditions.push(`event_type IN (${typeParams})`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderClause = `ORDER BY timestamp ${sortDirection.toUpperCase()}, seq ${sortDirection.toUpperCase()}`;

    // Query limit + 1 to check if there is a next page
    const query = `
      SELECT id, event_type, project_id, payload, payload_version, timestamp, seq
      FROM timeline_events
      ${whereClause}
      ${orderClause}
      LIMIT :limit
    `;

    params.limit = limit + 1;

    let dbEvents: TimelineEvent[] = [];
    try {
      const rows = db.prepare(query).all(params) as TimelineEventRow[];
      dbEvents = rows.map((row) => this.mapRowToEvent(row));
    } catch (err) {
      console.error("Timeline repository read failed (falling back to in-memory only):", err);
    }

    // Blend in matching in-memory fallback events
    const matchingFallback = fallbackQueue.filter((evt) => {
      // Cursor boundary matching, on the same (timestamp, seq) coordinate the
      // SQL predicate above uses.
      if (cursor) {
        const cmp = this.compareCoordinate(evt, cursor);
        const matchesCursor = sortDirection === "desc" ? cmp < 0 : cmp > 0;
        if (!matchesCursor) return false;
      }
      // Project ID filter
      if (
        filterProjectIds &&
        filterProjectIds.length > 0 &&
        (!evt.projectId || !filterProjectIds.includes(evt.projectId))
      ) {
        return false;
      }
      // Category filter
      if (filterCategories && filterCategories.length > 0) {
        let matchCat = false;
        filterCategories.forEach((cat) => {
          if (
            cat === "tasks" &&
            [
              "task.created",
              "task.completed",
              "task.updated",
              "task.deleted",
              "mission.completed",
            ].includes(evt.eventType)
          )
            matchCat = true;
          if (
            cat === "notes" &&
            ["note.created", "note.edited", "note.deleted"].includes(evt.eventType)
          )
            matchCat = true;
          if (cat === "sessions" && ["session.started", "session.ended"].includes(evt.eventType))
            matchCat = true;
        });
        if (!matchCat) return false;
      }
      return true;
    });

    const combined = [...dbEvents, ...matchingFallback];

    // De-duplicate in case of race conditions
    const uniqueMap = new Map<string, TimelineEvent>();
    combined.forEach((evt) => uniqueMap.set(evt.id, evt));
    const allItems = Array.from(uniqueMap.values());

    // Sort together on the same coordinate as the SQL ORDER BY. These must not
    // diverge: SQL decides which rows the LIMIT selects for the page, so a
    // different order here would page over the wrong rows.
    allItems.sort((a, b) => {
      const cmp = this.compareCoordinate(a, b);
      return sortDirection === "desc" ? -cmp : cmp;
    });

    const hasMore = allItems.length > limit;
    const itemsToReturn = hasMore ? allItems.slice(0, limit) : allItems;

    let nextCursor: TimelineCursor | undefined;
    if (hasMore && itemsToReturn.length > 0) {
      const last = itemsToReturn[itemsToReturn.length - 1];
      nextCursor = {
        timestamp: last.timestamp,
        seq: last.seq ?? 0,
      };
    }

    return {
      items: itemsToReturn,
      nextCursor,
    };
  }

  deleteById(id: string): void {
    try {
      this.getDb().prepare("DELETE FROM timeline_events WHERE id = ?").run(id);
    } catch {}
    const idx = fallbackQueue.findIndex((e) => e.id === id);
    if (idx !== -1) fallbackQueue.splice(idx, 1);
  }

  deleteByProjectId(projectId: string): void {
    try {
      this.getDb().prepare("DELETE FROM timeline_events WHERE project_id = ?").run(projectId);
    } catch {}
    for (let i = fallbackQueue.length - 1; i >= 0; i--) {
      if (fallbackQueue[i].projectId === projectId) {
        fallbackQueue.splice(i, 1);
      }
    }
  }

  clearAll(): void {
    try {
      this.getDb().prepare("DELETE FROM timeline_events").run();
    } catch {}
    fallbackQueue.length = 0;
  }

  count(): number {
    let dbCount = 0;
    try {
      const row = this.getDb().prepare("SELECT COUNT(*) as count FROM timeline_events").get() as
        { count: number } | undefined;
      dbCount = row ? row.count : 0;
    } catch {}
    return dbCount + fallbackQueue.length;
  }
}
