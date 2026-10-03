import { describe, it, expect } from "vitest";
import { z } from "zod";
import { CapabilityRegistry } from "../../src/contracts/capabilities/registry";
import { CapabilityDescriptor } from "../../src/contracts/capabilities/descriptor";
import { CorrelationMetadata } from "../../src/contracts/results/result";

describe("AKIRA OS Capability Registry Host (Contracts K7, K8, K14, Rule N3)", () => {
  const dummyCorrelation: CorrelationMetadata = {
    requestId: "req-1",
    correlationId: "corr-1",
    invocationId: "inv-1",
  };

  const sampleQueryDescriptor: CapabilityDescriptor<{ id: string }, { name: string }> = {
    name: "test.query",
    version: "1.0.0",
    owner: "AKIRA OS · workspace",
    kind: "Query",
    inputSchema: z.object({ id: z.string().min(1) }),
    permissions: { allowInternal: true, allowVajra: true },
    activationTier: 1,
    isAvailable: true,
    costClass: "local_cheap",
    executionCharacteristics: { isSynchronous: true, isIdempotent: true, isReadOnly: true },
  };

  it("registers, retrieves, and lists capability descriptors", () => {
    const registry = new CapabilityRegistry();
    const handler = (input: { id: string }) => ({ name: `Item ${input.id}` });

    registry.register(sampleQueryDescriptor, handler);

    expect(registry.has("test.query")).toBe(true);
    expect(registry.get("test.query")?.descriptor).toEqual(sampleQueryDescriptor);
    expect(registry.list()).toContainEqual(sampleQueryDescriptor);
  });

  it("throws error when registering duplicate capability names", () => {
    const registry = new CapabilityRegistry();
    const handler = () => ({ name: "test" });

    registry.register(sampleQueryDescriptor, handler);
    expect(() => registry.register(sampleQueryDescriptor, handler)).toThrow(
      "Capability registration failed: capability 'test.query' is already registered.",
    );
  });

  it("enforces Rule N3: throws error when trying to register a Command capability under GENESIS", () => {
    const registry = new CapabilityRegistry();
    const genesisCommandDescriptor: CapabilityDescriptor = {
      name: "memory.store",
      version: "1.0.0",
      owner: "GENESIS · Memory",
      kind: "Command",
      inputSchema: z.object({}),
      permissions: { allowInternal: true },
      activationTier: 1,
      isAvailable: true,
      costClass: "local_cheap",
      executionCharacteristics: { isSynchronous: true, isIdempotent: false, isReadOnly: false },
    };

    expect(() => registry.register(genesisCommandDescriptor, () => ({}))).toThrow(
      "Rule N3 Violation: GENESIS capability 'memory.store' cannot be a Command capability. GENESIS exposes only Queries.",
    );
  });

  it("invokes a capability and returns Result.success on valid execution", async () => {
    const registry = new CapabilityRegistry();
    registry.register(sampleQueryDescriptor, (input) => ({ name: `Project ${input.id}` }));

    const res = await registry.invoke("test.query", { id: "p1" }, dummyCorrelation);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toEqual({ name: "Project p1" });
      expect(res.correlation).toEqual(dummyCorrelation);
    }
  });

  it("returns Result.failure with category 'invalid_request' when input fails schema validation", async () => {
    const registry = new CapabilityRegistry();
    registry.register(sampleQueryDescriptor, (input) => ({ name: input.id }));

    // Invalid input: empty string fails z.string().min(1)
    const res = await registry.invoke("test.query", { id: "" }, dummyCorrelation);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe("invalid_request");
      expect(res.error.message).toContain("Input validation failed");
      expect(res.correlation).toEqual(dummyCorrelation);
    }
  });

  it("returns Result.failure with category 'capability_unavailable' when capability is missing or unavailable", async () => {
    const registry = new CapabilityRegistry();

    const res = await registry.invoke("nonexistent.query", {}, dummyCorrelation);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe("capability_unavailable");
      expect(res.correlation).toEqual(dummyCorrelation);
    }
  });

  it("returns Result.failure with category 'execution_failure' when handler throws", async () => {
    const registry = new CapabilityRegistry();
    registry.register(sampleQueryDescriptor, () => {
      throw new Error("SQLite connection lost");
    });

    const res = await registry.invoke("test.query", { id: "p1" }, dummyCorrelation);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe("execution_failure");
      expect(res.error.message).toBe("SQLite connection lost");
      expect(res.correlation).toEqual(dummyCorrelation);
    }
  });
});
