import { Events } from "../../contracts/events";
import { TimelineEvent, TimelineQueryRequest, TimelineQueryResult } from "./types";
import { TimelineRepository } from "../../contracts/repositories/TimelineRepository";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export class TimelineService {
  private unsubscribers: (() => void)[] = [];
  private isInitialized = false;

  private async getRepo(): Promise<TimelineRepository> {
    // Dynamic import to prevent better-sqlite3 from leaking to the browser bundle
    const { timelineRepository } = await import("../../persistence/repositories");
    return timelineRepository;
  }

  /**
   * Initializes the Timeline Service.
   * Connects the new Instrumentation Event Bus subscription.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.unsubscribers = [];

    // Dynamically load the globalEventBus and TimelineSubscriber to prevent client leaks
    const { globalEventBus } = await import("../../instrumentation");
    const { TimelineSubscriber } =
      await import("../../instrumentation/subscribers/timeline-subscriber");
    const repo = await this.getRepo();

    const timelineSub = new TimelineSubscriber(repo);
    globalEventBus.subscribe(timelineSub);

    this.unsubscribers.push(() => {
      globalEventBus.unsubscribe(timelineSub);
    });

    this.isInitialized = true;

    // Seed mock data for local development if empty
    if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
      try {
        await this.seedDevelopmentEvents();
      } catch (err) {
        console.error("Failed to seed development timeline events:", err);
      }
    }
  }

  /**
   * Retrieves timeline events matching filter query.
   */
  public async getEvents(request: TimelineQueryRequest): Promise<TimelineQueryResult> {
    const repo = await this.getRepo();
    return repo.findPaged(request);
  }

  /**
   * Fetches total count of timeline events.
   */
  public async getCount(): Promise<number> {
    const repo = await this.getRepo();
    return repo.count();
  }

  /**
   * Seed mock development events.
   */
  public async seedDevelopmentEvents(): Promise<void> {
    const repo = await this.getRepo();
    const count = repo.count();
    if (count > 0) return; // already seeded

    const baseTime = Date.now();
    const mockEvents: TimelineEvent[] = [
      // Today events
      {
        id: uid(),
        eventType: Events.TASK_COMPLETED,
        projectId: "proj-1",
        payload: { id: "task-1", title: "Refactor database boundaries", projectId: "proj-1" },
        payloadVersion: 1,
        timestamp: new Date(baseTime - 10 * 60000).toISOString(), // 10m ago
      },
      {
        id: uid(),
        eventType: Events.SESSION_ENDED,
        projectId: "proj-1",
        payload: {
          projectId: "proj-1",
          task: "Database separation refactor",
          duration: 45,
          notes: "Complete clean code isolation",
        },
        payloadVersion: 1,
        timestamp: new Date(baseTime - 30 * 60000).toISOString(), // 30m ago
      },
      {
        id: uid(),
        eventType: Events.SESSION_STARTED,
        projectId: "proj-1",
        payload: { projectId: "proj-1", task: "Database separation refactor" },
        payloadVersion: 1,
        timestamp: new Date(baseTime - 75 * 60000).toISOString(), // 1h 15m ago
      },
      {
        id: uid(),
        eventType: Events.NOTE_CREATED,
        projectId: "proj-1",
        payload: { id: "note-1", title: "Dependency Rules", projectId: "proj-1" },
        payloadVersion: 1,
        timestamp: new Date(baseTime - 3 * 3600000).toISOString(), // 3h ago
      },

      // Yesterday events
      {
        id: uid(),
        eventType: Events.TASK_CREATED,
        projectId: "proj-1",
        payload: {
          id: "task-1",
          title: "Refactor database boundaries",
          projectId: "proj-1",
          priority: "High",
        },
        payloadVersion: 1,
        timestamp: new Date(baseTime - 25 * 3600000).toISOString(), // 25h ago
      },
      {
        id: uid(),
        eventType: Events.PROJECT_CREATED,
        projectId: "proj-1",
        payload: {
          id: "proj-1",
          name: "Project Akira Master",
          tag: "AK-MASTER",
          icon: "cpu",
          color: "from-blue-500 to-indigo-600",
        },
        payloadVersion: 1,
        timestamp: new Date(baseTime - 28 * 3600000).toISOString(), // 28h ago
      },

      // Earlier events
      {
        id: uid(),
        eventType: Events.NOTE_CREATED,
        projectId: null,
        payload: { id: "note-2", title: "Initial Ideas", projectId: null },
        payloadVersion: 1,
        timestamp: new Date(baseTime - 5 * 24 * 3600000).toISOString(), // 5 days ago
      },
      {
        id: uid(),
        eventType: Events.MISSION_COMPLETED,
        projectId: null,
        payload: { title: "Complete design constitution check" },
        payloadVersion: 1,
        timestamp: new Date(baseTime - 8 * 24 * 3600000).toISOString(), // 8 days ago
      },
    ];

    await dbTransaction(() => {
      mockEvents.forEach((evt) => repo.insert(evt));
    });

    console.log(`Seeded ${mockEvents.length} mock timeline events for development.`);
  }

  /**
   * Shut down EventBus subscriptions and release listeners.
   */
  public shutdown(): void {
    this.unsubscribers.forEach((unsub) => {
      try {
        unsub();
      } catch (err) {
        console.error("Error unsubscribing timeline event handler:", err);
      }
    });
    this.unsubscribers = [];
    this.isInitialized = false;
  }
}

// Transaction runner utility to seed events in a single transaction
async function dbTransaction(action: () => void): Promise<void> {
  const { getDatabaseConnection } = await import("../../persistence/connection");
  const db = getDatabaseConnection();
  db.transaction(action)();
}

export const timelineService = new TimelineService();
