import { ContextProviderRegistry, contextProviderRegistry } from "./registry";
import { ContextRequest, CandidateContext, ContextCollection } from "./types";

export class ContextIntelligenceService {
  constructor(private readonly registry: ContextProviderRegistry) {}

  /**
   * Accepts a ContextRequest, retrieves candidate contexts from all registered providers,
   * and aggregates them into a deterministic, immutable ContextCollection.
   *
   * If a provider throws an exception, the service isolates the failure, continues executing
   * other providers, excludes results from the failed provider, and does not create placeholder
   * error objects.
   *
   * Current Milestone Implementation Policy:
   * To ensure determinism, candidate contexts in the aggregated collection are sorted
   * alphabetically by `providerId` first, and then by candidate context `id`.
   */
  public retrieveContext(request: ContextRequest): ContextCollection {
    if (!request) {
      throw new Error("ContextRequest is required");
    }

    const providers = this.registry.getProviders();
    const aggregated: CandidateContext[] = [];

    for (const provider of providers) {
      try {
        const results = provider.retrieve(request);
        if (results && Array.isArray(results)) {
          for (const item of results) {
            if (item && typeof item === "object") {
              // Ensure we enforce basic type safety and construct a clean, shallow-frozen copy
              const validatedItem: CandidateContext = {
                id: String(item.id || ""),
                providerId: String(item.providerId || provider.id),
                type: String(item.type || ""),
                content: String(item.content || ""),
                ...(item.metadata ? { metadata: Object.freeze({ ...item.metadata }) } : {}),
              };
              aggregated.push(Object.freeze(validatedItem));
            }
          }
        }
      } catch (error) {
        // Provider Failure Isolation: catch and isolate provider-level errors.
        // As per purity constraints, we do not log, publish events, emit telemetry,
        // or insert placeholder error objects.
      }
    }

    // Deterministic ordering policy: Sort by providerId, then by candidate context id.
    const sorted = [...aggregated].sort((a, b) => {
      const providerCompare = a.providerId.localeCompare(b.providerId);
      if (providerCompare !== 0) {
        return providerCompare;
      }
      return a.id.localeCompare(b.id);
    });

    // Return a frozen ContextCollection containing a frozen array of CandidateContexts.
    return Object.freeze({
      contexts: Object.freeze(sorted),
    });
  }
}

export const contextIntelligenceService = new ContextIntelligenceService(contextProviderRegistry);
