import { providerRegistry } from "./provider-registry";
import { AIRequest, StandardAIResponse } from "./types";
import { ContextPackage } from "../context/types";

export const aiContextEngine = {
  /**
   * Transforms context package metadata and prompt variables into provider requests, dispatching via standard interface.
   */
  async executeRequest(
    prompt: string,
    contextPackage?: ContextPackage,
    options?: Omit<AIRequest, "prompt" | "contextPackage">,
  ): Promise<StandardAIResponse> {
    const provider = providerRegistry.getActiveProvider();
    if (!provider) {
      throw new Error("No active AI Provider registered in providerRegistry.");
    }

    let structuredSystemInstruction =
      options?.systemInstruction || "You are AKIRA, a helpful desktop AI companion.";

    if (contextPackage) {
      const contextBlock = this.serializeContextPackage(contextPackage);
      structuredSystemInstruction += `\n\n[COGNITIVE CONTEXT]\n${contextBlock}`;
    }

    const request: AIRequest = {
      prompt,
      systemInstruction: structuredSystemInstruction,
      contextPackage,
      ...options,
    };

    return provider.generateContent(request);
  },

  /**
   * Transforms context package metadata and prompt variables into provider requests, dispatching via standard streaming interface.
   */
  async executeRequestStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    contextPackage?: ContextPackage,
    options?: Omit<AIRequest, "prompt" | "contextPackage"> & { signal?: AbortSignal },
  ): Promise<StandardAIResponse> {
    const provider = providerRegistry.getActiveProvider();
    if (!provider) {
      throw new Error("No active AI Provider registered in providerRegistry.");
    }

    let structuredSystemInstruction =
      options?.systemInstruction || "You are AKIRA, a helpful desktop AI companion.";

    if (contextPackage) {
      const contextBlock = this.serializeContextPackage(contextPackage);
      structuredSystemInstruction += `\n\n[COGNITIVE CONTEXT]\n${contextBlock}`;
    }

    const request: AIRequest = {
      prompt,
      systemInstruction: structuredSystemInstruction,
      contextPackage,
      ...options,
    };

    if (provider.generateContentStream) {
      return provider.generateContentStream(request, onChunk, options?.signal);
    } else {
      // Fallback if provider doesn't support streaming
      const response = await provider.generateContent(request);
      onChunk(response.content);
      return response;
    }
  },

  /**
   * Serializes a Context Package, preserving provenance reasons for explainability.
   */
  serializeContextPackage(pkg: ContextPackage): string {
    let block = `Session ID: ${pkg.contextSessionId}\n`;

    if (pkg.currentGoals.length > 0) {
      block +=
        `\nGoals:\n` +
        pkg.currentGoals.map((g) => `- ${g.data} (Reason: ${g.inclusionReason})`).join("\n") +
        "\n";
    }

    if (pkg.userPreferences.length > 0) {
      block +=
        `\nUser Preferences:\n` +
        pkg.userPreferences.map((p) => `- ${p.data} (Reason: ${p.inclusionReason})`).join("\n") +
        "\n";
    }

    if (pkg.importantConstraints.length > 0) {
      block +=
        `\nConstraints:\n` +
        pkg.importantConstraints
          .map((c) => `- ${c.data} (Reason: ${c.inclusionReason})`)
          .join("\n") +
        "\n";
    }

    if (pkg.identityObservations.length > 0) {
      block +=
        `\nEmergent Identity Traits:\n` +
        pkg.identityObservations
          .map((o) => `- ${o.data.name}: ${o.data.value} (Confidence: ${o.data.confidence})`)
          .join("\n") +
        "\n";
    }

    if (pkg.activeStories.length > 0) {
      block +=
        `\nActive Narrative Arcs:\n` +
        pkg.activeStories.map((s) => `- ${s.data.title} (Status: ${s.data.status})`).join("\n") +
        "\n";
    }

    if (pkg.recentActivitySummary.length > 0) {
      block +=
        `\nRecent Activity History:\n` +
        pkg.recentActivitySummary.map((a) => `- ${a}`).join("\n") +
        "\n";
    }

    return block.trim();
  },
};
