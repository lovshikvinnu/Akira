import { AkiraEvent } from "../../instrumentation/event-types";
import { MetricCalculator } from "./MetricCalculator";

// ==========================================
// BACKWARD COMPATIBLE SPRINT 1.1 CALCULATORS
// ==========================================

export class DailyTaskMetricCalculator implements MetricCalculator<{
  completed: number;
  created: number;
}> {
  readonly name = "daily-task-metric";
  readonly supportedEventTypes = ["task.created", "task.completed"];

  private completed = 0;
  private created = 0;

  processEvent(event: AkiraEvent): void {
    if (event.type === "task.created") {
      this.created++;
    } else if (event.type === "task.completed") {
      this.completed++;
    }
  }

  calculate() {
    return { completed: this.completed, created: this.created };
  }

  reset(): void {
    this.completed = 0;
    this.created = 0;
  }
}

export class DailyNoteMetricCalculator implements MetricCalculator<number> {
  readonly name = "daily-note-metric";
  readonly supportedEventTypes = ["note.created"];

  private created = 0;

  processEvent(event: AkiraEvent): void {
    if (event.type === "note.created") {
      this.created++;
    }
  }

  calculate(): number {
    return this.created;
  }

  reset(): void {
    this.created = 0;
  }
}

export class DailyFileMetricCalculator implements MetricCalculator<number> {
  readonly name = "daily-file-metric";
  readonly supportedEventTypes = [
    "file.uploaded",
    "vault.file.uploaded",
    "vault.file.created",
    "vault.file.registered",
  ];

  private uploaded = 0;

  processEvent(event: AkiraEvent): void {
    if (this.supportedEventTypes.includes(event.type)) {
      this.uploaded++;
    }
  }

  calculate(): number {
    return this.uploaded;
  }

  reset(): void {
    this.uploaded = 0;
  }
}

export class DailySearchMetricCalculator implements MetricCalculator<number> {
  readonly name = "daily-search-metric";
  readonly supportedEventTypes = [
    "search.performed",
    "search.query",
    "search.created",
    "search.executed",
  ];

  private searches = 0;

  processEvent(event: AkiraEvent): void {
    if (this.supportedEventTypes.includes(event.type)) {
      this.searches++;
    }
  }

  calculate(): number {
    return this.searches;
  }

  reset(): void {
    this.searches = 0;
  }
}

export class DailySessionMetricCalculator implements MetricCalculator<number> {
  readonly name = "daily-session-metric";
  readonly supportedEventTypes = ["session.completed", "session.stopped", "session.ended"];

  private totalDuration = 0;

  processEvent(event: AkiraEvent): void {
    const payload = event.payload as any;
    if (payload && typeof payload.duration === "number") {
      this.totalDuration += payload.duration;
    }
  }

  calculate(): number {
    return this.totalDuration;
  }

  reset(): void {
    this.totalDuration = 0;
  }
}

export class DailyActiveProjectsMetricCalculator implements MetricCalculator<number> {
  readonly name = "daily-active-projects-metric";
  readonly supportedEventTypes = [
    "project.created",
    "project.updated",
    "task.created",
    "task.completed",
    "session.completed",
    "session.created",
    "session.stopped",
    "session.started",
    "session.ended",
    "note.created",
    "note.updated",
    "file.uploaded",
    "vault.file.uploaded",
    "vault.file.created",
    "vault.file.registered",
  ];

  private projectIds = new Set<string>();

  processEvent(event: AkiraEvent): void {
    const payload = event.payload as any;
    let projectId: string | undefined = undefined;

    if (event.type.startsWith("project.")) {
      projectId = event.entityId || payload?.id;
    } else {
      projectId = event.entityId || payload?.projectId;
    }

    if (projectId && typeof projectId === "string") {
      this.projectIds.add(projectId);
    }
  }

  calculate(): number {
    return this.projectIds.size;
  }

  reset(): void {
    this.projectIds.clear();
  }
}

export interface ProjectSummary {
  projectId: string;
  activityScore: number;
  completionRate: number;
  lastActivity: string;
}

export class ProjectMetricCalculator implements MetricCalculator<Map<string, ProjectSummary>> {
  readonly name = "project-metric-calculator";
  readonly supportedEventTypes = [
    "project.created",
    "project.updated",
    "task.created",
    "task.completed",
    "session.completed",
    "session.created",
    "session.stopped",
    "session.started",
    "session.ended",
    "note.created",
    "note.updated",
    "file.uploaded",
    "vault.file.uploaded",
    "vault.file.created",
    "vault.file.registered",
  ];

  private projects = new Map<
    string,
    {
      eventsCount: number;
      tasksCreated: number;
      tasksCompleted: number;
      lastActivityTime: number;
    }
  >();

  processEvent(event: AkiraEvent): void {
    const payload = event.payload as any;
    let projectId: string | undefined = undefined;

    if (event.type.startsWith("project.")) {
      projectId = event.entityId || payload?.id;
    } else {
      projectId = event.entityId || payload?.projectId;
    }

    if (!projectId || typeof projectId !== "string") {
      return;
    }

    let stats = this.projects.get(projectId);
    if (!stats) {
      stats = { eventsCount: 0, tasksCreated: 0, tasksCompleted: 0, lastActivityTime: 0 };
      this.projects.set(projectId, stats);
    }

    stats.eventsCount++;
    const eventTime = new Date(event.timestamp).getTime();
    if (!isNaN(eventTime) && eventTime > stats.lastActivityTime) {
      stats.lastActivityTime = eventTime;
    }

    if (event.type === "task.created") {
      stats.tasksCreated++;
    } else if (event.type === "task.completed") {
      stats.tasksCompleted++;
    }
  }

  calculate(): Map<string, ProjectSummary> {
    const result = new Map<string, ProjectSummary>();
    for (const [projectId, stats] of this.projects.entries()) {
      const activityScore = stats.eventsCount;
      const completionRate =
        stats.tasksCreated > 0
          ? parseFloat((stats.tasksCompleted / stats.tasksCreated).toFixed(4))
          : 0.0;

      const lastActivity =
        stats.lastActivityTime > 0
          ? new Date(stats.lastActivityTime).toISOString()
          : new Date().toISOString();

      result.set(projectId, {
        projectId,
        activityScore,
        completionRate,
        lastActivity,
      });
    }
    return result;
  }

  reset(): void {
    this.projects.clear();
  }
}

// ==========================================
// NEW PRODUCTION SPRINT 1.2 CORE CALCULATORS
// ==========================================

export interface ProductivitySummary {
  tasksCreated: number;
  tasksCompleted: number;
  completionRate: number;
  reopenedTasks: number;
  productivityScore: number;
}

export class ProductivityCalculator implements MetricCalculator<ProductivitySummary> {
  readonly name = "productivity-calculator";
  readonly supportedEventTypes = [
    "task.created",
    "task.completed",
    "task.updated",
    "task.deleted",
    "task.reopened",
    "task.undone",
  ];

  private created = 0;
  private completed = 0;
  private reopened = 0;

  processEvent(event: AkiraEvent): void {
    if (event.type === "task.created") {
      this.created++;
    } else if (event.type === "task.completed") {
      this.completed++;
    } else if (event.type === "task.reopened" || event.type === "task.undone") {
      this.reopened++;
    }
  }

  calculate(): ProductivitySummary {
    const rate = this.created > 0 ? parseFloat((this.completed / this.created).toFixed(4)) : 0.0;

    // Scoring Methodology:
    // +10 per completed task
    // +2 per created task
    // -5 per reopened task
    // +20 bonus for 100% completion rate (minimum 1 created task)
    let score = this.completed * 10 + this.created * 2 - this.reopened * 5;
    if (rate === 1.0 && this.created > 0) {
      score += 20;
    }

    return {
      tasksCreated: this.created,
      tasksCompleted: this.completed,
      completionRate: rate,
      reopenedTasks: this.reopened,
      productivityScore: score,
    };
  }

  reset(): void {
    this.created = 0;
    this.completed = 0;
    this.reopened = 0;
  }
}

export interface ActivitySummary {
  dailyEvents: number;
  activeDays: number;
  peakActivityHour: number;
  activityStreak: number;
}

export class ActivityCalculator implements MetricCalculator<ActivitySummary> {
  readonly name = "activity-calculator";
  readonly supportedEventTypes = ["*"]; // processes any events

  private eventTimes: number[] = [];
  private uniqueDates = new Set<string>();

  constructor(private timezoneOffsetMinutes = 0) {}

  processEvent(event: AkiraEvent): void {
    const t = new Date(event.timestamp).getTime();
    if (!isNaN(t)) {
      this.eventTimes.push(t);

      // Extract localized YYYY-MM-DD
      const local = new Date(t + this.timezoneOffsetMinutes * 60 * 1000);
      const year = local.getUTCFullYear();
      const month = String(local.getUTCMonth() + 1).padStart(2, "0");
      const day = String(local.getUTCDate()).padStart(2, "0");
      this.uniqueDates.add(`${year}-${month}-${day}`);
    }
  }

  calculate(): ActivitySummary {
    const count = this.eventTimes.length;
    if (count === 0) {
      return {
        dailyEvents: 0,
        activeDays: 0,
        peakActivityHour: -1,
        activityStreak: 0,
      };
    }

    // 1. Peak Activity Hour
    const hourCounts = new Array(24).fill(0);
    for (const t of this.eventTimes) {
      const local = new Date(t + this.timezoneOffsetMinutes * 60 * 1000);
      const hr = local.getUTCHours();
      hourCounts[hr]++;
    }

    let peakHour = 0;
    let maxHourCount = -1;
    for (let h = 0; h < 24; h++) {
      if (hourCounts[h] > maxHourCount) {
        maxHourCount = hourCounts[h];
        peakHour = h;
      }
    }

    // 2. Activity Streak (longest consecutive active days)
    const sorted = Array.from(this.uniqueDates).sort();
    let longestStreak = 1;
    let currentStreak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1] + "T00:00:00.000Z").getTime();
      const curr = new Date(sorted[i] + "T00:00:00.000Z").getTime();
      const diff = Math.round((curr - prev) / (24 * 60 * 60 * 1000));
      if (diff === 1) {
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else if (diff > 1) {
        currentStreak = 1;
      }
    }

    return {
      dailyEvents: count,
      activeDays: this.uniqueDates.size,
      peakActivityHour: peakHour,
      activityStreak: longestStreak,
    };
  }

  reset(): void {
    this.eventTimes = [];
    this.uniqueDates.clear();
  }
}

export interface ProjectMetricDetail {
  projectId: string;
  activityScore: number;
  completionPercentage: number;
  lastActivity: string;
}

export interface ProjectsSummary {
  activeProjects: number;
  dormantProjects: string[];
  completionPercentage: number;
  projectDetails: ProjectMetricDetail[];
}

export class ProjectsCalculator implements MetricCalculator<ProjectsSummary> {
  readonly name = "projects-calculator";
  readonly supportedEventTypes = [
    "project.created",
    "project.updated",
    "project.continued",
    "project.deleted",
    "task.created",
    "task.completed",
    "session.started",
    "session.ended",
    "session.completed",
    "session.stopped",
    "note.created",
    "note.edited",
    "note.deleted",
    "file.uploaded",
    "vault.file.uploaded",
    "vault.file.deleted",
  ];

  private activeProjects = new Map<
    string,
    {
      eventsCount: number;
      tasksCreated: number;
      tasksCompleted: number;
      lastActivityTime: number;
    }
  >();

  constructor(private allKnownProjectIds: string[] = []) {}

  processEvent(event: AkiraEvent): void {
    const payload = event.payload as any;
    let projectId: string | undefined = undefined;

    if (event.type.startsWith("project.")) {
      projectId = event.entityId || payload?.id;
    } else {
      projectId = event.entityId || payload?.projectId;
    }

    if (!projectId || typeof projectId !== "string") {
      return;
    }

    let stats = this.activeProjects.get(projectId);
    if (!stats) {
      stats = { eventsCount: 0, tasksCreated: 0, tasksCompleted: 0, lastActivityTime: 0 };
      this.activeProjects.set(projectId, stats);
    }

    stats.eventsCount++;
    const t = new Date(event.timestamp).getTime();
    if (!isNaN(t) && t > stats.lastActivityTime) {
      stats.lastActivityTime = t;
    }

    if (event.type === "task.created") {
      stats.tasksCreated++;
    } else if (event.type === "task.completed") {
      stats.tasksCompleted++;
    }
  }

  calculate(): ProjectsSummary {
    const projectDetails: ProjectMetricDetail[] = [];
    const activeProjectIds = new Set<string>();

    let totalCompletion = 0;
    let completedCount = 0;

    for (const [projId, stats] of this.activeProjects.entries()) {
      activeProjectIds.add(projId);

      const completion =
        stats.tasksCreated > 0
          ? parseFloat((stats.tasksCompleted / stats.tasksCreated).toFixed(4))
          : 0.0;

      totalCompletion += completion;
      completedCount++;

      projectDetails.push({
        projectId: projId,
        activityScore: stats.eventsCount,
        completionPercentage: completion * 100, // represent as percentage 0-100
        lastActivity:
          stats.lastActivityTime > 0
            ? new Date(stats.lastActivityTime).toISOString()
            : new Date().toISOString(),
      });
    }

    // Identify dormant projects
    const dormant = this.allKnownProjectIds.filter((id) => !activeProjectIds.has(id));

    const avgCompletion =
      completedCount > 0 ? parseFloat((totalCompletion / completedCount).toFixed(4)) * 100 : 0.0;

    return {
      activeProjects: this.activeProjects.size,
      dormantProjects: dormant,
      completionPercentage: avgCompletion,
      projectDetails,
    };
  }

  reset(): void {
    this.activeProjects.clear();
  }
}

export interface VaultSummary {
  filesUploaded: number;
  filesDeleted: number;
  storageActivity: number;
  folderCreation: number;
}

export class VaultCalculator implements MetricCalculator<VaultSummary> {
  readonly name = "vault-calculator";
  readonly supportedEventTypes = [
    "file.uploaded",
    "vault.file.uploaded",
    "vault.file.deleted",
    "vault.folder.created",
  ];

  private uploaded = 0;
  private deleted = 0;
  private storageDelta = 0;
  private folders = 0;

  processEvent(event: AkiraEvent): void {
    if (event.type === "vault.file.uploaded" || event.type === "file.uploaded") {
      this.uploaded++;
      const payload = event.payload as any;
      if (payload && typeof payload.sizeBytes === "number") {
        this.storageDelta += payload.sizeBytes;
      }
    } else if (event.type === "vault.file.deleted") {
      this.deleted++;
    } else if (event.type === "vault.folder.created") {
      this.folders++;
    }
  }

  calculate(): VaultSummary {
    return {
      filesUploaded: this.uploaded,
      filesDeleted: this.deleted,
      storageActivity: this.storageDelta,
      folderCreation: this.folders,
    };
  }

  reset(): void {
    this.uploaded = 0;
    this.deleted = 0;
    this.storageDelta = 0;
    this.folders = 0;
  }
}

export interface SearchSummary {
  searchesExecuted: number;
  repeatedSearches: number;
  mostCommonQueries: { query: string; count: number }[];
}

export class SearchCalculator implements MetricCalculator<SearchSummary> {
  readonly name = "search-calculator";
  readonly supportedEventTypes = ["search.executed", "search.query", "search.performed"];

  private count = 0;
  private queryCounts = new Map<string, number>();

  processEvent(event: AkiraEvent): void {
    this.count++;
    const payload = event.payload as any;
    const q = payload?.query;
    if (q && typeof q === "string") {
      const norm = q.trim().toLowerCase();
      this.queryCounts.set(norm, (this.queryCounts.get(norm) || 0) + 1);
    }
  }

  calculate(): SearchSummary {
    let repeated = 0;
    const pairs: { query: string; count: number }[] = [];

    for (const [q, c] of this.queryCounts.entries()) {
      pairs.push({ query: q, count: c });
      if (c > 1) {
        repeated++;
      }
    }

    pairs.sort((a, b) => b.count - a.count);

    return {
      searchesExecuted: this.count,
      repeatedSearches: repeated,
      mostCommonQueries: pairs.slice(0, 5),
    };
  }

  reset(): void {
    this.count = 0;
    this.queryCounts.clear();
  }
}

export interface SessionsSummary {
  sessionCount: number;
  totalDuration: number;
  averageDuration: number;
  longestSession: number;
}

export class SessionsCalculator implements MetricCalculator<SessionsSummary> {
  readonly name = "sessions-calculator";
  readonly supportedEventTypes = ["session.ended", "session.completed", "session.stopped"];

  private count = 0;
  private total = 0;
  private longest = 0;

  processEvent(event: AkiraEvent): void {
    this.count++;
    const payload = event.payload as any;
    if (payload && typeof payload.duration === "number") {
      const durSeconds = payload.duration * 60; // convert focus duration (minutes) to seconds
      this.total += durSeconds;
      if (durSeconds > this.longest) {
        this.longest = durSeconds;
      }
    }
  }

  calculate(): SessionsSummary {
    return {
      sessionCount: this.count,
      totalDuration: this.total,
      averageDuration: this.count > 0 ? parseFloat((this.total / this.count).toFixed(2)) : 0.0,
      longestSession: this.longest,
    };
  }

  reset(): void {
    this.count = 0;
    this.total = 0;
    this.longest = 0;
  }
}
