/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDatabaseConnection } from "../../persistence/connection";
import { EventRepository } from "../../instrumentation/event-store/event-repository";
import { SqliteEventRepository } from "../../instrumentation/event-store/sqlite-event-repository";
import { AnalyticsRepository } from "../repository/AnalyticsRepository";
import { SqliteAnalyticsRepository } from "../repository/SqliteAnalyticsRepository";
import { AkiraEvent } from "../../instrumentation/event-types";
import { clockService } from "../shared/ClockService";
import {
  DashboardSummaryDTO,
  ProductivitySummaryDTO,
  ProjectHealthDTO,
  SearchInsightsDTO,
  SessionStatisticsDTO,
  ActivityTimelineDTO,
} from "./dto";
import { AnalyticsQueryFilters } from "./filters";
import {
  ProductivityCalculator,
  ActivityCalculator,
  ProjectsCalculator,
  VaultCalculator,
  SearchCalculator,
  SessionsCalculator,
} from "../metrics/calculators";

export class QueryService {
  private eventRepository: EventRepository;
  private analyticsRepository: AnalyticsRepository;
  private eventScanCache = new Map<string, AkiraEvent[]>();

  constructor(eventRepo?: EventRepository, analyticsRepo?: AnalyticsRepository) {
    const db = getDatabaseConnection();
    this.eventRepository = eventRepo || new SqliteEventRepository(db);
    this.analyticsRepository = analyticsRepo || new SqliteAnalyticsRepository(db);
  }

  /**
   * Clears the request-scoped event scan cache.
   */
  clearCache(): void {
    this.eventScanCache.clear();
  }

  /**
   * Helper to filter events based on criteria (projectId, eventType, source).
   */
  filterEvents(events: AkiraEvent[], filters?: AnalyticsQueryFilters): AkiraEvent[] {
    if (!filters) return events;
    return events.filter((e) => {
      if (filters.projectId) {
        const payload = e.payload as any;
        const matchesProjId =
          e.entityId === filters.projectId || payload?.projectId === filters.projectId;
        if (!matchesProjId) return false;
      }
      if (filters.eventType && e.type !== filters.eventType) {
        return false;
      }
      if (filters.module && e.source !== filters.module) {
        return false;
      }
      return true;
    });
  }

  /**
   * Discovers all historically known projects from the Event Store.
   */
  discoverAllProjects(): string[] {
    const events = this.eventRepository.findBetween(0, Date.now() * 2);
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
   * Compiles the dashboard summary from a pre-filtered list of events.
   */
  compileDashboardSummary(events: AkiraEvent[]): DashboardSummaryDTO {
    const prodCalc = new ProductivityCalculator();
    const vaultCalc = new VaultCalculator();
    const actCalc = new ActivityCalculator();

    // Group active projects
    const activeProjects = new Set<string>();

    for (const event of events) {
      if (
        prodCalc.supportedEventTypes.includes(event.type) ||
        prodCalc.supportedEventTypes.includes("*")
      ) {
        prodCalc.processEvent(event);
      }
      if (
        vaultCalc.supportedEventTypes.includes(event.type) ||
        vaultCalc.supportedEventTypes.includes("*")
      ) {
        vaultCalc.processEvent(event);
      }
      if (
        actCalc.supportedEventTypes.includes(event.type) ||
        actCalc.supportedEventTypes.includes("*")
      ) {
        actCalc.processEvent(event);
      }

      const payload = event.payload as any;
      let projId: string | undefined = undefined;
      if (event.type.startsWith("project.")) {
        projId = event.entityId || payload?.id;
      } else {
        projId = event.entityId || payload?.projectId;
      }
      if (projId && typeof projId === "string") {
        activeProjects.add(projId);
      }
    }

    const prod = prodCalc.calculate();
    const vault = vaultCalc.calculate();
    const act = actCalc.calculate();

    // Map duration: convert session.ended focus minutes to seconds
    let totalSessionSecs = 0;
    for (const event of events) {
      if (["session.ended", "session.completed", "session.stopped"].includes(event.type)) {
        const payload = event.payload as any;
        if (payload && typeof payload.duration === "number") {
          totalSessionSecs += payload.duration * 60;
        }
      }
    }

    return {
      productivityScore: prod.productivityScore || 0,
      tasksCompleted: prod.tasksCompleted || 0,
      activeProjects: activeProjects.size,
      sessionDuration: totalSessionSecs,
      storageActivity: vault.storageActivity || 0,
      dailyEvents: act.dailyEvents || 0,
    };
  }

  /**
   * Compiles productivity summary from events.
   */
  compileProductivitySummary(events: AkiraEvent[]): ProductivitySummaryDTO {
    const calc = new ProductivityCalculator();
    for (const event of events) {
      if (calc.supportedEventTypes.includes(event.type) || calc.supportedEventTypes.includes("*")) {
        calc.processEvent(event);
      }
    }
    const res = calc.calculate();
    return {
      completionRate: res.completionRate,
      tasksCreated: res.tasksCreated,
      tasksCompleted: res.tasksCompleted,
      reopenedTasks: res.reopenedTasks,
      productivityScore: res.productivityScore,
    };
  }

  /**
   * Compiles project health for a specific project.
   */
  compileProjectHealth(projectId: string, rangeEvents: AkiraEvent[]): ProjectHealthDTO {
    const allKnown = this.discoverAllProjects();
    const isDormant = !rangeEvents.some((e) => {
      const payload = e.payload as any;
      const id = e.entityId || payload?.projectId;
      return id === projectId;
    });

    const calc = new ProjectsCalculator(allKnown);
    for (const event of rangeEvents) {
      if (calc.supportedEventTypes.includes(event.type) || calc.supportedEventTypes.includes("*")) {
        calc.processEvent(event);
      }
    }
    const summary = calc.calculate();
    const detail = summary.projectDetails.find((d) => d.projectId === projectId);

    return {
      projectId,
      activityScore: detail?.activityScore || 0,
      completionPercentage: detail?.completionPercentage || 0,
      lastActivity: detail?.lastActivity || new Date().toISOString(),
      dormant: isDormant && allKnown.includes(projectId),
    };
  }

  /**
   * Compiles search insights from events.
   */
  compileSearchInsights(events: AkiraEvent[]): SearchInsightsDTO {
    const calc = new SearchCalculator();
    for (const event of events) {
      if (calc.supportedEventTypes.includes(event.type) || calc.supportedEventTypes.includes("*")) {
        calc.processEvent(event);
      }
    }
    return calc.calculate();
  }

  /**
   * Compiles session statistics from events.
   */
  compileSessionStatistics(events: AkiraEvent[]): SessionStatisticsDTO {
    const calc = new SessionsCalculator();
    for (const event of events) {
      if (calc.supportedEventTypes.includes(event.type) || calc.supportedEventTypes.includes("*")) {
        calc.processEvent(event);
      }
    }
    return calc.calculate();
  }

  /**
   * Compiles activity timeline and streak details.
   */
  compileActivityTimeline(
    events: AkiraEvent[],
    timezoneOffsetMinutes: number,
  ): ActivityTimelineDTO {
    const calc = new ActivityCalculator(timezoneOffsetMinutes);
    const dateCounts = new Map<string, number>();

    for (const event of events) {
      if (calc.supportedEventTypes.includes(event.type) || calc.supportedEventTypes.includes("*")) {
        calc.processEvent(event);
      }

      // Local YYYY-MM-DD grouping
      const dateKey = clockService.getBucketKey(event.timestamp, timezoneOffsetMinutes, "day");
      dateCounts.set(dateKey, (dateCounts.get(dateKey) || 0) + 1);
    }

    const timeline = Array.from(dateCounts.entries())
      .map(([date, eventCount]) => ({ date, eventCount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const summary = calc.calculate();

    return {
      activeDays: summary.activeDays,
      activityStreak: summary.activityStreak,
      peakActivityHour: summary.peakActivityHour,
      timeline,
    };
  }

  /**
   * Core execution query handler.
   * Resolves, filters, and runs calculations on event logs.
   */
  executeQuery<T>(
    startDate: string,
    endDate: string,
    filters: AnalyticsQueryFilters | undefined,
    compiler: (events: AkiraEvent[]) => T,
  ): T {
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();

    // Optimize: Check local short-lived request cache for identical date ranges
    const cacheKey = `${startMs}-${endMs}`;
    let rawEvents = this.eventScanCache.get(cacheKey);
    if (!rawEvents) {
      rawEvents = this.eventRepository.findBetween(startMs, endMs);
      this.eventScanCache.set(cacheKey, rawEvents);
    }

    // Apply filters
    const filteredEvents = this.filterEvents(rawEvents, filters);

    // Process results
    return compiler(filteredEvents);
  }
}
