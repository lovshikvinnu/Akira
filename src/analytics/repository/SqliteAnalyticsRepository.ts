/* eslint-disable @typescript-eslint/no-explicit-any */
if (typeof window !== "undefined") {
  throw new Error(
    "analytics/repository/SqliteAnalyticsRepository.ts must only be loaded on the server side.",
  );
}

import { Database } from "better-sqlite3";
import { getDatabaseConnection } from "../../persistence/connection";
import { DailyMetrics, ProjectMetrics, HistoricalAggregates } from "../models/types";
import { AnalyticsRepository } from "./AnalyticsRepository";

export class SqliteAnalyticsRepository implements AnalyticsRepository {
  private db: Database;

  constructor(db?: Database) {
    this.db = db || getDatabaseConnection();
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS daily_metrics (
          date TEXT PRIMARY KEY,
          tasks_completed INTEGER DEFAULT 0,
          tasks_created INTEGER DEFAULT 0,
          notes_created INTEGER DEFAULT 0,
          files_uploaded INTEGER DEFAULT 0,
          searches INTEGER DEFAULT 0,
          session_duration INTEGER DEFAULT 0,
          active_projects INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS project_metrics (
          project_id TEXT PRIMARY KEY,
          activity_score REAL DEFAULT 0.0,
          completion_rate REAL DEFAULT 0.0,
          last_activity TEXT
        );

        CREATE TABLE IF NOT EXISTS analytics_state (
          id TEXT PRIMARY KEY,
          last_processed_event_id TEXT,
          last_processed_timestamp TEXT,
          last_successful_rebuild TEXT,
          schema_version INTEGER DEFAULT 1
        );

        CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics (date);
        CREATE INDEX IF NOT EXISTS idx_project_metrics_score ON project_metrics (activity_score DESC);
      `);
    })();
  }

  saveDailyMetrics(metrics: DailyMetrics): void {
    const stmt = this.db.prepare(`
      INSERT INTO daily_metrics (
        date, tasks_completed, tasks_created, notes_created, files_uploaded, searches, session_duration, active_projects
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        tasks_completed = excluded.tasks_completed,
        tasks_created = excluded.tasks_created,
        notes_created = excluded.notes_created,
        files_uploaded = excluded.files_uploaded,
        searches = excluded.searches,
        session_duration = excluded.session_duration,
        active_projects = excluded.active_projects
    `);
    stmt.run(
      metrics.date,
      metrics.tasksCompleted,
      metrics.tasksCreated,
      metrics.notesCreated,
      metrics.filesUploaded,
      metrics.searches,
      metrics.sessionDuration,
      metrics.activeProjects,
    );
  }

  getDailyMetrics(date: string): DailyMetrics | null {
    const stmt = this.db.prepare(`SELECT * FROM daily_metrics WHERE date = ?`);
    const row = stmt.get(date) as any;
    if (!row) return null;
    return {
      date: row.date,
      tasksCompleted: row.tasks_completed,
      tasksCreated: row.tasks_created,
      notesCreated: row.notes_created,
      filesUploaded: row.files_uploaded,
      searches: row.searches,
      sessionDuration: row.session_duration,
      activeProjects: row.active_projects,
    };
  }

  getDailyMetricsRange(startDate: string, endDate: string): DailyMetrics[] {
    const stmt = this.db.prepare(`
      SELECT * FROM daily_metrics 
      WHERE date >= ? AND date <= ? 
      ORDER BY date ASC
    `);
    const rows = stmt.all(startDate, endDate) as any[];
    return rows.map((row) => ({
      date: row.date,
      tasksCompleted: row.tasks_completed,
      tasksCreated: row.tasks_created,
      notesCreated: row.notes_created,
      filesUploaded: row.files_uploaded,
      searches: row.searches,
      sessionDuration: row.session_duration,
      activeProjects: row.active_projects,
    }));
  }

  saveProjectMetrics(metrics: ProjectMetrics): void {
    const stmt = this.db.prepare(`
      INSERT INTO project_metrics (
        project_id, activity_score, completion_rate, last_activity
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        activity_score = excluded.activity_score,
        completion_rate = excluded.completion_rate,
        last_activity = excluded.last_activity
    `);
    stmt.run(
      metrics.projectId,
      metrics.activityScore,
      metrics.completionRate,
      metrics.lastActivity,
    );
  }

  getProjectMetrics(projectId: string): ProjectMetrics | null {
    const stmt = this.db.prepare(`SELECT * FROM project_metrics WHERE project_id = ?`);
    const row = stmt.get(projectId) as any;
    if (!row) return null;
    return {
      projectId: row.project_id,
      activityScore: row.activity_score,
      completionRate: row.completion_rate,
      lastActivity: row.last_activity,
    };
  }

  getAllProjectMetrics(): ProjectMetrics[] {
    const stmt = this.db.prepare(`SELECT * FROM project_metrics`);
    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      projectId: row.project_id,
      activityScore: row.activity_score,
      completionRate: row.completion_rate,
      lastActivity: row.last_activity,
    }));
  }

  getAggregatedMetrics(startDate: string, endDate: string): HistoricalAggregates {
    const stmt = this.db.prepare(`
      SELECT 
        SUM(tasks_completed) as total_tasks_completed,
        SUM(tasks_created) as total_tasks_created,
        SUM(notes_created) as total_notes_created,
        SUM(files_uploaded) as total_files_uploaded,
        SUM(searches) as total_searches,
        SUM(session_duration) as total_session_duration,
        AVG(active_projects) as average_active_projects
      FROM daily_metrics
      WHERE date >= ? AND date <= ?
    `);
    const row = stmt.get(startDate, endDate) as any;
    return {
      totalTasksCompleted: row?.total_tasks_completed || 0,
      totalTasksCreated: row?.total_tasks_created || 0,
      totalNotesCreated: row?.total_notes_created || 0,
      totalFilesUploaded: row?.total_files_uploaded || 0,
      totalSearches: row?.total_searches || 0,
      totalSessionDuration: row?.total_session_duration || 0,
      averageActiveProjects: row?.average_active_projects
        ? parseFloat(Number(row.average_active_projects).toFixed(4))
        : 0,
    };
  }

  getRebuildState(): {
    lastProcessedEventId: string | null;
    lastProcessedTimestamp: string | null;
    lastSuccessfulRebuild: string | null;
    schemaVersion: number;
  } | null {
    const row = this.db.prepare("SELECT * FROM analytics_state WHERE id = 'main'").get() as any;
    if (!row) return null;
    return {
      lastProcessedEventId: row.last_processed_event_id,
      lastProcessedTimestamp: row.last_processed_timestamp,
      lastSuccessfulRebuild: row.last_successful_rebuild,
      schemaVersion: row.schema_version,
    };
  }

  saveRebuildState(state: {
    lastProcessedEventId: string | null;
    lastProcessedTimestamp: string | null;
    lastSuccessfulRebuild: string | null;
    schemaVersion: number;
  }): void {
    this.db
      .prepare(
        `
      INSERT INTO analytics_state (id, last_processed_event_id, last_processed_timestamp, last_successful_rebuild, schema_version)
      VALUES ('main', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_processed_event_id = excluded.last_processed_event_id,
        last_processed_timestamp = excluded.last_processed_timestamp,
        last_successful_rebuild = excluded.last_successful_rebuild,
        schema_version = excluded.schema_version
    `,
      )
      .run(
        state.lastProcessedEventId,
        state.lastProcessedTimestamp,
        state.lastSuccessfulRebuild,
        state.schemaVersion,
      );
  }
}
