import { ContextProvider } from "./types";

export class ContextProviderRegistry {
  private readonly providers = new Map<string, ContextProvider>();

  /**
   * Registers a context provider.
   * Throws an error if the provider has a duplicate ID or invalid configuration.
   */
  public register(provider: ContextProvider): void {
    if (!provider) {
      throw new Error("Cannot register null or undefined provider");
    }
    if (!provider.id) {
      throw new Error("Provider must have a valid non-empty ID");
    }
    if (this.providers.has(provider.id)) {
      throw new Error(`Duplicate provider ID registered: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
  }

  /**
   * Retrieves all registered providers.
   *
   * Current Milestone Implementation Policy:
   * Providers are returned sorted alphabetically by their ID to ensure deterministic execution order.
   * This is the current milestone implementation policy rather than a permanent architectural requirement.
   */
  public getProviders(): readonly ContextProvider[] {
    const sorted = Array.from(this.providers.values()).sort((a, b) => a.id.localeCompare(b.id));
    return Object.freeze(sorted);
  }

  /**
   * Clears the registered providers map. Useful for isolated testing environments.
   */
  public clear(): void {
    this.providers.clear();
  }
}

export const contextProviderRegistry = new ContextProviderRegistry();
