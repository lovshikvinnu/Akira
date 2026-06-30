import { providerRegistry } from "./provider-registry";
import { GeminiProvider } from "./providers/gemini-provider";

export * from "./types";
export * from "./provider-interface";
export * from "./provider-registry";
export * from "./response-normalizer";
export * from "./context-engine";
export * from "./providers/gemini-provider";

// Register default provider configurations
providerRegistry.registerProvider(new GeminiProvider());
providerRegistry.setActiveProvider("Gemini");
