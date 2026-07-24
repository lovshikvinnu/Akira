import { AnalyticsValidator, DiagnosticResult } from "./analytics-validator";
import { ConsistencyChecker, ConsistencyReport } from "./consistency-checker";
import { AnalyticsRepository } from "../repository/AnalyticsRepository";
import { SqliteAnalyticsRepository } from "../repository/SqliteAnalyticsRepository";

export interface AnalyticsHealthReport {
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  schemaValid: boolean;
  consistent: boolean;
  databaseDiagnostics: DiagnosticResult;
  consistencyDetails: ConsistencyReport;
}

export class DiagnosticsService {
  private validator: AnalyticsValidator;
  private checker: ConsistencyChecker;
  private repo: AnalyticsRepository;

  constructor(
    validator?: AnalyticsValidator,
    checker?: ConsistencyChecker,
    repo?: AnalyticsRepository,
  ) {
    this.validator = validator || new AnalyticsValidator();
    this.checker = checker || new ConsistencyChecker();
    this.repo = repo || new SqliteAnalyticsRepository();
  }

  /**
   * Retrieves overall operations health report by validating schema and matching Event Store logs.
   */
  getAnalyticsHealth(): AnalyticsHealthReport {
    const dbDiag = this.validator.validateDatabase();
    const consistency = this.checker.checkConsistency();

    let status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" = "HEALTHY";
    if (!dbDiag.isValid) {
      status = "UNHEALTHY";
    } else if (!consistency.isConsistent) {
      status = "DEGRADED";
    }

    return {
      status,
      schemaValid: dbDiag.isValid,
      consistent: consistency.isConsistent,
      databaseDiagnostics: dbDiag,
      consistencyDetails: consistency,
    };
  }

  /**
   * Retrieves the current incremental rebuild metadata record.
   */
  getRebuildStatus() {
    const state = this.repo.getRebuildState();
    return {
      lastProcessedEventId: state?.lastProcessedEventId || null,
      lastProcessedTimestamp: state?.lastProcessedTimestamp || null,
      lastSuccessfulRebuild: state?.lastSuccessfulRebuild || null,
      schemaVersion: state?.schemaVersion || 1,
    };
  }

  /**
   * Returns details of metric inconsistencies.
   */
  getConsistencyReport(): ConsistencyReport {
    return this.checker.checkConsistency();
  }

  /**
   * Generates a performance snapshot outline.
   */
  getPerformanceSnapshot() {
    return {
      targetLimits: {
        latencyThresholdMs: 150,
        expectedScaleLinearity: "O(N)",
      },
      diagnosticsTimestamp: new Date().toISOString(),
    };
  }
}

export const diagnosticsService = new DiagnosticsService();
