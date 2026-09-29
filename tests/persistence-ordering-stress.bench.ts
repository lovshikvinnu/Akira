/**
 * Stress harness for the project -> task write ordering, run against a real
 * SQLite file rather than a mock. Not a regression test: this exists to try to
 * break the write chain, and prints store-vs-database counts for each arm.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

import type { AkiraState } from "../src/shared/types/store-types";

await import("../src/genesis/index");
const { akira, settlePendingPersistence, pendingPersistenceCount } =
  await import("../src/persistence/akira-store");
const { projectRepository, taskRepository, noteRepository } =
  await import("../src/persistence/repositories");

/**
 * Clears BOTH sides. `initializeState` alone empties the store and leaves the
 * database, so every arm inherits the previous arm's rows and reads as
 * divergence -- the first version of this harness reported 24 of 25 rounds
 * diverged for exactly that reason.
 */
async function fresh(): Promise<void> {
  akira.reset();
  await settlePendingPersistence();
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
}

function compare(label: string): void {
  const store = akira.getState();
  const dbProjects = projectRepository.getAll().length;
  const dbTasks = taskRepository.getAll().length;
  const ok = store.projects.length === dbProjects && store.tasks.length === dbTasks;
  console.log(
    `${ok ? "OK  " : "DIVERGED"} ${label.padEnd(44)} ` +
      `store p=${store.projects.length} t=${store.tasks.length} | ` +
      `db p=${dbProjects} t=${dbTasks}`,
  );
}

describe("persistence stress", () => {
  it("A: project then task with no await between them", async () => {
    await fresh();
    akira.addProject({ name: "Immediate" });
    const pid = akira.getState().lastProjectId as string;
    akira.addTaskDetails({ title: "straight after", projectId: pid });
    await settlePendingPersistence();
    compare("A project -> task, no delay");
  });

  it("B: one project, many tasks with no awaits", async () => {
    await fresh();
    akira.addProject({ name: "Burst" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 40; i++) akira.addTaskDetails({ title: `burst-${i}`, projectId: pid });
    await settlePendingPersistence();
    compare("B project -> 40 tasks");
  });

  it("C: interleaved projects and tasks", async () => {
    await fresh();
    for (let p = 0; p < 10; p++) {
      akira.addProject({ name: `P${p}` });
      const pid = akira.getState().lastProjectId as string;
      for (let t = 0; t < 5; t++) akira.addTaskDetails({ title: `P${p}-T${t}`, projectId: pid });
    }
    await settlePendingPersistence();
    compare("C 10 projects x 5 tasks interleaved");
  });

  it("D: mutate and delete in quick succession", async () => {
    await fresh();
    akira.addProject({ name: "Churn" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 12; i++) akira.addTaskDetails({ title: `churn-${i}`, projectId: pid });
    const ids = akira.getState().tasks.map((t) => t.id);
    for (const id of ids.slice(0, 6)) akira.toggleTask(id);
    for (const id of ids.slice(6)) akira.deleteTask(id);
    akira.updateProject(pid, { name: "Churn renamed" });
    await settlePendingPersistence();
    compare("D toggles + deletes + rename");
  });

  it("E: delete the project while its task writes are still pending", async () => {
    await fresh();
    akira.addProject({ name: "Doomed" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 10; i++) akira.addTaskDetails({ title: `doomed-${i}`, projectId: pid });
    console.log(`   pending writes when delete is issued: ${pendingPersistenceCount()}`);
    akira.deleteProject(pid);
    await settlePendingPersistence();
    compare("E delete project mid-flight");
  });

  it("F: reset while writes are in flight", async () => {
    await fresh();
    akira.addProject({ name: "Wiped" });
    const pid = akira.getState().lastProjectId as string;
    for (let i = 0; i < 15; i++) akira.addTaskDetails({ title: `wiped-${i}`, projectId: pid });
    console.log(`   pending writes when reset is issued: ${pendingPersistenceCount()}`);
    akira.reset();
    await settlePendingPersistence();
    compare("F reset mid-flight");
  });

  it("G: repeated rounds, to catch a rate rather than a one-off", async () => {
    let diverged = 0;
    for (let round = 0; round < 25; round++) {
      await fresh();
      akira.addProject({ name: `R${round}` });
      const pid = akira.getState().lastProjectId as string;
      akira.addTaskDetails({ title: `r${round}-a`, projectId: pid });
      akira.addTaskDetails({ title: `r${round}-b`, projectId: pid });
      await settlePendingPersistence();
      const store = akira.getState();
      if (
        store.projects.length !== projectRepository.getAll().length ||
        store.tasks.length !== taskRepository.getAll().length
      ) {
        diverged++;
      }
    }
    console.log(`G 25 rounds of project -> 2 tasks: ${diverged} diverged`);
  });

  it("H: notes created and deleted rapidly", async () => {
    await fresh();
    for (let i = 0; i < 20; i++) akira.addNote({ title: `n${i}`, content: `body ${i}` });
    await settlePendingPersistence();
    const ids = akira.getState().notes.map((n) => n.id);
    for (const id of ids.slice(0, 8)) akira.deleteNote(id);
    for (const id of ids.slice(8, 14)) akira.updateNote(id, { content: "edited" });
    await settlePendingPersistence();
    const store = akira.getState().notes.length;
    const db = noteRepository.getAll().length;
    console.log(
      `${store === db ? "OK  " : "DIVERGED"} H notes create/delete/update`.padEnd(52) +
        ` store n=${store} | db n=${db}`,
    );
  });

  it("I: task order agrees with the database after a reorder", async () => {
    await fresh();
    akira.addProject({ name: "Ordered" });
    const pid = akira.getState().lastProjectId as string;
    for (const t of ["one", "two", "three", "four"])
      akira.addTaskDetails({ title: t, projectId: pid });
    await settlePendingPersistence();
    const ids = akira.getState().tasks.map((t) => t.id);
    akira.reorderTasks([ids[3], ids[1], ids[2], ids[0]]);
    await settlePendingPersistence();
    const storeTitles = akira
      .getState()
      .tasks.map((t) => t.title)
      .join(",");
    const dbTitles = taskRepository
      .getAll()
      .map((t) => t.title)
      .join(",");
    console.log(
      `${storeTitles === dbTitles ? "OK  " : "DIVERGED"} I task order`.padEnd(52) +
        ` store=[${storeTitles}] db=[${dbTitles}]`,
    );
  });
});
