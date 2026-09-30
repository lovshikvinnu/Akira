/**
 * The chat archive as first-class SQLite rows, beside the blob the UI reads.
 *
 * Before this, every past conversation lived only in one `settings` JSON blob
 * (`akira:chat:history:v1`): unindexed, unsearchable, rewritten whole on every
 * save. `conversations` / `chat_messages` now mirror it, and `fts_workspace`
 * indexes each message. The blob stays the source of truth and the UI's only
 * read path; `conversationsService.save` is the one write path and writes both
 * in one transaction, and `initializeDatabase()` re-mirrors the blob at every
 * start -- which is also the migration of an existing archive.
 *
 * Storage only. Nothing here reads history back into GENESIS or the prompt;
 * the last test pins that GENESIS still does not reach these tables.
 *
 * Each "process" is a fresh module graph on a temp-file database, so restart
 * and migration are exercised through the real initializer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import type { ChatConversation } from "../src/shared/types/store-types";

vi.setConfig({ testTimeout: 30_000 });

let dbPath: string;
let open: { close(): void } | null = null;

async function start() {
  vi.resetModules();
  process.env.AKIRA_DATABASE_PATH = dbPath;
  process.env.NODE_ENV = "test";
  const { initializeDatabase } = await import("../src/persistence/initializer");
  initializeDatabase();
  const repos = await import("../src/persistence/repositories");
  const { getDatabaseConnection, closeDatabaseConnection } =
    await import("../src/persistence/connection");
  const db = getDatabaseConnection();
  const app = {
    initializeDatabase,
    repos,
    db,
    rows: () =>
      db
        .prepare(
          "SELECT id, conversation_id, role, text, created_at, position FROM chat_messages ORDER BY conversation_id, position",
        )
        .all() as { id: string; conversation_id: string; text: string; position: number }[],
    conversations: () =>
      (db.prepare("SELECT id, title FROM conversations ORDER BY id").all() as { id: string }[]).map(
        (c) => c.id,
      ),
    indexed: () =>
      (
        db
          .prepare(
            "SELECT entity_id, content FROM fts_workspace WHERE entity_type = 'message' ORDER BY entity_id",
          )
          .all() as { entity_id: string; content: string }[]
      ).map((r) => `${r.entity_id}=${r.content}`),
    blob: () => repos.settingsRepository.get(repos.CHAT_ARCHIVE_KEY),
    close() {
      open = null;
      closeDatabaseConnection();
    },
  };
  open = app;
  return app;
}

const msg = (id: string, role: "user" | "akira", text: string, createdAt: string) => ({
  id,
  role,
  text,
  createdAt,
});

const archive = (): ChatConversation[] => [
  {
    id: "conv-new",
    title: "Kitchen",
    createdAt: "2026-09-02T10:00:00.000Z",
    updatedAt: "2026-09-02T10:05:00.000Z",
    messages: [
      msg("m-4", "user", "which grout for the kitchen", "2026-09-02T10:00:00.000Z"),
      msg("m-5", "akira", "epoxy grout resists stains", "2026-09-02T10:00:01.000Z"),
    ],
  },
  {
    id: "conv-old",
    title: "Flying",
    createdAt: "2026-07-25T05:10:00.000Z",
    updatedAt: "2026-07-25T05:11:00.000Z",
    messages: [
      msg("m-1", "user", "pilot is my dream", "2026-07-25T05:10:00.000Z"),
      // Two messages in one millisecond: position, not the timestamp, orders them.
      msg("m-2", "akira", "a great dream", "2026-07-25T05:10:01.000Z"),
      msg("m-3", "user", "planes", "2026-07-25T05:10:01.000Z"),
    ],
  },
];

beforeEach(() => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "akira-conv-")), "akira.db");
});

afterEach(() => {
  open?.close();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

describe("migrating an existing archive", () => {
  it("imports every conversation and message from the JSON blob at startup", async () => {
    // The archive as it exists before this change: the blob and nothing else.
    const before = await start();
    before.repos.settingsRepository.set(before.repos.CHAT_ARCHIVE_KEY, JSON.stringify(archive()));
    before.db.exec("DELETE FROM chat_messages; DELETE FROM conversations;");
    expect(before.rows(), "the fixture must start with empty tables").toEqual([]);
    before.close();

    const app = await start();

    expect(app.conversations()).toEqual(["conv-new", "conv-old"]);
    expect(app.rows().map((r) => r.id)).toEqual(["m-4", "m-5", "m-1", "m-2", "m-3"]);
  });

  it("preserves conversation ids, message order and timestamps", async () => {
    const app = await start();
    app.repos.conversationRepository.save(archive());

    const old = app.repos.conversationRepository.getMessages("conv-old");
    expect(old.map((m) => m.text)).toEqual(["pilot is my dream", "a great dream", "planes"]);
    expect(old.map((m) => m.createdAt)).toEqual([
      "2026-07-25T05:10:00.000Z",
      "2026-07-25T05:10:01.000Z",
      "2026-07-25T05:10:01.000Z",
    ]);
    expect(app.conversations()).toEqual(["conv-new", "conv-old"]);
  });

  it("gives an id-less message a stable id, so a restart does not copy it", async () => {
    const legacy = archive();
    delete (legacy[1].messages[0] as { id?: string }).id;

    const first = await start();
    first.repos.conversationRepository.save(legacy);
    const ids = first.rows().map((r) => r.id);
    first.close();

    const second = await start();
    expect(second.rows().map((r) => r.id)).toEqual(ids);
    expect(ids).toContain("conv-old:0");
  });

  it("leaves the tables alone when the archive is unreadable, rather than emptying them", async () => {
    const first = await start();
    first.repos.conversationRepository.save(archive());
    first.repos.settingsRepository.set(first.repos.CHAT_ARCHIVE_KEY, "{not json");
    first.close();

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = await start();
    errors.mockRestore();

    expect(app.rows()).toHaveLength(5);
  });
});

describe("restart", () => {
  it("keeps every message, and repeated starts add none", async () => {
    const first = await start();
    first.repos.conversationRepository.save(archive());
    const rows = first.rows();
    const index = first.indexed();
    first.close();

    for (let restart = 1; restart <= 3; restart++) {
      const app = await start();
      expect(app.rows(), `restart ${restart}`).toEqual(rows);
      expect(app.indexed(), `restart ${restart}`).toEqual(index);
      app.close();
    }
  });
});

describe("saving the archive", () => {
  it("persists a new message to the tables and the blob in one write", async () => {
    const app = await start();
    const conversations = archive();
    app.repos.conversationRepository.save(conversations);

    conversations[0].messages.push(
      msg("m-6", "user", "and for the bathroom", "2026-09-02T10:06:00.000Z"),
    );
    app.repos.conversationRepository.save(conversations);

    expect(app.repos.conversationRepository.getMessages("conv-new").map((m) => m.id)).toEqual([
      "m-4",
      "m-5",
      "m-6",
    ]);
    expect(JSON.parse(app.blob()!)).toEqual(conversations);
  });

  it("stores the blob exactly as given, so the chat UI reads what it wrote", async () => {
    const app = await start();
    app.repos.conversationRepository.save(archive());

    expect(app.blob()).toBe(JSON.stringify(archive()));
  });

  it("goes through the service the chat route calls", async () => {
    const app = await start();
    const { conversationsService } = await import("../src/akira-os/conversations");
    const { runWithStartContext } = await import("@tanstack/start-storage-context");

    await runWithStartContext({} as never, () => conversationsService.save(archive()));

    expect(app.rows()).toHaveLength(5);
    expect(app.blob()).toBe(JSON.stringify(archive()));
  });

  it("refuses a generic settings write to the archive key, which would drift", async () => {
    const app = await start();
    app.repos.conversationRepository.save(archive());
    const { settingsService } = await import("../src/akira-os/settings");
    const { runWithStartContext } = await import("@tanstack/start-storage-context");
    // As akira-store's `runInServerRuntime` calls a server function.
    const call = (fn: () => Promise<unknown>) => runWithStartContext({} as never, fn);

    await expect(call(() => settingsService.set("akira:chat:history:v1", "[]"))).rejects.toThrow(
      /conversationsService\.save/,
    );
    await expect(call(() => settingsService.delete("akira:chat:history:v1"))).rejects.toThrow(
      /conversationsService\.save/,
    );
    expect(app.blob(), "the refused writes changed nothing").toBe(JSON.stringify(archive()));

    // Control: the same call succeeds for any other key, so the rejection
    // above is the guard and not a harness that cannot reach the handler.
    await call(() => settingsService.set("unrelated", "1"));
    expect(app.repos.settingsRepository.get("unrelated")).toBe("1");
  });
});

describe("deleting a conversation", () => {
  it("removes its messages and their index rows, and nothing else", async () => {
    const app = await start();
    const conversations = archive();
    app.repos.conversationRepository.save(conversations);

    app.repos.conversationRepository.save(conversations.filter((c) => c.id !== "conv-old"));

    expect(app.conversations()).toEqual(["conv-new"]);
    expect(app.rows().map((r) => r.id)).toEqual(["m-4", "m-5"]);
    expect(app.indexed().filter((r) => r.startsWith("m-1") || r.startsWith("m-2"))).toEqual([]);
    expect(app.indexed()).toHaveLength(2);
  });
});

describe("the search index", () => {
  it("indexes each message, follows an edit, and drops a removed one", async () => {
    const app = await start();
    const conversations = archive();
    app.repos.conversationRepository.save(conversations);
    expect(app.indexed()).toHaveLength(5);

    // The streaming path persists the reply once, with its final text.
    conversations[0].messages[1].text = "epoxy grout, sealed twice";
    conversations[1].messages.pop();
    app.repos.conversationRepository.save(conversations);

    expect(app.indexed()).toContain("m-5=epoxy grout, sealed twice");
    expect(app.indexed().some((r) => r.startsWith("m-3="))).toBe(false);
  });

  it("finds messages only when a search asks for them by scope", async () => {
    const app = await start();
    app.repos.conversationRepository.save(archive());
    app.db
      .prepare(
        "INSERT INTO projects (id, name, tag, description, progress, color, time_spent_minutes, created_at, updated_at, icon) VALUES ('p1', 'Grout Project', 'Home', '', 0, 'x', 0, 'now', 'now', 'x')",
      )
      .run();
    const search = (scope?: ("message" | "project")[]) =>
      app.repos.searchRepository
        .search({ query: "grout", scope })
        .map((r) => r.type)
        .sort();

    // Unscoped is what the search page and command palette send for "all".
    expect(search()).toEqual(["project"]);
    expect(search(["message"])).toEqual(["message", "message"]);
  });

  it("backfills rows that predate the index, once", async () => {
    const first = await start();
    first.db
      .prepare(
        "INSERT INTO projects (id, name, tag, description, progress, color, time_spent_minutes, created_at, updated_at, icon) VALUES ('p-legacy', 'Legacy Project', 'Old', '', 0, 'x', 0, 'now', 'now', 'x')",
      )
      .run();
    // What a database from before the search migration looks like: the row,
    // and no index entry for it.
    first.db.exec("DELETE FROM fts_workspace WHERE entity_id = 'p-legacy'");
    first.close();

    const app = await start();
    const hits = () =>
      (
        app.db
          .prepare("SELECT COUNT(*) AS n FROM fts_workspace WHERE entity_id = 'p-legacy'")
          .get() as { n: number }
      ).n;
    expect(hits()).toBe(1);
    expect(app.repos.searchRepository.search({ query: "Legacy" }).map((r) => r.id)).toEqual([
      "p-legacy",
    ]);

    app.initializeDatabase();
    expect(hits(), "a second start must not index it twice").toBe(1);
  });
});

describe("storage only", () => {
  it("GENESIS does not read the conversation tables", () => {
    const genesis = path.join(__dirname, "..", "src", "genesis");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(entry.name)) {
          const src = fs.readFileSync(p, "utf8");
          if (
            /chat_messages|conversationRepository|conversationsService|CHAT_ARCHIVE_KEY/.test(src)
          )
            offenders.push(path.relative(genesis, p));
        }
      }
    };
    walk(genesis);
    expect(offenders).toEqual([]);
  });
});
