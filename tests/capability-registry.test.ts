import { describe, it, expect, vi } from "vitest";
import {
  CapabilityRegistry,
  Capability,
  DuplicateCapabilityRegistrationError,
  CapabilityNotFoundError,
  InvalidCapabilityPriorityError,
  CapabilityVersionMismatchError,
  InvalidCapabilityMetadataError,
  RuntimeManager,
  ModuleState,
  CapabilityEvents,
  ModuleInstance,
} from "../src/runtime";
import { eventBus } from "../src/shared/infrastructure/event-bus";

describe("Platform Runtime - Capability Registry", () => {
  const createMockCapability = (
    id: string,
    providerModule: string,
    priority: number = 100,
    version: string = "1.0.0",
    tags: string[] = [],
  ): Capability => ({
    id,
    name: id.toUpperCase(),
    description: `Test capability ${id}`,
    version,
    providerModule,
    priority,
    tags,
    status: "active",
  });

  describe("Capability Registration & Validation", () => {
    it("should successfully register, lookup, and unregister a capability provider", () => {
      const registry = new CapabilityRegistry();
      const cap = createMockCapability("search", "search-mod");
      const serviceInstance = { search: () => ["result"] };

      registry.register(cap, serviceInstance);

      expect(registry.has("search")).toBe(true);
      expect(registry.find("search")).toEqual(cap);
      expect(registry.getProviders("search")).toEqual(["search-mod"]);
      expect(registry.resolve("search")).toBe(serviceInstance);

      // Unregister
      registry.unregister("search", "search-mod");
      expect(registry.has("search")).toBe(false);
      expect(registry.find("search")).toBeNull();
      expect(() => registry.resolve("search")).toThrow(CapabilityNotFoundError);
    });

    it("should throw DuplicateCapabilityRegistrationError when same module registers same capability ID twice", () => {
      const registry = new CapabilityRegistry();
      const cap1 = createMockCapability("stats", "stats-mod");
      const cap2 = createMockCapability("stats", "stats-mod");

      registry.register(cap1);
      expect(() => registry.register(cap2)).toThrow(DuplicateCapabilityRegistrationError);
    });

    it("should throw InvalidCapabilityPriorityError when priority is negative or invalid", () => {
      const registry = new CapabilityRegistry();
      const cap = createMockCapability("search", "search-mod", -5);

      expect(() => registry.register(cap)).toThrow(InvalidCapabilityPriorityError);
    });

    it("should throw InvalidCapabilityMetadataError when ID or version is empty", () => {
      const registry = new CapabilityRegistry();
      const capNoId = {
        id: "",
        name: "test",
        description: "d",
        version: "1.0.0",
        providerModule: "m",
        priority: 100,
        tags: [],
        status: "active" as const,
      };
      expect(() => registry.register(capNoId)).toThrow(InvalidCapabilityMetadataError);
    });
  });

  describe("Provider Selection & Prioritization", () => {
    it("should resolve the provider with the highest priority when multiple exist", () => {
      const registry = new CapabilityRegistry();

      const providerLow = createMockCapability("database", "sqlite-mod", 50);
      const serviceLow = { type: "sqlite" };

      const providerHigh = createMockCapability("database", "postgres-mod", 150);
      const serviceHigh = { type: "postgres" };

      registry.register(providerLow, serviceLow);
      registry.register(providerHigh, serviceHigh);

      expect(registry.resolve("database")).toBe(serviceHigh);

      // Verify resolveAll returns them in prioritized order
      const allResolved = registry.resolveAll("database");
      expect(allResolved).toEqual([serviceHigh, serviceLow]);
    });

    it("should resolve ties deterministically using provider module ID sorting", () => {
      const registry = new CapabilityRegistry();

      const providerA = createMockCapability("logger", "a-logger", 100);
      const serviceA = { name: "A" };

      const providerB = createMockCapability("logger", "b-logger", 100);
      const serviceB = { name: "B" };

      registry.register(providerB, serviceB);
      registry.register(providerA, serviceA);

      // Deterministic choice should be 'a-logger' because of alphabetical sorting on tie
      const selected = registry.find("logger");
      expect(selected?.providerModule).toBe("a-logger");
      expect(registry.resolve("logger")).toBe(serviceA);
    });
  });

  describe("Lookups & Filtering", () => {
    it("should filter lookups by module ID and list all registered capabilities", () => {
      const registry = new CapabilityRegistry();
      const cap1 = createMockCapability("search", "mod-a");
      const cap2 = createMockCapability("stats", "mod-a");
      const cap3 = createMockCapability("billing", "mod-b");

      registry.register(cap1);
      registry.register(cap2);
      registry.register(cap3);

      expect(registry.getCapabilities("mod-a")).toEqual([cap1, cap2]);
      expect(registry.list()).toEqual([cap1, cap2, cap3]);
    });
  });

  describe("Semantic Version Bound Resolution", () => {
    it("should resolve capability instances matching the specified semver range check", () => {
      const registry = new CapabilityRegistry();

      const capOld = createMockCapability("engine", "engine-v1", 100, "1.2.0");
      const serviceOld = { ver: "1.2.0" };

      const capNew = createMockCapability("engine", "engine-v2", 100, "2.1.0");
      const serviceNew = { ver: "2.1.0" };

      registry.register(capOld, serviceOld);
      registry.register(capNew, serviceNew);

      // Matches ^1.0.0 -> should resolve engine-vold
      expect(registry.resolve("engine", "^1.0.0")).toBe(serviceOld);

      // Matches ^2.0.0 -> should resolve engine-vnew
      expect(registry.resolve("engine", "^2.0.0")).toBe(serviceNew);

      // Unmatched version range -> throws CapabilityVersionMismatchError
      expect(() => registry.resolve("engine", "^3.0.0")).toThrow(CapabilityVersionMismatchError);
    });
  });

  describe("Lifecycle Integration", () => {
    it("should automatically register capabilities on startup and unregister them on shutdown in RuntimeManager", async () => {
      const manager = new RuntimeManager();

      const storageModuleDefinition = {
        name: "storage-provider",
        version: "1.0.0",
        startup: () => {},
      };

      const mockManifest = {
        id: "storage-module",
        name: "Storage Module",
        version: "1.0.0",
        sdkVersion: "^1.0.0",
        description: "Provides storage capacity",
        author: "AKIRA",
        capabilities: ["storage", "caching"],
        enabled: true,
      };

      // Manually construct instance with manifest configuration loaded
      const context = (manager as any).createContextForModule("storage-module");
      const inst = new ModuleInstance(
        "storage-module",
        "Storage Module",
        "1.0.0",
        context,
        storageModuleDefinition,
        mockManifest,
      );

      // Register with manager maps
      manager.registerDiscoveredModule("storage-module", "mock/path");
      (manager as any).instances.set("storage-module", inst);
      manager.lifecycleManager.registerModule(inst);

      // Start it up via lifecycle manager
      await manager.lifecycleManager.start(inst);

      expect(inst.state).toBe(ModuleState.RUNNING);

      // Capabilities should be registered automatically!
      expect(manager.capabilityRegistry.has("storage")).toBe(true);
      expect(manager.capabilityRegistry.has("caching")).toBe(true);
      expect(manager.capabilityRegistry.getProviders("storage")).toContain("storage-module");

      // Shutdown module
      await manager.unloadModule("storage-module");

      // Capabilities should be removed automatically!
      expect(manager.capabilityRegistry.has("storage")).toBe(false);
      expect(manager.capabilityRegistry.has("caching")).toBe(false);
    });
  });

  describe("Events", () => {
    it("should publish events through the event bus for capability registration and removal", () => {
      const eventSpy = vi.fn();
      eventBus.subscribe(CapabilityEvents.REGISTERED, eventSpy);
      eventBus.subscribe(CapabilityEvents.REMOVED, eventSpy);

      const registry = new CapabilityRegistry();
      const cap = createMockCapability("db", "db-mod");

      registry.register(cap);
      registry.unregister("db", "db-mod");

      expect(eventSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("Stress Performance Tests", () => {
    it("should handle registration and priority lookup for 1000 capabilities within 50ms", () => {
      const registry = new CapabilityRegistry();

      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        const cap = createMockCapability(`cap-${i}`, `provider-${i}`, i);
        registry.register(cap, { instanceIndex: i });
      }
      const regTime = Date.now() - startTime;
      expect(regTime).toBeLessThan(50); // Under 50ms for 1000 registrations

      const resolveStart = Date.now();
      // O(1) Lookup of a specific capability
      const res = registry.resolve("cap-500");
      const lookupTime = Date.now() - resolveStart;

      expect(res.instanceIndex).toBe(500);
      expect(lookupTime).toBeLessThan(5); // Under 5ms for O(1) lookup
    });
  });
});
