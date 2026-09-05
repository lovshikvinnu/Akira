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

  /**
   * Serializes a Resolved Context, preserving confidence, provenance, and subsystem ownership.
   */
  serializeResolvedContext(resolved: ResolvedContext): string {
    let block = `Overall Confidence: ${resolved.overallConfidence}\n\n`;

    const presence = resolved.provenance.presenceContext;
    if (presence) {
      const confStr =
        presence.confidence >= 0.8 ? "High" : presence.confidence >= 0.5 ? "Medium" : "Low";
      block += `Presence (Origin: Presence Engine)\n`;
      block += `• Session Type: ${presence.sessionType}\n`;
      block += `• Return State: ${presence.returnState}\n`;
      block += `• Current Time Period: ${presence.timePeriod}\n`;
      block += `• Confidence: ${confStr} (${presence.confidence})\n\n`;
    }

    const state = resolved.provenance.companionState;
    if (state) {
      const confStr =
        state.contextConfidence >= 0.8 ? "High" : state.contextConfidence >= 0.5 ? "Medium" : "Low";
      block += `State (Origin: Companion State Engine)\n`;
      block += `• Active Focus: ${state.currentFocus}\n`;
      if (state.activeProject) {
        block += `• Active Project: ${state.activeProject.name}\n`;
      }
      if (state.activeGoal) {
        block += `• Active Goal: ${state.activeGoal}\n`;
      }
      if (state.currentDiscussion) {
        block += `• Current Discussion: ${state.currentDiscussion}\n`;
      }
      if (state.pendingQuestions && state.pendingQuestions.length > 0) {
        block +=
          `• Pending Questions:\n` +
          state.pendingQuestions.map((q) => `  - ${q}`).join("\n") +
          "\n";
      }
      block += `• Confidence: ${confStr} (${state.contextConfidence})\n\n`;
    }

    if (resolved.activeGoals && resolved.activeGoals.length > 0) {
      block += `Goals (Origin: Goal Engine)\n`;
      block +=
        resolved.activeGoals
          .map((g) => {
            const confStr = g.confidence >= 0.8 ? "High" : g.confidence >= 0.5 ? "Medium" : "Low";
            return `• Goal: ${g.title}\n  - Description: ${g.description}\n  - Status: ${g.status}\n  - Progress: ${g.progressPercentage}%\n  - Confidence: ${confStr} (${g.confidence})`;
          })
          .join("\n") + "\n\n";
    }

    if (resolved.knowledgeRelevance && resolved.knowledgeRelevance.length > 0) {
      block += `Knowledge (Origin: Knowledge Engine)\n`;
      block +=
        resolved.knowledgeRelevance
          .map((k) => {
            const confStr = k.confidence >= 0.8 ? "High" : k.confidence >= 0.5 ? "Medium" : "Low";
            return `• Knowledge: ${k.name} (${k.type})\n  - Detail: ${k.description}\n  - Status: ${k.status}\n  - Confidence: ${confStr} (${k.confidence})`;
          })
          .join("\n") + "\n\n";
    }

    if (resolved.importantRelationships && resolved.importantRelationships.length > 0) {
      block += `Relationships (Origin: Relationship Engine)\n`;
      block +=
        resolved.importantRelationships
          .map((r) => {
            const confStr = r.confidence >= 0.8 ? "High" : r.confidence >= 0.5 ? "Medium" : "Low";
            return `• Contact: ${r.name} (${r.role})\n  - Status: ${r.status}\n  - Significance: ${r.significance}/10\n  - Confidence: ${confStr} (${r.confidence})`;
          })
          .join("\n") + "\n\n";
    }

    if (resolved.relevantHabits && resolved.relevantHabits.length > 0) {
      block += `Habits (Origin: Habit Engine)\n`;
      block +=
        resolved.relevantHabits
          .map((h) => {
            const confStr = h.confidence >= 0.8 ? "High" : h.confidence >= 0.5 ? "Medium" : "Low";
            const stabilityStr =
              h.stability >= 0.8 ? "Stable" : h.stability >= 0.5 ? "Developing" : "Volatile";
            return `• Routine: ${h.name}\n  - Status: ${h.status}\n  - Stability: ${stabilityStr} (${h.stability})\n  - Confidence: ${confStr} (${h.confidence})`;
          })
          .join("\n") + "\n\n";
    }

    if (resolved.reflectionRelevance && resolved.reflectionRelevance.length > 0) {
      block += `Reflection (Origin: Reflection Engine)\n`;
      block +=
        resolved.reflectionRelevance
          .map((r) => {
            const confStr = r.confidence >= 0.8 ? "High" : r.confidence >= 0.5 ? "Medium" : "Low";
            return `• Progress Summary: ${r.progressSummary}\n  - Growth Summary: ${r.growthSummary}\n  - Habits/Patterns: ${r.patternSummary}\n  - Confidence: ${confStr} (${r.confidence})`;
          })
          .join("\n") + "\n\n";
    }

    let hasSummary = false;
    let summaryBlock = `Summary\n`;

    if (resolved.relevantContext && resolved.relevantContext.length > 0) {
      hasSummary = true;
      summaryBlock +=
        `• Context Summary:\n` + resolved.relevantContext.map((c) => `  - ${c}`).join("\n") + "\n";
    }

    if (resolved.supportingEvidence && resolved.supportingEvidence.length > 0) {
      hasSummary = true;
      summaryBlock +=
        `• Supporting Evidence:\n` +
        resolved.supportingEvidence.map((e) => `  - ${e}`).join("\n") +
        "\n";
    }

    if (resolved.conflictsExposed && resolved.conflictsExposed.length > 0) {
      hasSummary = true;
      summaryBlock +=
        `• Conflicts Exposed:\n` +
        resolved.conflictsExposed.map((c) => `  - ${c}`).join("\n") +
        "\n";
    }

    if (hasSummary) {
      block += summaryBlock;
    }

    return block.trim();
  },
};
