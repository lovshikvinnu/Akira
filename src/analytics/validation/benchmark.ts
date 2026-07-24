import { getDatabaseConnection } from "../../persistence/connection";
import { SqliteEventRepository } from "../../instrumentation/event-store/sqlite-event-repository";
import { SqliteAnalyticsRepository } from "../repository/SqliteAnalyticsRepository";
import { RebuildManager } from "./rebuild-manager";
import { DashboardService } from "../dashboard/dashboard-service";
import { AnalyticsService } from "../service/analytics-service";

export interface BenchmarkResult {
  eventCount: number;
  rebuildDurationMs: number;
  throughputEventsPerSec: number;
  memoryDeltaMb: number;
  dashboardLatencyMs: number;
}

export class BenchmarkRunner {
  /**
   * Runs complete operational scale benchmarks for a specified event volume.
   */
  runBenchmark(eventCount: number): BenchmarkResult {
    const db = getDatabaseConnection();
    db.prepare("DELETE FROM events").run();
    db.prepare("DELETE FROM daily_metrics").run();
    db.prepare("DELETE FROM project_metrics").run();
    db.prepare("DELETE FROM analytics_state").run();

    const eventRepo = new SqliteEventRepository(db);
    const analyticsRepo = new SqliteAnalyticsRepository(db);
    const rebuildManager = new RebuildManager(eventRepo, analyticsRepo);
    const service = new AnalyticsService(undefined, undefined);
    const dashboardService = new DashboardService(service);

    // 1. Seed events using prepared statements in a single transaction for speed
    const insertStmt = db.prepare(`
      INSERT INTO events (id, type, source, timestamp, version, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const baseTime = new Date("2026-07-19T00:00:00.000Z").getTime();

    // Seed events batch
    db.transaction(() => {
      for (let i = 0; i < eventCount; i++) {
        // Distribute events across 5 days to test range buckets
        const offsetDay = i % 5;
        const eventTime = new Date(
          baseTime + offsetDay * 24 * 60 * 60 * 1000 + (i % 86400) * 1000,
        ).toISOString();

        let type = "task.created";
        if (i % 4 === 1) type = "task.completed";
        else if (i % 4 === 2) type = "note.created";
        else if (i % 4 === 3) type = "search.executed";

        insertStmt.run(
          `bench-evt-${i}`,
          type,
          "benchmark",
          eventTime,
          1,
          JSON.stringify({ id: `item-${i}`, query: `query-${i}`, projectId: `proj-${i % 3}` }),
        );
      }
    })();

    // 2. Measure Rebuild
    const memStart = process.memoryUsage().heapUsed;
    const startMs = Date.now();

    rebuildManager.rebuildAll();

    const rebuildMs = Date.now() - startMs;
    const memEnd = process.memoryUsage().heapUsed;
    const memDiffMb = parseFloat(((memEnd - memStart) / 1024 / 1024).toFixed(4));

    const throughput = parseFloat((eventCount / (rebuildMs / 1000)).toFixed(2));

    // 3. Measure Dashboard Query Latency
    // Call clearCache on service to make sure it runs fresh executeQuery
    service.clearCache();
    const dashStart = Date.now();
    dashboardService.getDashboard({
      range: "custom",
      startDate: new Date(baseTime).toISOString(),
      endDate: new Date(baseTime + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const dashMs = Date.now() - dashStart;

    return {
      eventCount,
      rebuildDurationMs: rebuildMs,
      throughputEventsPerSec: isFinite(throughput) ? throughput : eventCount * 1000,
      memoryDeltaMb: memDiffMb,
      dashboardLatencyMs: dashMs,
    };
  }
}
export const benchmarkRunner = new BenchmarkRunner();
