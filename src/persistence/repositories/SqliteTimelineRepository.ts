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

/**
 * Provisional sequences for buffered events start here.
 *
 * A buffered event is by definition the most recently recorded one, so while it
 * waits it must sort above everything already stored. The database is
 * unavailable in exactly this situation, so its MAX(seq) cannot be consulted;
 * starting above any sequence a real database will ever reach gets the ordering
 * right without a read that would fail anyway. The value is provisional only:
 * draining assigns the real sequence from SQL.
 */
const FALLBACK_SEQ_BASE = Number.MAX_SAFE_INTEGER - 1_000_000;

/** Guards against a drain re-entering itself. */
let isDraining = false;

/**
 * Whether a write failed because the database was momentarily unavailable
 * rather than because the row itself is unacceptable.
 *
 * The distinction decides whether an event may be queued at all. A locked or
 * read-only database will accept the same row later; a constraint violation
 * never will, so queuing one would park an event that is retried on every
 * subsequent write forever and inflate count() permanently.
 */
function isTransientDbError(err: any): boolean {
  const code = String(err?.code ?? "");
  if (
    code === "SQLITE_BUSY" ||
    code === "SQLITE_LOCKED" ||
    code === "SQLITE_READONLY" ||
    code === "SQLITE_IOERR" ||
    code === "SQLITE_CANTOPEN" ||
    code === "SQLITE_PROTOCOL" ||
    code === "SQLITE_NOTADB"
  ) {
    return true;
  }
  if (code.startsWith("SQLITE_CONSTRAINT")) return false;
  const message = String(err?.message ?? "").toLowerCase();
  return (
    message.includes("locked") ||
    message.includes("busy") ||
    message.includes("readonly") ||
    message.includes("unable to open")
  );
}

/** Whether the row is already present, which makes a retry a no-op. */
function isDuplicateIdError(err: any): boolean {
  const code = String(err?.code ?? "");
  if (code === "SQLITE_CONSTRAINT_PRIMARYKEY" || code === "SQLITE_CONSTRAINT_UNIQUE") return true;
  return String(err?.message ?? "")
    .toLowerCase()
    .includes("unique constraint failed");
}

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
   * Writes one event. `seq` is assigned by SQL rather than by the caller so the
   * database stays the single source of truth, including for the vault audit
   * triggers that insert timeline rows directly.
   */
  private writeEvent(event: TimelineEvent): void {
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
  }

  /**
   * Writes buffered events back in the order they were recorded, stopping at
   * the first one the database still refuses.
   *
   * Each drained event takes a fresh SQL sequence rather than the provisional
   * one it was buffered with. Because a drain runs before every write, the
   * queue is only ever non-empty while writes are failing, so nothing else can
   * have persisted in the meantime. Draining in order therefore lands these
   * events after everything already stored and before anything written next,
   * which is where they belong.
   */
  private drainFallbackQueue(): void {
    if (isDraining || fallbackQueue.length === 0) return;
    isDraining = true;
    try {
      while (fallbackQueue.length > 0) {
        const event = fallbackQueue[0];
        try {
          this.writeEvent(event);
          fallbackQueue.shift();
        } catch (err: any) {
          if (isDuplicateIdError(err)) {
            // Already stored. Retrying must not create a second row.
            fallbackQueue.shift();
            continue;
          }
          if (isTransientDbError(err)) {
            // Still unavailable. Keep this event and everything behind it
            // queued so the recorded order is not broken by skipping ahead.
            return;
          }
          console.error(
            `Timeline event "${event.id}" can never be persisted and was dropped from the fallback queue:`,
            err,
          );
          fallbackQueue.shift();
        }
      }
    } finally {
      isDraining = false;
    }
  }

  /**
   * Provisional sequence for an event the database refused to accept.
   *
   * It orders the event against anything else already buffered and keeps it
   * above every persisted row while it waits. Draining replaces it with a real
   * sequence allocated by SQL, so this value never reaches the database.
   */
  private nextFallbackSeq(): number {
    const bufferedMax = fallbackQueue.reduce(
      (max, evt) => Math.max(max, evt.seq ?? 0),
      FALLBACK_SEQ_BASE,
    );
    return bufferedMax + 1;
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
    // Recover anything buffered by an earlier outage before adding to it. This
    // is the recovery trigger: ordinary write activity drains the queue, so no
    // timer or background task is involved. It also keeps the queue empty
    // whenever the database is healthy, which is what stops a buffered event
    // and a later persisted one from being handed the same sequence.
    this.drainFallbackQueue();

    try {
      this.writeEvent(event);
    } catch (err: any) {
      if (!isTransientDbError(err)) {
        // SQLite natively blocks up to busy_timeout (5000ms), so reaching here
        // with a non-transient error means the row itself was rejected. Queuing
        // it would retry it forever, so report it instead.
        console.error(`Timeline event "${event.id}" was rejected and not recorded:`, err);
        return;
      }
      console.warn(
        "Timeline SQL write failed (DB locked/offline). Buffering event in-memory:",
        err,
      );
      fallbackQueue.push({ ...event, seq: this.nextFallbackSeq() });
    }
  }

  /**
   * Attempts to persist everything buffered, and reports what is still waiting.
   *
   * Writes drain the queue on their own, so this exists for the case where
   * nothing is being written: an idle system, or a shutdown path that wants one
   * last attempt before the process goes away.
   */
  flush(): number {
    this.drainFallbackQueue();
    return fallbackQueue.length;
  }

  /**
   * Events accepted by the repository but not yet in the database.
   *
   * count() deliberately still includes these, because they are visible to
   * reads and excluding them would make the count disagree with findPaged().
   * This exposes the difference so a backlog is observable rather than hidden
   * inside an otherwise healthy-looking total.
   */
  pendingCount(): number {
    return fallbackQueue.length;
  }

  findPaged(request: TimelineQueryRequest): TimelineQueryResult {
    const { limit, cursor, filterProjectIds, filterCategories, sortDirection = "desc" } = request;

    // Acquiring the connection is allowed to fail. Buffered events exist
    // precisely because the database was unavailable, so a read during that
    // outage must still surface them rather than throwing.
    let db: ReturnType<SqliteTimelineRepository["getDb"]> | null = null;
    try {
      db = this.getDb();
    } catch (err) {
      console.error("Timeline database unavailable for reads (serving buffered events only):", err);
    }

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
      const rows = (db ? db.prepare(query).all(params) : []) as TimelineEventRow[];
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
