import { useState, useEffect } from "react";
import { providerRegistry } from "./provider-registry";

export type ProviderStatus =
  "Connected" | "Local Mode" | "Missing API Key" | "Network Error" | "Invalid API Key";

export type ProviderMetrics = {
  providerName: string;
  model: string;
  requestCount: number;
  streamStatus: "Idle" | "Streaming" | "Success" | "Error";
  lastResponseTime: string;
};

class AIProviderManager {
  private activeProvider = "Gemini";
  private keys: Record<string, string> = {};
  private statuses: Record<string, ProviderStatus> = {};
  private metrics: Record<string, ProviderMetrics> = {};
  private models: Record<string, string> = {
    Gemini: "gemini-2.5-flash",
    OpenRouter: "nvidia/nemotron-3-nano-30b-a3b:free",
  };
  private listeners = new Set<() => void>();

  constructor() {
    this.loadConfig();
  }

  private loadConfig() {
    if (typeof window === "undefined") return;
    try {
      this.activeProvider = localStorage.getItem("akira:ai:active_provider") || "Gemini";

      // Load keys
      const storedKeys = localStorage.getItem("akira:ai:keys");
      if (storedKeys) {
        this.keys = JSON.parse(storedKeys);
      }

      // Load statuses
      const storedStatuses = localStorage.getItem("akira:ai:statuses");
      if (storedStatuses) {
        this.statuses = JSON.parse(storedStatuses);
      }

      // Load models
      const storedModels = localStorage.getItem("akira:ai:models");
      if (storedModels) {
        this.models = { ...this.models, ...JSON.parse(storedModels) };
      }

      // Initialize metrics for Gemini
      this.metrics["Gemini"] = {
        providerName: "Gemini",
        model: this.getModel("Gemini"),
        requestCount: 0,
        streamStatus: "Idle",
        lastResponseTime: "-",
      };

      // Set initial status based on key presence
      if (!this.statuses["Gemini"]) {
        const hasKey = this.getApiKey("Gemini");
        this.statuses["Gemini"] = hasKey ? "Connected" : "Missing API Key";
      }

      // Initialize metrics for OpenRouter
      this.metrics["OpenRouter"] = {
        providerName: "OpenRouter",
        model: this.getModel("OpenRouter"),
        requestCount: 0,
        streamStatus: "Idle",
        lastResponseTime: "-",
      };

      // Set initial status based on key presence
      if (!this.statuses["OpenRouter"]) {
        const hasKey = this.getApiKey("OpenRouter");
        this.statuses["OpenRouter"] = hasKey ? "Connected" : "Missing API Key";
      }
    } catch (e) {
      console.error("Failed to load provider config:", e);
    }
  }

  private saveConfig() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("akira:ai:active_provider", this.activeProvider);
      localStorage.setItem("akira:ai:keys", JSON.stringify(this.keys));
      localStorage.setItem("akira:ai:statuses", JSON.stringify(this.statuses));
      localStorage.setItem("akira:ai:models", JSON.stringify(this.models));
    } catch (e) {
      console.error("Failed to save provider config:", e);
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  getActiveProviderName(): string {
    return this.activeProvider;
  }

  setActiveProviderName(name: string) {
    this.activeProvider = name;
    try {
      providerRegistry.setActiveProvider(name);
    } catch (e) {
      console.warn(`Could not sync active provider "${name}" in registry:`, e);
    }
    this.saveConfig();
    this.emit();
  }

  getApiKey(provider: string): string {
    if (this.keys[provider]) {
      return this.keys[provider];
    }
    // Fallback to env
    if (provider === "Gemini") {
      return (import.meta.env.VITE_GEMINI_API_KEY as string) || "";
    }
    if (provider === "OpenRouter") {
      return (import.meta.env.VITE_OPENROUTER_API_KEY as string) || "";
    }
    return "";
  }

  setApiKey(provider: string, key: string) {
    if (key) {
      this.keys[provider] = key;
      this.statuses[provider] = "Connected";
    } else {
      delete this.keys[provider];
      this.statuses[provider] = "Missing API Key";
    }
    this.saveConfig();
    this.emit();
  }

  removeApiKey(provider: string) {
    delete this.keys[provider];
    this.statuses[provider] = "Missing API Key";
    this.saveConfig();
    this.emit();
  }

  getStatus(provider: string): ProviderStatus {
    const hasKey = this.getApiKey(provider);
    if (!hasKey) {
      return "Missing API Key";
    }
    return this.statuses[provider] || "Connected";
  }

  setStatus(provider: string, status: ProviderStatus) {
    this.statuses[provider] = status;
    this.saveConfig();
    this.emit();
  }

  getModel(provider: string): string {
    return (
      this.models[provider] ||
      (provider === "Gemini" ? "gemini-2.5-flash" : "nvidia/nemotron-3-nano-30b-a3b:free")
    );
  }

  setModel(provider: string, model: string) {
    this.models[provider] = model;
    const currentMetrics = this.getMetrics(provider);
    currentMetrics.model = model;
    this.saveConfig();
    this.emit();
  }

  getMetrics(provider: string): ProviderMetrics {
    if (!this.metrics[provider]) {
      this.metrics[provider] = {
        providerName: provider,
        model: this.getModel(provider),
        requestCount: 0,
        streamStatus: "Idle",
        lastResponseTime: "-",
      };
    }
    return this.metrics[provider];
  }

  recordRequest(
    provider: string,
    model: string,
    durationMs: number,
    success: boolean,
    stream: boolean,
  ) {
    const current = this.getMetrics(provider);
    current.requestCount += 1;
    current.model = model;
    current.streamStatus = success ? "Success" : "Error";
    current.lastResponseTime = `${durationMs}ms`;
    this.emit();
  }

  setStreamStatus(provider: string, status: ProviderMetrics["streamStatus"]) {
    const current = this.getMetrics(provider);
    current.streamStatus = status;
    this.emit();
  }

  async testConnection(
    provider: string,
    key: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!key) {
      return { success: false, message: "API Key is required to test connection." };
    }

    if (provider === "Gemini") {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: "ping",
                  },
                ],
              },
            ],
          }),
        });

        if (response.ok) {
          this.setStatus("Gemini", "Connected");
          return { success: true, message: "Connection test succeeded. API key is valid." };
        } else {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData?.error?.message || response.statusText || "Unknown error";
          let status: ProviderStatus = "Invalid API Key";
          let message = `Unable to connect: ${errMsg}`;

          if (response.status === 400 || response.status === 403) {
            status = "Invalid API Key";
            message =
              "Invalid API Key: The key was rejected by Google Gemini API. Please verify the key and try again.";
          } else {
            status = "Network Error";
            message = `Network Error: Request failed with status ${response.status}. ${errMsg}`;
          }
          this.setStatus("Gemini", status);
          return { success: false, message };
        }
      } catch (err: unknown) {
        this.setStatus("Gemini", "Network Error");
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `Network Error: Failed to reach Google Gemini API. Please check your internet connection. Detail: ${errMsg}`,
        };
      }
    }

    if (provider === "OpenRouter") {
      try {
        const endpoint = "https://openrouter.ai/api/v1/chat/completions";
        const model = this.getModel("OpenRouter");
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            "HTTP-Referer": "https://github.com/lovshikvinnu/AKIRA",
            "X-Title": "AKIRA",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: "ping",
              },
            ],
            max_tokens: 5,
          }),
        });

        if (response.ok) {
          this.setStatus("OpenRouter", "Connected");
          return { success: true, message: "Connection test succeeded. API key is valid." };
        } else {
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

          let status: ProviderStatus = "Invalid API Key";
          let message = `Unable to connect: ${errMessage}`;

          if (
            response.status === 401 ||
            errMessage.toLowerCase().includes("invalid api key") ||
            errMessage.toLowerCase().includes("key")
          ) {
            status = "Invalid API Key";
            message =
              "Invalid API Key: The key was rejected by OpenRouter. Please verify the key and try again.";
          } else if (
            response.status === 429 ||
            errMessage.toLowerCase().includes("rate limit") ||
            errMessage.toLowerCase().includes("too many requests")
          ) {
            status = "Network Error";
            message = "Rate Limit: Too many requests for OpenRouter provider. Please retry later.";
          } else {
            status = "Network Error";
            message = `Network Error: Request failed with status ${response.status}. ${errMessage}`;
          }
          this.setStatus("OpenRouter", status);
          return { success: false, message };
        }
      } catch (err: unknown) {
        this.setStatus("OpenRouter", "Network Error");
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `Network Error: Failed to reach OpenRouter API. Please check your internet connection. Detail: ${errMsg}`,
        };
      }
    }

    return { success: false, message: "Provider not supported for connection test." };
  }
}

export const aiProviderManager = new AIProviderManager();

export function useAIProviderManager() {
  const [state, setState] = useState(() => ({
    activeProvider: aiProviderManager.getActiveProviderName(),
    geminiKey: aiProviderManager.getApiKey("Gemini"),
    geminiStatus: aiProviderManager.getStatus("Gemini"),
    geminiMetrics: aiProviderManager.getMetrics("Gemini"),
    openRouterKey: aiProviderManager.getApiKey("OpenRouter"),
    openRouterStatus: aiProviderManager.getStatus("OpenRouter"),
    openRouterMetrics: aiProviderManager.getMetrics("OpenRouter"),
  }));

  useEffect(() => {
    return aiProviderManager.subscribe(() => {
      setState({
        activeProvider: aiProviderManager.getActiveProviderName(),
        geminiKey: aiProviderManager.getApiKey("Gemini"),
        geminiStatus: aiProviderManager.getStatus("Gemini"),
        geminiMetrics: aiProviderManager.getMetrics("Gemini"),
        openRouterKey: aiProviderManager.getApiKey("OpenRouter"),
        openRouterStatus: aiProviderManager.getStatus("OpenRouter"),
        openRouterMetrics: aiProviderManager.getMetrics("OpenRouter"),
      });
    });
  }, []);

  return state;
}
