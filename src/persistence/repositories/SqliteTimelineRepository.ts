if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteTimelineRepository.ts must only be loaded on the server side."
  );
}

import { TimelineEvent, TimelineQueryRequest, TimelineQueryResult } from "../../akira-os/timeline/types";
import { TimelineRepository } from "../../contracts/repositories/TimelineRepository";
import { getDatabaseConnection } from "../connection";

interface TimelineEventRow {
  id: string;
  event_type: string;
  project_id: string | null;
  payload: string;
  payload_version: number;
  timestamp: string;
}

// In-memory fallback queue for offline/read-only resilience under database locks
const fallbackQueue: TimelineEvent[] = [];

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
    };
  }

  insert(event: TimelineEvent): void {
    // Attempt write transaction retry. SQLite natively blocks up to busy_timeout (5000ms),
    // but if it fails completely (locked/read-only), we store the event in-memory to prevent app crashes.
    try {
      this.getDb()
        .prepare(
          `
          INSERT INTO timeline_events (
            id, event_type, project_id, payload, timestamp, payload_version
          ) VALUES (?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          event.id,
          event.eventType,
          event.projectId,
          JSON.stringify(event.payload),
          event.timestamp,
          event.payloadVersion
        );
    } catch (err: any) {
      console.warn("Timeline SQL write failed (DB locked/offline). Buffering event in-memory:", err);
      fallbackQueue.push(event);
    }
  }

  findPaged(request: TimelineQueryRequest): TimelineQueryResult {
    const { limit, cursor, filterProjectIds, filterCategories, sortDirection = "desc" } = request;
    const db = this.getDb();

    const conditions: string[] = [];
    const params: Record<string, any> = {};

    // 1. Keyset Cursor logic (composite key of timestamp + id)
    if (cursor) {
      params.cursor_timestamp = cursor.timestamp;
      params.cursor_id = cursor.id;
      if (sortDirection === "desc") {
        conditions.push(
          "(timestamp < :cursor_timestamp OR (timestamp = :cursor_timestamp AND id < :cursor_id))"
        );
      } else {
        conditions.push(
          "(timestamp > :cursor_timestamp OR (timestamp = :cursor_timestamp AND id > :cursor_id))"
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
            "mission.completed"
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
    const orderClause = `ORDER BY timestamp ${sortDirection.toUpperCase()}, id ${sortDirection.toUpperCase()}`;

    // Query limit + 1 to check if there is a next page
    const query = `
      SELECT id, event_type, project_id, payload, payload_version, timestamp 
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
      // Cursor boundary matching
      if (cursor) {
        const cmp = evt.timestamp.localeCompare(cursor.timestamp);
        const matchesCursor =
          sortDirection === "desc"
            ? cmp < 0 || (cmp === 0 && evt.id.localeCompare(cursor.id) < 0)
            : cmp > 0 || (cmp === 0 && evt.id.localeCompare(cursor.id) > 0);
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
          if (
            cat === "sessions" &&
            ["session.started", "session.ended"].includes(evt.eventType)
          )
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

    // Sort together by composite keyset coordinate
    allItems.sort((a, b) => {
      const cmp = a.timestamp.localeCompare(b.timestamp);
      if (cmp !== 0) return sortDirection === "desc" ? -cmp : cmp;
      return sortDirection === "desc" ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
    });

    const hasMore = allItems.length > limit;
    const itemsToReturn = hasMore ? allItems.slice(0, limit) : allItems;

    let nextCursor: { timestamp: string; id: string } | undefined;
    if (hasMore && itemsToReturn.length > 0) {
      const last = itemsToReturn[itemsToReturn.length - 1];
      nextCursor = {
        timestamp: last.timestamp,
        id: last.id,
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
        | { count: number }
        | undefined;
      dbCount = row ? row.count : 0;
    } catch {}
    return dbCount + fallbackQueue.length;
  }
}
