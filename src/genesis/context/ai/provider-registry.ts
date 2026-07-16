import { AIProvider } from "./provider-interface";

const providers = new Map<string, AIProvider>();
let activeProviderName: string | null = null;

export const providerRegistry = {
  /**
   * Register a new AI provider backend.
   */
  registerProvider(provider: AIProvider): void {
    providers.set(provider.name, provider);
    if (!activeProviderName) {
      activeProviderName = provider.name;
    }
  },

  /**
   * Get provider by name.
   */
  getProvider(name: string): AIProvider | null {
    return providers.get(name) || null;
  },

  /**
   * Fetch currently active AI provider backend.
   */
  getActiveProvider(): AIProvider | null {
    if (!activeProviderName) return null;
    return providers.get(activeProviderName) || null;
  },

  /**
   * Swap active provider backend.
   */
  setActiveProvider(name: string): void {
    if (providers.has(name)) {
      activeProviderName = name;
    } else {
      throw new Error(`AI Provider "${name}" is not registered.`);
    }
  },

  /**
   * Clear registry cache.
   */
  clear(): void {
    providers.clear();
    activeProviderName = null;
  },
};
