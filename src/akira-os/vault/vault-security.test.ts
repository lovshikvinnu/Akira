/**
 * Regression protection for the two confirmed Vault defects (Recovery task:
 * Vault Security & Data Integrity).
 *
 *  1. `resolveSafePath` enforced its boundary with a string prefix test, so a
 *     sibling directory whose name merely began with the Vault root's name
 *     (`../<Root>_secrets/x`) resolved as if it were inside the Vault.
 *
 *  2. Deduplication points several logical records at one physical file, but
 *     soft delete relocated that file into `Trash/` on behalf of a single
 *     record, and deduplication happily reused a soft-deleted record's `Trash/`
 *     path. Either route let one user action destroy another record's content.
 *
 * Environment variables are assigned before the modules under test are pulled
 * in, and the imports are dynamic: ESM evaluates every static `import`
 * declaration before any statement in the module body, so a static import
 * would read the database and Vault paths before these assignments land.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

const vaultRoot = path.join(process.cwd(), "src", "persistence", "scratch", "VaultSecurityTest");
/** Sibling directory sharing the Vault root's name prefix - the escape target. */
const siblingRoot = `${vaultRoot}_secrets`;

process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";
process.env.AKIRA_VAULT_PATH = vaultRoot;

const { initializeDatabase } = await import("../../persistence/initializer");
const { getDatabaseConnection } = await import("../../persistence/connection");
const { vaultFileRepository } = await import("../../persistence/repositories");
const { VaultValidationService, getVaultRoot } = await import("./VaultValidationService");
const { VaultStorageService } = await import("./VaultStorageService");

fs.mkdirSync(path.join(vaultRoot, "Temp"), { recursive: true });
initializeDatabase();

// These suites write real files under src/persistence/scratch/. beforeEach
// clears them between cases, but nothing removed the last case's output, so a
// normal test run left untracked artifacts in the working tree. Each suite
// removes the tree it owns, and only that tree.
afterAll(() => {
  fs.rmSync(vaultRoot, { recursive: true, force: true });
  fs.rmSync(siblingRoot, { recursive: true, force: true });
});

const PDF_CONTENT = "%PDF-1.5 Vault recovery fixture";
const OTHER_PDF_CONTENT = "%PDF-1.5 A different document entirely";

function removeContents(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath)) {
    const entryPath = path.join(dirPath, entry);
    if (fs.statSync(entryPath).isDirectory()) {
      removeContents(entryPath);
      fs.rmdirSync(entryPath);
    } else {
      fs.unlinkSync(entryPath);
    }
  }
}

function reset(): void {
  const db = getDatabaseConnection();
  db.prepare("DELETE FROM vault_file_links").run();
  db.prepare("DELETE FROM vault_file_tags").run();
  db.prepare("DELETE FROM vault_files").run();
  db.prepare("DELETE FROM vault_folders").run();
  removeContents(vaultRoot);
  fs.mkdirSync(path.join(vaultRoot, "Temp"), { recursive: true });
}

/** Uploads `content` through the real pipeline and returns the new record id. */
async function upload(content: string, displayName: string): Promise<string> {
  const tempPath = path.join(vaultRoot, "Temp", `${randomUUID()}.part`);
  fs.writeFileSync(tempPath, content);
  return VaultStorageService.uploadFile(tempPath, displayName, "application/pdf", null);
}

function storagePathOf(fileId: string): string {
  const record = vaultFileRepository.getById(fileId);
  if (!record) throw new Error(`Expected record ${fileId} to exist`);
  return record.storagePath;
}

/** The bytes a user would actually receive for this record, or null if gone. */
function readableContent(fileId: string): string | null {
  const absolutePath = VaultValidationService.resolveSafePath(storagePathOf(fileId));
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : null;
}

// ---------------------------------------------------------------------------
// Part 2 - Path boundary enforcement
// ---------------------------------------------------------------------------

describe("VaultValidationService.resolveSafePath", () => {
  const isWindows = path.sep === "\\";

  it("resolves legitimate Vault-relative paths inside the root", () => {
    expect(VaultValidationService.resolveSafePath("Documents/report.pdf")).toBe(
      path.join(getVaultRoot(), "Documents", "report.pdf"),
    );
    expect(VaultValidationService.resolveSafePath("Images/nested/deep/photo.png")).toBe(
      path.join(getVaultRoot(), "Images", "nested", "deep", "photo.png"),
    );
    expect(VaultValidationService.resolveSafePath("Trash/file.pdf")).toBe(
      path.join(getVaultRoot(), "Trash", "file.pdf"),
    );
  });

  it("resolves the root itself and normalises interior traversal that stays inside", () => {
    expect(VaultValidationService.resolveSafePath("")).toBe(getVaultRoot());
    expect(VaultValidationService.resolveSafePath("Documents/../Images/a.png")).toBe(
      path.join(getVaultRoot(), "Images", "a.png"),
    );
  });

  it("rejects the prefix-collision escape into a sibling directory", () => {
    // The confirmed bypass: `<root>_secrets` passes a `startsWith(root)` test.
    const siblingName = path.basename(siblingRoot);
    expect(() => VaultValidationService.resolveSafePath(`../${siblingName}/x`)).toThrow(
      /Security Violation/,
    );
    expect(() => VaultValidationService.resolveSafePath(`../${siblingName}`)).toThrow(
      /Security Violation/,
    );
  });

  it("rejects parent and nested traversal", () => {
    const traversals = [
      "..",
      "../",
      "../secret.db",
      "../../invalid-path/secret.db",
      "../../../../../../etc/passwd",
      "nested/../../escape.txt",
      "Documents/../../escape.txt",
      "Documents/subdir/../../../escape.txt",
    ];
    for (const candidate of traversals) {
      expect(() => VaultValidationService.resolveSafePath(candidate), candidate).toThrow(
        /Security Violation/,
      );
    }
  });

  it("rejects absolute paths pointing outside the Vault root", () => {
    const externals = isWindows
      ? ["C:\\Windows\\System32\\config\\SAM", "D:\\elsewhere\\x"]
      : ["/etc/passwd", "/var/tmp/x"];
    for (const candidate of externals) {
      expect(() => VaultValidationService.resolveSafePath(candidate), candidate).toThrow(
        /Security Violation/,
      );
    }
  });

  it("rejects backslash-separated traversal on Windows", () => {
    if (!isWindows) return;
    const siblingName = path.basename(siblingRoot);
    expect(() => VaultValidationService.resolveSafePath(`..\\${siblingName}\\x`)).toThrow(
      /Security Violation/,
    );
    expect(() => VaultValidationService.resolveSafePath("Documents\\..\\..\\escape.txt")).toThrow(
      /Security Violation/,
    );
  });

  it("accepts an absolute path that already points inside the Vault root", () => {
    const inside = path.join(getVaultRoot(), "Documents", "inside.pdf");
    expect(VaultValidationService.resolveSafePath(inside)).toBe(inside);
  });

  it("does not over-reject legitimate names that merely begin with dots", () => {
    // A segment-aware check must not treat "..hidden.pdf" as traversal.
    expect(VaultValidationService.resolveSafePath("..hidden.pdf")).toBe(
      path.join(getVaultRoot(), "..hidden.pdf"),
    );
    expect(VaultValidationService.resolveSafePath("Documents/..config")).toBe(
      path.join(getVaultRoot(), "Documents", "..config"),
    );
  });

  it("never returns a path outside the configured root", () => {
    const candidates = [
      "Documents/a.pdf",
      "",
      "..hidden",
      "Documents/../Images/b.png",
      path.join(getVaultRoot(), "Audio", "c.mp3"),
    ];
    for (const candidate of candidates) {
      const resolved = VaultValidationService.resolveSafePath(candidate);
      const relative = path.relative(getVaultRoot(), resolved);
      expect(path.isAbsolute(relative), candidate).toBe(false);
      expect(relative === ".." || relative.startsWith(`..${path.sep}`), candidate).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Part 3 - Deduplication / soft-delete data integrity
// ---------------------------------------------------------------------------

describe("Vault deduplication and soft-delete data integrity", () => {
  beforeEach(() => {
    reset();
  });

  it("deduplicates identical content onto one physical file", async () => {
    const originalId = await upload(PDF_CONTENT, "Original.pdf");
    const duplicateId = await upload(PDF_CONTENT, "Duplicate.pdf");

    expect(originalId).not.toBe(duplicateId);
    expect(storagePathOf(duplicateId)).toBe(storagePathOf(originalId));
    expect(readableContent(originalId)).toBe(PDF_CONTENT);
    expect(readableContent(duplicateId)).toBe(PDF_CONTENT);
  });

  it("keeps a deduplicated sibling readable after the other record is soft-deleted", async () => {
    const originalId = await upload(PDF_CONTENT, "Original.pdf");
    const duplicateId = await upload(PDF_CONTENT, "Duplicate.pdf");
    const sharedPath = storagePathOf(duplicateId);

    VaultStorageService.deleteFile(originalId);

    // The duplicate was never deleted by the user; its content must survive.
    expect(vaultFileRepository.getById(duplicateId)?.deletedAt).toBeNull();
    expect(storagePathOf(duplicateId)).toBe(sharedPath);
    expect(readableContent(duplicateId)).toBe(PDF_CONTENT);

    // The soft-deleted record is marked deleted but shares the same bytes.
    expect(vaultFileRepository.getById(originalId)?.deletedAt).not.toBeNull();
    expect(readableContent(originalId)).toBe(PDF_CONTENT);
  });

  it("moves an exclusively owned file into Trash on soft delete and back on restore", async () => {
    const fileId = await upload(PDF_CONTENT, "Solo.pdf");
    const activePath = storagePathOf(fileId);
    expect(activePath.startsWith("Documents/")).toBe(true);

    VaultStorageService.deleteFile(fileId);
    expect(storagePathOf(fileId).startsWith("Trash/")).toBe(true);
    expect(readableContent(fileId)).toBe(PDF_CONTENT);
    expect(fs.existsSync(path.join(vaultRoot, activePath))).toBe(false);

    VaultStorageService.restoreFile(fileId);
    expect(vaultFileRepository.getById(fileId)?.deletedAt).toBeNull();
    expect(storagePathOf(fileId).startsWith("Documents/")).toBe(true);
    expect(readableContent(fileId)).toBe(PDF_CONTENT);
  });

  it("restores a shared record without disturbing its sibling", async () => {
    const originalId = await upload(PDF_CONTENT, "Original.pdf");
    const duplicateId = await upload(PDF_CONTENT, "Duplicate.pdf");

    VaultStorageService.deleteFile(originalId);
    VaultStorageService.restoreFile(originalId);

    expect(vaultFileRepository.getById(originalId)?.deletedAt).toBeNull();
    expect(storagePathOf(originalId)).toBe(storagePathOf(duplicateId));
    expect(readableContent(originalId)).toBe(PDF_CONTENT);
    expect(readableContent(duplicateId)).toBe(PDF_CONTENT);
  });

  it("does not attach a new upload to a soft-deleted record sitting in Trash", async () => {
    const originalId = await upload(PDF_CONTENT, "Original.pdf");
    VaultStorageService.deleteFile(originalId);
    const trashedPath = storagePathOf(originalId);
    expect(trashedPath.startsWith("Trash/")).toBe(true);

    // Re-adding the same content must produce a live file of its own, not a
    // record whose bytes live in Trash and vanish when the original is purged.
    const readdedId = await upload(PDF_CONTENT, "Re-added.pdf");
    expect(storagePathOf(readdedId).startsWith("Trash/")).toBe(false);
    expect(storagePathOf(readdedId)).not.toBe(trashedPath);
    expect(readableContent(readdedId)).toBe(PDF_CONTENT);

    // Purging the trashed original must not disturb the re-added file.
    VaultStorageService.permanentDeleteFile(originalId);
    expect(readableContent(readdedId)).toBe(PDF_CONTENT);

    // ...and the trashed file's own bytes must not be orphaned on disk.
    expect(fs.existsSync(path.join(vaultRoot, trashedPath))).toBe(false);
  });

  it("restores a trashed original while a re-added copy stays intact", async () => {
    const originalId = await upload(PDF_CONTENT, "Original.pdf");
    VaultStorageService.deleteFile(originalId);
    const readdedId = await upload(PDF_CONTENT, "Re-added.pdf");

    VaultStorageService.restoreFile(originalId);

    expect(readableContent(originalId)).toBe(PDF_CONTENT);
    expect(readableContent(readdedId)).toBe(PDF_CONTENT);
    expect(storagePathOf(originalId)).not.toBe(storagePathOf(readdedId));
  });

  it("unlinks physical content only when the last reference to it is purged", async () => {
    const originalId = await upload(PDF_CONTENT, "Original.pdf");
    const duplicateId = await upload(PDF_CONTENT, "Duplicate.pdf");
    const sharedPath = storagePathOf(originalId);

    VaultStorageService.permanentDeleteFile(originalId);
    expect(vaultFileRepository.getById(originalId)).toBeUndefined();
    expect(fs.existsSync(path.join(vaultRoot, sharedPath))).toBe(true);
    expect(readableContent(duplicateId)).toBe(PDF_CONTENT);

    VaultStorageService.permanentDeleteFile(duplicateId);
    expect(fs.existsSync(path.join(vaultRoot, sharedPath))).toBe(false);
  });

  it("keeps a soft-deleted sibling recoverable after its duplicate is purged", async () => {
    const originalId = await upload(PDF_CONTENT, "Original.pdf");
    const duplicateId = await upload(PDF_CONTENT, "Duplicate.pdf");

    VaultStorageService.deleteFile(originalId);
    VaultStorageService.permanentDeleteFile(duplicateId);

    // The trashed record is the last reference; its bytes must still be there
    // so the user can restore it.
    expect(readableContent(originalId)).toBe(PDF_CONTENT);
    VaultStorageService.restoreFile(originalId);
    expect(readableContent(originalId)).toBe(PDF_CONTENT);
  });

  it("leaves unrelated content untouched when a file is purged", async () => {
    const fileId = await upload(PDF_CONTENT, "One.pdf");
    const otherId = await upload(OTHER_PDF_CONTENT, "Two.pdf");

    VaultStorageService.permanentDeleteFile(fileId);

    expect(readableContent(otherId)).toBe(OTHER_PDF_CONTENT);
  });

  it("does not discard a fresh upload against a dangling deduplication target", async () => {
    const originalId = await upload(PDF_CONTENT, "Original.pdf");

    // Simulates a record left behind by the pre-fix defect (or any external
    // removal): metadata still points at a physical file that is gone.
    fs.unlinkSync(path.join(vaultRoot, storagePathOf(originalId)));

    const readdedId = await upload(PDF_CONTENT, "Re-added.pdf");

    expect(readableContent(readdedId)).toBe(PDF_CONTENT);
    expect(storagePathOf(readdedId)).not.toBe(storagePathOf(originalId));
  });
});
