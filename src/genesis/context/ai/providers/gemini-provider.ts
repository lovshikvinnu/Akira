import { AIProvider } from "../provider-interface";
import { AIRequest, StandardAIResponse } from "../types";
import { ResponseAdapter, responseNormalizer } from "../response-normalizer";
import { aiProviderManager } from "../provider-manager";

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
    const apiKey = aiProviderManager.getApiKey("Gemini");
    const model = "gemini-2.5-flash";
    const startTime = Date.now();

    if (!apiKey) {
      console.warn("VITE_GEMINI_API_KEY is not defined. Using mock fallback mode for development.");

      const mockReply = `[MOCK RESPONSE] Hello! I received your prompt: "${request.prompt}".
I've loaded the active context session: ${request.contextPackage?.contextSessionId || "None"}.
You have ${request.contextPackage?.activeStories.length || 0} active stories and ${request.contextPackage?.identityObservations.length || 0} identity traits loaded.`;

      const duration = Date.now() - startTime;
      aiProviderManager.recordRequest("Gemini", model, duration, true, false);

      return responseNormalizer.normalize("Gemini", mockReply, model);
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const contents: { role?: string; parts: { text: string }[] }[] = [];

    if (request.history && request.history.length > 0) {
      for (const msg of request.history) {
        contents.push({
          role: msg.role === "akira" ? "model" : "user",
          parts: [
            {
              text: msg.text,
            },
          ],
        });
      }
    }

    // Append current prompt (latest user message) if not already the last item in history
    const lastHistoryItem = request.history?.[request.history.length - 1];
    if (
      !lastHistoryItem ||
      lastHistoryItem.text !== request.prompt ||
      (lastHistoryItem.role !== "user" && lastHistoryItem.role !== "model")
    ) {
      contents.push({
        role: "user",
        parts: [
          {
            text: request.prompt,
          },
        ],
      });
    }

    const payload: {
      contents: { role?: string; parts: { text: string }[] }[];
      generationConfig: { temperature: number; maxOutputTokens?: number };
      systemInstruction?: { parts: { text: string }[] };
    } = {
      contents,
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
        const duration = Date.now() - startTime;
        aiProviderManager.recordRequest("Gemini", model, duration, false, false);
        throw new Error(`Gemini API Request failed (Status ${response.status}): ${errText}`);
      }

      const data = await response.json();
      const duration = Date.now() - startTime;
      aiProviderManager.recordRequest("Gemini", model, duration, true, false);
      return responseNormalizer.normalize("Gemini", data, model);
    } catch (err) {
      console.error("Error inside GeminiProvider:", err);
      const duration = Date.now() - startTime;
      aiProviderManager.recordRequest("Gemini", model, duration, false, false);
      throw err;
    }
  }

  /**
   * Generates content as a stream from standardized requests, calling onChunk as chunks arrive.
   */
  async generateContentStream(
    request: AIRequest,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<StandardAIResponse> {
    const apiKey = aiProviderManager.getApiKey("Gemini");
    const model = "gemini-2.5-flash";
    const startTime = Date.now();

    if (!apiKey) {
      console.warn("VITE_GEMINI_API_KEY is not defined. Using mock fallback mode for development.");

      const mockReply = `[MOCK RESPONSE] Hello! I received your prompt: "${request.prompt}".
I've loaded the active context session: ${request.contextPackage?.contextSessionId || "None"}.
You have ${request.contextPackage?.activeStories.length || 0} active stories and ${request.contextPackage?.identityObservations.length || 0} identity traits loaded.
Here is some mock markdown to test the streaming rendering:
- **Presence**: Truth before comfort, compassion, accountability.
- **Goals**: Focus on high-value items first.
### Table Test
| Metric | Baseline | Target |
| :--- | :--- | :--- |
| Focus | 65% | 90% |
| Calm | 4/10 | 8/10 |

Let me know what else I can help you with!`;

      // Split into words/spaces to stream smoothly
      const words = mockReply.split(/(?=\s)/);
      let index = 0;

      aiProviderManager.setStreamStatus("Gemini", "Streaming");

      return new Promise<StandardAIResponse>((resolve, reject) => {
        const interval = setInterval(() => {
          if (signal?.aborted) {
            clearInterval(interval);
            const duration = Date.now() - startTime;
            aiProviderManager.recordRequest("Gemini", model, duration, false, true);
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }

          if (index < words.length) {
            onChunk(words[index]);
            index++;
          } else {
            clearInterval(interval);
            const duration = Date.now() - startTime;
            aiProviderManager.recordRequest("Gemini", model, duration, true, true);
            resolve(responseNormalizer.normalize("Gemini", mockReply, model));
          }
        }, 40);
      });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;

    const contents: { role?: string; parts: { text: string }[] }[] = [];

    if (request.history && request.history.length > 0) {
      for (const msg of request.history) {
        contents.push({
          role: msg.role === "akira" ? "model" : "user",
          parts: [
            {
              text: msg.text,
            },
          ],
        });
      }
    }

    // Append current prompt (latest user message) if not already the last item in history
    const lastHistoryItem = request.history?.[request.history.length - 1];
    if (
      !lastHistoryItem ||
      lastHistoryItem.text !== request.prompt ||
      (lastHistoryItem.role !== "user" && lastHistoryItem.role !== "model")
    ) {
      contents.push({
        role: "user",
        parts: [
          {
            text: request.prompt,
          },
        ],
      });
    }

    const payload: {
      contents: { role?: string; parts: { text: string }[] }[];
      generationConfig: { temperature: number; maxOutputTokens?: number };
      systemInstruction?: { parts: { text: string }[] };
    } = {
      contents,
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

    aiProviderManager.setStreamStatus("Gemini", "Streaming");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        const duration = Date.now() - startTime;
        aiProviderManager.recordRequest("Gemini", model, duration, false, true);
        throw new Error(`Gemini API Request failed (Status ${response.status}): ${errText}`);
      }

      if (!response.body) {
        const duration = Date.now() - startTime;
        aiProviderManager.recordRequest("Gemini", model, duration, false, true);
        throw new Error("Response body is not readable");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let streamBuffer = "";
      let accumulatedText = "";
      let lastParsedObj: unknown = null;
      let done = false;

      while (!done) {
        if (signal?.aborted) {
          reader.cancel();
          const duration = Date.now() - startTime;
          aiProviderManager.recordRequest("Gemini", model, duration, false, true);
          throw new DOMException("Aborted", "AbortError");
        }

        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunkStr = decoder.decode(value, { stream: !done });
          streamBuffer += chunkStr;
          streamBuffer = parseJSONStream(streamBuffer, (parsedObj: unknown) => {
            lastParsedObj = parsedObj;
            const rawObj = parsedObj as {
              candidates?: {
                content?: { parts?: { text?: string }[] };
                finishReason?: string;
              }[];
            };
            const textChunk = rawObj.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (textChunk) {
              accumulatedText += textChunk;
              onChunk(textChunk);
            }
          });
        }
      }

      const duration = Date.now() - startTime;
      if (lastParsedObj) {
        aiProviderManager.recordRequest("Gemini", model, duration, true, true);
        return responseNormalizer.normalize("Gemini", lastParsedObj, model);
      }

      aiProviderManager.recordRequest("Gemini", model, duration, true, true);
      return {
        responseId: uid(),
        provider: "Gemini",
        model,
        content: accumulatedText,
        finishReason: "stop",
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      if (err instanceof DOMException && err.name === "AbortError") {
        console.log("Gemini Stream aborted by caller.");
        aiProviderManager.recordRequest("Gemini", model, duration, false, true);
      } else {
        console.error("Error inside GeminiProvider stream:", err);
        aiProviderManager.recordRequest("Gemini", model, duration, false, true);
      }
      throw err;
    }
  }
}

/**
 * Parses incremental JSON blocks out of Gemini stream buffer array.
 */
function parseJSONStream(streamText: string, onObject: (obj: unknown) => void): string {
  let braceCount = 0;
  let startIndex = -1;
  let inString = false;
  let escape = false;
  let lastIndex = 0;

  for (let i = 0; i < streamText.length; i++) {
    const char = streamText[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        if (braceCount === 0) {
          startIndex = i;
        }
        braceCount++;
      } else if (char === "}") {
        braceCount--;
        if (braceCount === 0 && startIndex !== -1) {
          const jsonStr = streamText.slice(startIndex, i + 1);
          try {
            const parsed = JSON.parse(jsonStr);
            onObject(parsed);
            lastIndex = i + 1;
          } catch (e) {
            // failed to parse complete JSON block, leave it in buffer
          }
          startIndex = -1;
        }
      }
    }
  }

  return streamText.slice(lastIndex);
}
