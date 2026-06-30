import { AIProvider } from "../provider-interface";
import { AIRequest, StandardAIResponse } from "../types";
import { ResponseAdapter, responseNormalizer } from "../response-normalizer";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const geminiAdapter: ResponseAdapter = {
  providerName: "Gemini",
  normalize(
    rawResponse: unknown,
    model: string,
    metadata?: Record<string, unknown>,
  ): StandardAIResponse {
    if (typeof rawResponse === "string") {
      return {
        responseId: uid(),
        provider: "Gemini",
        model,
        content: rawResponse,
        finishReason: "stop",
        timestamp: new Date().toISOString(),
        metadata,
      };
    }

    const raw = rawResponse as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        finishReason?: string;
      }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const content = raw.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const finishReasonString = raw.candidates?.[0]?.finishReason || "STOP";

    let finishReason: StandardAIResponse["finishReason"] = "unknown";
    if (finishReasonString === "STOP") {
      finishReason = "stop";
    } else if (finishReasonString === "MAX_TOKENS") {
      finishReason = "length";
    } else if (finishReasonString === "SAFETY" || finishReasonString === "RECITATION") {
      finishReason = "content_filter";
    }

    const promptTokens = raw.usageMetadata?.promptTokenCount;
    const completionTokens = raw.usageMetadata?.candidatesTokenCount;
    const totalTokens = raw.usageMetadata?.totalTokenCount;

    return {
      responseId: uid(),
      provider: "Gemini",
      model,
      content,
      finishReason,
      usage: promptTokens
        ? {
            promptTokens,
            completionTokens,
            totalTokens,
          }
        : undefined,
      timestamp: new Date().toISOString(),
      metadata,
    };
  },
};

// Register dynamic adapter on module load
responseNormalizer.registerAdapter(geminiAdapter);

export class GeminiProvider implements AIProvider {
  name = "Gemini";

  /**
   * Generates content from standardized requests, returning StandardAIResponse.
   */
  async generateContent(request: AIRequest): Promise<StandardAIResponse> {
    const apiKey = (import.meta.env.VITE_GEMINI_API_KEY as string) || "";
    const model = "gemini-2.5-flash";

    if (!apiKey) {
      console.warn("VITE_GEMINI_API_KEY is not defined. Using mock fallback mode for development.");

      const mockReply = `[MOCK RESPONSE] Hello! I received your prompt: "${request.prompt}".
I've loaded the active context session: ${request.contextPackage?.contextSessionId || "None"}.
You have ${request.contextPackage?.activeStories.length || 0} active stories and ${request.contextPackage?.identityObservations.length || 0} identity traits loaded.`;

      return responseNormalizer.normalize("Gemini", mockReply, model);
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload: {
      contents: { parts: { text: string }[] }[];
      generationConfig: { temperature: number; maxOutputTokens?: number };
      systemInstruction?: { parts: { text: string }[] };
    } = {
      contents: [
        {
          parts: [
            {
              text: request.prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: request.temperature ?? 0.7,
      },
    };

    if (request.systemInstruction) {
      payload.systemInstruction = {
        parts: [
          {
            text: request.systemInstruction,
          },
        ],
      };
    }

    if (request.maxTokens) {
      payload.generationConfig.maxOutputTokens = request.maxTokens;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Request failed (Status ${response.status}): ${errText}`);
      }

      const data = await response.json();
      return responseNormalizer.normalize("Gemini", data, model);
    } catch (err) {
      console.error("Error inside GeminiProvider:", err);
      throw err;
    }
  }
}
