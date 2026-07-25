import { getDatabaseConnection } from "../../persistence/connection";
import { EventRepository } from "../../instrumentation/event-store/event-repository";
import { SqliteEventRepository } from "../../instrumentation/event-store/sqlite-event-repository";
import { AnalyticsRepository } from "../repository/AnalyticsRepository";
import { SqliteAnalyticsRepository } from "../repository/SqliteAnalyticsRepository";
import { ProjectsCalculator } from "../metrics/calculators";

export interface Mismatch {
  checkType: string;
  identifier: string; // e.g. date or project_id
  expected: any;
  actual: any;
  description: string;
}

export interface ConsistencyReport {
  isConsistent: boolean;
  totalChecksRun: number;
  mismatches: Mismatch[];
}

export class ConsistencyChecker {
  private eventRepository: EventRepository;
  private analyticsRepository: AnalyticsRepository;

  constructor(eventRepo?: EventRepository, analyticsRepo?: AnalyticsRepository) {
    const db = getDatabaseConnection();
    this.eventRepository = eventRepo || new SqliteEventRepository(db);
    this.analyticsRepository = analyticsRepo || new SqliteAnalyticsRepository(db);
  }

  /**
   * Compares all daily and project metrics tables against calculations derived from the Event Store.
   */
  checkConsistency(): ConsistencyReport {
    const mismatches: Mismatch[] = [];
    let totalChecksRun = 0;

    // 1. Verify Daily Metrics
    const allEvents = this.eventRepository.findBetween(0, Date.now() * 2);

    // Group events by YYYY-MM-DD
    const eventsByDate = new Map<string, any[]>();
    for (const event of allEvents) {
      const dateKey = event.timestamp.substring(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        if (!eventsByDate.has(dateKey)) {
          eventsByDate.set(dateKey, []);
        }
        eventsByDate.get(dateKey)!.push(event);
      }
    }

    // Check each day represented in events
    for (const [date, dayEvents] of eventsByDate.entries()) {
      const actual = this.analyticsRepository.getDailyMetrics(date);

      const expectedTasksCompleted = dayEvents.filter((e) => e.type === "task.completed").length;
      const expectedTasksCreated = dayEvents.filter((e) => e.type === "task.created").length;
      const expectedNotesCreated = dayEvents.filter((e) => e.type === "note.created").length;
      const expectedFilesUploaded = dayEvents.filter(
        (e) => e.type === "vault.file.uploaded" || e.type === "file.uploaded",
      ).length;
      const expectedSearches = dayEvents.filter(
        (e) =>
          e.type === "search.executed" ||
          e.type === "search.query" ||
          e.type === "search.performed",
      ).length;

      let expectedSessionDuration = 0;
      for (const e of dayEvents) {
        if (["session.ended", "session.completed", "session.stopped"].includes(e.type)) {
          const payload = e.payload as any;
          if (payload && typeof payload.duration === "number") {
            expectedSessionDuration += payload.duration;
          }
        }
      }

      if (!actual) {
        mismatches.push({
          checkType: "Daily Metrics Record Missing",
          identifier: date,
          expected: "DailyMetrics Object",
          actual: null,
          description: `Derived records for date ${date} are completely missing in daily_metrics`,
        });
        errorCheck();
        continue;
      }

      totalChecksRun++;
      if (actual.tasksCompleted !== expectedTasksCompleted) {
        mismatches.push({
          checkType: "tasks_completed mismatch",
          identifier: date,
          expected: expectedTasksCompleted,
          actual: actual.tasksCompleted,
          description: `Count of task.completed events for ${date} does not match daily_metrics.tasks_completed`,
        });
      }

      totalChecksRun++;
      if (actual.tasksCreated !== expectedTasksCreated) {
        mismatches.push({
          checkType: "tasks_created mismatch",
          identifier: date,
          expected: expectedTasksCreated,
          actual: actual.tasksCreated,
          description: `Count of task.created events for ${date} does not match daily_metrics.tasks_created`,
        });
      }

      totalChecksRun++;
      if (actual.notesCreated !== expectedNotesCreated) {
        mismatches.push({
          checkType: "notes_created mismatch",
          identifier: date,
          expected: expectedNotesCreated,
          actual: actual.notesCreated,
          description: `Count of note.created events for ${date} does not match daily_metrics.notes_created`,
        });
      }

      totalChecksRun++;
      if (actual.filesUploaded !== expectedFilesUploaded) {
        mismatches.push({
          checkType: "files_uploaded mismatch",
          identifier: date,
          expected: expectedFilesUploaded,
          actual: actual.filesUploaded,
          description: `Count of vault file upload events for ${date} does not match daily_metrics.files_uploaded`,
        });
      }

      totalChecksRun++;
      if (actual.searches !== expectedSearches) {
        mismatches.push({
          checkType: "searches mismatch",
          identifier: date,
          expected: expectedSearches,
          actual: actual.searches,
          description: `Count of search query events for ${date} does not match daily_metrics.searches`,
        });
      }

      totalChecksRun++;
      if (actual.sessionDuration !== expectedSessionDuration) {
        mismatches.push({
          checkType: "session_duration mismatch",
          identifier: date,
          expected: expectedSessionDuration,
          actual: actual.sessionDuration,
          description: `Cumulative focus duration minutes for ${date} does not match daily_metrics.session_duration`,
        });
      }
    }

    // 2. Verify Project Metrics
    const projectRecords = this.analyticsRepository.getAllProjectMetrics();

    // Discover all known projects from events
    const projectIds = new Set<string>();
    for (const event of allEvents) {
      const payload = event.payload as any;
      let projId: string | undefined = undefined;
      if (event.type.startsWith("project.")) {
        projId = event.entityId || payload?.id;
      } else {
        projId = event.entityId || payload?.projectId;
      }
      if (projId && typeof projId === "string") {
        projectIds.add(projId);
      }
    }

    const calc = new ProjectsCalculator(Array.from(projectIds));
    for (const event of allEvents) {
      if (calc.supportedEventTypes.includes(event.type)) {
        calc.processEvent(event);
      }
    }
    const expectedProjects = calc.calculate();

    for (const record of projectRecords) {
      const expectedDetail = expectedProjects.projectDetails.find(
        (d) => d.projectId === record.projectId,
      );

      if (!expectedDetail) {
        mismatches.push({
          checkType: "Orphaned Project Metrics",
          identifier: record.projectId,
          expected: "No events representing project",
          actual: record,
          description: `Project metrics record for ${record.projectId} exists in project_metrics but project is unknown historically`,
        });
        errorCheck();
        continue;
      }

      totalChecksRun++;
      if (Math.abs(record.activityScore - expectedDetail.activityScore) > 0.001) {
        mismatches.push({
          checkType: "Project activity_score mismatch",
          identifier: record.projectId,
          expected: expectedDetail.activityScore,
          actual: record.activityScore,
          description: `Project activity score does not match calculated event weight for ${record.projectId}`,
        });
      }

      totalChecksRun++;
      if (Math.abs(record.completionRate - expectedDetail.completionPercentage / 100.0) > 0.001) {
        mismatches.push({
          checkType: "Project completion_rate mismatch",
          identifier: record.projectId,
          expected: expectedDetail.completionPercentage / 100.0,
          actual: record.completionRate,
          description: `Project completion rate does not match event-derived tasks metrics for ${record.projectId}`,
        });
      }
    }

    function errorCheck() {
      totalChecksRun++;
    }

    return {
      isConsistent: mismatches.length === 0,
      totalChecksRun,
      mismatches,
    };
  }
}
