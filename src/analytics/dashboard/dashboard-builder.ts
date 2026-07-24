import { AnalyticsService } from "../service/analytics-service";
import { AnalyticsQueryOptions } from "../service/filters";
import { validateAndResolveQuery } from "../service/validation";
import { DashboardDTO } from "./dashboard-dto";
import { ProjectHealthDTO } from "../service/dto";

export class DashboardBuilder {
  constructor(private analyticsService: AnalyticsService) {}

  /**
   * Orchestrates the construction of a complete DashboardDTO.
   * Leverages existing AnalyticsService methods and maps widgets.
   */
  build(options?: AnalyticsQueryOptions): DashboardDTO {
    const opts = options || { range: "last30Days" };

    // 1. Resolve current and previous date range boundaries
    const resolved = validateAndResolveQuery(opts);
    const startMs = new Date(resolved.startDate).getTime();
    const endMs = new Date(resolved.endDate).getTime();

    // Previous period of equal duration
    const durationMs = endMs - startMs;
    const prevStart = new Date(startMs - durationMs - 1).toISOString();
    const prevEnd = new Date(startMs - 1).toISOString();

    const prevOpts: AnalyticsQueryOptions = {
      range: "custom",
      startDate: prevStart,
      endDate: prevEnd,
      filters: opts.filters,
    };

    // 2. Fetch metrics via AnalyticsService facade
    const summary = this.analyticsService.getDashboardSummary(opts);
    const productivity = this.analyticsService.getProductivitySummary(opts);
    const activity = this.analyticsService.getActivityTimeline(opts);
    const activeProjects = this.analyticsService.getActiveProjects(opts);
    const dormantProjects = this.analyticsService.getDormantProjects(opts);
    const search = this.analyticsService.getSearchInsights(opts);
    const sessions = this.analyticsService.getSessionStatistics(opts);

    // Trend metrics
    const productivityTrend = this.analyticsService.getProductivityTrend(opts);
    const uploadHistory = this.analyticsService.getUploadHistory(opts);

    // Fetch previous period productivity to compute delta
    const prevProductivity = this.analyticsService.getProductivitySummary(prevOpts);
    const delta = productivity.productivityScore - prevProductivity.productivityScore;

    // 3. Compile project health details
    const projectDetails: ProjectHealthDTO[] = activeProjects.map((projectId) =>
      this.analyticsService.getProjectHealth(projectId, opts),
    );

    // 4. Construct Widget projections
    const totalFilesUploaded = uploadHistory.reduce((sum, d) => sum + d.filesUploaded, 0);

    const topProjects = [...projectDetails]
      .sort((a, b) => b.activityScore - a.activityScore)
      .slice(0, 3)
      .map((d) => ({ projectId: d.projectId, activityScore: d.activityScore }));

    return {
      summary,
      productivity,
      activity,
      projects: {
        activeProjects,
        dormantProjects,
        projectDetails,
      },
      vault: {
        storageActivity: summary.storageActivity,
        uploadHistory,
      },
      search,
      sessions,
      widgets: {
        productivity: {
          title: "Productivity Index",
          score: productivity.productivityScore,
          trend: productivityTrend,
          delta,
        },
        activity: {
          activeDays: activity.activeDays,
          streak: activity.activityStreak,
          peakHour: activity.peakActivityHour,
        },
        projects: {
          activeProjects: activeProjects.length,
          dormantProjects: dormantProjects.length,
          topProjects,
        },
        vault: {
          uploadedFiles: totalFilesUploaded,
          uploadedBytes: summary.storageActivity,
        },
        search: {
          searches: search.searchesExecuted,
          topQueries: search.mostCommonQueries,
        },
        sessions: {
          sessions: sessions.sessionCount,
          averageDuration: sessions.averageDuration,
        },
      },
    };
  }
}
