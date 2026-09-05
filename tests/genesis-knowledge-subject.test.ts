/**
 * What the user is learning has to be nameable.
 *
 * `knowledgeRule` keyed its fragment on `memory.relatedNoteId`, and
 * `serializeUnderstanding` renders the half after the colon into a sentence for
 * the model. So the system prompt carried, verbatim:
 *
 *   Knowledge
 *   • Ae4016cb C1d8 45e0 B1a9 Bb551f84350d
 *   The user is actively learning Ae4016cb C1d8 45e0 B1a9 Bb551f84350d.
 *   Confidence: Low
 *
 * -- the title-caser splitting a UUID on its dashes. Two things follow, and the
 * second is the one with product consequences:
 *
 *   1. The prompt spends context asserting something meaningless.
 *   2. A UUID is unique per note, so every fragment had exactly one supporting
 *      memory. Confidence is computed from that count, so no knowledge
 *      understanding could ever rise above the floor. Three notes on one
 *      subject read as three unrelated Low-confidence facts.
 *
 * Keying on the note's subject fixes both: notes about one thing accumulate,
 * and writing about it repeatedly is what raises confidence in it.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeAll } from "vitest";

const { initializeDatabase } = await import("../src/persistence/initializer");
initializeDatabase();

const genesis = await import("../src/genesis/index");
const { akira, settlePendingPersistence } = await import("../src/persistence/akira-store");
const { understandingEngine } = await import("../src/genesis/understanding/engine");
const { getUnderstandingContext } = await import("../src/genesis/understanding");
const { memoryService } = await import("../src/genesis/memory/memory-service");

void genesis;

const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i;

function knowledgeKeys(): string[] {
  return understandingEngine
    .getUnderstandings()
    .filter((u) => u.category === "Knowledge")
    .map((u) => u.canonicalKey);
}

describe("knowledge understanding names its subject", () => {
  beforeAll(async () => {
    akira.initializeState({ ...akira.getState() } as never);

    // Two notes about ONE subject, deliberately cased differently, plus a
    // second subject, plus an untitled note.
    akira.addNote({
      title: "RISC-V pipeline hazards",
      content: "Forwarding resolves most data hazards.",
      projectId: null,
    });
    akira.addNote({
      title: "risc-v Pipeline Hazards",
      content: "Load-use still needs a stall cycle.",
      projectId: null,
    });
    akira.addNote({
      title: "Cache associativity",
      content: "Higher associativity lowers conflict misses.",
      projectId: null,
    });
    akira.addNote({ title: "", content: "an untitled scratch thought", projectId: null });
    await settlePendingPersistence();
  });

  it("names the subject rather than the note's identifier", () => {
    const keys = knowledgeKeys();
    expect(keys.length).toBeGreaterThan(0); // control: the rule produced anything at all
    for (const k of keys) {
      expect(k, `${k} still carries a raw identifier`).not.toMatch(UUID_LIKE);
    }
    expect(keys).toContain("knowledge:risc-v-pipeline-hazards");
    expect(keys).toContain("knowledge:cache-associativity");
  });

  it("puts a readable sentence in front of the model", () => {
    const block = getUnderstandingContext();
    expect(block).toContain("The user is actively learning Risc V Pipeline Hazards.");
    expect(block).not.toMatch(UUID_LIKE);
  });

  it("aggregates notes about one subject instead of fragmenting them", () => {
    const keys = knowledgeKeys();
    // Two notes, same subject, different casing -> one fragment.
    expect(keys.filter((k) => k === "knowledge:risc-v-pipeline-hazards")).toHaveLength(1);

    const u = understandingEngine
      .getUnderstandings()
      .find((x) => x.canonicalKey === "knowledge:risc-v-pipeline-hazards")!;
    // The point of aggregating: repeated engagement is now visible as
    // confidence. Under the old key this was structurally impossible.
    expect(u.supportingMemoryIds.length).toBeGreaterThanOrEqual(2);
    expect(u.confidence).not.toBe("Low");

    // POSITIVE CONTROL: a subject with one note is still Low, so the assertion
    // above is measuring aggregation and not a blanket confidence change.
    const single = understandingEngine
      .getUnderstandings()
      .find((x) => x.canonicalKey === "knowledge:cache-associativity")!;
    expect(single.confidence).toBe("Low");
  });

  it("says nothing at all about a note with no title", () => {
    // Better one fewer fragment than a fragment naming nothing.
    //
    // Asserted as an exact set rather than "no empty key": under the old
    // behaviour the untitled note still produced a fragment, keyed by its UUID,
    // which a non-empty-key check happily accepts. The set is what discriminates.
    const keys = knowledgeKeys().sort();
    expect(keys).toEqual(["knowledge:cache-associativity", "knowledge:risc-v-pipeline-hazards"]);
  });

  it("survives reconstruction, because the subject rides on the event", () => {
    // The subject is read from `metadata.title`, which is part of the durable
    // event -- not from the store, which is itself rebuilt from these events on
    // reload. Replay is the case that would break a store-backed lookup.
    const before = knowledgeKeys().sort();
    memoryService.initialize(); // clear-then-replay
    const after = knowledgeKeys().sort();

    expect(after.length).toBeGreaterThan(0); // control: replay produced something
    expect(after).toEqual(before);
    for (const k of after) expect(k).not.toMatch(UUID_LIKE);
  });
});
