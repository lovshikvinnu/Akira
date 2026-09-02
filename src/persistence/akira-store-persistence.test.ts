// Set isolated test database environment variables before loading database connectors
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { test, expect, vi, afterEach } from "vitest";
import { initializeDatabase } from "./initializer";
import { akira, settlePendingPersistence, pendingPersistenceCount } from "./akira-store";
import { saveMemory } from "../shared/genesis-provider";
import type { MemoryEvent } from "../shared/types/event-types";

initializeDatabase();

/**
 * Every store mutation writes through to SQLite behind a dynamic import that is
 * deliberately not awaited, so the UI never blocks on disk. These tests pin the
 * two properties that follow from that: the work is owned, and a write that
 * fails is reported rather than escaping as an unhandled rejection.
 *
 * An unowned promise is what produced the nondeterministic
 * EnvironmentTeardownError seen in full runs: a module load still in flight
 * when Vitest tore the environment down rejected with nobody listening.
 */

afterEach(async () => {
  await settlePendingPersistence();
  vi.restoreAllMocks();
});

function memoryEvent(id: string): MemoryEvent {
  return {
    id,
    eventType: "note_created",
    title: "Persistence probe",
    description: "probe",
    timestamp: new Date().toISOString(),
    relatedProjectId: null,
    relatedNoteId: null,
    metadata: {},
  } as MemoryEvent;
}

test("store mutations register persistence work and settle to zero", async () => {
  await settlePendingPersistence();
  expect(pendingPersistenceCount()).toBe(0);

  akira.addProject({ name: "Owned", tag: "OW", color: "blue", icon: "folder" } as never);

  // The write-through starts immediately and is tracked rather than abandoned.
  expect(pendingPersistenceCount()).toBeGreaterThan(0);

  await settlePendingPersistence();
  expect(pendingPersistenceCount()).toBe(0);
});

test("a failing write is reported and never becomes an unhandled rejection", async () => {
  await settlePendingPersistence();

  const settings = await import("../akira-os/settings");
  const failure = new Error("simulated disk failure");
  vi.spyOn(settings.settingsService, "updateLastProjectId").mockRejectedValue(failure);
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});

  akira.addProject({ name: "Failing", tag: "FL", color: "red", icon: "folder" } as never);

  // Settling must resolve, not reject: the rejection is owned by the store.
  await expect(settlePendingPersistence()).resolves.toBeUndefined();
  expect(pendingPersistenceCount()).toBe(0);

  const reported = logged.mock.calls.some((call) =>
    call.some((arg) => arg === failure || String(arg).includes("Persistence write")),
  );
  expect(reported).toBe(true);
});

test("concurrent mutations do not lose persistence operations", async () => {
  await settlePendingPersistence();

  const settings = await import("../akira-os/settings");
  const projects = await import("../akira-os/projects");
  const settingsWrites = vi.spyOn(settings.settingsService, "updateLastProjectId");
  const projectWrites = vi.spyOn(projects.projectsService, "add");

  const count = 8;
  for (let i = 0; i < count; i++) {
    akira.addProject({ name: `Bulk ${i}`, tag: `B${i}`, color: "blue", icon: "folder" } as never);
  }

  expect(pendingPersistenceCount()).toBeGreaterThan(0);
  await settlePendingPersistence();

  expect(pendingPersistenceCount()).toBe(0);
  expect(projectWrites).toHaveBeenCalledTimes(count);
  expect(settingsWrites).toHaveBeenCalledTimes(count);
});

test("the GENESIS memory stream is written through the same mechanism", async () => {
  await settlePendingPersistence();

  const settings = await import("../akira-os/settings");
  const memoryWrites = vi.spyOn(settings.settingsService, "updateMemories");

  saveMemory(memoryEvent("mem-owned-1"));

  expect(pendingPersistenceCount()).toBeGreaterThan(0);
  await settlePendingPersistence();

  expect(pendingPersistenceCount()).toBe(0);
  expect(memoryWrites).toHaveBeenCalledTimes(1);
});

test("a failing GENESIS memory write is owned like every other write", async () => {
  await settlePendingPersistence();

  const settings = await import("../akira-os/settings");
  vi.spyOn(settings.settingsService, "updateMemories").mockRejectedValue(
    new Error("simulated memory persist failure"),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});

  saveMemory(memoryEvent("mem-owned-2"));

  await expect(settlePendingPersistence()).resolves.toBeUndefined();
  expect(pendingPersistenceCount()).toBe(0);
});
