// Set isolated test database environment variables before loading database connectors
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";
// Configure Vault test path in a temp subdirectory inside scratch/
import path from "path";
import fs from "fs";
const scratchDir = path.join(process.cwd(), "src", "persistence", "scratch");
const testVaultPath = path.join(scratchDir, "VaultTest");
process.env.AKIRA_VAULT_PATH = testVaultPath;

import { initializeDatabase } from "../../persistence/initializer";
import { getDatabaseConnection } from "../../persistence/connection";
import {
  vaultFileRepository,
  vaultFolderRepository,
  vaultTagRepository,
  timelineRepository,
} from "../../persistence/repositories";
import { VaultHashService } from "./VaultHashService";
import { VaultValidationService, getVaultRoot } from "./VaultValidationService";
import { VaultFolderService } from "./VaultFolderService";
import { VaultStorageService } from "./VaultStorageService";
import { eventBus } from "../../shared/infrastructure/event-bus";
import { Events } from "../../contracts/events";

let totalTests = 0;
let passedTests = 0;

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

function assertExists(value: any, message: string) {
  if (value === undefined || value === null) {
    throw new Error(`${message} -> Expected value to exist, but got ${value}`);
  }
}

function assertThrows(fn: () => void, expectedMessagePart: string, message: string) {
  try {
    fn();
    throw new Error(`${message} -> Expected function to throw error, but it succeeded`);
  } catch (err: any) {
    if (!err.message.includes(expectedMessagePart)) {
      throw new Error(
        `${message} -> Expected error message to contain "${expectedMessagePart}", but got "${err.message}"`,
      );
    }
  }
}

// Setup directories and Database
fs.mkdirSync(testVaultPath, { recursive: true });
fs.mkdirSync(path.join(testVaultPath, "Temp"), { recursive: true });
initializeDatabase();

function resetDbAndFS() {
  const db = getDatabaseConnection();
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

  // Clear Vault folders physically
  const clearDir = (dirPath: string) => {
    if (fs.existsSync(dirPath)) {
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        if (fs.statSync(itemPath).isDirectory()) {
          clearDir(itemPath);
          try {
            fs.rmdirSync(itemPath);
          } catch (_) {}
        } else {
          try {
            fs.unlinkSync(itemPath);
          } catch (_) {}
        }
      }
    }
  };
  clearDir(testVaultPath);
  fs.mkdirSync(path.join(testVaultPath, "Temp"), { recursive: true });
}

// -------------------------------------------------------------
// TEST CASES
// -------------------------------------------------------------

test("Vault Service - Hash & Duplicate Identification", () => {
  resetDbAndFS();

  const buffer = Buffer.from("AKIRA Engine test buffer content");
  const hash = VaultHashService.generateHashFromBuffer(buffer);

  assertEquals(
    hash,
    "03066c3d8a240038d6cf373df0292d5354eaaa7b668917530b6b283eea554eae",
    "Buffer hash generation match",
  );

  const dup = VaultHashService.findDuplicates(hash);
  assertEquals(dup.length, 0, "Unique hash duplicate check resolves to 0");
});

test("Vault Service - Safe Boundaries Validation", () => {
  resetDbAndFS();

  // Traversal test
  assertThrows(
    () => VaultValidationService.resolveSafePath("../../invalid-path/secret.db"),
    "Security Violation",
    "Should prevent traversal attempts outside root Vault folder",
  );

  // Filename sanitation
  const clean = VaultValidationService.sanitizeFilename("Report/Annual:Draft*.pdf");
  assertEquals(
    clean,
    "Annual_Draft_.pdf",
    "Should strip slash, colon, asterisk from filenames and retain basename",
  );
});

test("Vault Service - Magic Number MIME Verification", () => {
  resetDbAndFS();

  const tempFile = path.join(testVaultPath, "Temp", "upload.part");
  fs.writeFileSync(tempFile, "%PDF-1.4 test file mock");

  // Validate correct MIME
  VaultValidationService.validateMagicNumberMime(tempFile, "application/pdf");

  // Validate invalid signature throws
  assertThrows(
    () => VaultValidationService.validateMagicNumberMime(tempFile, "image/png"),
    "magic bytes",
    "Should reject PNG validation for a PDF header file",
  );
});

test("Vault Service - Folder Creation & Circular Detection", () => {
  resetDbAndFS();

  const rootId = VaultFolderService.createFolder("Root Folder", null);
  const childId = VaultFolderService.createFolder("Child Folder", rootId);

  assertExists(rootId, "Root Folder creation");
  assertExists(childId, "Child Folder creation");

  // Attempt circular parent-to-child move
  assertThrows(
    () => VaultFolderService.moveFolder(rootId, childId),
    "Circular folder hierarchy detected",
    "Should prevent placing parent folder inside its descendant",
  );
});

test("Vault Service - Transaction-safe Upload and Deduplication", async () => {
  resetDbAndFS();

  const tempFile = path.join(testVaultPath, "Temp", "my_file.part");
  fs.writeFileSync(tempFile, "%PDF-1.5 Annual report content");

  // First upload: should create physical file in Documents
  const fileId = await VaultStorageService.uploadFile(
    tempFile,
    "Report.pdf",
    "application/pdf",
    null,
  );

  const fileMeta = vaultFileRepository.getById(fileId);
  assertExists(fileMeta, "Uploaded metadata must exist");
  assertEquals(fileMeta?.status, "Ready", "Status should be Ready");

  const physicalPath = path.join(testVaultPath, fileMeta!.storagePath);
  assertEquals(fs.existsSync(physicalPath), true, "Physical file must exist in Category directory");

  // Second upload: Identical content (Deduplication)
  const tempFile2 = path.join(testVaultPath, "Temp", "copy.part");
  fs.writeFileSync(tempFile2, "%PDF-1.5 Annual report content");

  const duplicateId = await VaultStorageService.uploadFile(
    tempFile2,
    "Duplicate.pdf",
    "application/pdf",
    null,
  );

  const duplicateMeta = vaultFileRepository.getById(duplicateId);
  assertExists(duplicateMeta, "Duplicate file metadata must exist");
  assertEquals(
    duplicateMeta?.storagePath,
    fileMeta?.storagePath,
    "Deduplicated files must point to identical storage paths",
  );

  // Verify that active references count is 2
  const count = vaultFileRepository.countReferencesByHash(fileMeta!.hash);
  assertEquals(count, 2, "Reference counter query should return 2");
});

test("Vault Service - Deletion Reference Counting & Recovery", async () => {
  resetDbAndFS();

  const tempFile = path.join(testVaultPath, "Temp", "file1.part");
  fs.writeFileSync(tempFile, "%PDF-1.5 Test data");

  const fileId1 = await VaultStorageService.uploadFile(
    tempFile,
    "Doc1.pdf",
    "application/pdf",
    null,
  );

  const tempFile2 = path.join(testVaultPath, "Temp", "file2.part");
  fs.writeFileSync(tempFile2, "%PDF-1.5 Test data"); // duplicate hash

  const fileId2 = await VaultStorageService.uploadFile(
    tempFile2,
    "Doc2.pdf",
    "application/pdf",
    null,
  );

  const file1 = vaultFileRepository.getById(fileId1)!;

  // 1. Soft Delete file1
  VaultStorageService.deleteFile(fileId1);
  const file1Deleted = vaultFileRepository.getById(fileId1)!;
  assertExists(file1Deleted.deletedAt, "Soft deletion must set deletedAt");
  assertEquals(
    file1Deleted.storagePath.startsWith("Trash/"),
    true,
    "Soft-deleted physical file must be moved to Trash",
  );
  assertEquals(
    fs.existsSync(path.join(testVaultPath, file1Deleted.storagePath)),
    true,
    "Soft-deleted physical file must exist in Trash directory",
  );

  // 2. Restore file1
  VaultStorageService.restoreFile(fileId1);
  const file1Restored = vaultFileRepository.getById(fileId1)!;
  assertEquals(file1Restored.deletedAt, null, "Restore must reset deletedAt to null");
  assertEquals(
    file1Restored.storagePath.startsWith("Documents/"),
    true,
    "Restored physical file must be moved back to Category folder",
  );

  // 3. Soft-delete again to verify permanent delete unlinks
  VaultStorageService.deleteFile(fileId1);
  const file1Trash = vaultFileRepository.getById(fileId1)!;

  // Purge File 1 -> since File 2 still exists (ref count is 2), physical file on disk should NOT be deleted
  VaultStorageService.permanentDeleteFile(fileId1);
  const physicalTrashPath = path.join(testVaultPath, file1Trash.storagePath);
  assertEquals(
    fs.existsSync(physicalTrashPath),
    true,
    "Physical file should survive permanent deletion if another logical reference exists",
  );

  // Purge File 2 (reference count drops to 1, then to 0) -> physical file on disk MUST be unlinked
  const file2 = vaultFileRepository.getById(fileId2)!;
  VaultStorageService.permanentDeleteFile(fileId2);
  const physicalActivePath = path.join(testVaultPath, file2.storagePath);
  assertEquals(
    fs.existsSync(physicalActivePath),
    false,
    "Physical file must be permanently unlinked from disk when the last logical reference is deleted",
  );
});

test("Vault Service - Folder Service Deletion cascades", () => {
  resetDbAndFS();

  const parentId = VaultFolderService.createFolder("Parent Folder", null);
  const childId = VaultFolderService.createFolder("Child Folder", parentId);

  // Verify child exists
  const folder = vaultFolderRepository.getById(childId);
  assertExists(folder, "Child folder exists");

  // Empty Folder parent -> should delete subfolders and files
  VaultFolderService.emptyFolder(parentId);

  const deadChild = vaultFolderRepository.getById(childId);
  assertEquals(deadChild, undefined, "Subfolders should be cascade deleted by emptyFolder");
});

test("Vault Service - Timeline Integration event logging", async () => {
  resetDbAndFS();

  // Create listener for Events.VAULT_FOLDER_CREATED
  let eventPayload: any = null;
  const unsub = eventBus.subscribe(Events.VAULT_FOLDER_CREATED, (event) => {
    eventPayload = event.payload;
  });

  const folderId = VaultFolderService.createFolder("Audit Test Folder", null);

  // Wait a small moment
  await new Promise((resolve) => setTimeout(resolve, 20));

  assertExists(eventPayload, "Event VAULT_FOLDER_CREATED should be published to eventBus");
  assertEquals(eventPayload.id, folderId, "Payload should carry created folder ID");
  assertEquals(eventPayload.name, "Audit Test Folder", "Payload should carry folder name");

  unsub();
});

// Run serial runner
async function runAll() {
  console.log("=== STARTING FILE VAULT BACKEND INTEGRATION TESTS ===");
  for (const t of tests) {
    totalTests++;
    console.log(`Running: ${t.name}`);
    try {
      await t.fn();
      passedTests++;
    } catch (error) {
      console.error(`  ✗ Failed: ${t.name}`);
      console.error(error);
    }
  }

  console.log(
    `\nVault Backend Integration Tests Completed: ${passedTests} / ${totalTests} Passed.`,
  );

  // Clean up test vault path physically
  const deleteFolderRecursive = (dirPath: string) => {
    if (fs.existsSync(dirPath)) {
      fs.readdirSync(dirPath).forEach((file) => {
        const curPath = path.join(dirPath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          deleteFolderRecursive(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(dirPath);
    }
  };
  try {
    deleteFolderRecursive(testVaultPath);
  } catch (_) {}

  if (passedTests < totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll();
