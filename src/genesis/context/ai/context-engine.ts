import { providerRegistry } from "./provider-registry";
import { AIRequest, StandardAIResponse } from "./types";
import { ContextPackage } from "../types";
import { contextResolutionService, ResolvedContext } from "../context-resolution";
import { memoryService } from "../../memory/memory-service";
import { getUnderstandingContext, intentResolver } from "../../understanding";
import { getInsightContext } from "../../insights";
import { contextRelevanceSelector } from "../context-relevance-selector";
import { getWorkspaceProvider } from "../../../contracts/workspace-provider";
import { promptBuilder } from "./prompt-builder";

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

    // 1. Intent Resolution Stage
    const intentResolution = intentResolver.resolveIntent(prompt, options?.history);

    // 2. Context Relevance Selection Stage
    const resolvedContext = contextResolutionService.getContext();
    const selection = contextRelevanceSelector.selectContext(
      prompt,
      contextPackage,
      resolvedContext,
      intentResolution,
    );

    // 3. Prompt Builder Stage
    const structuredSystemInstruction = promptBuilder.buildSystemInstruction(
      prompt,
      selection,
      intentResolution,
      options?.systemInstruction,
    );

    const request: AIRequest = {
      ...options,
      prompt,
      systemInstruction: structuredSystemInstruction,
      contextPackage: selection.contextPackage,
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

    // 1. Intent Resolution Stage
    const intentResolution = intentResolver.resolveIntent(prompt, options?.history);

    // 2. Context Relevance Selection Stage
    const resolvedContext = contextResolutionService.getContext();
    const selection = contextRelevanceSelector.selectContext(
      prompt,
      contextPackage,
      resolvedContext,
      intentResolution,
    );

    // 3. Prompt Builder Stage
    const structuredSystemInstruction = promptBuilder.buildSystemInstruction(
      prompt,
      selection,
      intentResolution,
      options?.systemInstruction,
    );

    const request: AIRequest = {
      ...options,
      prompt,
      systemInstruction: structuredSystemInstruction,
      contextPackage: selection.contextPackage,
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
};
