/**
 * The order the user drags tasks into is the only order they have.
 *
 * `routes/tasks.tsx` makes every row `draggable` and reorders on drop; there is
 * no sort control anywhere in the task list. So manual order is not a
 * convenience on top of some other ordering — it is the ordering.
 *
 * It was kept in the store's array and nowhere else. `reorderTasks` rearranged
 * memory, no write was issued, and `SqliteTaskRepository.getAll()` read
 * `ORDER BY created_at ASC`. Reproduced before the fix:
 *
 *     store order before : A first, B second, C third
 *     store order after  : C third, A first, B second
 *     database order     : A first, B second, C third
 *
 * The drag appeared to work and was silently undone by the next reload.
 *
 * Adding `persist()` alone would not have fixed it: there was no column to
 * write to. `tasks.position` is that column, and `setOrder` is deliberately not
 * `update` — reordering is not editing a task, and `update` stamps
 * `updated_at`, so dragging one task would rewrite the modification time of
 * every task below it.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

import type { AkiraState } from "../src/shared/types/store-types";

await import("../src/genesis/index");
const { akira, settlePendingPersistence } = await import("../src/persistence/akira-store");
const { taskRepository } = await import("../src/persistence/repositories");

/** What a reload would show: the database, read the way hydration reads it. */
const durableOrder = (): string[] => taskRepository.getAll().map((t) => t.title);

const storeOrder = (): string[] => akira.getState().tasks.map((t) => t.title);

/** Clears both sides. Emptying only the store leaves rows behind to be re-read. */
async function fresh(): Promise<void> {
  akira.reset();
  await settlePendingPersistence();
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
}

async function seed(titles: string[]): Promise<string[]> {
  akira.addProject({ name: "Kitchen Renovation" });
  const projectId = akira.getState().lastProjectId as string;
  for (const title of titles) akira.addTaskDetails({ title, projectId });
  await settlePendingPersistence();
  return akira.getState().tasks.map((t) => t.id);
}

const idOf = (title: string): string => akira.getState().tasks.find((t) => t.title === title)!.id;

beforeEach(async () => {
  await fresh();
});

describe("a task list the user has reordered", () => {
  it("is stored in creation order until they touch it", async () => {
    // The guard for everything below: the fixture has to produce a list whose
    // order is known, or a later assertion about a changed order proves nothing.
    await seed(["A first", "B second", "C third"]);

    expect(storeOrder()).toEqual(["A first", "B second", "C third"]);
    expect(durableOrder()).toEqual(["A first", "B second", "C third"]);
  });

  it("survives a reload", async () => {
    const ids = await seed(["A first", "B second", "C third"]);

    akira.reorderTasks([ids[2], ids[0], ids[1]]);
    await settlePendingPersistence();

    expect(storeOrder()).toEqual(["C third", "A first", "B second"]);
    // The assertion the original bug failed: the database agrees.
    expect(durableOrder()).toEqual(["C third", "A first", "B second"]);
  });

  it("keeps that order when a new task is added afterwards", async () => {
    const ids = await seed(["A first", "B second", "C third"]);
    akira.reorderTasks([ids[2], ids[0], ids[1]]);
    await settlePendingPersistence();

    const projectId = akira.getState().lastProjectId as string;
    akira.addTaskDetails({ title: "D newest", projectId });
    await settlePendingPersistence();

    // Appended, not inserted. A new task has no place in an order the user
    // arranged, and it must not displace one.
    expect(durableOrder()).toEqual(["C third", "A first", "B second", "D newest"]);
    expect(storeOrder()).toEqual(durableOrder());
  });

  it("takes the latest of several reorders", async () => {
    const ids = await seed(["A first", "B second", "C third"]);

    akira.reorderTasks([ids[2], ids[1], ids[0]]);
    akira.reorderTasks([ids[1], ids[0], ids[2]]);
    akira.reorderTasks([ids[0], ids[2], ids[1]]);
    await settlePendingPersistence();

    // Three drags in quick succession, no awaits between them. The writes are
    // chained, so the last one wins rather than whichever settles last.
    expect(durableOrder()).toEqual(["A first", "C third", "B second"]);
    expect(storeOrder()).toEqual(durableOrder());
  });

  it("keeps the remaining order after a deletion", async () => {
    const ids = await seed(["A first", "B second", "C third", "D fourth"]);
    akira.reorderTasks([ids[3], ids[1], ids[0], ids[2]]);
    await settlePendingPersistence();

    akira.deleteTask(idOf("A first"));
    await settlePendingPersistence();

    expect(durableOrder()).toEqual(["D fourth", "B second", "C third"]);
    expect(storeOrder()).toEqual(durableOrder());
  });

  it("does not restamp the tasks it moves", async () => {
    // `updated_at` drives session attribution. If reordering rewrote it,
    // dragging a task today would pull finished work into today's session.
    const ids = await seed(["A first", "B second", "C third"]);
    const before = new Map(taskRepository.getAll().map((t) => [t.title, t.updatedAt]));

    akira.reorderTasks([ids[2], ids[0], ids[1]]);
    await settlePendingPersistence();

    for (const task of taskRepository.getAll()) {
      expect(task.updatedAt, `${task.title} was restamped by a reorder`).toBe(
        before.get(task.title),
      );
    }
  });
});
