process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { getDatabaseConnection } from "../../persistence/connection";
import { SqliteEventRepository } from "../../instrumentation/event-store/sqlite-event-repository";
import { EventBus } from "../../instrumentation/event-bus";
import { SqliteAnalyticsRepository } from "../repository/SqliteAnalyticsRepository";
import { AnalyticsEngine, AnalyticsSubscriber } from "../engine/AnalyticsEngine";
import { MetricCalculator } from "../metrics/MetricCalculator";
import { AkiraEvent } from "../../instrumentation/event-types";
import {
  ProductivityCalculator,
  ActivityCalculator,
  ProjectsCalculator,
  VaultCalculator,
  SearchCalculator,
  SessionsCalculator,
} from "../metrics/calculators";
import { QueryService } from "../service/query-service";
import { AnalyticsService } from "../service/analytics-service";
import { validateAndResolveQuery } from "../service/validation";
import { DashboardService } from "../dashboard/dashboard-service";
import { RebuildManager } from "../validation/rebuild-manager";
import { ConsistencyChecker } from "../validation/consistency-checker";
import { AnalyticsValidator } from "../validation/analytics-validator";
import { DiagnosticsService } from "../validation/diagnostics";
import { BenchmarkRunner } from "../validation/benchmark";

const totalTests = 0;
const passedTests = 0;
const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertExists(val: any, message: string) {
  if (val === null || val === undefined) {
    throw new Error(`${message} -> Expected value to exist, got ${val}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Helper to delay execution (useful for testing async timers/subscribers)
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ----------------------------------------------------

test("Repository - Table creation, CRUD, and UPSERT operations", () => {
  const db = getDatabaseConnection();
  const repo = new SqliteAnalyticsRepository(db);

  // 1. Test Daily Metrics Persistence
  const sampleDaily = {
    date: "2026-07-19",
    tasksCompleted: 5,
    tasksCreated: 8,
    notesCreated: 3,
    filesUploaded: 2,
    searches: 15,
    sessionDuration: 3600,
    activeProjects: 2,
  };

  repo.saveDailyMetrics(sampleDaily);
  const fetchedDaily = repo.getDailyMetrics("2026-07-19");
  assertExists(fetchedDaily, "Daily metrics must be persisted and retrieved");
  assertEquals(fetchedDaily!.tasksCompleted, 5, "Tasks completed matches");
  assertEquals(fetchedDaily!.sessionDuration, 3600, "Session duration matches");

  // 2. Test UPSERT (ON CONFLICT UPDATE)
  const updatedDaily = { ...sampleDaily, tasksCompleted: 10, sessionDuration: 5000 };
  repo.saveDailyMetrics(updatedDaily);
  const fetchedUpdatedDaily = repo.getDailyMetrics("2026-07-19");
  assertEquals(
    fetchedUpdatedDaily!.tasksCompleted,
    10,
    "UPSERT: Tasks completed updated successfully",
  );
  assertEquals(
    fetchedUpdatedDaily!.sessionDuration,
    5000,
    "UPSERT: Session duration updated successfully",
  );

  // 3. Test Range queries
  repo.saveDailyMetrics({
    date: "2026-07-20",
    tasksCompleted: 2,
    tasksCreated: 4,
    notesCreated: 1,
    filesUploaded: 0,
    searches: 5,
    sessionDuration: 1800,
    activeProjects: 1,
  });

  const range = repo.getDailyMetricsRange("2026-07-19", "2026-07-21");
  assertEquals(range.length, 2, "Range query must return 2 days of metrics");
  assertEquals(range[0].date, "2026-07-19", "First item matches date");
  assertEquals(range[1].date, "2026-07-20", "Second item matches date");

  // 4. Test Project Metrics Persistence
  const sampleProject = {
    projectId: "proj-alpha",
    activityScore: 45.5,
    completionRate: 0.75,
    lastActivity: "2026-07-19T12:00:00.000Z",
  };

  repo.saveProjectMetrics(sampleProject);
  const fetchedProj = repo.getProjectMetrics("proj-alpha");
  assertExists(fetchedProj, "Project metrics must be retrieved");
  assertEquals(fetchedProj!.activityScore, 45.5, "Activity score matches");
  assertEquals(fetchedProj!.completionRate, 0.75, "Completion rate matches");

  // Test project list
  const allProjs = repo.getAllProjectMetrics();
  assert(allProjs.length >= 1, "Should retrieve at least one project metric");

  // 5. Test Historical Aggregates
  const aggregates = repo.getAggregatedMetrics("2026-07-19", "2026-07-20");
  assertEquals(aggregates.totalTasksCompleted, 12, "Total completed tasks (10 + 2 = 12) matches");
  assertEquals(aggregates.totalSessionDuration, 6800, "Total session duration matches");
  assertEquals(aggregates.averageActiveProjects, 1.5, "Average active projects (1.5) matches");
});

test("Metric Registration - Extensible calculators interface", () => {
  const db = getDatabaseConnection();
  const eventRepo = new SqliteEventRepository(db);
  const analyticsRepo = new SqliteAnalyticsRepository(db);
  const engine = new AnalyticsEngine(eventRepo, analyticsRepo);

  // Check default registration count
  const initialCalculators = engine.getRegisteredCalculators();
  assert(initialCalculators.length >= 7, "Default calculators must be registered");

  // Register custom calculator
  class CustomCalculator implements MetricCalculator<string> {
    readonly name = "custom-calculator";
    readonly supportedEventTypes = ["custom.action"];
    private observedValue = "initial";

    processEvent(event: AkiraEvent): void {
      this.observedValue = (event.payload as any).value;
    }
    calculate(): string {
      return this.observedValue;
    }
    reset(): void {
      this.observedValue = "reset";
    }
  }

  const custom = new CustomCalculator();
  engine.registerCalculator(custom);

  const matched = engine.getRegisteredCalculators().find((c) => c.name === "custom-calculator");
  assertExists(matched, "Custom calculator should be registered successfully");
  assertEquals(matched!.supportedEventTypes[0], "custom.action", "Supported event type matches");
});

test("Aggregation Pipeline & Event Store Integration - Deriving metrics from events", () => {
  const db = getDatabaseConnection();

  // Clean tables to start fresh
  db.prepare("DELETE FROM events").run();
  db.prepare("DELETE FROM daily_metrics").run();
  db.prepare("DELETE FROM project_metrics").run();

  const eventRepo = new SqliteEventRepository(db);
  const analyticsRepo = new SqliteAnalyticsRepository(db);
  const engine = new AnalyticsEngine(eventRepo, analyticsRepo);

  // 1. Seed simulated event logs
  // Events on Day 1 (2026-07-18)
  eventRepo.insert({
    id: "evt-1",
    type: "task.created",
    source: "tasks-test",
    timestamp: "2026-07-18T10:00:00.000Z",
    payload: { id: "task-101", title: "Task 1", projectId: "proj-omega" },
    version: 1,
  });
  eventRepo.insert({
    id: "evt-2",
    type: "task.completed",
    source: "tasks-test",
    timestamp: "2026-07-18T11:00:00.000Z",
    payload: { id: "task-101", title: "Task 1", projectId: "proj-omega" },
    version: 1,
  });
  eventRepo.insert({
    id: "evt-3",
    type: "note.created",
    source: "notes-test",
    timestamp: "2026-07-18T12:00:00.000Z",
    payload: { id: "note-101", title: "Note 1" },
    version: 1,
  });
  eventRepo.insert({
    id: "evt-4",
    type: "session.completed",
    source: "sessions-test",
    timestamp: "2026-07-18T13:00:00.000Z",
    payload: { id: "sess-101", duration: 180, projectId: "proj-omega" },
    version: 1,
  });
  eventRepo.insert({
    id: "evt-5",
    type: "search.query",
    source: "search-test",
    timestamp: "2026-07-18T14:00:00.000Z",
    payload: { query: "akira os docs" },
    version: 1,
  });

  // 2. Run aggregation for Day 1
  engine.aggregateDay("2026-07-18");

  // Validate Day 1 derived metrics
  const day1Metrics = analyticsRepo.getDailyMetrics("2026-07-18");
  assertExists(day1Metrics, "Aggregation should produce daily_metrics entry");
  assertEquals(day1Metrics!.tasksCreated, 1, "Day 1 tasksCreated matches");
  assertEquals(day1Metrics!.tasksCompleted, 1, "Day 1 tasksCompleted matches");
  assertEquals(day1Metrics!.notesCreated, 1, "Day 1 notesCreated matches");
  assertEquals(day1Metrics!.sessionDuration, 180, "Day 1 sessionDuration matches");
  assertEquals(day1Metrics!.searches, 1, "Day 1 searches matches");
  assertEquals(day1Metrics!.activeProjects, 1, "Day 1 activeProjects matches");

  // 3. Run project aggregation
  engine.aggregateProject("proj-omega");
  const projOmegaMetrics = analyticsRepo.getProjectMetrics("proj-omega");
  assertExists(projOmegaMetrics, "Project metrics for proj-omega must exist");
  assertEquals(
    projOmegaMetrics!.activityScore,
    3,
    "Activity score count (evt-1, evt-2, evt-4) is 3",
  );
  assertEquals(
    projOmegaMetrics!.completionRate,
    1.0,
    "Completion rate is 1.0 (1 completed / 1 created)",
  );
  assertEquals(
    projOmegaMetrics!.lastActivity,
    "2026-07-18T13:00:00.000Z",
    "Last activity time matches session.completed event",
  );

  // 4. Test runFullAggregation
  // Add another day's events
  eventRepo.insert({
    id: "evt-6",
    type: "vault.file.uploaded",
    source: "vault-test",
    timestamp: "2026-07-19T09:00:00.000Z",
    payload: { id: "file-101", sizeBytes: 1024, projectId: "proj-beta" },
    version: 1,
  });
  eventRepo.insert({
    id: "evt-7",
    type: "task.created",
    source: "tasks-test",
    timestamp: "2026-07-19T10:00:00.000Z",
    payload: { id: "task-102", title: "Task 2", projectId: "proj-beta" },
    version: 1,
  });

  engine.runFullAggregation();

  const day2Metrics = analyticsRepo.getDailyMetrics("2026-07-19");
  assertExists(day2Metrics, "Full aggregation should compile Day 2");
  assertEquals(day2Metrics!.filesUploaded, 1, "Day 2 filesUploaded matches");
  assertEquals(day2Metrics!.tasksCreated, 1, "Day 2 tasksCreated matches");
  assertEquals(day2Metrics!.tasksCompleted, 0, "Day 2 tasksCompleted is 0");

  const projBetaMetrics = analyticsRepo.getProjectMetrics("proj-beta");
  assertExists(projBetaMetrics, "Full aggregation should compile project proj-beta");
  assertEquals(projBetaMetrics!.activityScore, 2, "proj-beta events count is 2");
  assertEquals(projBetaMetrics!.completionRate, 0.0, "proj-beta completion rate is 0.0");
});

test("Real-time Event Bus Integration & Debounced Processing", async () => {
  const db = getDatabaseConnection();

  db.prepare("DELETE FROM events").run();
  db.prepare("DELETE FROM daily_metrics").run();
  db.prepare("DELETE FROM project_metrics").run();

  const eventRepo = new SqliteEventRepository(db);
  const analyticsRepo = new SqliteAnalyticsRepository(db);
  const engine = new AnalyticsEngine(eventRepo, analyticsRepo);

  // Setup EventBus and subscriber
  const eventBus = new EventBus();
  const subscriber = new AnalyticsSubscriber(engine);
  eventBus.subscribe(subscriber);

  // Simulate event creation and publication via EventBus
  const event: AkiraEvent = {
    id: "evt-async-1",
    type: "task.created",
    source: "tasks-test",
    timestamp: "2026-07-19T15:30:00.000Z",
    payload: { id: "task-201", title: "Async Task", projectId: "proj-async" },
    version: 1,
  };

  // We must insert the event into eventRepo first, because the pipeline
  // fetches events from eventRepo upon being triggered by subscriber.
  eventRepo.insert(event);

  // Publish to subscriber via the eventBus
  eventBus.publish(event);

  // Wait for async processing (subscriber does setTimeout 50ms)
  await delay(100);

  // Verify derived metrics updated in real-time
  const daily = analyticsRepo.getDailyMetrics("2026-07-19");
  assertExists(daily, "Daily metrics should have updated asynchronously");
  assertEquals(daily!.tasksCreated, 1, "Asynchronously aggregated task created");

  const proj = analyticsRepo.getProjectMetrics("proj-async");
  assertExists(proj, "Project metrics should have updated asynchronously");
  assertEquals(proj!.activityScore, 1, "Asynchronously aggregated project activity score");
});

// ----------------------------------------------------
// SPRINT 1.2 CORE METRICS TESTS
// ----------------------------------------------------

test("Sprint 1.2 - Productivity Calculator correctness, empty states, out-of-order, and duplicate events", () => {
  const calc = new ProductivityCalculator();

  // 1. Correct aggregation & scoring
  calc.processEvent({
    id: "evt-prod-1",
    type: "task.created",
    timestamp: "2026-07-19T10:00:00.000Z",
    source: "test",
    payload: { id: "t1" },
    version: 1,
  });
  calc.processEvent({
    id: "evt-prod-2",
    type: "task.completed",
    timestamp: "2026-07-19T11:00:00.000Z",
    source: "test",
    payload: { id: "t1" },
    version: 1,
  });

  const res1 = calc.calculate();
  assertEquals(res1.tasksCreated, 1, "Created matches");
  assertEquals(res1.tasksCompleted, 1, "Completed matches");
  assertEquals(res1.completionRate, 1.0, "Completion rate is 100%");
  assertEquals(
    res1.productivityScore,
    10 + 2 + 20,
    "Productivity score matches (10 + 2 + 20 bonus = 32)",
  );

  // 2. Empty event history
  calc.reset();
  const res2 = calc.calculate();
  assertEquals(res2.tasksCreated, 0, "Empty: Created is 0");
  assertEquals(res2.tasksCompleted, 0, "Empty: Completed is 0");
  assertEquals(res2.completionRate, 0.0, "Empty: Rate is 0");
  assertEquals(res2.reopenedTasks, 0, "Empty: Reopened is 0");
  assertEquals(res2.productivityScore, 0, "Empty: Score is 0");

  // 3. Out-of-order events
  // Reopen event before completion (processed in different ordering)
  calc.processEvent({
    id: "evt-prod-3",
    type: "task.reopened",
    timestamp: "2026-07-19T09:00:00.000Z",
    source: "test",
    payload: { id: "t2" },
    version: 1,
  });
  calc.processEvent({
    id: "evt-prod-4",
    type: "task.completed",
    timestamp: "2026-07-19T10:00:00.000Z",
    source: "test",
    payload: { id: "t2" },
    version: 1,
  });

  const res3 = calc.calculate();
  assertEquals(res3.tasksCompleted, 1, "Out-of-order: 1 task completed");
  assertEquals(res3.reopenedTasks, 1, "Out-of-order: 1 task reopened");
  assertEquals(res3.productivityScore, 10 - 5, "Out-of-order: Score matches (10 - 5 = 5)");

  // 4. Duplicate events (idempotency is handled at the Event Store repository,
  // but if the pipeline receives duplicate events, the calculator consumes them sequentially)
  calc.reset();
  const duplicateEvent: AkiraEvent = {
    id: "evt-dup",
    type: "task.created",
    timestamp: "2026-07-19T10:00:00.000Z",
    source: "test",
    payload: { id: "t3" },
    version: 1,
  };
  calc.processEvent(duplicateEvent);
  calc.processEvent(duplicateEvent); // second processing (duplicate)
  const res4 = calc.calculate();
  assertEquals(res4.tasksCreated, 2, "Calculator processes all events fed to it (2 tasks created)");
});

test("Sprint 1.2 - Activity Calculator timezone boundary, streaks, and peak hour", () => {
  // IST timezone offset is +330 (+5:30)
  const calcIST = new ActivityCalculator(330);

  // UTC time: 2026-07-18T20:00:00Z.
  // IST local time: 2026-07-19T01:30:00 (which belongs to July 19th).
  calcIST.processEvent({
    id: "evt-act-1",
    type: "some.event",
    timestamp: "2026-07-18T20:00:00.000Z",
    source: "test",
    payload: {},
    version: 1,
  });

  // UTC time: 2026-07-19T02:00:00Z.
  // IST local time: 2026-07-19T07:30:00 (July 19th).
  calcIST.processEvent({
    id: "evt-act-2",
    type: "some.event",
    timestamp: "2026-07-19T02:00:00.000Z",
    source: "test",
    payload: {},
    version: 1,
  });

  // Add a third event to establish 07:00 as the definitive peak activity hour in IST
  calcIST.processEvent({
    id: "evt-act-2-peak",
    type: "some.event",
    timestamp: "2026-07-19T02:15:00.000Z",
    source: "test",
    payload: {},
    version: 1,
  });

  const resIST = calcIST.calculate();
  assertEquals(resIST.activeDays, 1, "Both events fell on July 19th in IST, so activeDays = 1");
  assertEquals(resIST.peakActivityHour, 7, "Peak hour in IST should be 7 (07:30)");

  // EST timezone offset is -300 (-5:00)
  const calcEST = new ActivityCalculator(-300);
  calcEST.processEvent({
    id: "evt-act-3",
    type: "some.event",
    timestamp: "2026-07-18T20:00:00.000Z",
    source: "test",
    payload: {},
    version: 1,
  });
  calcEST.processEvent({
    id: "evt-act-4",
    type: "some.event",
    timestamp: "2026-07-19T02:00:00.000Z",
    source: "test",
    payload: {},
    version: 1,
  });

  // Add a third event to establish 21:00 as the definitive peak activity hour in EST
  calcEST.processEvent({
    id: "evt-act-4-peak",
    type: "some.event",
    timestamp: "2026-07-19T02:15:00.000Z",
    source: "test",
    payload: {},
    version: 1,
  });

  const resEST = calcEST.calculate();
  // UTC 2026-07-18T20:00:00Z adjusted by -300 mins is 2026-07-18T15:00:00 (July 18th)
  // UTC 2026-07-19T02:00:00Z adjusted by -300 mins is 2026-07-18T21:00:00 (July 18th)
  assertEquals(resEST.activeDays, 1, "Both events fell on July 18th in EST, so activeDays = 1");
  assertEquals(resEST.peakActivityHour, 21, "Peak hour in EST should be 21 (21:00)");

  // Test Streak calculation
  calcEST.reset();
  // July 18 local
  calcEST.processEvent({
    id: "s-1",
    type: "evt",
    timestamp: "2026-07-18T12:00:00.000Z",
    source: "t",
    payload: {},
    version: 1,
  });
  // July 19 local
  calcEST.processEvent({
    id: "s-2",
    type: "evt",
    timestamp: "2026-07-19T12:00:00.000Z",
    source: "t",
    payload: {},
    version: 1,
  });
  // July 20 local
  calcEST.processEvent({
    id: "s-3",
    type: "evt",
    timestamp: "2026-07-20T12:00:00.000Z",
    source: "t",
    payload: {},
    version: 1,
  });
  // Break streak: Skip July 21st, next on July 22nd
  calcEST.processEvent({
    id: "s-4",
    type: "evt",
    timestamp: "2026-07-22T12:00:00.000Z",
    source: "t",
    payload: {},
    version: 1,
  });

  const resStreak = calcEST.calculate();
  assertEquals(resStreak.activeDays, 4, "Total 4 active days");
  assertEquals(resStreak.activityStreak, 3, "Longest consecutive streak is 3 (July 18, 19, 20)");
});

test("Sprint 1.2 - Projects Calculator active & dormant projects", () => {
  const allKnownProjects = ["proj-active", "proj-dormant-1", "proj-dormant-2"];
  const calc = new ProjectsCalculator(allKnownProjects);

  calc.processEvent({
    id: "p-act-1",
    type: "task.created",
    timestamp: "2026-07-19T10:00:00.000Z",
    source: "test",
    payload: { projectId: "proj-active" },
    version: 1,
  });
  calc.processEvent({
    id: "p-act-2",
    type: "task.completed",
    timestamp: "2026-07-19T11:00:00.000Z",
    source: "test",
    payload: { projectId: "proj-active" },
    version: 1,
  });

  const res = calc.calculate();
  assertEquals(res.activeProjects, 1, "1 active project in range");
  assertEquals(res.dormantProjects.length, 2, "2 dormant projects");
  assert(res.dormantProjects.includes("proj-dormant-1"), "proj-dormant-1 is dormant");
  assert(res.dormantProjects.includes("proj-dormant-2"), "proj-dormant-2 is dormant");
  assertEquals(res.completionPercentage, 100.0, "Completion rate of active projects is 100.0%");
  assertEquals(res.projectDetails[0].activityScore, 2, "Activity score count matches");
});

test("Sprint 1.2 - Vault, Search, and Sessions Calculators", () => {
  // 1. Vault
  const vaultCalc = new VaultCalculator();
  vaultCalc.processEvent({
    id: "v1",
    type: "vault.file.uploaded",
    timestamp: "2026-07-19T10:00:00.000Z",
    source: "t",
    payload: { sizeBytes: 1500 },
    version: 1,
  });
  vaultCalc.processEvent({
    id: "v2",
    type: "vault.file.deleted",
    timestamp: "2026-07-19T11:00:00.000Z",
    source: "t",
    payload: {},
    version: 1,
  });
  vaultCalc.processEvent({
    id: "v3",
    type: "vault.folder.created",
    timestamp: "2026-07-19T12:00:00.000Z",
    source: "t",
    payload: {},
    version: 1,
  });

  const resVault = vaultCalc.calculate();
  assertEquals(resVault.filesUploaded, 1, "Files uploaded");
  assertEquals(resVault.filesDeleted, 1, "Files deleted");
  assertEquals(resVault.storageActivity, 1500, "Storage activity size in bytes");
  assertEquals(resVault.folderCreation, 1, "Folder creation count");

  // 2. Search
  const searchCalc = new SearchCalculator();
  searchCalc.processEvent({
    id: "se1",
    type: "search.executed",
    timestamp: "2026-07-19T10:00:00.000Z",
    source: "t",
    payload: { query: "query A" },
    version: 1,
  });
  searchCalc.processEvent({
    id: "se2",
    type: "search.executed",
    timestamp: "2026-07-19T11:00:00.000Z",
    source: "t",
    payload: { query: "query A" },
    version: 1,
  });
  searchCalc.processEvent({
    id: "se3",
    type: "search.executed",
    timestamp: "2026-07-19T12:00:00.000Z",
    source: "t",
    payload: { query: "query B" },
    version: 1,
  });

  const resSearch = searchCalc.calculate();
  assertEquals(resSearch.searchesExecuted, 3, "Searches executed");
  assertEquals(resSearch.repeatedSearches, 1, "Repeated searches count ('query A' executed > 1)");
  assertEquals(resSearch.mostCommonQueries[0].query, "query a", "Most common query normalized");
  assertEquals(resSearch.mostCommonQueries[0].count, 2, "Most common count");

  // 3. Sessions
  const sessCalc = new SessionsCalculator();
  // Duration in payload is focus session minutes (e.g. 25 minutes)
  sessCalc.processEvent({
    id: "ss1",
    type: "session.ended",
    timestamp: "2026-07-19T10:00:00.000Z",
    source: "t",
    payload: { duration: 20 },
    version: 1,
  });
  sessCalc.processEvent({
    id: "ss2",
    type: "session.ended",
    timestamp: "2026-07-19T11:00:00.000Z",
    source: "t",
    payload: { duration: 40 },
    version: 1,
  });

  const resSess = sessCalc.calculate();
  assertEquals(resSess.sessionCount, 2, "Sessions ended");
  assertEquals(
    resSess.totalDuration,
    1200 + 2400,
    "Total duration in seconds (20 + 40 = 60 mins = 3600 seconds)",
  );
  assertEquals(resSess.averageDuration, 1800, "Average duration matches (30 mins = 1800 seconds)");
  assertEquals(resSess.longestSession, 2400, "Longest session in seconds (40 mins = 2400 seconds)");
});

test("Sprint 1.2 - Period-based grouping and aggregation pipeline (Daily, Weekly, Monthly)", () => {
  const db = getDatabaseConnection();
  db.prepare("DELETE FROM events").run();

  const eventRepo = new SqliteEventRepository(db);
  const analyticsRepo = new SqliteAnalyticsRepository(db);
  const engine = new AnalyticsEngine(eventRepo, analyticsRepo);

  // Insert events spread across dates
  // Day 1 (Monday, July 13th)
  eventRepo.insert({
    id: "p1",
    type: "task.created",
    timestamp: "2026-07-13T09:00:00.000Z",
    source: "t",
    payload: {},
    version: 1,
  });
  // Day 2 (Tuesday, July 14th)
  eventRepo.insert({
    id: "p2",
    type: "task.completed",
    timestamp: "2026-07-14T10:00:00.000Z",
    source: "t",
    payload: {},
    version: 1,
  });
  // Day 3 (Sunday, July 19th)
  eventRepo.insert({
    id: "p3",
    type: "note.created",
    timestamp: "2026-07-19T11:00:00.000Z",
    source: "t",
    payload: {},
    version: 1,
  });
  // Next Month Day (August 1st)
  eventRepo.insert({
    id: "p4",
    type: "search.executed",
    timestamp: "2026-08-01T12:00:00.000Z",
    source: "t",
    payload: { query: "akira" },
    version: 1,
  });

  // 1. Daily Aggregation range query
  const dailyReport = engine.aggregatePeriod(
    "day",
    "2026-07-12T00:00:00.000Z",
    "2026-08-05T00:00:00.000Z",
    0,
  );
  assert(dailyReport.has("2026-07-13"), "Daily report contains July 13");
  assert(dailyReport.has("2026-07-14"), "Daily report contains July 14");
  assert(dailyReport.has("2026-07-19"), "Daily report contains July 19");
  assert(dailyReport.has("2026-08-01"), "Daily report contains August 1");

  // 2. Weekly Aggregation
  // In our Monday-first week logic: July 13-19 belongs to the week starting 2026-07-13.
  const weeklyReport = engine.aggregatePeriod(
    "week",
    "2026-07-12T00:00:00.000Z",
    "2026-08-05T00:00:00.000Z",
    0,
  );
  assertEquals(weeklyReport.size, 2, "Should aggregate into 2 weeks");
  assert(weeklyReport.has("2026-07-13"), "Weekly report contains week starting July 13");
  assert(
    weeklyReport.has("2026-07-27") ||
      weeklyReport.has("2026-08-01") ||
      weeklyReport.has("2026-07-27Z") ||
      weeklyReport.has("2026-07-27"),
    "Weekly report contains week starting July 27 (for August 1st event)",
  );

  // 3. Monthly Aggregation
  const monthlyReport = engine.aggregatePeriod(
    "month",
    "2026-07-12T00:00:00.000Z",
    "2026-08-05T00:00:00.000Z",
    0,
  );
  assertEquals(monthlyReport.size, 2, "Should aggregate into 2 months");
  assert(monthlyReport.has("2026-07"), "Monthly report contains July 2026");
  assert(monthlyReport.has("2026-08"), "Monthly report contains August 2026");
});

test("Sprint 1.2 - Large Datasets Performance boundary checking", () => {
  const db = getDatabaseConnection();
  db.prepare("DELETE FROM events").run();

  const eventRepo = new SqliteEventRepository(db);
  const analyticsRepo = new SqliteAnalyticsRepository(db);
  const engine = new AnalyticsEngine(eventRepo, analyticsRepo);

  console.log("Seeding large dataset (2,000 events)...");
  // Seed 2,000 events (using direct prepare to optimize transaction speeds in tests)
  const insertStmt = db.prepare(`
    INSERT INTO events (id, type, source, timestamp, version, payload_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tBase = new Date("2026-07-19T00:00:00.000Z").getTime();
  db.transaction(() => {
    for (let i = 0; i < 2000; i++) {
      insertStmt.run(
        `large-evt-${i}`,
        i % 2 === 0 ? "task.created" : "task.completed",
        "load-test",
        tBase + i * 1000, // events spaced by 1 second
        1,
        JSON.stringify({ id: `task-${i}` }),
      );
    }
  })();

  const startTime = Date.now();
  // Aggregate period
  const report = engine.aggregatePeriod(
    "day",
    "2026-07-18T00:00:00.000Z",
    "2026-07-21T00:00:00.000Z",
    0,
  );
  const elapsed = Date.now() - startTime;

  console.log(`Aggregated 2,000 events in ${elapsed}ms`);
  assert(elapsed < 150, "Aggregation of 2,000 events must run in under 150ms");

  const dayData = report.get("2026-07-19");
  assertExists(dayData, "Metrics calculated successfully for July 19th");
  assertEquals(dayData!["productivity-calculator"].tasksCreated, 1000, "1,000 tasks created");
  assertEquals(dayData!["productivity-calculator"].tasksCompleted, 1000, "1,000 tasks completed");
});

test("Sprint 2.1 - Query Parameter Validation & Date Range Resolution", () => {
  // 1. Predefined ranges
  const resToday = validateAndResolveQuery({ range: "today", filters: { timezone: 330 } });
  assertExists(resToday.startDate, "resolved today range should have a start date");
  assertExists(resToday.endDate, "resolved today range should have an end date");
  assertEquals(
    resToday.timezoneOffsetMinutes,
    330,
    "resolved today range should carry the requested timezone offset",
  );

  const res7Days = validateAndResolveQuery({ range: "last7Days" });
  assert(
    new Date(res7Days.endDate).getTime() >= new Date(res7Days.startDate).getTime(),
    "End date is after start date",
  );

  // 2. Reject end before start
  try {
    validateAndResolveQuery({
      range: "custom",
      startDate: "2026-07-20T00:00:00.000Z",
      endDate: "2026-07-19T00:00:00.000Z",
    });
    assert(false, "Should have thrown for end before start");
  } catch (err: any) {
    assert(err.message.includes("cannot be before start date"), "Error message matches");
  }

  // 3. Reject invalid dates
  try {
    validateAndResolveQuery({
      range: "custom",
      startDate: "not-a-date",
      endDate: "2026-07-19T00:00:00.000Z",
    });
    assert(false, "Should have thrown for invalid start date");
  } catch (err: any) {
    assert(err.message.includes("Invalid start date"), "Error message matches");
  }
});

test("Sprint 2.1 - AnalyticsService & QueryService End-to-End Integration", () => {
  const db = getDatabaseConnection();
  db.prepare("DELETE FROM events").run();

  const eventRepo = new SqliteEventRepository(db);
  const analyticsRepo = new SqliteAnalyticsRepository(db);
  const queryService = new QueryService(eventRepo, analyticsRepo);
  const service = new AnalyticsService(queryService);

  // Seed events
  eventRepo.insert({
    id: "e-svc-1",
    type: "task.created",
    timestamp: "2026-07-19T10:00:00.000Z",
    source: "tasks",
    payload: { id: "t-svc-1", projectId: "p-svc-alpha" },
    version: 1,
  });
  eventRepo.insert({
    id: "e-svc-2",
    type: "task.completed",
    timestamp: "2026-07-19T11:00:00.000Z",
    source: "tasks",
    payload: { id: "t-svc-1", projectId: "p-svc-alpha" },
    version: 1,
  });
  eventRepo.insert({
    id: "e-svc-3",
    type: "vault.file.uploaded",
    timestamp: "2026-07-19T12:00:00.000Z",
    source: "vault",
    payload: { sizeBytes: 250 },
    version: 1,
  });
  eventRepo.insert({
    id: "e-svc-4",
    type: "search.executed",
    timestamp: "2026-07-19T13:00:00.000Z",
    source: "search",
    payload: { query: "akira query" },
    version: 1,
  });
  eventRepo.insert({
    id: "e-svc-5",
    type: "session.ended",
    timestamp: "2026-07-19T14:00:00.000Z",
    source: "sessions",
    payload: { duration: 30 },
    version: 1,
  });

  // Verify dashboard summary
  const summary = service.getDashboardSummary({
    range: "custom",
    startDate: "2026-07-19T00:00:00.000Z",
    endDate: "2026-07-19T23:59:59.999Z",
  });
  assertEquals(summary.tasksCompleted, 1, "Completed matches");
  assertEquals(
    summary.productivityScore,
    32,
    "Score matches (10 completed + 2 created + 20 bonus = 32)",
  );
  assertEquals(summary.activeProjects, 1, "1 active project");
  assertEquals(summary.storageActivity, 250, "Vault upload size is 250");
  assertEquals(summary.sessionDuration, 1800, "Session duration is 1800 seconds (30 mins)");
  assertEquals(summary.dailyEvents, 5, "Total 5 events");

  // Verify productivity summary
  const prodSummary = service.getProductivitySummary({
    range: "custom",
    startDate: "2026-07-19T00:00:00.000Z",
    endDate: "2026-07-19T23:59:59.999Z",
  });
  assertEquals(prodSummary.completionRate, 1.0, "Completion rate is 100%");

  // Verify project health
  const health = service.getProjectHealth("p-svc-alpha", {
    range: "custom",
    startDate: "2026-07-19T00:00:00.000Z",
    endDate: "2026-07-19T23:59:59.999Z",
  });
  assertEquals(health.projectId, "p-svc-alpha", "ID matches");
  assertEquals(health.dormant, false, "Project is active in range, so not dormant");

  // Verify project dormant detection
  const dormantProjects = service.getDormantProjects({
    range: "custom",
    startDate: "2026-07-20T00:00:00.000Z",
    endDate: "2026-07-20T23:59:59.999Z",
  });
  assert(dormantProjects.includes("p-svc-alpha"), "p-svc-alpha is dormant on July 20th");

  // Verify search insights
  const searchInsights = service.getSearchInsights({
    range: "custom",
    startDate: "2026-07-19T00:00:00.000Z",
    endDate: "2026-07-19T23:59:59.999Z",
  });
  assertEquals(searchInsights.searchesExecuted, 1, "1 search executed");
  assertEquals(searchInsights.mostCommonQueries[0].query, "akira query", "Query matches");

  // Verify focus sessions stats
  const sessStats = service.getSessionStatistics({
    range: "custom",
    startDate: "2026-07-19T00:00:00.000Z",
    endDate: "2026-07-19T23:59:59.999Z",
  });
  assertEquals(sessStats.sessionCount, 1, "1 session");
  assertEquals(sessStats.longestSession, 1800, "1800 focus seconds longest");

  // Verify optional filtering (filter by projectId)
  const filteredSummary = service.getDashboardSummary({
    range: "custom",
    startDate: "2026-07-19T00:00:00.000Z",
    endDate: "2026-07-19T23:59:59.999Z",
    filters: { projectId: "non-existent-proj" },
  });
  assertEquals(filteredSummary.tasksCompleted, 0, "No tasks completed for non-existent-proj");

  // Verify empty datasets returns default empty DTOs instead of null
  const emptySummary = service.getDashboardSummary({
    range: "custom",
    startDate: "2026-07-25T00:00:00.000Z",
    endDate: "2026-07-25T23:59:59.999Z",
  });
  assertEquals(emptySummary.tasksCompleted, 0, "empty summary should report zero tasks completed");
  assertEquals(
    emptySummary.productivityScore,
    0,
    "empty summary should report a zero productivity score",
  );
  assertEquals(emptySummary.activeProjects, 0, "empty summary should report zero active projects");
  assertEquals(
    emptySummary.sessionDuration,
    0,
    "empty summary should report zero session duration",
  );
});

test("Sprint 2.2 - DashboardService, DashboardBuilder, and query optimizations", () => {
  const db = getDatabaseConnection();
  db.prepare("DELETE FROM events").run();

  const eventRepo = new SqliteEventRepository(db);
  const analyticsRepo = new SqliteAnalyticsRepository(db);
  const engine = new AnalyticsEngine(eventRepo, analyticsRepo);
  const queryService = new QueryService(eventRepo, analyticsRepo);
  const service = new AnalyticsService(queryService, engine);
  const dashboardSvc = new DashboardService(service);

  // 1. Seed events for previous period (July 18th)
  eventRepo.insert({
    id: "e-dash-prev-1",
    type: "task.created",
    timestamp: "2026-07-18T10:00:00.000Z",
    source: "tasks",
    payload: { id: "t-d-1", projectId: "p-dash-1" },
    version: 1,
  });
  eventRepo.insert({
    id: "e-dash-prev-2",
    type: "task.completed",
    timestamp: "2026-07-18T11:00:00.000Z",
    source: "tasks",
    payload: { id: "t-d-1", projectId: "p-dash-1" },
    version: 1,
  });

  // 2. Seed events for current period (July 19th)
  eventRepo.insert({
    id: "e-dash-curr-1",
    type: "task.created",
    timestamp: "2026-07-19T10:00:00.000Z",
    source: "tasks",
    payload: { id: "t-d-2", projectId: "p-dash-1" },
    version: 1,
  });
  eventRepo.insert({
    id: "e-dash-curr-2",
    type: "task.completed",
    timestamp: "2026-07-19T11:00:00.000Z",
    source: "tasks",
    payload: { id: "t-d-2", projectId: "p-dash-1" },
    version: 1,
  });
  eventRepo.insert({
    id: "e-dash-curr-3",
    type: "task.created",
    timestamp: "2026-07-19T12:00:00.000Z",
    source: "tasks",
    payload: { id: "t-d-3", projectId: "p-dash-1" },
    version: 1,
  });

  // Current Productivity: Created = 2, Completed = 1. Score = (1 * 10) + (2 * 2) = 14.
  // Previous Productivity: Created = 1, Completed = 1. Score = (1 * 10) + (1 * 2) + 20 bonus = 32.
  // Delta = 14 - 32 = -18.

  // 3. Build dashboard
  const dashboard = dashboardSvc.getDashboard({
    range: "custom",
    startDate: "2026-07-19T00:00:00.000Z",
    endDate: "2026-07-19T23:59:59.999Z",
  });

  assertExists(dashboard, "dashboard should be built");
  assertExists(dashboard.summary, "dashboard should include a summary section");
  assertExists(dashboard.widgets, "dashboard should include widgets");

  // Assert widget properties
  assertEquals(dashboard.widgets.productivity.score, 14, "Current score matches");
  assertEquals(
    dashboard.widgets.productivity.delta,
    -18,
    "Productivity delta compared to yesterday matches",
  );
  assertEquals(dashboard.widgets.projects.activeProjects, 1, "1 active project");
  assertEquals(dashboard.widgets.projects.dormantProjects, 0, "0 dormant projects");

  // Verify empty dashboard returns zeroed projections instead of null
  const emptyDashboard = dashboardSvc.getDashboard({
    range: "custom",
    startDate: "2026-07-25T00:00:00.000Z",
    endDate: "2026-07-25T23:59:59.999Z",
  });
  assertExists(emptyDashboard, "dashboard should still be built for an empty dataset");
  assertEquals(emptyDashboard.widgets.productivity.score, 0, "Empty score is 0");
  assertEquals(emptyDashboard.widgets.productivity.delta, 0, "Empty delta is 0");
  assertEquals(emptyDashboard.widgets.activity.activeDays, 0, "Empty activeDays is 0");
});

test("Sprint 3.1 - Historical Rebuild Manager (Full, Incremental, Resume)", () => {
  const db = getDatabaseConnection();
  db.prepare("DELETE FROM events").run();

  const eventRepo = new SqliteEventRepository(db);
  const analyticsRepo = new SqliteAnalyticsRepository(db);
  const rebuildManager = new RebuildManager(eventRepo, analyticsRepo);

  // 1. Seed events
  eventRepo.insert({
    id: "reb-1",
    type: "task.created",
    timestamp: "2026-07-19T10:00:00.000Z",
    source: "t",
    payload: {},
    version: 1,
  });
  eventRepo.insert({
    id: "reb-2",
    type: "task.completed",
    timestamp: "2026-07-19T11:00:00.000Z",
    source: "t",
    payload: {},
    version: 1,
  });

  // Run full rebuild
  const resFull = rebuildManager.rebuildAll();
  assertEquals(resFull.totalEventsProcessed, 2, "Full rebuild processed 2 events");
  assertEquals(resFull.datesAggregated, 1, "Aggregated 1 date");

  // Verify state persisted
  const state = analyticsRepo.getRebuildState();
  assertExists(state, "rebuild state should be persisted");
  assertEquals(
    state!.lastProcessedEventId,
    "reb-2",
    "rebuild state should record the last processed event id",
  );
  assertExists(
    state!.lastProcessedTimestamp,
    "rebuild state should record the last processed timestamp",
  );

  // 2. Incremental Rebuild
  eventRepo.insert({
    id: "reb-3",
    type: "note.created",
    timestamp: "2026-07-20T10:00:00.000Z",
    source: "n",
    payload: {},
    version: 1,
  });
  const resIncr = rebuildManager.rebuildIncremental();
  assertEquals(resIncr.totalEventsProcessed, 1, "Incremental rebuild processed 1 new event");
  assertEquals(resIncr.datesAggregated, 1, "Aggregated 1 new date");

  const stateNew = analyticsRepo.getRebuildState();
  assertEquals(stateNew!.lastProcessedEventId, "reb-3", "State updated to reb-3");
});

test("Sprint 3.1 - Consistency Checker & Diagnostics (Daily, Project, Mismatches)", () => {
  const db = getDatabaseConnection();
  db.prepare("DELETE FROM events").run();

  const eventRepo = new SqliteEventRepository(db);
  const analyticsRepo = new SqliteAnalyticsRepository(db);
  const checker = new ConsistencyChecker(eventRepo, analyticsRepo);
  const diag = new DiagnosticsService(undefined, checker, analyticsRepo);
  const rebuildManager = new RebuildManager(eventRepo, analyticsRepo);

  // Seed event
  eventRepo.insert({
    id: "cons-1",
    type: "task.created",
    timestamp: "2026-07-19T10:00:00.000Z",
    source: "t",
    payload: {},
    version: 1,
  });

  // Rebuild
  rebuildManager.rebuildAll();

  // Run consistency checks
  const rep = checker.checkConsistency();
  assertEquals(rep.isConsistent, true, "Calculations match derived tables");

  // Fetch health report
  const health = diag.getAnalyticsHealth();
  assertEquals(
    health.status,
    "HEALTHY",
    "diagnostics should report HEALTHY for a consistent store",
  );
  assertEquals(health.schemaValid, true, "diagnostics should report the schema as valid");
  assertEquals(health.consistent, true, "diagnostics should report derived data as consistent");

  // Interrupted / corrupted state simulation (introducing a database mismatch manually)
  db.prepare("UPDATE daily_metrics SET tasks_created = 99 WHERE date = '2026-07-19'").run();

  const reportMismatch = checker.checkConsistency();
  assertEquals(reportMismatch.isConsistent, false, "Inconsistency detected");
  assertEquals(reportMismatch.mismatches.length, 1, "1 mismatch recorded");
  assertEquals(
    reportMismatch.mismatches[0].checkType,
    "tasks_created mismatch",
    "consistency report should name the mismatching check",
  );

  // Health report must update to DEGRADED
  const degradedHealth = diag.getAnalyticsHealth();
  assertEquals(
    degradedHealth.status,
    "DEGRADED",
    "diagnostics should report DEGRADED when a mismatch exists",
  );
});

test("Sprint 3.1 - Fault Tolerance on Malformed & Corrupted payload events", () => {
  const db = getDatabaseConnection();
  db.prepare("DELETE FROM events").run();

  const eventRepo = new SqliteEventRepository(db);
  const analyticsRepo = new SqliteAnalyticsRepository(db);
  const rebuildManager = new RebuildManager(eventRepo, analyticsRepo);

  // 1. Seed valid events
  eventRepo.insert({
    id: "ft-1",
    type: "task.created",
    timestamp: "2026-07-19T10:00:00.000Z",
    source: "t",
    payload: {},
    version: 1,
  });

  // 2. Seed malformed event (missing id or missing properties inside EventStore raw row)
  // We use direct database insert to simulate corrupted event payload that got into the store
  db.prepare(
    `
    INSERT INTO events (id, type, source, timestamp, version, payload_json)
    VALUES ('ft-bad', '', 'corrupted-source', ?, 1, 'invalid-json{')
  `,
  ).run(new Date("2026-07-19T11:00:00.000Z").getTime());

  // Rebuild should complete successfully, ignoring the bad event
  const res = rebuildManager.rebuildAll();
  assertEquals(
    res.datesAggregated,
    1,
    "Rebuild aggregated successfully despite the corrupted event",
  );
  assertEquals(res.errorCount, 1, "1 error logged during fault isolation");
});

test("Sprint 3.1 - Scalability Performance Benchmarking", () => {
  const runner = new BenchmarkRunner();

  console.log("Running Scalability Performance Benchmarks...");
  const bench1k = runner.runBenchmark(1000);
  console.log(
    `  [1,000 events]: Rebuilt in ${bench1k.rebuildDurationMs}ms, Throughput: ${bench1k.throughputEventsPerSec} events/sec`,
  );
  assert(bench1k.rebuildDurationMs < 100, "1k events rebuild runs in under 100ms");

  const bench5k = runner.runBenchmark(5000);
  console.log(
    `  [5,000 events]: Rebuilt in ${bench5k.rebuildDurationMs}ms, Throughput: ${bench5k.throughputEventsPerSec} events/sec`,
  );
  assert(bench5k.rebuildDurationMs < 200, "5k events rebuild runs in under 200ms");
});

// ----------------------------------------------------
