import { describe, it, expect, beforeEach } from "vitest";
import {
  ContextProviderRegistry,
  ContextIntelligenceService,
  ContextProvider,
  ContextRequest,
  CandidateContext,
} from "../src/genesis/context/intelligence";

describe("GENESIS v2.21 — Context Intelligence Foundation", () => {
  let registry: ContextProviderRegistry;
  let service: ContextIntelligenceService;

  beforeEach(() => {
    registry = new ContextProviderRegistry();
    service = new ContextIntelligenceService(registry);
  });

  describe("ContextProviderRegistry", () => {
    it("should allow registering a valid provider", () => {
      const provider: ContextProvider = {
        id: "provider-a",
        retrieve: () => [],
      };

      registry.register(provider);
      const providers = registry.getProviders();

      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe("provider-a");
    });

    it("should reject duplicate provider IDs with a clear error", () => {
      const provider1: ContextProvider = {
        id: "provider-dup",
        retrieve: () => [],
      };
      const provider2: ContextProvider = {
        id: "provider-dup",
        retrieve: () => [],
      };

      registry.register(provider1);
      expect(() => registry.register(provider2)).toThrow(/Duplicate provider ID registered/);
    });

    it("should reject invalid providers", () => {
      expect(() => registry.register(null as any)).toThrow();
      expect(() => registry.register({ id: "" } as any)).toThrow();
    });

    it("should return registered providers in deterministic alphabetical order by ID", () => {
      const providerC: ContextProvider = { id: "provider-c", retrieve: () => [] };
      const providerA: ContextProvider = { id: "provider-a", retrieve: () => [] };
      const providerB: ContextProvider = { id: "provider-b", retrieve: () => [] };

      // Register out of order
      registry.register(providerC);
      registry.register(providerA);
      registry.register(providerB);

      const providers = registry.getProviders();
      expect(providers).toHaveLength(3);
      expect(providers[0].id).toBe("provider-a");
      expect(providers[1].id).toBe("provider-b");
      expect(providers[2].id).toBe("provider-c");
    });

    it("should expose an immutable/frozen provider array", () => {
      const provider: ContextProvider = { id: "provider-a", retrieve: () => [] };
      registry.register(provider);

      const providers = registry.getProviders();
      expect(Object.isFrozen(providers)).toBe(true);
      expect(() => (providers as any).push({ id: "hacked" })).toThrow();
    });
  });

  describe("ContextIntelligenceService", () => {
    it("should aggregate candidate context from multiple providers", () => {
      const providerA: ContextProvider = {
        id: "provider-a",
        retrieve: () => [
          { id: "ctx-1", providerId: "provider-a", type: "goal", content: "Learn React" },
        ],
      };

      const providerB: ContextProvider = {
        id: "provider-b",
        retrieve: () => [
          { id: "ctx-2", providerId: "provider-b", type: "habit", content: "Daily Coding" },
        ],
      };

      registry.register(providerA);
      registry.register(providerB);

      const request: ContextRequest = { query: "development" };
      const collection = service.retrieveContext(request);

      expect(collection.contexts).toHaveLength(2);
      expect(collection.contexts[0].id).toBe("ctx-1");
      expect(collection.contexts[1].id).toBe("ctx-2");
    });

    it("should isolate provider failures and continue executing remaining providers", () => {
      const providerGood: ContextProvider = {
        id: "provider-good",
        retrieve: () => [
          { id: "ctx-good", providerId: "provider-good", type: "state", content: "Working fine" },
        ],
      };

      const providerBad: ContextProvider = {
        id: "provider-bad",
        retrieve: () => {
          throw new Error("Simulated provider crash");
        },
      };

      // Register both providers
      registry.register(providerGood);
      registry.register(providerBad);

      const request: ContextRequest = { query: "status" };
      const collection = service.retrieveContext(request);

      // Verify that failure is isolated: bad provider excluded, good provider results returned, no error placeholders
      expect(collection.contexts).toHaveLength(1);
      expect(collection.contexts[0].id).toBe("ctx-good");
      expect(
        collection.contexts.some((c) => c.content.includes("crash") || c.type === "error"),
      ).toBe(false);
    });

    it("should return a frozen ContextCollection and frozen contexts array", () => {
      const provider: ContextProvider = {
        id: "provider-a",
        retrieve: () => [
          { id: "ctx-1", providerId: "provider-a", type: "goal", content: "Keep learning" },
        ],
      };

      registry.register(provider);
      const collection = service.retrieveContext({ query: "test" });

      expect(Object.isFrozen(collection)).toBe(true);
      expect(Object.isFrozen(collection.contexts)).toBe(true);
      expect(Object.isFrozen(collection.contexts[0])).toBe(true);
    });

    it("should aggregate results in a completely deterministic order (sorted by providerId, then by context id)", () => {
      // Create outputs that are unsorted
      const providerB: ContextProvider = {
        id: "provider-b",
        retrieve: () => [
          { id: "ctx-z", providerId: "provider-b", type: "state", content: "Z content" },
          { id: "ctx-y", providerId: "provider-b", type: "state", content: "Y content" },
        ],
      };

      const providerA: ContextProvider = {
        id: "provider-a",
        retrieve: () => [
          { id: "ctx-m", providerId: "provider-a", type: "state", content: "M content" },
        ],
      };

      // Register in reverse alphabetical order
      registry.register(providerB);
      registry.register(providerA);

      const collection = service.retrieveContext({ query: "sort-test" });

      // Deterministic sorted output:
      // provider-a first (ctx-m)
      // provider-b second (ctx-y, then ctx-z)
      expect(collection.contexts).toHaveLength(3);
      expect(collection.contexts[0].providerId).toBe("provider-a");
      expect(collection.contexts[0].id).toBe("ctx-m");

      expect(collection.contexts[1].providerId).toBe("provider-b");
      expect(collection.contexts[1].id).toBe("ctx-y");

      expect(collection.contexts[2].providerId).toBe("provider-b");
      expect(collection.contexts[2].id).toBe("ctx-z");
    });
  });
});
