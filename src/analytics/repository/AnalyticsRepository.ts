import { DailyMetrics, ProjectMetrics, HistoricalAggregates } from "../models/types";

export interface AnalyticsRepository {
  /**
   * Saves or updates derived metrics for a specific date.
   */
  saveDailyMetrics(metrics: DailyMetrics): void;

  /**
   * Retrieves daily metrics for a specific date.
   * Returns null if no metrics exist for that date.
   */
  getDailyMetrics(date: string): DailyMetrics | null;

  /**
   * Retrieves a range of daily metrics inclusive of start and end dates.
   */
  getDailyMetricsRange(startDate: string, endDate: string): DailyMetrics[];

  /**
   * Saves or updates derived metrics for a specific project.
   */
  saveProjectMetrics(metrics: ProjectMetrics): void;

  /**
   * Retrieves metrics for a specific project.
   * Returns null if no metrics exist for that project.
   */
  getProjectMetrics(projectId: string): ProjectMetrics | null;

  /**
   * Retrieves metrics for all projects.
   */
  getAllProjectMetrics(): ProjectMetrics[];

  /**
   * Computes historical aggregate summaries across a date range.
   */
  getAggregatedMetrics(startDate: string, endDate: string): HistoricalAggregates;

  /**
   * Retrieves the persisted rebuild state metadata.
   */
  getRebuildState(): {
    lastProcessedEventId: string | null;
    lastProcessedTimestamp: string | null;
    lastSuccessfulRebuild: string | null;
    schemaVersion: number;
  } | null;

  /**
   * Saves or updates the rebuild state metadata.
   */
  saveRebuildState(state: {
    lastProcessedEventId: string | null;
    lastProcessedTimestamp: string | null;
    lastSuccessfulRebuild: string | null;
    schemaVersion: number;
  }): void;
}
