process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";
import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { EOL, tmpdir } from "node:os";
import { join } from "node:path";
const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "c3-decay.txt");
writeFileSync(REPORT, "");
const log = (...p: string[]) => appendFileSync(REPORT, p.join(" ") + EOL);
import type { AkiraState } from "../src/shared/types/store-types";
const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } =
  await import("../src/genesis/memory/relationships/relationship-service");
const { identityService: emergent } = await import("../src/genesis/understanding/identity-service");
const { identityBuilder } = await import("../src/genesis/understanding/identity-builder");
const { eventService } = await import("../src/genesis/events/event-service");
const g = await import("../src/genesis/identity");
const { InMemoryIdentityRepository } =
  await import("../src/genesis/identity/repositories/InMemoryIdentityRepository");

function fresh() {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory();
  genesis.candidateService.clearHistory();
  storyService.clearHistory();
  importanceService.clearHistory();
  relationshipService.clearHistory();
  emergent.clearHistory();
}
/** A process restart: the identity graph is in-memory only, so it starts empty. */
function simulateReload() {
  const repo = new InMemoryIdentityRepository();
  g.identityService.initialize(repo);
  memoryService.reconstructRuntimeMemory();
  identityBuilder.flushDirtyStories();
}
const goalNode = (needle: string) => {
  const id = g.identityService.getIdentity();
  if (!id) return undefined;
  const gg = g.identityService.getGoals(id.id).find((x: any) => x.title.includes(needle)) as
    { confidenceReference: string } | undefined;
  return gg?.confidenceReference;
};

describe("decay lifecycle", () => {
  it("D1: does an aged trait survive a reload aged", () => {
    fresh();
    g.identityService.initialize(new InMemoryIdentityRepository());
    eventService.record(
      "declaration_captured",
      "Declaration Captured",
      "My goal is to learn Verilog",
      null,
    );
    identityBuilder.flushDirtyStories();

    const node = goalNode("Verilog")!;
    const memory = memoryService.getMemories().find((m) => m.description.includes("Verilog"))!;
    for (let i = 0; i < 4; i++)
      g.identityService.addEvidence(node, "MemoryNode" as never, `${memory.id}-${i}`, "x");

    const old = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    for (const ev of g.identityEvidenceService.getEvidenceByNode(node)) {
      g.identityService.updateEvidence(ev.id, { createdAt: old } as never);
    }
    const aged = g.identityConfidenceService.getConfidence(node);
    log("=== D1  aged, then reloaded ===");
    log(`  before reload: score ${aged?.score} level ${aged?.level}  (evidence 90 days old)`);

    simulateReload();
    const after = goalNode("Verilog");
    const conf = after ? g.identityConfidenceService.getConfidence(after) : null;
    const evs = after ? g.identityEvidenceService.getEvidenceByNode(after) : [];
    log(
      `  after reload:  node ${after ? "rebuilt" : "MISSING"}  score ${conf?.score} level ${conf?.level}`,
    );
    log(`  evidence records after reload: ${evs.length}`);
    if (evs.length) {
      const days = (Date.now() - new Date(evs[0].createdAt).getTime()) / 86400000;
      log(`  age of rebuilt evidence: ${days.toFixed(2)} days`);
    }
  });

  it("D2: is createdAt settable through the supported contract", () => {
    log("");
    log("=== D2  the timestamp contract ===");
    log(`  addEvidence(nodeId, sourceType, sourceId, contentReference?, metadata?)`);
    log(`    createdAt is set to new Date() inside; not a parameter`);
    log(
      `  updateEvidence patch type: Partial<Omit<IdentityEvidence, "id" | "nodeId" | "createdAt">>`,
    );
    log(`    -> createdAt is OMITTED from the patch type; D1 set it via a cast`);
    log(`  metadata accepts weight/status/originEngine, not a timestamp`);
  });

  it("D3: cost of recalculation, for lazy vs periodic", () => {
    fresh();
    g.identityService.initialize(new InMemoryIdentityRepository());
    for (let i = 0; i < 20; i++) {
      eventService.record(
        "declaration_captured",
        "Declaration Captured",
        `My goal is to learn topic ${i}`,
        null,
      );
    }
    identityBuilder.flushDirtyStories();
    const id = g.identityService.getIdentity()!;
    const goals = g.identityService.getGoals(id.id) as Array<{ confidenceReference: string }>;
    for (const gg of goals) {
      for (let i = 0; i < 3; i++)
        g.identityService.addEvidence(gg.confidenceReference, "MemoryNode" as never, `e-${i}`, "x");
    }

    const t0 = performance.now();
    for (let r = 0; r < 50; r++)
      for (const gg of goals)
        g.identityConfidenceService.calculateConfidence(gg.confidenceReference);
    const ms = (performance.now() - t0) / 50;
    log("");
    log("=== D3  recalculation cost ===");
    log(`  nodes ${goals.length}, evidence per node 3`);
    log(`  full sweep of all nodes: ${ms.toFixed(4)} ms  (mean of 50)`);
  });

  it("D4: is the score a pure function of state, or of wall-clock", () => {
    log("");
    log("=== D4  replay determinism ===");
    log(`  calculateConfidence reads Date.now() for the recency factor`);
    log(`  so the same evidence yields a different score at a different wall-clock time`);
    log(`  boundaries at 7 and 30 days: factor 1.0 / 0.9 / 0.7`);
  });
});
