import { AIProvider } from "../provider-interface";
import { AIRequest, StandardAIResponse } from "../types";
import { ResponseAdapter, responseNormalizer } from "../response-normalizer";
import { aiProviderManager } from "../provider-manager";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const openrouterAdapter: ResponseAdapter = {
  providerName: "OpenRouter",
  normalize(
    rawResponse: unknown,
    model: string,
    metadata?: Record<string, unknown>,
  ): StandardAIResponse {
    if (typeof rawResponse === "string") {
      return {
        responseId: uid(),
        provider: "OpenRouter",
        model,
        content: rawResponse,
        finishReason: "stop",
        timestamp: new Date().toISOString(),
        metadata,
      };
    }

    const raw = rawResponse as {
      id?: string;
      choices?: {
        message?: { content?: string };
        delta?: { content?: string };
        finish_reason?: string;
      }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const choice = raw.choices?.[0];
    const content = choice?.message?.content ?? choice?.delta?.content ?? "";
    const finishReasonString = choice?.finish_reason || "stop";

    let finishReason: StandardAIResponse["finishReason"] = "unknown";
    if (finishReasonString === "stop") {
      finishReason = "stop";
    } else if (finishReasonString === "length") {
      finishReason = "length";
    } else if (finishReasonString === "content_filter") {
      finishReason = "content_filter";
    }

    const promptTokens = raw.usage?.prompt_tokens;
    const completionTokens = raw.usage?.completion_tokens;
    const totalTokens = raw.usage?.total_tokens;

    return {
      responseId: raw.id || uid(),
      provider: "OpenRouter",
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
responseNormalizer.registerAdapter(openrouterAdapter);

export class OpenRouterProvider implements AIProvider {
  name = "OpenRouter";
  defaultModel = "nvidia/nemotron-3-nano-30b-a3b:free";

  async generateContent(request: AIRequest): Promise<StandardAIResponse> {
    const apiKey = aiProviderManager.getApiKey("OpenRouter");
    const model = aiProviderManager.getModel("OpenRouter") || this.defaultModel;
    const startTime = Date.now();

    if (!apiKey) {
      console.warn(
        "VITE_OPENROUTER_API_KEY is not defined. Using mock fallback mode for development.",
      );

      const mockReply = `[MOCK RESPONSE - OpenRouter] Hello! I received your prompt: "${request.prompt}".
I've loaded the active context session: ${request.contextPackage?.contextSessionId || "None"}.
You have ${request.contextPackage?.activeStories.length || 0} active stories and ${request.contextPackage?.identityObservations.length || 0} identity traits loaded.`;

      const duration = Date.now() - startTime;
      aiProviderManager.recordRequest("OpenRouter", model, duration, true, false);

      return responseNormalizer.normalize("OpenRouter", mockReply, model);
    }

    const endpoint = "https://openrouter.ai/api/v1/chat/completions";
    const messages: { role: string; content: string }[] = [];

    if (request.systemInstruction) {
      messages.push({
        role: "system",
        content: request.systemInstruction,
      });
    }

    if (request.history && request.history.length > 0) {
      for (const msg of request.history) {
        messages.push({
          role: msg.role === "akira" ? "assistant" : "user",
          content: msg.text,
        });
      }
    }

    const lastHistoryItem = request.history?.[request.history.length - 1];
    if (
      !lastHistoryItem ||
      lastHistoryItem.text !== request.prompt ||
      (lastHistoryItem.role !== "user" &&
        lastHistoryItem.role !== "model" &&
        lastHistoryItem.role !== "akira")
    ) {
      messages.push({
        role: "user",
        content: request.prompt,
      });
    }

    const payload: {
      model: string;
      messages: { role: string; content: string }[];
      temperature: number;
      max_tokens?: number;
    } = {
      model,
      messages,
      temperature: request.temperature ?? 0.7,
    };

    if (request.maxTokens) {
      payload.max_tokens = request.maxTokens;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/lovshikvinnu/AKIRA",
          "X-Title": "AKIRA",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        await handleOpenRouterError(response, model, startTime, false);
      }

      const data = await response.json();
      const duration = Date.now() - startTime;
      aiProviderManager.recordRequest("OpenRouter", model, duration, true, false);
      return responseNormalizer.normalize("OpenRouter", data, model);
    } catch (err) {
      console.error("Error inside OpenRouterProvider:", err);
      const duration = Date.now() - startTime;
      if (!(
        err instanceof Error &&
        (err.message.includes("Invalid API key") ||
          err.message.includes("Rate Limit") ||
          err.message.includes("Timeout"))
      )) {
        aiProviderManager.recordRequest("OpenRouter", model, duration, false, false);
      }
      throw err;
    }
  }

  async generateContentStream(
    request: AIRequest,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<StandardAIResponse> {
    const apiKey = aiProviderManager.getApiKey("OpenRouter");
    const model = aiProviderManager.getModel("OpenRouter") || this.defaultModel;
    const startTime = Date.now();

    if (!apiKey) {
      console.warn(
        "VITE_OPENROUTER_API_KEY is not defined. Using mock fallback mode for development.",
      );

      const mockReply = `[MOCK RESPONSE - OpenRouter] Hello! I received your prompt: "${request.prompt}".
I've loaded the active context session: ${request.contextPackage?.contextSessionId || "None"}.
You have ${request.contextPackage?.activeStories.length || 0} active stories and ${request.contextPackage?.identityObservations.length || 0} identity traits loaded.
Here is some mock markdown to test the streaming rendering:
- **Presence**: Truth before comfort, compassion, accountability.
- **Goals**: Focus on high-value items first.`;

      const words = mockReply.split(/(?=\s)/);
      let index = 0;

      aiProviderManager.setStreamStatus("OpenRouter", "Streaming");

      return new Promise<StandardAIResponse>((resolve, reject) => {
        const interval = setInterval(() => {
          if (signal?.aborted) {
            clearInterval(interval);
            const duration = Date.now() - startTime;
            aiProviderManager.recordRequest("OpenRouter", model, duration, false, true);
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }

          if (index < words.length) {
            onChunk(words[index]);
            index++;
          } else {
            clearInterval(interval);
            const duration = Date.now() - startTime;
            aiProviderManager.recordRequest("OpenRouter", model, duration, true, true);
            resolve(responseNormalizer.normalize("OpenRouter", mockReply, model));
          }
        }, 40);
      });
    }

    const endpoint = "https://openrouter.ai/api/v1/chat/completions";
    const messages: { role: string; content: string }[] = [];

    if (request.systemInstruction) {
      messages.push({
        role: "system",
        content: request.systemInstruction,
      });
    }

    if (request.history && request.history.length > 0) {
      for (const msg of request.history) {
        messages.push({
          role: msg.role === "akira" ? "assistant" : "user",
          content: msg.text,
        });
      }
    }

    const lastHistoryItem = request.history?.[request.history.length - 1];
    if (
      !lastHistoryItem ||
      lastHistoryItem.text !== request.prompt ||
      (lastHistoryItem.role !== "user" &&
        lastHistoryItem.role !== "model" &&
        lastHistoryItem.role !== "akira")
    ) {
      messages.push({
        role: "user",
        content: request.prompt,
      });
    }

    const payload: {
      model: string;
      messages: { role: string; content: string }[];
      temperature: number;
      max_tokens?: number;
      stream: boolean;
    } = {
      model,
      messages,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    if (request.maxTokens) {
      payload.max_tokens = request.maxTokens;
    }

    aiProviderManager.setStreamStatus("OpenRouter", "Streaming");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/lovshikvinnu/AKIRA",
          "X-Title": "AKIRA",
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        await handleOpenRouterError(response, model, startTime, true);
      }

      if (!response.body) {
        const duration = Date.now() - startTime;
        aiProviderManager.recordRequest("OpenRouter", model, duration, false, true);
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
          aiProviderManager.recordRequest("OpenRouter", model, duration, false, true);
          throw new DOMException("Aborted", "AbortError");
        }

        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunkStr = decoder.decode(value, { stream: !done });
          streamBuffer += chunkStr;
          streamBuffer = parseOpenRouterStream(streamBuffer, (parsedObj: unknown) => {
            lastParsedObj = parsedObj;
            const rawObj = parsedObj as {
              choices?: {
                delta?: {
                  content?: string;
                };
              }[];
            };
            const textChunk = rawObj.choices?.[0]?.delta?.content || "";
            if (textChunk) {
              accumulatedText += textChunk;
              onChunk(textChunk);
            }
          });
        }
      }

      const duration = Date.now() - startTime;
      if (lastParsedObj) {
        aiProviderManager.recordRequest("OpenRouter", model, duration, true, true);
        const normalized = responseNormalizer.normalize("OpenRouter", lastParsedObj, model);
        normalized.content = accumulatedText;
        return normalized;
      }

      aiProviderManager.recordRequest("OpenRouter", model, duration, true, true);
      return {
        responseId: uid(),
        provider: "OpenRouter",
        model,
        content: accumulatedText,
        finishReason: "stop",
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      if (err instanceof DOMException && err.name === "AbortError") {
        console.log("OpenRouter Stream aborted by caller.");
        aiProviderManager.recordRequest("OpenRouter", model, duration, false, true);
      } else {
        console.error("Error inside OpenRouterProvider stream:", err);
        if (!(
          err instanceof Error &&
          (err.message.includes("Invalid API key") ||
            err.message.includes("Rate Limit") ||
            err.message.includes("Timeout"))
        )) {
          aiProviderManager.recordRequest("OpenRouter", model, duration, false, true);
        }
      }
      throw err;
    }
  }
}

async function handleOpenRouterError(
  response: Response,
  model: string,
  startTime: number,
  stream: boolean,
) {
  const duration = Date.now() - startTime;
  aiProviderManager.recordRequest("OpenRouter", model, duration, false, stream);

  let errMessage = "";
  try {
    const errData = await response.json();
    errMessage = errData?.error?.message || response.statusText || "";
  } catch (e) {
    try {
      errMessage = await response.text();
    } catch (_) {
      errMessage = response.statusText || "";
    }
  }

  const status = response.status;
  if (
    status === 401 ||
    errMessage.toLowerCase().includes("invalid api key") ||
    errMessage.toLowerCase().includes("key")
  ) {
    throw new Error("Invalid API key configured for OpenRouter. Please check settings.");
  } else if (
    status === 429 ||
    errMessage.toLowerCase().includes("rate limit") ||
    errMessage.toLowerCase().includes("too many requests")
  ) {
    throw new Error("Rate Limit reached for OpenRouter. Please try again in a moment.");
  } else if (status === 408 || errMessage.toLowerCase().includes("timeout")) {
    throw new Error("Timeout: The OpenRouter service timed out while waiting for a response.");
  } else {
    throw new Error(`OpenRouter request failed (Status ${status}): ${errMessage}`);
  }
}

function parseOpenRouterStream(streamText: string, onJSON: (parsedObj: unknown) => void): string {
  const lines = streamText.split("\n");
  const remaining = lines.pop() || "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("data: ")) {
      const dataStr = trimmed.slice(6).trim();
      if (dataStr === "[DONE]") {
        continue;
      }
      try {
        const parsed = JSON.parse(dataStr);
        onJSON(parsed);
      } catch (e) {
        // failed to parse
      }
    }
  }

  return remaining;
}
