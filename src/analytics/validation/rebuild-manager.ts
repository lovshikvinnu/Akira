/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDatabaseConnection } from "../../persistence/connection";
import { EventRepository } from "../../instrumentation/event-store/event-repository";
import { SqliteEventRepository } from "../../instrumentation/event-store/sqlite-event-repository";
import { AnalyticsRepository } from "../repository/AnalyticsRepository";
import { SqliteAnalyticsRepository } from "../repository/SqliteAnalyticsRepository";
import { AnalyticsEngine } from "../engine/AnalyticsEngine";
import { AkiraEvent } from "../../instrumentation/event-types";

export interface RebuildProgress {
  totalEventsProcessed: number;
  datesAggregated: number;
  projectsAggregated: number;
  isCompleted: boolean;
  errorCount: number;
}

export class RebuildManager {
  private eventRepository: EventRepository;
  private analyticsRepository: AnalyticsRepository;
  private engine: AnalyticsEngine;
  private db: any;

  constructor(
    eventRepo?: EventRepository,
    analyticsRepo?: AnalyticsRepository,
    engine?: AnalyticsEngine,
  ) {
    this.db = getDatabaseConnection();
    this.eventRepository = eventRepo || new SqliteEventRepository(this.db);
    this.analyticsRepository = analyticsRepo || new SqliteAnalyticsRepository(this.db);
    this.engine = engine || new AnalyticsEngine(this.eventRepository, this.analyticsRepository);
  }

  /**
   * Completely reconstructs derived tables from the immutable Event Store.
   */
  rebuildAll(progressCallback?: (prog: RebuildProgress) => void): RebuildProgress {
    // 1. Wipe derived metrics tables
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM daily_metrics").run();
      this.db.prepare("DELETE FROM project_metrics").run();
      this.db.prepare("DELETE FROM analytics_state").run();
    })();

    return this.rebuildIncremental(progressCallback);
  }

  /**
   * Performs an incremental rebuild of derived tables, picking up from the last processed timestamp.
   */
  rebuildIncremental(progressCallback?: (prog: RebuildProgress) => void): RebuildProgress {
    const state = this.analyticsRepository.getRebuildState();

    let startMs = 0;
    if (state && state.lastProcessedTimestamp) {
      startMs = new Date(state.lastProcessedTimestamp).getTime() + 1;
    }

    const endMs = Date.now() * 2; // Wide future bound
    let rawEvents: any[] = [];
    let fetchUsingRepo = true;
    let errorCount = 0;

    // Fault Isolation: Try fetching via approved repository interface.
    // If a corrupted event crashes JSON parsing inside the repository, fall back to row-by-row streaming.
    try {
      rawEvents = this.eventRepository.findBetween(startMs, endMs);
    } catch (repoErr) {
      console.warn(
        "EventRepository.findBetween failed due to corrupted rows. Falling back to direct database stream...",
        repoErr,
      );
      fetchUsingRepo = false;
      const stmt = this.db.prepare(`
        SELECT * FROM events 
        WHERE timestamp >= ? AND timestamp <= ? 
        ORDER BY timestamp ASC
      `);
      rawEvents = stmt.all(startMs, endMs);
    }

    const events: AkiraEvent[] = [];

    if (fetchUsingRepo) {
      for (const ev of rawEvents) {
        events.push(ev);
      }
    } else {
      // Map rows manually with individual row fault-tolerance
      for (const row of rawEvents) {
        try {
          const payload = JSON.parse(row.payload_json);
          const metadata = row.metadata_json ? JSON.parse(row.metadata_json) : undefined;

          events.push({
            id: row.id,
            type: row.type,
            source: row.source,
            timestamp: new Date(row.timestamp).toISOString(),
            version: row.version,
            entityId: row.entity_id || undefined,
            actor: row.actor || undefined,
            correlationId: row.correlation_id || undefined,
            payload,
            metadata,
          });
        } catch (err) {
          console.error(`Fault Tolerance: Skipped corrupted event row ID ${row.id}:`, err);
          errorCount++;
        }
      }
    }

    // Sort chronologically by timestamp
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    if (events.length === 0) {
      return {
        totalEventsProcessed: 0,
        datesAggregated: 0,
        projectsAggregated: 0,
        isCompleted: true,
        errorCount,
      };
    }

    const uniqueDates = new Set<string>();
    const uniqueProjects = new Set<string>();

    // Process event-by-event. Isolate envelope formatting failures
    for (const event of events) {
      try {
        if (!event.id || !event.type || !event.timestamp) {
          throw new Error("Malformed event envelope");
        }

        // Collect YYYY-MM-DD date boundaries in UTC for aggregation
        const dateKey = event.timestamp.substring(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
          uniqueDates.add(dateKey);
        }

        const payload = event.payload as any;
        let projId: string | undefined = undefined;
        if (event.type.startsWith("project.")) {
          projId = event.entityId || payload?.id;
        } else {
          projId = event.entityId || payload?.projectId;
        }
        if (projId && typeof projId === "string") {
          uniqueProjects.add(projId);
        }
      } catch (err) {
        console.error(`Fault Tolerance: Failed to pre-process event ${event.id}:`, err);
        errorCount++;
      }
    }

    // Run Daily aggregation pipeline
    let datesAggregated = 0;
    for (const date of uniqueDates) {
      try {
        this.engine.aggregateDay(date);
        datesAggregated++;
      } catch (err) {
        console.error(`Fault Tolerance: Failed to aggregate day ${date}:`, err);
        errorCount++;
      }
    }

    // Run Project aggregation pipeline
    let projectsAggregated = 0;
    for (const projId of uniqueProjects) {
      try {
        this.engine.aggregateProject(projId);
        projectsAggregated++;
      } catch (err) {
        console.error(`Fault Tolerance: Failed to aggregate project ${projId}:`, err);
        errorCount++;
      }
    }

    // Update state to allow incremental resume/recovery
    const lastEvent = events[events.length - 1];
    const newState = {
      lastProcessedEventId: lastEvent.id,
      lastProcessedTimestamp: lastEvent.timestamp,
      lastSuccessfulRebuild: new Date().toISOString(),
      schemaVersion: 1,
    };
    this.analyticsRepository.saveRebuildState(newState);

    const progress: RebuildProgress = {
      totalEventsProcessed: events.length,
      datesAggregated,
      projectsAggregated,
      isCompleted: true,
      errorCount,
    };

    if (progressCallback) {
      progressCallback(progress);
    }

    return progress;
  }
}
