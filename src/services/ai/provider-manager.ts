import { useState, useEffect } from "react";

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

      // Initialize metrics for Gemini
      this.metrics["Gemini"] = {
        providerName: "Gemini",
        model: "gemini-2.5-flash",
        requestCount: 0,
        streamStatus: "Idle",
        lastResponseTime: "-",
      };

      // Set initial status based on key presence
      if (!this.statuses["Gemini"]) {
        const hasKey = this.getApiKey("Gemini");
        this.statuses["Gemini"] = hasKey ? "Connected" : "Missing API Key";
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

  getMetrics(provider: string): ProviderMetrics {
    if (!this.metrics[provider]) {
      this.metrics[provider] = {
        providerName: provider,
        model: provider === "Gemini" ? "gemini-2.5-flash" : "unknown",
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
  }));

  useEffect(() => {
    return aiProviderManager.subscribe(() => {
      setState({
        activeProvider: aiProviderManager.getActiveProviderName(),
        geminiKey: aiProviderManager.getApiKey("Gemini"),
        geminiStatus: aiProviderManager.getStatus("Gemini"),
        geminiMetrics: aiProviderManager.getMetrics("Gemini"),
      });
    });
  }, []);

  return state;
}
