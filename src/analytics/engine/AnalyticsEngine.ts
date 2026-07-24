/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventRepository } from "../../instrumentation/event-store/event-repository";
import { AkiraEvent } from "../../instrumentation/event-types";
import { EventSubscriber } from "../../instrumentation/subscriber";
import { DailyMetrics, ProjectMetrics, HistoricalAggregates } from "../models/types";
import { AnalyticsRepository } from "../repository/AnalyticsRepository";
import { MetricCalculator } from "../metrics/MetricCalculator";
import { clockService } from "../shared/ClockService";
import {
  DailyTaskMetricCalculator,
  DailyNoteMetricCalculator,
  DailyFileMetricCalculator,
  DailySearchMetricCalculator,
  DailySessionMetricCalculator,
  DailyActiveProjectsMetricCalculator,
  ProjectMetricCalculator,
  ProductivityCalculator,
  ActivityCalculator,
  ProjectsCalculator,
  VaultCalculator,
  SearchCalculator,
  SessionsCalculator,
} from "../metrics/calculators";

export class AnalyticsEngine {
  private calculators = new Map<string, MetricCalculator<any>>();
  private schedulerIntervalId: NodeJS.Timeout | null = null;

  constructor(
    private eventRepository: EventRepository,
    private analyticsRepository: AnalyticsRepository,
  ) {
    this.registerDefaultCalculators();
  }

  /**
   * Registers default metric calculators.
   */
  private registerDefaultCalculators(): void {
    // Sprint 1.1 Calculators
    this.registerCalculator(new DailyTaskMetricCalculator());
    this.registerCalculator(new DailyNoteMetricCalculator());
    this.registerCalculator(new DailyFileMetricCalculator());
    this.registerCalculator(new DailySearchMetricCalculator());
    this.registerCalculator(new DailySessionMetricCalculator());
    this.registerCalculator(new DailyActiveProjectsMetricCalculator());
    this.registerCalculator(new ProjectMetricCalculator());

    // Sprint 1.2 Core Calculators
    this.registerCalculator(new ProductivityCalculator());
    this.registerCalculator(new ActivityCalculator());
    this.registerCalculator(new ProjectsCalculator());
    this.registerCalculator(new VaultCalculator());
    this.registerCalculator(new SearchCalculator());
    this.registerCalculator(new SessionsCalculator());
  }

  /**
   * Registers a new custom metric calculator in the engine.
   */
  registerCalculator(calculator: MetricCalculator<any>): void {
    if (!calculator.name) {
      throw new Error("Metric calculator must have a unique name");
    }
    this.calculators.set(calculator.name, calculator);
  }

  /**
   * Returns all registered calculators.
   */
  getRegisteredCalculators(): MetricCalculator<any>[] {
    return Array.from(this.calculators.values());
  }

  /**
   * Performs daily metrics aggregation for a specific date (YYYY-MM-DD).
   */
  aggregateDay(date: string): void {
    // 1. Calculate boundaries in UTC milliseconds
    const startMs = new Date(`${date}T00:00:00.000Z`).getTime();
    const endMs = new Date(`${date}T23:59:59.999Z`).getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      throw new Error(`Invalid date string provided for day aggregation: ${date}`);
    }

    // 2. Fetch events within the date range
    const events = this.eventRepository.findBetween(startMs, endMs);

    // 3. Reset and run calculators
    for (const calc of this.calculators.values()) {
      // Exclude project-specific calculators from daily columns
      if (calc.name === "project-metric-calculator") continue;

      calc.reset();
      for (const event of events) {
        if (
          calc.supportedEventTypes.includes(event.type) ||
          calc.supportedEventTypes.includes("*")
        ) {
          calc.processEvent(event);
        }
      }
    }

    // 4. Extract derived metrics
    const taskCalc = this.calculators.get("daily-task-metric");
    const noteCalc = this.calculators.get("daily-note-metric");
    const fileCalc = this.calculators.get("daily-file-metric");
    const searchCalc = this.calculators.get("daily-search-metric");
    const sessionCalc = this.calculators.get("daily-session-metric");
    const activeProjectsCalc = this.calculators.get("daily-active-projects-metric");

    const taskResult = taskCalc ? taskCalc.calculate() : { completed: 0, created: 0 };
    const noteResult = noteCalc ? noteCalc.calculate() : 0;
    const fileResult = fileCalc ? fileCalc.calculate() : 0;
    const searchResult = searchCalc ? searchCalc.calculate() : 0;
    const sessionResult = sessionCalc ? sessionCalc.calculate() : 0;
    const activeProjectsResult = activeProjectsCalc ? activeProjectsCalc.calculate() : 0;

    const dailyMetrics: DailyMetrics = {
      date,
      tasksCompleted: taskResult.completed || 0,
      tasksCreated: taskResult.created || 0,
      notesCreated: noteResult || 0,
      filesUploaded: fileResult || 0,
      searches: searchResult || 0,
      sessionDuration: sessionResult || 0,
      activeProjects: activeProjectsResult || 0,
    };

    // 5. Persist daily summary metrics
    this.analyticsRepository.saveDailyMetrics(dailyMetrics);
  }

  /**
   * Performs metrics aggregation for a specific project.
   */
  aggregateProject(projectId: string): void {
    if (!projectId) return;

    // Fetch all events from event store
    // Use wide bounds (epoch to future date) to extract historical context
    const startMs = 0;
    const endMs = Date.now() * 2; // Safeguard for future timestamps

    const events = this.eventRepository.findBetween(startMs, endMs);

    // Filter events associated with the project
    const projectEvents = events.filter((event) => {
      const payload = event.payload as any;
      let eventProjId: string | undefined = undefined;
      if (event.type.startsWith("project.")) {
        eventProjId = event.entityId || payload?.id;
      } else {
        eventProjId = event.entityId || payload?.projectId;
      }
      return eventProjId === projectId;
    });

    const projectCalc = this.calculators.get("project-metric-calculator");
    if (projectCalc) {
      projectCalc.reset();
      for (const event of projectEvents) {
        if (
          projectCalc.supportedEventTypes.includes(event.type) ||
          projectCalc.supportedEventTypes.includes("*")
        ) {
          projectCalc.processEvent(event);
        }
      }

      const summariesMap = projectCalc.calculate() as Map<string, any>;
      const summary = summariesMap.get(projectId);

      if (summary) {
        const metrics: ProjectMetrics = {
          projectId: summary.projectId,
          activityScore: summary.activityScore,
          completionRate: summary.completionRate,
          lastActivity: summary.lastActivity,
        };
        this.analyticsRepository.saveProjectMetrics(metrics);
      } else {
        // Safe default if no events exist but we still want to establish baseline project metrics
        const metrics: ProjectMetrics = {
          projectId,
          activityScore: 0,
          completionRate: 0.0,
          lastActivity: new Date().toISOString(),
        };
        this.analyticsRepository.saveProjectMetrics(metrics);
      }
    }
  }

  /**
   * Scans the Event Store to find all active dates and project IDs, then aggregates everything.
   */
  runFullAggregation(): void {
    const startMs = 0;
    const endMs = Date.now() * 2;
    const events = this.eventRepository.findBetween(startMs, endMs);

    const dates = new Set<string>();
    const projectIds = new Set<string>();

    for (const event of events) {
      // 1. Get YYYY-MM-DD
      const dateStr = event.timestamp.split("T")[0];
      if (dateStr) {
        dates.add(dateStr);
      }

      // 2. Get project_id
      const payload = event.payload as any;
      let projectId: string | undefined = undefined;
      if (event.type.startsWith("project.")) {
        projectId = event.entityId || payload?.id;
      } else {
        projectId = event.entityId || payload?.projectId;
      }
      if (projectId && typeof projectId === "string") {
        projectIds.add(projectId);
      }
    }

    // Process daily aggregations
    for (const date of dates) {
      this.aggregateDay(date);
    }

    // Process project aggregations
    for (const projectId of projectIds) {
      this.aggregateProject(projectId);
    }
  }

  /**
   * Starts a background timer scheduler that runs aggregation regularly.
   */
  startScheduler(intervalMs: number): void {
    if (this.schedulerIntervalId) {
      this.stopScheduler();
    }
    this.schedulerIntervalId = setInterval(() => {
      try {
        this.runFullAggregation();
      } catch (err) {
        console.error("[AnalyticsEngine] Scheduled background aggregation failed:", err);
      }
    }, intervalMs);
  }

  /**
   * Stops the background timer scheduler.
   */
  stopScheduler(): void {
    if (this.schedulerIntervalId) {
      clearInterval(this.schedulerIntervalId);
      this.schedulerIntervalId = null;
    }
  }

  /**
   * Exposes read-only daily metrics service.
   */
  getDailySummary(date: string): DailyMetrics | null {
    return this.analyticsRepository.getDailyMetrics(date);
  }

  /**
   * Exposes read-only project metrics service.
   */
  getProjectSummary(projectId: string): ProjectMetrics | null {
    return this.analyticsRepository.getProjectMetrics(projectId);
  }

  /**
   * Exposes read-only historical aggregates query service.
   */
  getHistoricalAggregates(startDate: string, endDate: string): HistoricalAggregates {
    return this.analyticsRepository.getAggregatedMetrics(startDate, endDate);
  }

  /**
   * Scans the entire Event Store to compile a list of all historically active/known projects.
   */
  discoverAllProjectsFromEventStore(): string[] {
    const startMs = 0;
    const endMs = Date.now() * 2;
    const events = this.eventRepository.findBetween(startMs, endMs);
    const projectIds = new Set<string>();
    for (const event of events) {
      const payload = event.payload as any;
      let projectId: string | undefined = undefined;
      if (event.type.startsWith("project.")) {
        projectId = event.entityId || payload?.id;
      } else {
        projectId = event.entityId || payload?.projectId;
      }
      if (projectId && typeof projectId === "string") {
        projectIds.add(projectId);
      }
    }
    return Array.from(projectIds);
  }

  /**
   * Run all registered calculators over a set of events.
   */
  aggregateEvents(events: AkiraEvent[]): Record<string, any> {
    // 1. Prepare dynamic projects known list if projects calculator is present
    const projectsCalc = this.calculators.get("projects-calculator");
    if (projectsCalc) {
      (projectsCalc as any).allKnownProjectIds = this.discoverAllProjectsFromEventStore();
    }

    const results: Record<string, any> = {};
    for (const calc of this.calculators.values()) {
      calc.reset();
      for (const event of events) {
        if (
          calc.supportedEventTypes.includes(event.type) ||
          calc.supportedEventTypes.includes("*")
        ) {
          calc.processEvent(event);
        }
      }
      results[calc.name] = calc.calculate();
    }
    return results;
  }

  /**
   * Performs daily, weekly, or monthly metrics aggregation over a given period.
   * Groups events into buckets based on the timezone offset (in minutes).
   */
  aggregatePeriod(
    unit: "day" | "week" | "month",
    startDate: string,
    endDate: string,
    timezoneOffsetMinutes = 0,
  ): Map<string, Record<string, any>> {
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      throw new Error(`Invalid date boundary specified for aggregation: ${startDate} - ${endDate}`);
    }

    const events = this.eventRepository.findBetween(startMs, endMs);

    // Group events by local date key
    const buckets = new Map<string, AkiraEvent[]>();
    for (const event of events) {
      const key = clockService.getBucketKey(event.timestamp, timezoneOffsetMinutes, unit);
      let list = buckets.get(key);
      if (!list) {
        list = [];
        buckets.set(key, list);
      }
      list.push(event);
    }

    const aggregatedBuckets = new Map<string, Record<string, any>>();
    for (const [key, bucketEvents] of buckets.entries()) {
      aggregatedBuckets.set(key, this.aggregateEvents(bucketEvents));
    }

    return aggregatedBuckets;
  }
}

/**
 * Event Subscriber implementation for real-time analytics updates.
 */
export class AnalyticsSubscriber implements EventSubscriber {
  readonly id = "analytics-subscriber";

  constructor(private engine: AnalyticsEngine) {}

  onEvent(event: AkiraEvent): void {
    // Process asynchronously to avoid blocking event bus publishers
    setTimeout(() => {
      try {
        const date = event.timestamp.split("T")[0];
        if (date) {
          this.engine.aggregateDay(date);
        }

        const payload = event.payload as any;
        let projectId: string | undefined = undefined;
        if (event.type.startsWith("project.")) {
          projectId = event.entityId || payload?.id;
        } else {
          projectId = event.entityId || payload?.projectId;
        }

        if (projectId && typeof projectId === "string") {
          this.engine.aggregateProject(projectId);
        }
      } catch (err) {
        console.error("[AnalyticsSubscriber] Real-time event consumption failed:", err);
      }
    }, 50);
  }
}
