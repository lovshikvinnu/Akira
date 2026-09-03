/**
 * Identity observation growth.
 *
 * `observationCache` itself is bounded by construction: addObservation merges
 * on (category, name), so the number of entries tracks distinct traits rather
 * than activity. Two fields inside an entry were not bounded at all, and both
 * grow every time an existing observation is reinforced:
 *
 *   confidenceHistory  an array appended on each update
 *   provenance         a string concatenated on each update
 *
 * Identity is rebuilt from stories, and stories update on every memory, so a
 * long-lived process reinforces the same handful of traits indefinitely. This
 * is the same shape as importance signal history, which the retention policy
 * already caps with maxImportanceHistoryPerMemory.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const genesis = await import("../src/genesis/index");
const { identityService } = await import("../src/genesis/understanding/identity-service");
const { getRetentionPolicy, setRetentionPolicy, resetRetentionPolicy, DEFAULT_RETENTION_POLICY } =
  await import("../src/genesis/retention/policy");

/** Reinforces one trait repeatedly, the way story updates do. */
function reinforce(times: number): void {
  for (let i = 0; i < times; i++) {
    identityService.addObservation({
      category: "Trait",
      name: "Focus",
      value: "deep work",
      confidence: 0.5,
      provenance: `story-${i}`,
      supportingStoryIds: [`story-${i}`],
      supportingMemoryIds: [`mem-${i}`],
    } as never);
  }
}

describe("identity observation payload stays bounded", () => {
  beforeEach(() => {
    resetRetentionPolicy();
    identityService.clearHistory();
  });

  afterEach(() => {
    resetRetentionPolicy();
    identityService.clearHistory();
  });

  it("declares an observation history limit in the retention policy", () => {
    expect(DEFAULT_RETENTION_POLICY.maxObservationHistory).toBeGreaterThan(0);
    expect(Number.isFinite(DEFAULT_RETENTION_POLICY.maxObservationHistory)).toBe(true);
  });

  it("merges rather than accumulating entries for one trait", () => {
    reinforce(40);
    expect(identityService.getObservations()).toHaveLength(1);
  });

  it("caps confidence history under sustained reinforcement", () => {
    setRetentionPolicy({ maxObservationHistory: 6 });
    reinforce(40);

    const [observation] = identityService.getObservations();
    expect(observation.confidenceHistory.length).toBeLessThanOrEqual(6);
  });

  it("keeps the newest confidence entries, discarding the stale end", () => {
    setRetentionPolicy({ maxObservationHistory: 5 });
    reinforce(20);

    const [observation] = identityService.getObservations();
    const reasons = observation.confidenceHistory.map((h) => h.reason).join(" ");
    // The most recent reinforcement must survive; the first must not.
    expect(reasons).toContain("story-19");
    expect(reasons).not.toContain("story-0 ");
  });

  it("does not let provenance grow without bound", () => {
    setRetentionPolicy({ maxObservationHistory: 5 });
    reinforce(60);

    const [observation] = identityService.getObservations();
    // A string that concatenates one segment per update is unbounded; the
    // bound should track the same limit the history does.
    expect(observation.provenance.split("|").length).toBeLessThanOrEqual(
      getRetentionPolicy().maxObservationHistory + 1,
    );
  });
});
