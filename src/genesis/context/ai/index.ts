import { providerRegistry } from "./provider-registry";
import { GeminiProvider } from "./providers/gemini-provider";
import { OpenRouterProvider } from "./providers/openrouter-provider";
import { aiProviderManager } from "./provider-manager";

export * from "./types";
export * from "./provider-interface";
export * from "./provider-registry";
export * from "./response-normalizer";
export * from "./context-engine";
export * from "./providers/gemini-provider";
export * from "./providers/openrouter-provider";
export * from "./provider-manager";

// Register default provider configurations
providerRegistry.registerProvider(new GeminiProvider());
providerRegistry.registerProvider(new OpenRouterProvider());

const initialProvider = aiProviderManager.getActiveProviderName();
try {
  providerRegistry.setActiveProvider(initialProvider);
} catch (e) {
  providerRegistry.setActiveProvider("Gemini");
}
