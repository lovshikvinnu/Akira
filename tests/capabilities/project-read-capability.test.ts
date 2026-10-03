process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeEach } from "vitest";
import { initializeDatabase } from "../../src/persistence/initializer";

initializeDatabase();

import { projectRepository } from "../../src/persistence/repositories";
import { CapabilityRegistry } from "../../src/contracts/capabilities/registry";
import {
  registerProjectCapabilities,
  projectReadDescriptor,
  projectListDescriptor,
} from "../../src/akira-os/projects/capabilities/project-read";
import { CorrelationMetadata } from "../../src/contracts/results/result";

describe("Project Read Capabilities Vertical Slice (project.read / project.list)", () => {
  let registry: CapabilityRegistry;

  const sampleCorrelation: CorrelationMetadata = {
    requestId: "req-project-123",
    correlationId: "corr-project-123",
    invocationId: "inv-project-123",
  };

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registerProjectCapabilities(registry);
  });

  it("registers project.read and project.list descriptors correctly", () => {
    expect(registry.has("project.read")).toBe(true);
    expect(registry.has("project.list")).toBe(true);

    const readCap = registry.get("project.read");
    expect(readCap?.descriptor.name).toBe("project.read");
    expect(readCap?.descriptor.kind).toBe("Query");
    expect(readCap?.descriptor.owner).toBe("AKIRA OS · workspace");

    const listCap = registry.get("project.list");
    expect(listCap?.descriptor.name).toBe("project.list");
    expect(listCap?.descriptor.kind).toBe("Query");
    expect(listCap?.descriptor.owner).toBe("AKIRA OS · workspace");
  });

  it("executes project.read and returns Result.success(project) when project exists", async () => {
    const projectId = projectRepository.add({
      name: "Akira System Core",
      tag: "Engine",
      description: "Capability architecture refactoring",
    });

    const res = await registry.invoke("project.read", { id: projectId }, sampleCorrelation);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).not.toBeNull();
      expect(res.value?.id).toBe(projectId);
      expect(res.value?.name).toBe("Akira System Core");
      expect(res.value?.tag).toBe("Engine");
      expect(res.correlation).toEqual(sampleCorrelation);
    }
  });

  it("executes project.read and returns Result.success(null) when project does not exist", async () => {
    const res = await registry.invoke(
      "project.read",
      { id: "non-existent-uuid" },
      sampleCorrelation,
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toBeNull();
      expect(res.correlation).toEqual(sampleCorrelation);
    }
  });

  it("returns Result.failure with category 'invalid_request' when project.read input is invalid", async () => {
    // Empty string fails input schema validation min(1)
    const res = await registry.invoke("project.read", { id: "" }, sampleCorrelation);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe("invalid_request");
      expect(res.error.message).toContain("Input validation failed");
      expect(res.correlation).toEqual(sampleCorrelation);
    }
  });

  it("executes project.list and returns Result.success(Project[]) containing all workspace projects", async () => {
    const p1 = projectRepository.add({ name: "Alpha Project" });
    const p2 = projectRepository.add({ name: "Beta Project" });

    const res = await registry.invoke("project.list", {}, sampleCorrelation);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(Array.isArray(res.value)).toBe(true);
      const ids = res.value.map((p) => p.id);
      expect(ids).toContain(p1);
      expect(ids).toContain(p2);
      expect(res.correlation).toEqual(sampleCorrelation);
    }
  });
});
