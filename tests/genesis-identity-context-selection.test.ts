/**
 * What reaches the prompt when every observation claims the same confidence.
 *
 * `filterIdentityObservations` ranks emergent identity observations and cuts
 * them to `context.maxIdentityObservations` (12). It ranked on confidence
 * alone -- and confidence does not vary: `PersonalDeclarationRule` writes every
 * declaration at exactly 1.0, and the two computed traits saturate to 1.0 after
 * five reflections and twelve work memories. Measured on sixteen ordinary
 * declarations: fourteen observations, all at 1.0.
 *
 * A comparator returning 0 for every pair leaves `Array.prototype.sort` stable,
 * so the order became `observationCache`'s own -- insertion order, oldest
 * first -- and the cut took the newest. "I am interested in starting my own
 * company" was dropped in favour of "I enjoy cooking Thai food". The failure
 * grows with use: past twelve observations, nothing newly declared reaches the
 * AI again.
 *
 * WHY THE TIE ASSERTION IS NOT DECORATION
 *
 * These cases are about ordering *within* equal confidence. On a build where
 * confidence discriminated, the ranking would work for reasons that have
 * nothing to do with the tie-break, and a test that only checked the outcome
 * would pass while proving nothing. So the tie is asserted first: if these
 * observations ever stop being equal, this file must fail rather than quietly
 * start testing something else.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeAll } from "vitest";

import { initializeDatabase } from "../src/persistence/initializer";

initializeDatabase();

import type { AkiraState } from "../src/shared/types/store-types";
import type { IdentityObservation } from "../src/genesis/understanding/identity-types";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { identityService } = await import("../src/genesis/understanding/identity-service");
const { contextRules } = await import("../src/genesis/context/context-rules");
const { getRetentionPolicy } = await import("../src/genesis/retention/policy");

/** Declared oldest first, the way a user accumulates them. */
const DECLARATIONS = [
  "I am interested in aviation",
  "I value honesty",
  "I enjoy long distance running",
  "I like working early in the morning",
  "I want to become a better public speaker",
  "I am interested in embedded systems",
  "I value time with my family",
  "I enjoy cooking Thai food",
  "I like reading science fiction",
  "I am interested in machine learning",
  "I value financial independence",
  "I enjoy playing the guitar",
  "I am interested in starting my own company",
];

const NEWEST = "starting my own company";
const OLDEST = "aviation";

let observations: IdentityObservation[] = [];
let budget = 0;

beforeAll(() => {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();

  for (const d of DECLARATIONS) akira.addNote(d);

  observations = identityService.getObservations();
  budget = getRetentionPolicy().context.maxIdentityObservations;
});

describe("selecting identity observations for the prompt", () => {
  it("is choosing between observations that are genuinely tied", () => {
    // The precondition. Without it the cases below could pass on ordering that
    // confidence did by itself.
    expect(observations.length).toBeGreaterThan(budget);

    const eligible = observations.filter((o) => o.confidence >= 0.5);
    expect(eligible.length).toBeGreaterThan(budget);
    expect(new Set(eligible.map((o) => o.confidence)).size).toBe(1);

    // And the cut has to actually bite, or nothing is being chosen.
    expect(contextRules.filterIdentityObservations(observations).length).toBe(budget);
  });

  it("gives the most recent declaration to the AI", () => {
    const selected = contextRules.filterIdentityObservations(observations);
    const names = selected.map((c) => c.data.name);

    // Before the recency tie-break this was dropped: it is declared last, and
    // a degenerate sort cut the tail.
    expect(names).toContain(NEWEST);
  });

  it("drops the oldest rather than the newest when it must drop something", () => {
    const selected = contextRules.filterIdentityObservations(observations);
    const names = selected.map((c) => c.data.name);
    const cacheOrder = observations.map((o) => o.name);

    const dropped = observations
      .filter((o) => o.confidence >= 0.5 && !names.includes(o.name))
      .map((o) => o.name);

    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped).toContain(OLDEST);
    expect(dropped).not.toContain(NEWEST);

    // Everything dropped is older than everything kept.
    const newestDroppedIndex = Math.max(...dropped.map((n) => cacheOrder.indexOf(n)));
    const oldestKeptIndex = Math.min(
      ...names.filter((n) => cacheOrder.includes(n)).map((n) => cacheOrder.indexOf(n)),
    );
    expect(newestDroppedIndex).toBeLessThan(oldestKeptIndex);
  });

  it("still ranks by confidence first, where confidence differs", () => {
    // The tie-break must not have become the sort. A weak observation stays
    // last even though it is the most recently touched thing in the cache.
    const weak: IdentityObservation = {
      ...observations[0],
      id: "weak-but-newest",
      name: "a weakly evidenced trait",
      confidence: 0.6,
      updatedAt: new Date(Date.now() + 60_000).toISOString(),
    };

    const selected = contextRules.filterIdentityObservations([...observations, weak]);
    expect(selected.map((c) => c.data.name)).not.toContain("a weakly evidenced trait");
  });
});
