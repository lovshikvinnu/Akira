// Set isolated test database environment variables before loading database connectors
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { initializeDatabase } from "./initializer";
import { getDatabaseConnection } from "./connection";

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

function assertExists(value: any, message: string) {
  if (value === undefined || value === null) {
    throw new Error(`${message} -> Expected value to exist, but got ${value}`);
  }
}

// Setup memory database schema
initializeDatabase();
const db = getDatabaseConnection();

// Clean up DB helper
function resetDb() {
  db.prepare("DELETE FROM vault_file_links").run();
  db.prepare("DELETE FROM vault_file_tags").run();
  db.prepare("DELETE FROM vault_files").run();
  db.prepare("DELETE FROM vault_folders").run();
  db.prepare("DELETE FROM vault_tags").run();
  db.prepare("DELETE FROM projects").run();
  db.prepare("DELETE FROM tasks").run();
  db.prepare("DELETE FROM notes").run();
  db.prepare("DELETE FROM sessions").run();
  db.prepare("DELETE FROM timeline_events").run();
}

// -------------------------------------------------------------
// TEST CASES
// -------------------------------------------------------------

test("Vault DB - Table Creation Check", () => {
  const tables = db
    .prepare(
      `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name LIKE 'vault_%'
    `,
    )
    .all() as { name: string }[];

  const tableNames = tables.map((t) => t.name);
  assertEquals(tableNames.includes("vault_folders"), true, "vault_folders table should exist");
  assertEquals(tableNames.includes("vault_files"), true, "vault_files table should exist");
  assertEquals(tableNames.includes("vault_tags"), true, "vault_tags table should exist");
  assertEquals(tableNames.includes("vault_file_tags"), true, "vault_file_tags table should exist");
  assertEquals(
    tableNames.includes("vault_file_links"),
    true,
    "vault_file_links table should exist",
  );
});

test("Vault DB - Unique Index and Constraints Check", () => {
  resetDb();

  // Insert a folder
  db.prepare(
    `
    INSERT INTO vault_folders (id, name, parent_id, created_at, updated_at)
    VALUES ('folder-1', 'Documents', NULL, '2026-07-18T12:00:00Z', '2026-07-18T12:00:00Z')
  `,
  ).run();

  // Insert a file under folder-1
  db.prepare(
    `
    INSERT INTO vault_files (
      id, display_name, original_name, mime_type, extension, size_bytes, hash, 
      storage_path, folder_id, status, favorite, created_at, updated_at
    ) VALUES (
      'file-1', 'Report.pdf', 'report_draft.pdf', 'application/pdf', '.pdf', 1024, 'hash-sha256-123',
      'Documents/83ac91d2.pdf', 'folder-1', 'Ready', 1, '2026-07-18T12:00:00Z', '2026-07-18T12:00:00Z'
    )
  `,
  ).run();

  const file = db.prepare("SELECT * FROM vault_files WHERE id = 'file-1'").get() as any;
  assertExists(file, "File should exist in database");
  assertEquals(file.display_name, "Report.pdf", "File display name should match");
  assertEquals(file.favorite, 1, "File favorite flag should be active");
  assertEquals(file.size_bytes, 1024, "File size should match");
});

test("Vault DB - Folder Deletion Cascade and Nullify Rules", () => {
  resetDb();

  // Create Parent Folder
  db.prepare(
    `
    INSERT INTO vault_folders (id, name, parent_id, created_at, updated_at)
    VALUES ('parent', 'Parent Folder', NULL, '2026-07-18T12:00:00Z', '2026-07-18T12:00:00Z')
  `,
  ).run();

  // Create Child Folder (Cascades ON DELETE CASCADE)
  db.prepare(
    `
    INSERT INTO vault_folders (id, name, parent_id, created_at, updated_at)
    VALUES ('child', 'Child Folder', 'parent', '2026-07-18T12:00:00Z', '2026-07-18T12:00:00Z')
  `,
  ).run();

  // Create File inside Child Folder (Set NULL on Folder deletion)
  db.prepare(
    `
    INSERT INTO vault_files (
      id, display_name, original_name, mime_type, extension, size_bytes, hash, 
      storage_path, folder_id, status, favorite, created_at, updated_at
    ) VALUES (
      'file-child', 'Report.pdf', 'report.pdf', 'application/pdf', '.pdf', 500, 'hash-pdf',
      'Documents/uuid.pdf', 'child', 'Ready', 0, '2026-07-18T12:00:00Z', '2026-07-18T12:00:00Z'
    )
  `,
  ).run();

  // Delete Parent Folder -> should cascade delete Child Folder
  db.prepare("DELETE FROM vault_folders WHERE id = 'parent'").run();

  const childFolder = db.prepare("SELECT * FROM vault_folders WHERE id = 'child'").get();
  assertEquals(childFolder, undefined, "Child folder should be cascade deleted");

  // File should still exist but its folder_id should be NULL
  const file = db.prepare("SELECT * FROM vault_files WHERE id = 'file-child'").get() as any;
  assertExists(file, "File should survive parent folder deletion");
  assertEquals(file.folder_id, null, "File folder_id should drop to NULL");
});

test("Vault DB - Tag Garbage Collection Trigger", () => {
  resetDb();

  // Create File
  db.prepare(
    `
    INSERT INTO vault_files (
      id, display_name, original_name, mime_type, extension, size_bytes, hash, 
      storage_path, folder_id, status, favorite, created_at, updated_at
    ) VALUES (
      'file-tag-test', 'Doc.txt', 'doc.txt', 'text/plain', '.txt', 10, 'hash-txt',
      'Documents/uuid.txt', NULL, 'Ready', 0, '2026-07-18T12:00:00Z', '2026-07-18T12:00:00Z'
    )
  `,
  ).run();

  // Create Tag
  db.prepare(
    `
    INSERT INTO vault_tags (id, name, created_at)
    VALUES ('tag-1', 'Reference', '2026-07-18T12:00:00Z')
  `,
  ).run();

  // Link File and Tag
  db.prepare(
    `
    INSERT INTO vault_file_tags (file_id, tag_id)
    VALUES ('file-tag-test', 'tag-1')
  `,
  ).run();

  // Verify tag link exists
  const tagLink = db.prepare("SELECT * FROM vault_file_tags WHERE file_id = 'file-tag-test'").get();
  assertExists(tagLink, "Tag association should be registered");

  // Remove tag mapping -> should trigger cleanup of unused 'tag-1' in vault_tags
  db.prepare(
    "DELETE FROM vault_file_tags WHERE file_id = 'file-tag-test' AND tag_id = 'tag-1'",
  ).run();

  const tagRecord = db.prepare("SELECT * FROM vault_tags WHERE id = 'tag-1'").get();
  assertEquals(
    tagRecord,
    undefined,
    "Tag should be garbage collected since it has no remaining references",
  );
});

test("Vault DB - Polymorphic Link Cleanup Triggers", () => {
  resetDb();

  // 1. Setup mock entities
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO projects (id, name, tag, color, created_at, updated_at, icon)
    VALUES ('proj-1', 'Project Akira', 'Development', 'blue', ?, ?, 'sparkles')
  `,
  ).run(now, now);

  db.prepare(
    `
    INSERT INTO tasks (id, title, priority, created_at, updated_at)
    VALUES ('task-1', 'Write Vault Code', 'High', ?, ?)
  `,
  ).run(now, now);

  // 2. Setup Vault File
  db.prepare(
    `
    INSERT INTO vault_files (
      id, display_name, original_name, mime_type, extension, size_bytes, hash, 
      storage_path, folder_id, status, favorite, created_at, updated_at
    ) VALUES (
      'file-poly', 'Diagram.png', 'diagram.png', 'image/png', '.png', 2048, 'hash-png',
      'Images/uuid.png', NULL, 'Ready', 0, '2026-07-18T12:00:00Z', '2026-07-18T12:00:00Z'
    )
  `,
  ).run();

  // 3. Link File to Project and Task
  db.prepare(
    `
    INSERT INTO vault_file_links (id, file_id, entity_type, entity_id, created_at)
    VALUES ('link-proj', 'file-poly', 'project', 'proj-1', '2026-07-18T12:00:00Z')
  `,
  ).run();

  db.prepare(
    `
    INSERT INTO vault_file_links (id, file_id, entity_type, entity_id, created_at)
    VALUES ('link-task', 'file-poly', 'task', 'task-1', '2026-07-18T12:00:00Z')
  `,
  ).run();

  // Verify links are present
  const projLinks = db
    .prepare("SELECT * FROM vault_file_links WHERE entity_type = 'project'")
    .all();
  assertEquals(projLinks.length, 1, "Project link should exist");

  const taskLinks = db.prepare("SELECT * FROM vault_file_links WHERE entity_type = 'task'").all();
  assertEquals(taskLinks.length, 1, "Task link should exist");

  // 4. Delete Project -> Polymorphic trigger should delete link-proj
  db.prepare("DELETE FROM projects WHERE id = 'proj-1'").run();

  const deadProjLink = db.prepare("SELECT * FROM vault_file_links WHERE id = 'link-proj'").get();
  assertEquals(deadProjLink, undefined, "Project file link should be auto-cleaned");

  // 5. Delete Task -> Polymorphic trigger should delete link-task
  db.prepare("DELETE FROM tasks WHERE id = 'task-1'").run();

  const deadTaskLink = db.prepare("SELECT * FROM vault_file_links WHERE id = 'link-task'").get();
  assertEquals(deadTaskLink, undefined, "Task file link should be auto-cleaned");
});

test("Vault DB - Audit & Timeline Trigger logging", () => {
  resetDb();

  // Insert a file -> triggers 'file.created' event in timeline_events
  db.prepare(
    `
    INSERT INTO vault_files (
      id, display_name, original_name, mime_type, extension, size_bytes, hash, 
      storage_path, folder_id, status, favorite, created_at, updated_at
    ) VALUES (
      'file-audit', 'SourceCode.py', 'code.py', 'text/x-python', '.py', 300, 'hash-py',
      'Code/uuid.py', NULL, 'Ready', 0, '2026-07-18T12:00:00Z', '2026-07-18T12:00:00Z'
    )
  `,
  ).run();

  // Check timeline events
  const createdEvent = db
    .prepare("SELECT * FROM timeline_events WHERE event_type = 'file.created'")
    .get() as any;

  assertExists(createdEvent, "An insert timeline audit event should have been logged");
  const payload = JSON.parse(createdEvent.payload);
  assertEquals(payload.id, "file-audit", "Timeline payload should store file ID");
  assertEquals(payload.displayName, "SourceCode.py", "Timeline payload should store display name");

  // Delete the file -> triggers 'file.deleted' event in timeline_events
  db.prepare("DELETE FROM vault_files WHERE id = 'file-audit'").run();

  const deletedEvent = db
    .prepare("SELECT * FROM timeline_events WHERE event_type = 'file.deleted'")
    .get() as any;

  assertExists(deletedEvent, "A delete timeline audit event should have been logged");
  const delPayload = JSON.parse(deletedEvent.payload);
  assertEquals(delPayload.id, "file-audit", "Delete timeline payload should store file ID");
  assertEquals(delPayload.hash, "hash-py", "Delete timeline payload should store file hash");
});

test("Vault DB - Recursive CTE Circle Check Verification", () => {
  resetDb();

  // Setup simple folder tree:
  // Root -> A -> B
  db.prepare(
    `
    INSERT INTO vault_folders (id, name, parent_id, created_at, updated_at)
    VALUES ('A', 'Folder A', NULL, '2026-07-18T12:00:00Z', '2026-07-18T12:00:00Z')
  `,
  ).run();

  db.prepare(
    `
    INSERT INTO vault_folders (id, name, parent_id, created_at, updated_at)
    VALUES ('B', 'Folder B', 'A', '2026-07-18T12:00:00Z', '2026-07-18T12:00:00Z')
  `,
  ).run();

  // Validation: Attempting to move A (parent) to be inside B (child) should be circular.
  // We execute the Recursive CTE search query.
  const checkStmt = db.prepare(`
    WITH RECURSIVE FolderHierarchy AS (
      SELECT id, parent_id 
      FROM vault_folders 
      WHERE id = :targetParentId
      
      UNION ALL
      
      SELECT f.id, f.parent_id 
      FROM vault_folders f
      INNER JOIN FolderHierarchy h ON f.id = h.parent_id
    )
    SELECT COUNT(*) AS is_circular 
    FROM FolderHierarchy 
    WHERE id = :folderToMoveId;
  `);

  // Move A under B -> targetParentId = 'B', folderToMoveId = 'A'
  const result = checkStmt.get({ targetParentId: "B", folderToMoveId: "A" }) as any;
  assertEquals(
    result.is_circular,
    1,
    "Moving Folder A under its child Folder B should be identified as circular (is_circular = 1)",
  );

  // Move B under A -> targetParentId = 'A', folderToMoveId = 'B'
  const normalResult = checkStmt.get({ targetParentId: "A", folderToMoveId: "B" }) as any;
  assertEquals(
    normalResult.is_circular,
    0,
    "Moving Folder B under Folder A is not circular (is_circular = 0)",
  );
});

// Since async tests complete in next tick, delay exit to ensure results print
setTimeout(() => {
  console.log(`\nFile Vault Database Tests Completed: ${passedTests} / ${totalTests} Passed.`);
  if (passedTests < totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}, 200);
