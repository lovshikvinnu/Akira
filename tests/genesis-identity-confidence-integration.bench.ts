process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";
import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { EOL, tmpdir } from "node:os";
import { join } from "node:path";
const REPORT = process.env.AKIRA_PROBE_OUT ?? join(tmpdir(), "c3-integ.txt");
writeFileSync(REPORT, "");
const log = (...p: string[]) => appendFileSync(REPORT, p.join(" ") + EOL);
import type { AkiraState } from "../src/shared/types/store-types";
const genesis = await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { memoryService } = await import("../src/genesis/memory/memory-service");
const { storyService } = await import("../src/genesis/stories/story-service");
const { importanceService } = await import("../src/genesis/importance/importance-service");
const { relationshipService } = await import("../src/genesis/memory/relationships/relationship-service");
const { identityService: emergent } = await import("../src/genesis/understanding/identity-service");
const { identityBuilder } = await import("../src/genesis/understanding/identity-builder");
const { eventService } = await import("../src/genesis/events/event-service");
const g = await import("../src/genesis/identity");

function fresh() {
  const s = akira.getState() as AkiraState;
  akira.initializeState({ ...s, memories: [], tasks: [], notes: [], projects: [], chat: [] });
  memoryService.clearHistory(); genesis.candidateService.clearHistory();
  storyService.clearHistory(); importanceService.clearHistory();
  relationshipService.clearHistory(); emergent.clearHistory();
}
const conf = (nodeId: string) => g.identityConfidenceService.getConfidence(nodeId);

describe("integration feasibility", () => {
  it("I1: why the link fails today, at the mechanism", () => {
    fresh();
    eventService.record("declaration_captured", "Declaration Captured", "My goal is to learn Verilog", null);
    identityBuilder.flushDirtyStories();

    const identity = g.identityService.getIdentity()!;
    const goal = g.identityService.getGoals(identity.id)[0] as { title: string; confidenceReference: string; evidenceReferences: string[] };
    const memory = memoryService.getMemories().find((m) => m.description.includes("learn Verilog"))!;
    const node = g.identityGraphService.getIdentityNode(goal.confidenceReference);

    log("=== I1  the failing link ===");
    log(`  createGoal was passed evidenceReferences: ${JSON.stringify(goal.evidenceReferences)}`);
    log(`  that value is a MEMORY id:        ${goal.evidenceReferences[0] === memory.id}`);
    log(`  node.evidenceIds after linking:   ${JSON.stringify(node?.evidenceIds)}`);
    log(`  evidence records for that node:   ${g.identityEvidenceService.getEvidenceByNode(goal.confidenceReference).length}`);
    log(`  confidence: score ${conf(goal.confidenceReference)?.score} level ${conf(goal.confidenceReference)?.level}`);
    log("  -- linkEvidenceToNode returns false when getEvidence(id) misses, and is ignored");
  });

  it("I2: does creating the evidence record actually move it", () => {
    fresh();
    eventService.record("declaration_captured", "Declaration Captured", "My goal is to learn Verilog", null);
    identityBuilder.flushDirtyStories();
    const identity = g.identityService.getIdentity()!;
    const goal = g.identityService.getGoals(identity.id)[0] as { confidenceReference: string };
    const memory = memoryService.getMemories().find((m) => m.description.includes("learn Verilog"))!;
    const nodeId = goal.confidenceReference;

    log("");
    log("=== I2  feasibility: one addEvidence call ===");
    log(`  before: score ${conf(nodeId)?.score} level ${conf(nodeId)?.level}`);
    // sourceId is the designed pointer back to the source; no duplicate state.
    g.identityService.addEvidence(nodeId, "MemoryNode" as never, memory.id, memory.description);
    log(`  after:  score ${conf(nodeId)?.score} level ${conf(nodeId)?.level}`);
    log(`  evidence records: ${g.identityEvidenceService.getEvidenceByNode(nodeId).length}`);
    log(`  sourceId points at the memory: ${g.identityEvidenceService.getEvidenceByNode(nodeId)[0]?.sourceId === memory.id}`);
    log(`  summary: ${JSON.stringify(conf(nodeId)?.explanation?.summary ?? "")}`);
  });

  it("I3: does recency actually apply once evidence exists", () => {
    fresh();
    eventService.record("declaration_captured", "Declaration Captured", "My dream is to ship AKIRA", null);
    identityBuilder.flushDirtyStories();
    const identity = g.identityService.getIdentity()!;
    const goal = g.identityService.getGoals(identity.id).find((x: any) => x.title.includes("ship")) as { confidenceReference: string };
    const nodeId = goal.confidenceReference;
    const memory = memoryService.getMemories().find((m) => m.description.includes("ship AKIRA"))!;

    for (let i = 0; i < 4; i++) {
      g.identityService.addEvidence(nodeId, "MemoryNode" as never, `${memory.id}-${i}`, "x");
    }
    const fresh0 = conf(nodeId);

    // Backdate every evidence record past the 30-day boundary.
    const list = g.identityEvidenceService.getEvidenceByNode(nodeId);
    const old = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    for (const ev of list) g.identityService.updateEvidence(ev.id, { createdAt: old } as never);
    const aged = conf(nodeId);

    log("");
    log("=== I3  recency, once evidence exists ===");
    log(`  4 fresh items:  score ${fresh0?.score} level ${fresh0?.level}`);
    log(`  same, 60d old:  score ${aged?.score} level ${aged?.level}`);
  });

  it("I4: does confidence recalculate on replay", () => {
    fresh();
    eventService.record("declaration_captured", "Declaration Captured", "I aspire to run a marathon", null);
    identityBuilder.flushDirtyStories();
    const identity = g.identityService.getIdentity()!;
    const before = g.identityService.getGoals(identity.id).length;

    memoryService.reconstructRuntimeMemory();
    identityBuilder.flushDirtyStories();
    const after = g.identityService.getGoals(identity.id).length;

    log("");
    log("=== I4  replay ===");
    log(`  goals before replay ${before}, after ${after}`);
    log(`  emergent observations after replay: ${emergent.getObservations().length}`);
    log("  -- createGoal is guarded by an `exists` title check, so replay does not");
    log("     re-create and therefore does not recalculate graph confidence");
  });
});
