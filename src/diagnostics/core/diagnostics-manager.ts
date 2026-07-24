import { RuntimeAdapter } from "../interfaces/runtime-adapter";
import { DiagnosticWarning, DiagnosticError, RuntimeReport } from "../core/diagnostics-report";
import { HealthChecker } from "../health/health-checker";
import { PerformanceMonitor } from "../performance/performance-monitor";
import { StartupProfiler } from "../performance/startup-profiler";
import { DiagnosticsExporter } from "../reporting/diagnostics-exporter";
import { DiagnosticsContext } from "../core/diagnostics-context";
import { MetricsCollector } from "../metrics/metrics-collector";
import { EventMetrics } from "../metrics/event-metrics";
import { setInterval } from "timers";

/**
 * DiagnosticsManager orchestrates passive observation of the runtime.
 * It collects metrics, runs health checks, builds reports, and exports them.
 * It never mutates runtime state.
 */
export class DiagnosticsManager {
  private readonly context: DiagnosticsContext;
  private readonly healthChecker: HealthChecker;
  private readonly performanceMonitor: PerformanceMonitor;
  private readonly startupProfiler: StartupProfiler;
  private readonly exporter: DiagnosticsExporter;
  private readonly eventMetrics: EventMetrics;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(runtimeAdapter: RuntimeAdapter) {
    this.context = new DiagnosticsContext(runtimeAdapter);
    this.healthChecker = new HealthChecker();
    this.performanceMonitor = new PerformanceMonitor();
    this.startupProfiler = new StartupProfiler();
    this.exporter = new DiagnosticsExporter();
    this.eventMetrics = new EventMetrics(runtimeAdapter);
    this.subscribeToEvents();
    this.startupProfiler.markStart();
  }

  /** Subscribe to runtime EventBus for passive observation */
  private subscribeToEvents() {
    const bus = (this.context.runtimeAdapter as any).events as any;
    if (bus && typeof bus.subscribe === "function") {
      bus.subscribe("module.lifecycle", (payload: any) =>
        this.eventMetrics.record("module.lifecycle"),
      );
      bus.subscribe("capability.register", () => this.eventMetrics.record("capability.register"));
      bus.subscribe("permission.grant", () => this.eventMetrics.record("permission.grant"));
      bus.subscribe("runtime.error", () => this.eventMetrics.record("runtime.error"));
    }
  }

  /** Start periodic metric collection */
  start(intervalMs: number = 5000) {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.collectAndReport(), intervalMs);
  }

  /** Stop periodic collection */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Perform a full collection cycle and generate a report */
  async collectAndReport() {
    try {
      // Collect metrics from all collectors (simplified to eventMetrics only for now)
      const eventSnapshot = this.eventMetrics.snapshot();
      const uptime = Date.now() - this.context.startTimestamp;
      const report: RuntimeReport = {
        runtimeVersion: this.context.runtimeVersion,
        uptime,
        startupDuration: this.startupProfiler.duration(),
        moduleCount: 0, // placeholder – would be filled via other collectors
        runningModules: 0,
        failedModules: 0,
        capabilities: 0,
        permissions: 0,
        eventsPerSecond: eventSnapshot.eventsPerSecond,
        memoryUsage: process.memoryUsage().heapUsed,
        warnings: [],
        errors: [],
        healthScore: 100,
      };

      // Run health check
      const { warnings, errors, healthScore } = this.healthChecker.evaluate(report);
      report.warnings = warnings;
      report.errors = errors;
      report.healthScore = healthScore;

      // Store snapshot
      this.context.runtimeReport = Object.freeze({ ...report });
      this.context.warnings = warnings;
      this.context.errors = errors;

      // Export report (JSON for now)
      await this.exporter.export(report, "json");
    } catch (e) {
      // Translate any unexpected error
      const err = new DiagnosticError();
    }
  }
}
