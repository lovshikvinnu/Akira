/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDatabaseConnection } from "../../persistence/connection";
import { AnalyticsRepository } from "../repository/AnalyticsRepository";
import { SqliteAnalyticsRepository } from "../repository/SqliteAnalyticsRepository";
import { DashboardDTO } from "../dashboard/dashboard-dto";

export interface DiagnosticIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
  context: any;
}

export interface DiagnosticResult {
  isValid: boolean;
  errors: DiagnosticIssue[];
}

export class AnalyticsValidator {
  private analyticsRepository: AnalyticsRepository;
  private db: any;

  constructor(analyticsRepo?: AnalyticsRepository) {
    this.db = getDatabaseConnection();
    this.analyticsRepository = analyticsRepo || new SqliteAnalyticsRepository(this.db);
  }

  /**
   * Run structural diagnostics checks on the derived analytics SQLite tables.
   */
  validateDatabase(): DiagnosticResult {
    const errors: DiagnosticIssue[] = [];

    // 1. Check schema columns compatibility
    try {
      const dailyColumns = this.db.prepare("PRAGMA table_info(daily_metrics)").all() as any[];
      const expectedDaily = [
        "date",
        "tasks_completed",
        "tasks_created",
        "notes_created",
        "files_uploaded",
        "searches",
        "session_duration",
        "active_projects",
      ];
      for (const col of expectedDaily) {
        if (!dailyColumns.some((c) => c.name === col)) {
          errors.push({
            code: "SCHEMA_MISMATCH_DAILY",
            message: `Column '${col}' is missing in 'daily_metrics' table`,
            severity: "error",
            context: dailyColumns,
          });
        }
      }

      const projectColumns = this.db.prepare("PRAGMA table_info(project_metrics)").all() as any[];
      const expectedProject = ["project_id", "activity_score", "completion_rate", "last_activity"];
      for (const col of expectedProject) {
        if (!projectColumns.some((c) => c.name === col)) {
          errors.push({
            code: "SCHEMA_MISMATCH_PROJECT",
            message: `Column '${col}' is missing in 'project_metrics' table`,
            severity: "error",
            context: projectColumns,
          });
        }
      }
    } catch (err: any) {
      errors.push({
        code: "SCHEMA_QUERY_FAILED",
        message: `Failed to query schema diagnostics: ${err.message}`,
        severity: "error",
        context: err,
      });
      return { isValid: false, errors };
    }

    // 2. Scan daily metrics for negative counters and invalid date formats
    try {
      const dailyRecords = this.db.prepare("SELECT * FROM daily_metrics").all() as any[];
      for (const row of dailyRecords) {
        // Date format check (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
          errors.push({
            code: "INVALID_DATE_BUCKET",
            message: `Date key '${row.date}' does not match standard YYYY-MM-DD pattern`,
            severity: "error",
            context: row,
          });
        }

        // Negative counters checks
        const counters = [
          "tasks_completed",
          "tasks_created",
          "notes_created",
          "files_uploaded",
          "searches",
          "session_duration",
          "active_projects",
        ];
        for (const countKey of counters) {
          if (row[countKey] < 0) {
            errors.push({
              code: "NEGATIVE_COUNTER",
              message: `Daily metrics for ${row.date} contains negative counter value in ${countKey}: ${row[countKey]}`,
              severity: "error",
              context: row,
            });
          }
        }
      }
    } catch (err: any) {
      errors.push({
        code: "DAILY_SCAN_FAILED",
        message: `Failed to scan daily metrics rows: ${err.message}`,
        severity: "error",
        context: err,
      });
    }

    // 3. Scan project metrics for invalid bounds
    try {
      const projectRecords = this.db.prepare("SELECT * FROM project_metrics").all() as any[];
      for (const row of projectRecords) {
        if (row.completion_rate < 0 || row.completion_rate > 1.0) {
          errors.push({
            code: "INVALID_COMPLETION_RATE",
            message: `Project ${row.project_id} completion rate is out of bounds [0.0, 1.0]: ${row.completion_rate}`,
            severity: "error",
            context: row,
          });
        }
        if (row.activity_score < 0) {
          errors.push({
            code: "NEGATIVE_ACTIVITY_SCORE",
            message: `Project ${row.project_id} activity score is negative: ${row.activity_score}`,
            severity: "error",
            context: row,
          });
        }
      }
    } catch (err: any) {
      errors.push({
        code: "PROJECT_SCAN_FAILED",
        message: `Failed to scan project metrics rows: ${err.message}`,
        severity: "error",
        context: err,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Performs runtime structural validation on compiled DashboardDTO shapes.
   */
  validateDashboardDTO(dto: DashboardDTO): DiagnosticResult {
    const errors: DiagnosticIssue[] = [];

    const validateProps = (obj: any, path: string, props: string[]) => {
      if (!obj) {
        errors.push({
          code: "MISSING_SECTION",
          message: `Dashboard DTO section '${path}' is completely missing or empty`,
          severity: "error",
          context: obj,
        });
        return;
      }
      for (const prop of props) {
        if (obj[prop] === undefined) {
          errors.push({
            code: "MISSING_PROPERTY",
            message: `Dashboard DTO property '${path}.${prop}' is undefined`,
            severity: "error",
            context: obj,
          });
        }
      }
    };

    // Root sections
    validateProps(dto, "root", [
      "summary",
      "productivity",
      "activity",
      "projects",
      "vault",
      "search",
      "sessions",
      "widgets",
    ]);

    if (dto.summary) {
      validateProps(dto.summary, "summary", [
        "productivityScore",
        "tasksCompleted",
        "activeProjects",
        "sessionDuration",
        "storageActivity",
        "dailyEvents",
      ]);
    }

    if (dto.widgets) {
      validateProps(dto.widgets, "widgets", [
        "productivity",
        "activity",
        "projects",
        "vault",
        "search",
        "sessions",
      ]);

      if (dto.widgets.productivity) {
        validateProps(dto.widgets.productivity, "widgets.productivity", [
          "title",
          "score",
          "trend",
          "delta",
        ]);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
