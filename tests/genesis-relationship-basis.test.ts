/**
 * A link the user made and a link the system guessed are different claims.
 *
 * Four rules create memory relationships. Two match on an identifier the user
 * set -- `relatedProjectId` for "Part Of", `relatedNoteId` for "References" --
 * so the link restates something already true in the workspace. The other two
 * are this module's reading of the record: "Continues" decides one work session
 * carries on from another, and "Caused By" decides a completion was caused by a
 * creation, by looking for "completed"/"100%" against "initiated"/"created" in
 * prose. Nobody stated either.
 *
 * They were the same record. `evidence` reads like a distinction but it is a
 * sentence, so no consumer could act on it -- and there is a consumer that
 * would: the Relationships importance signal counts `rels.length`
 * (`importance-rules.ts:54`), so an inferred causality raised a memory's
 * importance exactly as much as a project the user filed it under, and
 * importance decides what is recalled into the prompt.
 *
 * `basis` is that distinction as a value rather than as prose. This file pins
 * which rule produces which, that nothing unclassified can reach the cache, and
 * that a reload does not turn a guess into a fact.
 *
 * "Unlinked" is deliberately not a stored value: a pair with insufficient
 * evidence produces no record, which is already how absence is represented.
 * A row meaning "no relationship" would invent state for every pair compared.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

import type { AkiraState } from "../src/shared/types/store-types";
import type { MemoryRelationship } from "../src/genesis/memory/relationships/types";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { relationshipRules } =
  await import("../src/genesis/memory/relationships/relationship-rules");

function freshWorkspace(): void {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  relationshipService.clearHistory();
}

/** A project worked on repeatedly, which is what produces linked memories. */
function projectWithRepeatedWork(): void {
  akira.addProject({ name: "Flight Training" });
  const pid = akira.getState().lastProjectId as string;
  akira.touchProject(pid);
  akira.touchProject(pid);
  akira.addTaskDetails({ title: "Book medical exam", projectId: pid });
  const task = akira.getState().tasks.find((t) => t.title === "Book medical exam");
  if (task) akira.toggleTask(task.id);
}

const all = (): MemoryRelationship[] => relationshipService.getRelationships();

beforeEach(() => {
  freshWorkspace();
  projectWithRepeatedWork();
});

describe("every relationship", () => {
  it("is actually being produced, in both kinds", () => {
    // The guard, and it has to name both kinds. Several cases below only assert
    // inside `if (basis === ...)`, so a workload that produced facts alone
    // would leave the inference claims looping over nothing and passing.
    // Measured on this workload: 6 "Part Of"/Fact and 1 "Continues"/Inference.
    expect(all().length).toBeGreaterThan(0);
    expect(all().some((r) => r.basis === "Fact")).toBe(true);
    expect(all().some((r) => r.basis === "Inference")).toBe(true);
  });

  it("says where it came from", () => {
    for (const rel of all()) {
      expect(["Fact", "Inference"]).toContain(rel.basis);
    }
  });

  it("does not carry the distinction in prose alone", () => {
    // `evidence` stays a sentence for a reader; `basis` is the value consumers
    // are meant to branch on.
    for (const rel of all()) {
      expect(typeof rel.basis).toBe("string");
      expect(rel.basis).not.toBe(rel.evidence);
    }
  });
});

describe("a link the user made", () => {
  it("is a fact when both memories carry the same project id", () => {
    const partOf = all().filter((r) => r.type === "Part Of");
    expect(partOf.length).toBeGreaterThan(0);
    for (const rel of partOf) expect(rel.basis).toBe("Fact");
  });
});

describe("a link the system read into the record", () => {
  it("is an inference, for every rule that decides rather than matches an id", () => {
    // Asserted against the rules themselves as well as the cache, because the
    // inferring rules need particular memory shapes and a workload that
    // happened not to produce one would leave this passing on nothing.
    const inferring = ["Activity Sequence Rule", "Milestone Causality Rule"];
    for (const name of inferring) {
      const rule = relationshipRules.find((r) => r.name === name);
      expect(rule, `${name} is gone`).toBeDefined();
    }

    for (const rel of all()) {
      if (rel.type === "Continues" || rel.type === "Caused By") {
        expect(rel.basis).toBe("Inference");
      }
    }
  });

  it("never claims a user-set identifier it does not have", () => {
    // The prohibition, stated as behaviour: a "Caused By" is never recorded as
    // a Fact, whatever its evidence sentence says about causation.
    for (const rel of all()) {
      if (rel.basis === "Fact") {
        expect(["Part Of", "References"]).toContain(rel.type);
      }
    }
  });
});

describe("an unclassified detection", () => {
  it("is not recorded at all", () => {
    // The service requires `basis` alongside type and evidence, so a rule that
    // detects a link without saying where it came from cannot reach the cache
    // and be counted as though the user had established it.
    const before = all().length;

    relationshipRules.push({
      name: "Unclassified Test Rule",
      evaluate: () => ({
        detected: true,
        type: "Related",
        evidence: "a link with no stated basis",
      }),
    });

    try {
      freshWorkspace();
      projectWithRepeatedWork();
      expect(all().length).toBeGreaterThan(0);
      expect(all().some((r) => r.evidence === "a link with no stated basis")).toBe(false);
      expect(before).toBeGreaterThan(0);
    } finally {
      relationshipRules.pop();
    }
  });
});

describe("after a reload", () => {
  it("does not promote an inference into a fact", () => {
    const beforeByType = new Map(all().map((r) => [`${r.type}:${r.evidence}`, r.basis]));
    expect(beforeByType.size).toBeGreaterThan(0);

    memoryService.reconstructRuntimeMemory();

    for (const rel of all()) {
      const previous = beforeByType.get(`${rel.type}:${rel.evidence}`);
      if (previous) expect(rel.basis).toBe(previous);
      if (rel.type === "Continues" || rel.type === "Caused By") {
        expect(rel.basis).toBe("Inference");
      }
    }
  });
});
