import { StandardAIResponse } from "./types";

export interface ResponseAdapter {
  providerName: string;
  normalize(
    rawResponse: unknown,
    model: string,
    metadata?: Record<string, unknown>,
  ): StandardAIResponse;
}

const adapters = new Map<string, ResponseAdapter>();

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const responseNormalizer = {
  /**
   * Register a dynamic response normalization adapter.
   */
  registerAdapter(adapter: ResponseAdapter): void {
    adapters.set(adapter.providerName.toLowerCase(), adapter);
  },

  /**
   * Normalizes a provider's raw response structure into standard formats.
   */
  normalize(
    providerName: string,
    rawResponse: unknown,
    model: string,
    metadata?: Record<string, unknown>,
  ): StandardAIResponse {
    const adapter = adapters.get(providerName.toLowerCase());
    if (adapter) {
      return adapter.normalize(rawResponse, model, metadata);
    }

    // Fallback normalization if no specific adapter is found
    return {
      responseId: uid(),
      provider: providerName,
      model,
      content: typeof rawResponse === "string" ? rawResponse : JSON.stringify(rawResponse),
      finishReason: "unknown",
      timestamp: new Date().toISOString(),
      metadata,
    };
  },
};
