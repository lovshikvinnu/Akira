// Set isolated test database environment variables before loading database connectors
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { initializeDatabase } from "../../../persistence/initializer";
import { timelineRepository } from "../../../persistence/repositories";
import { getDatabaseConnection } from "../../../persistence/connection";

let totalTests = 0;
let passedTests = 0;

function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  console.log(`Running: ${name}`);
  try {
    const res = fn();
    if (res instanceof Promise) {
      res
        .then(() => {
          passedTests++;
        })
        .catch((error) => {
          console.error(`  ✗ Failed: ${name}`);
          console.error(error);
        });
    } else {
      passedTests++;
    }
  } catch (error) {
    console.error(`  ✗ Failed: ${name}`);
    console.error(error);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// Bootstrap schema in isolated in-memory DB
initializeDatabase();

// Setup projects to satisfy foreign keys
const db = getDatabaseConnection();
db.prepare("DELETE FROM projects").run();
db.prepare(
  `
  INSERT INTO projects (id, name, tag, description, progress, color, created_at, updated_at, icon)
  VALUES ('proj-perf', 'Performance Project', 'PP', 'Perf Testing', 0, 'blue', ?, ?, 'folder')
`,
).run(new Date().toISOString(), new Date().toISOString());

test("Database Performance - Latency under load (capacity 1,000+ records)", () => {
  timelineRepository.clearAll();

  // Seed 1,000 timeline events
  const baseTime = Date.now();
  db.transaction(() => {
    for (let i = 0; i < 1000; i++) {
      timelineRepository.insert({
        id: `evt-${i}`,
        eventType: "task.completed",
        projectId: "proj-perf",
        payload: { title: `Performance Task ${i}` },
        payloadVersion: 1,
        timestamp: new Date(baseTime - i * 1000).toISOString(),
      });
    }
  })();

  assertEquals(timelineRepository.count(), 1000, "Seeding check failed");

  // Measure cursored read latency
  const start = performance.now();
  const result = timelineRepository.findPaged({
    limit: 15,
    filterProjectIds: ["proj-perf"],
    filterCategories: ["tasks"],
  });
  const duration = performance.now() - start;

  console.log(`  -> Cursor-based pagination read speed: ${duration.toFixed(2)}ms`);

  // Performance threshold. Budget target is < 15ms, with a 30ms test boundary to prevent transient machine CPU throttle failures.
  if (duration > 30) {
    throw new Error(
      `Database query latency exceeded performance budget boundary of 30ms. Got: ${duration.toFixed(2)}ms`,
    );
  }

  assertEquals(result.items.length, 15, "Should retrieve 15 items");
});

test("Operational Resiliency - Lock Recovery and Fallback Queue", () => {
  timelineRepository.clearAll();

  // Mock repository getDb to simulate a locked database transaction
  const originalGetDb = (timelineRepository as any).getDb;
  (timelineRepository as any).getDb = () => {
    throw new Error("SQLite write failed: Database file is locked (SQLITE_BUSY)");
  };

  timelineRepository.insert({
    id: "offline-evt",
    eventType: "task.created",
    projectId: "proj-perf",
    payload: { title: "Offline Task" },
    payloadVersion: 1,
    timestamp: new Date().toISOString(),
  });

  // Verify count contains the fallback item
  assertEquals(
    timelineRepository.count(),
    1,
    "Count should include the offline event cached in-memory",
  );

  // Restore the original database connection resolver
  (timelineRepository as any).getDb = originalGetDb;

  // Verify read blending incorporates fallback items correctly
  const queryResult = timelineRepository.findPaged({ limit: 10 });
  assertEquals(
    queryResult.items.length,
    1,
    "Blended result should retrieve the offline fallback event",
  );
  assertEquals(
    queryResult.items[0].id,
    "offline-evt",
    "Retrieved event should match offline cached event",
  );

  timelineRepository.clearAll();
});

// Since async tests complete in next tick, delay exit to ensure results print
setTimeout(() => {
  console.log(`\nTimeline Performance Test Run Completed: ${passedTests} / ${totalTests} Passed.`);
  if (passedTests < totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}, 200);
