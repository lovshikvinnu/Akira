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
import { getHistoricalRecallProvider } from "../../../contracts/historical-recall";
import { detectHistoricalSearch, HISTORICAL_RESULT_LIMIT } from "../historical-search-intent";
import type { SelectedContext } from "../context-relevance-selector";

/** Options every request accepts beyond the provider's own. */
type EngineOptions = {
  /**
   * The conversation this request belongs to, so a historical search does not
   * quote the conversation back to itself -- the question being asked is in it.
   */
  conversationId?: string;
};

/**
 * Historical Recall stage: only when the user explicitly asked to search past
 * conversations. Never a fallback for GENESIS having no answer, and nothing it
 * retrieves is recorded anywhere -- it is quoted into this one request.
 */
async function recallHistory(
  prompt: string,
  conversationId: string | undefined,
): Promise<SelectedContext["historicalRecall"]> {
  const intent = detectHistoricalSearch(prompt);
  if (!intent) return undefined;
  const provider = getHistoricalRecallProvider();
  if (!provider || intent.terms.length === 0) return { terms: intent.terms, evidence: [] };
  try {
    const evidence = await provider.search({
      terms: intent.terms,
      limit: HISTORICAL_RESULT_LIMIT,
      excludeConversationId: conversationId,
    });
    return { terms: intent.terms, evidence: evidence.slice(0, HISTORICAL_RESULT_LIMIT) };
  } catch (err) {
    console.warn("Historical Recall search failed:", err);
    return { terms: intent.terms, evidence: [], failed: true };
  }
}

export const aiContextEngine = {
  /**
   * Transforms context package metadata and prompt variables into provider requests, dispatching via standard interface.
   */
  async executeRequest(
    prompt: string,
    contextPackage?: ContextPackage,
    options?: Omit<AIRequest, "prompt" | "contextPackage"> & EngineOptions,
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

    // 3. Historical Recall Stage (explicit requests only)
    selection.historicalRecall = await recallHistory(prompt, options?.conversationId);

    // 4. Prompt Builder Stage
    const structuredSystemInstruction = promptBuilder.buildSystemInstruction(
      prompt,
      selection,
      intentResolution,
      options?.systemInstruction,
    );

    const { conversationId: _conversationId, ...providerOptions } = options ?? {};
    const request: AIRequest = {
      ...providerOptions,
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
    options?: Omit<AIRequest, "prompt" | "contextPackage"> & {
      signal?: AbortSignal;
    } & EngineOptions,
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

    // 3. Historical Recall Stage (explicit requests only)
    selection.historicalRecall = await recallHistory(prompt, options?.conversationId);

    // 4. Prompt Builder Stage
    const structuredSystemInstruction = promptBuilder.buildSystemInstruction(
      prompt,
      selection,
      intentResolution,
      options?.systemInstruction,
    );

    const { conversationId: _conversationId, ...providerOptions } = options ?? {};
    const request: AIRequest = {
      ...providerOptions,
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
