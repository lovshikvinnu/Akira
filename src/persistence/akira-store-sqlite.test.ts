// Set isolated test database environment variables before loading database connectors
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { test, expect, beforeEach } from "vitest";
import { initializeDatabase } from "./initializer";
import { getDatabaseConnection } from "./connection";
import { akira, settlePendingPersistence } from "./akira-store";
import { saveMemory } from "../shared/genesis-provider";
import type { MemoryEvent } from "../shared/types/event-types";

initializeDatabase();

/**
 * Store mutations must reach SQLite, and these tests prove it by reading the
 * database back rather than by asserting a service method was called.
 *
 * Nothing here wraps the mutation in a request context. A store write-through
 * runs in the server runtime whether or not a request happens to be in flight,
 * and if it needs ceremony from every caller to work, it does not work.
 */

function db() {
  return getDatabaseConnection();
}

beforeEach(async () => {
  await settlePendingPersistence();
  db().prepare("DELETE FROM tasks").run();
  db().prepare("DELETE FROM projects").run();
  db().prepare("DELETE FROM settings").run();
});

test("addProject writes a real row to SQLite", async () => {
  akira.addProject({ name: "Real Persist", tag: "RP", color: "blue", icon: "folder" } as never);
  await settlePendingPersistence();

  const rows = db().prepare("SELECT name, tag FROM projects").all() as {
    name: string;
    tag: string;
  }[];
  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe("Real Persist");
  expect(rows[0].tag).toBe("RP");
});

test("task mutations write and update real rows", async () => {
  const projectId = akira.addProject({
    name: "Task Host",
    tag: "TH",
    color: "blue",
    icon: "folder",
  } as never);
  akira.addTaskDetails({ title: "Persisted task", projectId } as never);
  await settlePendingPersistence();

  const created = db().prepare("SELECT id, title, done FROM tasks").all() as {
    id: string;
    title: string;
    done: number;
  }[];
  expect(created).toHaveLength(1);
  expect(created[0].title).toBe("Persisted task");

  akira.toggleTask(created[0].id);
  await settlePendingPersistence();

  const toggled = db().prepare("SELECT done FROM tasks WHERE id = ?").get(created[0].id) as {
    done: number;
  };
  expect(Boolean(toggled.done)).toBe(true);
});

test("read-after-restart: a fresh read sees what the store persisted", async () => {
  const id = akira.addProject({
    name: "Survives Restart",
    tag: "SR",
    color: "green",
    icon: "folder",
  } as never);
  await settlePendingPersistence();

  // Read through a freshly resolved repository, not through store state.
  const { projectRepository } = await import("./repositories");
  const all = projectRepository.getAll() as { id: string; name: string }[];
  expect(all.some((p) => p.id === id && p.name === "Survives Restart")).toBe(true);
});

test("the GENESIS memory stream is durably written", async () => {
  const event = {
    id: "mem-durable-1",
    eventType: "note_created",
    title: "Durable memory",
    description: "d",
    timestamp: new Date().toISOString(),
    relatedProjectId: null,
    relatedNoteId: null,
    metadata: {},
  } as MemoryEvent;

  saveMemory(event);
  await settlePendingPersistence();

  const { settingsRepository } = await import("./repositories");
  const stored = settingsRepository.get("genesis_memories");
  expect(stored).toBeTruthy();
  expect(JSON.parse(stored as string).some((m: MemoryEvent) => m.id === "mem-durable-1")).toBe(
    true,
  );
});
