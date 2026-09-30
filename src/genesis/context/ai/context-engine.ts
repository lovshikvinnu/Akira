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
import {
  detectHistoricalQuestion,
  detectHistoricalSearch,
  HISTORICAL_RESULT_LIMIT,
} from "../historical-search-intent";
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
 * Does GENESIS already put the answer in front of the model? The v0 rule --
 * a rule, not a score, because nothing upstream produces an answer-level
 * confidence to threshold:
 *
 *   GENESIS is sufficient for a historical question when EVERY subject term of
 *   the question appears, at the start of a word, in the GENESIS context the
 *   model will receive: the serialized context package (recalled memories,
 *   goals, identity), the understandings block, and the resolved context.
 *
 * Every term, not any: knowing "FieldSense" is not knowing which sensor
 * FieldSense used. Word-prefix, so "sensor" is covered by "sensors" and
 * "dream" by "dreams". Read from the text the model gets, so "sufficient"
 * means the answer is in the request, not merely somewhere in memory.
 */
function genesisCovers(terms: string[], prompt: string, selection: SelectedContext): boolean {
  const genesisText = [
    selection.contextPackage ? promptBuilder.serializeContextPackage(selection.contextPackage) : "",
    getUnderstandingContext(prompt, selection.filterUnderstandings) ?? "",
    selection.resolvedContext
      ? promptBuilder.serializeResolvedContext(selection.resolvedContext)
      : "",
  ]
    .join("\n")
    .toLowerCase();
  // Terms are letters and digits only (see subjectTerms), so they need no escaping.
  return terms.every((t) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${t}`, "u").test(genesisText));
}

/**
 * Historical Recall stage. Two ways in, one search:
 *
 *   explicit  -- the user asked to search past conversations. Always searches.
 *   automatic -- the question asks about the user's own past
 *                (`detectHistoricalQuestion`) and GENESIS does not already
 *                cover it (`genesisCovers`). An ordinary question never
 *                reaches the archive merely because GENESIS lacks an answer.
 *
 * Nothing retrieved is recorded anywhere; it is quoted into this one request.
 */
async function recallHistory(
  prompt: string,
  conversationId: string | undefined,
  selection: SelectedContext,
): Promise<SelectedContext["historicalRecall"]> {
  const explicit = detectHistoricalSearch(prompt);
  const automatic = explicit ? null : detectHistoricalQuestion(prompt);
  const intent =
    explicit ??
    (automatic && !genesisCovers(automatic.terms, prompt, selection) ? automatic : null);
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
    // An automatic search the user never asked for has nothing to report: the
    // question is answered as it would have been without one.
    return explicit ? { terms: intent.terms, evidence: [], failed: true } : undefined;
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
    selection.historicalRecall = await recallHistory(prompt, options?.conversationId, selection);

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
    selection.historicalRecall = await recallHistory(prompt, options?.conversationId, selection);

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
