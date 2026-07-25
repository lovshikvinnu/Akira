import { getDatabaseConnection } from "../../persistence/connection";
import { SqliteEventRepository } from "../../instrumentation/event-store/sqlite-event-repository";
import { SqliteAnalyticsRepository } from "../repository/SqliteAnalyticsRepository";
import { AnalyticsEngine } from "../engine/AnalyticsEngine";
import { QueryService } from "./query-service";
import { AnalyticsQueryOptions } from "./filters";
import { validateAndResolveQuery } from "./validation";
import {
  DashboardSummaryDTO,
  ProductivitySummaryDTO,
  ProjectHealthDTO,
  SearchInsightsDTO,
  SessionStatisticsDTO,
  ActivityTimelineDTO,
} from "./dto";
import {
  ProductivityCalculator,
  ActivityCalculator,
  ProjectsCalculator,
  VaultCalculator,
  SearchCalculator,
  SessionsCalculator,
} from "../metrics/calculators";

export class AnalyticsService {
  private queryService: QueryService;
  private engine: AnalyticsEngine;

  constructor(queryService?: QueryService, engine?: AnalyticsEngine) {
    const db = getDatabaseConnection();
    const eventRepo = new SqliteEventRepository(db);
    const analyticsRepo = new SqliteAnalyticsRepository(db);

    this.engine = engine || new AnalyticsEngine(eventRepo, analyticsRepo);
    this.queryService = queryService || new QueryService(eventRepo, analyticsRepo);
  }

  // ==========================================
  // DASHBOARD APIS
  // ==========================================

  getDashboardSummary(options?: AnalyticsQueryOptions): DashboardSummaryDTO {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    return this.queryService.executeQuery(
      resolved.startDate,
      resolved.endDate,
      opts.filters,
      (events) => this.queryService.compileDashboardSummary(events),
    );
  }

  getTodaySummary(timezoneOffset = 0): DashboardSummaryDTO {
    return this.getDashboardSummary({ range: "today", filters: { timezone: timezoneOffset } });
  }

  getWeekSummary(timezoneOffset = 0): DashboardSummaryDTO {
    return this.getDashboardSummary({ range: "last7Days", filters: { timezone: timezoneOffset } });
  }

  getMonthSummary(timezoneOffset = 0): DashboardSummaryDTO {
    return this.getDashboardSummary({ range: "last30Days", filters: { timezone: timezoneOffset } });
  }

  // ==========================================
  // PRODUCTIVITY APIS
  // ==========================================

  getProductivitySummary(options?: AnalyticsQueryOptions): ProductivitySummaryDTO {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    return this.queryService.executeQuery(
      resolved.startDate,
      resolved.endDate,
      opts.filters,
      (events) => this.queryService.compileProductivitySummary(events),
    );
  }

  getCompletionRate(options?: AnalyticsQueryOptions): number {
    const summary = this.getProductivitySummary(options);
    return summary.completionRate;
  }

  getProductivityTrend(
    options?: AnalyticsQueryOptions,
  ): { date: string; productivityScore: number }[] {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    const trends: { date: string; productivityScore: number }[] = [];
    const periodResults = this.engine.aggregatePeriod(
      "day",
      resolved.startDate,
      resolved.endDate,
      resolved.timezoneOffsetMinutes,
    );

    for (const [date, metricsMap] of periodResults.entries()) {
      const prod = metricsMap["productivity-calculator"];
      trends.push({
        date,
        productivityScore: prod?.productivityScore || 0,
      });
    }

    return trends.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ==========================================
  // PROJECTS APIS
  // ==========================================

  getActiveProjects(options?: AnalyticsQueryOptions): string[] {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    return this.queryService.executeQuery(
      resolved.startDate,
      resolved.endDate,
      opts.filters,
      (events) => {
        const active = new Set<string>();
        for (const event of events) {
          const payload = event.payload as any;
          let projId: string | undefined = undefined;
          if (event.type.startsWith("project.")) {
            projId = event.entityId || payload?.id;
          } else {
            projId = event.entityId || payload?.projectId;
          }
          if (projId && typeof projId === "string") {
            active.add(projId);
          }
        }
        return Array.from(active);
      },
    );
  }

  getDormantProjects(options?: AnalyticsQueryOptions): string[] {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    return this.queryService.executeQuery(
      resolved.startDate,
      resolved.endDate,
      opts.filters,
      (events) => {
        const allKnown = this.queryService.discoverAllProjects();
        const calc = new ProjectsCalculator(allKnown);
        for (const event of events) {
          calc.processEvent(event);
        }
        return calc.calculate().dormantProjects;
      },
    );
  }

  getProjectHealth(projectId: string, options?: AnalyticsQueryOptions): ProjectHealthDTO {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    return this.queryService.executeQuery(
      resolved.startDate,
      resolved.endDate,
      opts.filters,
      (events) => this.queryService.compileProjectHealth(projectId, events),
    );
  }

  getProjectActivity(
    options?: AnalyticsQueryOptions,
  ): { projectId: string; activityScore: number }[] {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    return this.queryService.executeQuery(
      resolved.startDate,
      resolved.endDate,
      opts.filters,
      (events) => {
        const allKnown = this.queryService.discoverAllProjects();
        const calc = new ProjectsCalculator(allKnown);
        for (const event of events) {
          calc.processEvent(event);
        }
        return calc.calculate().projectDetails.map((detail) => ({
          projectId: detail.projectId,
          activityScore: detail.activityScore,
        }));
      },
    );
  }

  // ==========================================
  // ACTIVITY APIS
  // ==========================================

  getActivityTimeline(options?: AnalyticsQueryOptions): ActivityTimelineDTO {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    return this.queryService.executeQuery(
      resolved.startDate,
      resolved.endDate,
      opts.filters,
      (events) => this.queryService.compileActivityTimeline(events, resolved.timezoneOffsetMinutes),
    );
  }

  getPeakHours(options?: AnalyticsQueryOptions): number {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    return this.queryService.executeQuery(
      resolved.startDate,
      resolved.endDate,
      opts.filters,
      (events) => {
        const calc = new ActivityCalculator(resolved.timezoneOffsetMinutes);
        for (const event of events) {
          calc.processEvent(event);
        }
        return calc.calculate().peakActivityHour;
      },
    );
  }

  getActivityStreak(options?: AnalyticsQueryOptions): number {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    return this.queryService.executeQuery(
      resolved.startDate,
      resolved.endDate,
      opts.filters,
      (events) => {
        const calc = new ActivityCalculator(resolved.timezoneOffsetMinutes);
        for (const event of events) {
          calc.processEvent(event);
        }
        return calc.calculate().activityStreak;
      },
    );
  }

  // ==========================================
  // VAULT APIS
  // ==========================================

  getStorageActivity(options?: AnalyticsQueryOptions): number {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    return this.queryService.executeQuery(
      resolved.startDate,
      resolved.endDate,
      opts.filters,
      (events) => {
        const calc = new VaultCalculator();
        for (const event of events) {
          calc.processEvent(event);
        }
        return calc.calculate().storageActivity;
      },
    );
  }

  getUploadHistory(
    options?: AnalyticsQueryOptions,
  ): { date: string; filesUploaded: number; sizeBytes: number }[] {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    const history: { date: string; filesUploaded: number; sizeBytes: number }[] = [];
    const periodResults = this.engine.aggregatePeriod(
      "day",
      resolved.startDate,
      resolved.endDate,
      resolved.timezoneOffsetMinutes,
    );

    for (const [date, metricsMap] of periodResults.entries()) {
      const vault = metricsMap["vault-calculator"];
      history.push({
        date,
        filesUploaded: vault?.filesUploaded || 0,
        sizeBytes: vault?.storageActivity || 0,
      });
    }

    return history.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ==========================================
  // SEARCH APIS
  // ==========================================

  getSearchInsights(options?: AnalyticsQueryOptions): SearchInsightsDTO {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    return this.queryService.executeQuery(
      resolved.startDate,
      resolved.endDate,
      opts.filters,
      (events) => this.queryService.compileSearchInsights(events),
    );
  }

  getMostCommonQueries(options?: AnalyticsQueryOptions): { query: string; count: number }[] {
    const insights = this.getSearchInsights(options);
    return insights.mostCommonQueries;
  }

  // ==========================================
  // SESSIONS APIS
  // ==========================================

  getSessionStatistics(options?: AnalyticsQueryOptions): SessionStatisticsDTO {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    return this.queryService.executeQuery(
      resolved.startDate,
      resolved.endDate,
      opts.filters,
      (events) => this.queryService.compileSessionStatistics(events),
    );
  }

  getFocusStatistics(
    options?: AnalyticsQueryOptions,
  ): { date: string; sessionCount: number; totalDuration: number }[] {
    const opts = options || { range: "last30Days" };
    const resolved = validateAndResolveQuery(opts);

    const stats: { date: string; sessionCount: number; totalDuration: number }[] = [];
    const periodResults = this.engine.aggregatePeriod(
      "day",
      resolved.startDate,
      resolved.endDate,
      resolved.timezoneOffsetMinutes,
    );

    for (const [date, metricsMap] of periodResults.entries()) {
      const sess = metricsMap["sessions-calculator"];
      stats.push({
        date,
        sessionCount: sess?.sessionCount || 0,
        totalDuration: sess?.totalDuration || 0,
      });
    }

    return stats.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Resets short-lived request-scoped query cache to ensure fresh data fetching.
   */
  clearCache(): void {
    this.queryService.clearCache();
  }
}
export const analyticsService = new AnalyticsService();
