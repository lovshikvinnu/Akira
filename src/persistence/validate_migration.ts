import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { executeMigration } from "./migration-impl";
import { initializeDatabase } from "./initializer";
import { getDatabaseConnection, closeDatabaseConnection } from "./connection";

// Define helper to create temporary databases
const TEMP_DB_PATH = path.join(process.cwd(), "src", "persistence", "temp_test_akira.db");

function setupTestDb() {
  // Ensure previous temp db is deleted
  cleanupTestDb();
  process.env.AKIRA_DATABASE_PATH = TEMP_DB_PATH;
  
  // Initialize db schema
  initializeDatabase();
  return getDatabaseConnection();
}

function cleanupTestDb() {
  closeDatabaseConnection();
  if (fs.existsSync(TEMP_DB_PATH)) {
    try {
      fs.unlinkSync(TEMP_DB_PATH);
      // Clean up WAL journals if they exist
      if (fs.existsSync(TEMP_DB_PATH + "-wal")) fs.unlinkSync(TEMP_DB_PATH + "-wal");
      if (fs.existsSync(TEMP_DB_PATH + "-shm")) fs.unlinkSync(TEMP_DB_PATH + "-shm");
    } catch (err) {
      console.warn("Warning: Could not delete temp DB files:", err);
    }
  }
}

// Scenarios to test
async function runTests() {
  console.log("=== STARTING PERSISTENCE MIGRATION INTEGRATION TESTS ===");
  let failed = false;

  const assert = (condition: boolean, message: string) => {
    if (!condition) {
      console.error(`  [FAIL] ${message}`);
      failed = true;
    } else {
      console.log(`  [PASS] ${message}`);
    }
  };

  // 1. Fresh Install Test
  console.log("\nScenario 1: Fresh Install (no data in localStorage, empty DB)");
  try {
    const db = setupTestDb();
    const versionRow = db.prepare("SELECT MAX(version) as current_version FROM schema_version").get() as { current_version: number };
    assert(versionRow.current_version === 1, "Schema version is 1");

    const projectsCount = db.prepare("SELECT COUNT(*) as cnt FROM projects").get() as { cnt: number };
    assert(projectsCount.cnt === 0, "Projects table is empty");

    const migrationHistoryCount = db.prepare("SELECT COUNT(*) as cnt FROM migration_history").get() as { cnt: number };
    assert(migrationHistoryCount.cnt === 0, "Migration history table is empty");
  } catch (err: any) {
    console.error("Scenario 1 crashed:", err);
    failed = true;
  } finally {
    cleanupTestDb();
  }

  // 2. Standard Migration Test
  console.log("\nScenario 2: Standard E2E Migration (realistic legacy payload)");
  try {
    const db = setupTestDb();
    
    const legacyPayload = {
      projects: [
        {
          id: "proj-101",
          name: "Building Akira",
          tag: "Work",
          description: "Building the ultimate companion",
          progress: 45,
          color: "from-blue-500 to-purple-600",
          nextTask: "Verify migrations",
          notes: "Focus on SQLite",
          timeSpentMinutes: 120,
          lastWorked: "2026-07-15T12:00:00Z",
          createdAt: "2026-07-15T08:00:00Z",
          icon: "cpu"
        },
        {
          id: "proj-102",
          name: "Health & Fitness",
          tag: "Personal",
          description: "Running and strength training",
          progress: 20,
          color: "from-green-400 to-emerald-600",
          nextTask: "Run 5k",
          notes: "Eat clean",
          timeSpentMinutes: 60,
          lastWorked: "2026-07-14T18:00:00Z",
          createdAt: "2026-07-10T10:00:00Z",
          icon: "dumbbell"
        }
      ],
      tasks: [
        {
          id: "task-201",
          title: "Write migration validator script",
          description: "Verify SQLite data integrity",
          priority: "High",
          estimatedDuration: 45,
          dueDate: "2026-07-16T18:00:00Z",
          done: false,
          completed: false,
          projectId: "proj-101",
          createdAt: "2026-07-15T09:00:00Z",
          updatedAt: "2026-07-15T09:30:00Z"
        },
        {
          id: "task-202",
          title: "Setup better-sqlite3 connection",
          description: "Setup server function logic",
          priority: "Medium",
          estimatedDuration: 30,
          dueDate: null,
          done: true,
          completed: true,
          projectId: "proj-101",
          createdAt: "2026-07-15T08:30:00Z",
          updatedAt: "2026-07-15T11:00:00Z"
        }
      ],
      notes: [
        {
          id: "note-301",
          title: "Migration Notes",
          content: "Remember to test foreign key constraints on SQLite db.",
          tags: ["sqlite", "migration"],
          createdAt: "2026-07-15T10:00:00Z",
          updatedAt: "2026-07-15T10:05:00Z",
          pinned: true,
          favorite: true,
          projectId: "proj-101"
        }
      ],
      sessions: [
        {
          id: "sess-401",
          projectId: "proj-101",
          task: "Setup better-sqlite3 connection",
          startedAt: "2026-07-15T10:30:00Z",
          endedAt: "2026-07-15T11:00:00Z",
          duration: 30,
          notes: "Connected fine."
        }
      ],
      profile: {
        name: "Valued User",
        role: "AI Tester",
        motto: "Aesthetics and order"
      },
      activeSession: {
        projectId: "proj-101",
        task: "Write migration validator script",
        startedAt: "2026-07-16T00:00:00Z"
      },
      lastProjectId: "proj-101",
      chat: [
        {
          id: "msg-501",
          role: "user",
          text: "Let's migrate our state",
          createdAt: "2026-07-15T11:15:00Z"
        }
      ],
      streaks: [
        {
          id: "strk-601",
          label: "Coding",
          icon: "cpu",
          days: 5,
          pct: 100,
          color: "from-blue-500"
        }
      ]
    };

    const res = executeMigration(db, JSON.stringify(legacyPayload));
    assert(res.success === true, "Migration returns success: true");
    assert(res.status === "migrated", "Migration returns status: 'migrated'");

    // Verify projects
    const p1 = db.prepare("SELECT * FROM projects WHERE id = ?").get("proj-101") as any;
    assert(p1 !== undefined, "Project proj-101 was migrated");
    assert(p1.name === "Building Akira", "Project name matches");
    assert(p1.progress === 45, "Project progress matches");
    assert(p1.icon === "cpu", "Project icon matches");
    
    const p2 = db.prepare("SELECT * FROM projects WHERE id = ?").get("proj-102") as any;
    assert(p2 !== undefined, "Project proj-102 was migrated");
    assert(p2.progress === 20, "Project progress matches");

    // Verify tasks
    const t1 = db.prepare("SELECT * FROM tasks WHERE id = ?").get("task-201") as any;
    assert(t1 !== undefined, "Task task-201 was migrated");
    assert(t1.title === "Write migration validator script", "Task title matches");
    assert(t1.done === 0, "Task done status is 0 (false)");
    assert(t1.project_id === "proj-101", "Task is linked to proj-101");

    const t2 = db.prepare("SELECT * FROM tasks WHERE id = ?").get("task-202") as any;
    assert(t2 !== undefined, "Task task-202 was migrated");
    assert(t2.done === 1, "Task done status is 1 (true)");
    assert(t2.completed === 1, "Task completed status is 1 (true)");

    // Verify notes
    const n1 = db.prepare("SELECT * FROM notes WHERE id = ?").get("note-301") as any;
    assert(n1 !== undefined, "Note was migrated");
    assert(n1.content === "Remember to test foreign key constraints on SQLite db.", "Note content matches");
    assert(n1.pinned === 1, "Note pinned status is 1 (true)");
    assert(n1.favorite === 1, "Note favorite status is 1 (true)");
    assert(n1.tags === JSON.stringify(["sqlite", "migration"]), "Note tags are JSON stringified");

    // Verify sessions
    const s1 = db.prepare("SELECT * FROM sessions WHERE id = ?").get("sess-401") as any;
    assert(s1 !== undefined, "Session was migrated");
    assert(s1.duration === 30, "Session duration matches");
    assert(s1.project_id === "proj-101", "Session project ID matches");

    // Verify settings
    const profile = db.prepare("SELECT value FROM settings WHERE key = 'profile'").get() as any;
    assert(JSON.parse(profile.value).name === "Valued User", "Profile settings key exists and matches");

    const activeSession = db.prepare("SELECT value FROM settings WHERE key = 'active_session'").get() as any;
    assert(JSON.parse(activeSession.value).task === "Write migration validator script", "Active session settings key exists and matches");

    const lastProjectId = db.prepare("SELECT value FROM settings WHERE key = 'last_project_id'").get() as any;
    assert(JSON.parse(lastProjectId.value) === "proj-101", "Last project ID settings key exists and matches");

    const chat = db.prepare("SELECT value FROM settings WHERE key = 'chat'").get() as any;
    assert(JSON.parse(chat.value)[0].text === "Let's migrate our state", "Chat history settings key exists and matches");

    const streaks = db.prepare("SELECT value FROM settings WHERE key = 'streaks'").get() as any;
    assert(JSON.parse(streaks.value)[0].label === "Coding", "Streaks settings key exists and matches");

    // Verify history
    const hist = db.prepare("SELECT * FROM migration_history WHERE migration_name = ?").get("legacy_localstorage_migration") as any;
    assert(hist !== undefined, "Migration history has a record");
    assert(hist.status === "completed", "Migration status in history is 'completed'");
    assert(hist.error_message === null, "Migration error message is null");

    // 3. Idempotency / Duplicate Run Test
    console.log("\nScenario 3: Duplicate Migration / Idempotency (re-running migration)");
    const resDup = executeMigration(db, JSON.stringify(legacyPayload));
    assert(resDup.success === true, "Idempotent migration returns success: true");
    assert(resDup.status === "already_completed", "Idempotent migration returns status: 'already_completed'");

    // Verify no counts doubled
    const projCount = db.prepare("SELECT COUNT(*) as cnt FROM projects").get() as { cnt: number };
    assert(projCount.cnt === 2, "Projects count remained at 2");

    const taskCount = db.prepare("SELECT COUNT(*) as cnt FROM tasks").get() as { cnt: number };
    assert(taskCount.cnt === 2, "Tasks count remained at 2");

  } catch (err: any) {
    console.error("Scenario 2/3 crashed:", err);
    failed = true;
  } finally {
    cleanupTestDb();
  }

  // 4. Corrupted Payload Test
  console.log("\nScenario 4: Corrupted LocalStorage Payload (malformed JSON)");
  try {
    const db = setupTestDb();
    const resCorrupt = executeMigration(db, "{projects: [invalid-json}");
    assert(resCorrupt.success === false, "Corrupted payload returns success: false");
    assert(resCorrupt.status === "failed", "Corrupted payload returns status: 'failed'");
    assert(resCorrupt.error === "Invalid JSON format", "Error message matches 'Invalid JSON format'");

    const projectsCount = db.prepare("SELECT COUNT(*) as cnt FROM projects").get() as { cnt: number };
    assert(projectsCount.cnt === 0, "No projects inserted");

    const histCount = db.prepare("SELECT COUNT(*) as cnt FROM migration_history").get() as { cnt: number };
    assert(histCount.cnt === 0, "No migration_history logged for parse failure");
  } catch (err: any) {
    console.error("Scenario 4 crashed:", err);
    failed = true;
  } finally {
    cleanupTestDb();
  }

  // 5. Partial Payload Test
  console.log("\nScenario 5: Partial LocalStorage Payload (missing optional fields)");
  try {
    const db = setupTestDb();
    
    // Legacy payload missing tasks, notes, sessions, chat, streaks
    const partialPayload = {
      projects: [
        {
          id: "proj-201",
          name: "Minimal Project",
          tag: "Work",
          color: "blue"
        }
      ],
      profile: {
        name: "Partial User",
        role: "Minimalist",
        motto: "Less is more"
      }
    };

    const res = executeMigration(db, JSON.stringify(partialPayload));
    assert(res.success === true, "Partial payload migration returns success: true");
    assert(res.status === "migrated", "Partial payload migration returns status: 'migrated'");

    const proj = db.prepare("SELECT * FROM projects WHERE id = ?").get("proj-201") as any;
    assert(proj !== undefined, "Minimal Project was inserted");
    assert(proj.name === "Minimal Project", "Project name matches");

    const tasksCount = db.prepare("SELECT COUNT(*) as cnt FROM tasks").get() as { cnt: number };
    assert(tasksCount.cnt === 0, "Tasks table remains empty");

    const notesCount = db.prepare("SELECT COUNT(*) as cnt FROM notes").get() as { cnt: number };
    assert(notesCount.cnt === 0, "Notes table remains empty");

    const profile = db.prepare("SELECT value FROM settings WHERE key = 'profile'").get() as any;
    assert(JSON.parse(profile.value).name === "Partial User", "Profile was migrated");
  } catch (err: any) {
    console.error("Scenario 5 crashed:", err);
    failed = true;
  } finally {
    cleanupTestDb();
  }

  // 6. Transaction Rollback Test
  console.log("\nScenario 6: Transaction Rollback on Migration Failure (foreign key / payload error)");
  try {
    const db = setupTestDb();

    // Payload has valid project, but task has no project ID AND we violate foreign key constraints (or throw payload error)
    // Wait, let's inject a task with no title (which throws "Invalid task element in payload" in JS before SQLite insert)
    // Let's also check a foreign key constraint violation. Let's do both.
    
    // Case 6a: Validation error in Javascript during transaction
    console.log("  Subcase 6a: JS Error thrown inside transaction");
    const badPayloadJs = {
      projects: [
        {
          id: "proj-ok",
          name: "Project OK",
          tag: "Work",
          color: "blue"
        }
      ],
      tasks: [
        {
          id: "task-bad",
          // missing title (violates payload validation)
          projectId: "proj-ok"
        }
      ]
    };

    const resJs = executeMigration(db, JSON.stringify(badPayloadJs));
    assert(resJs.success === false, "JS error payload returns success: false");
    assert(resJs.status === "failed", "JS error payload returns status: 'failed'");
    assert(resJs.error === "Invalid task element in payload", "Error message matches expected JS throw");

    // Check rollback: verify no projects were inserted!
    const projCountJs = db.prepare("SELECT COUNT(*) as cnt FROM projects").get() as { cnt: number };
    assert(projCountJs.cnt === 0, "Rollback successful: projects table is empty");

    // Check history logging
    const histJs = db.prepare("SELECT * FROM migration_history WHERE migration_name = ?").get("legacy_localstorage_migration") as any;
    assert(histJs !== undefined, "Migration history has a record");
    assert(histJs.status === "failed", "Status in history is 'failed'");
    assert(histJs.error_message === "Invalid task element in payload", "Error message saved in history");

    // Clear db for Case 6b
    cleanupTestDb();
    const db2 = setupTestDb();

    // Case 6b: SQLite Foreign Key violation inside transaction
    console.log("  Subcase 6b: SQLite Constraint/Foreign Key Violation");
    const badPayloadSql = {
      projects: [
        {
          id: "proj-ok2",
          name: "Project OK 2",
          tag: "Work",
          color: "blue"
        }
      ],
      tasks: [
        {
          id: "task-ok2",
          title: "Task with missing project",
          priority: "Medium",
          projectId: "non-existent-project-id" // Violates foreign key reference
        }
      ]
    };

    const resSql = executeMigration(db2, JSON.stringify(badPayloadSql));
    assert(resSql.success === false, "Sql constraint violation returns success: false");
    assert(resSql.status === "failed", "Sql constraint violation returns status: 'failed'");
    assert(resSql.error!.includes("FOREIGN KEY constraint failed"), "Error message contains 'FOREIGN KEY constraint failed'");

    // Check rollback: verify no projects were inserted!
    const projCountSql = db2.prepare("SELECT COUNT(*) as cnt FROM projects").get() as { cnt: number };
    assert(projCountSql.cnt === 0, "Rollback successful: projects table is empty");

    const histSql = db2.prepare("SELECT * FROM migration_history WHERE migration_name = ?").get("legacy_localstorage_migration") as any;
    assert(histSql.status === "failed", "Status in history is 'failed'");
    assert(histSql.error_message!.includes("FOREIGN KEY constraint failed"), "SQL error message saved in history");

  } catch (err: any) {
    console.error("Scenario 6 crashed:", err);
    failed = true;
  } finally {
    cleanupTestDb();
  }

  console.log("\n=== PERSISTENCE MIGRATION INTEGRATION TESTS COMPLETE ===");
  if (failed) {
    console.error("Overall Test Result: FAILED");
    process.exit(1);
  } else {
    console.log("Overall Test Result: ALL PASSED");
    process.exit(0);
  }
}

runTests();
