import { SelectedContext } from "../context-relevance-selector";
import { getUnderstandingContext } from "../../understanding";
import { getInsightContext } from "../../insights";
import { getWorkspaceProvider } from "../../../contracts/workspace-provider";
import { IntentResolution } from "../../understanding/intent-resolver";
import { ContextPackage } from "../types";
import { ResolvedContext } from "../context-resolution/types";
import { memoryService } from "../../memory/memory-service";

export const promptBuilder = {
  buildSystemInstruction(
    prompt: string,
    selection: SelectedContext,
    intentResolution: IntentResolution,
    baseInstruction?: string,
  ): string {
    let structuredSystemInstruction =
      baseInstruction || "You are AKIRA, a helpful desktop AI companion.";

    // Receive the Intent Resolution result as structured metadata
    if (intentResolution) {
      if (intentResolution.clarificationRequired) {
        const interpretations = intentResolution.candidates.map((c) => {
          const p = prompt.toLowerCase().trim();
          if (p === "pilot") {
            if (c.name === "career") return "aircraft pilot";
            if (c.name === "project") return "pilot project";
            if (c.name === "testing methodology") return "pilot testing";
          }
          return c.name;
        });

        structuredSystemInstruction += `\n\nIntent Resolution\n\nConfidence:\nLow\n\nClarification Required:\nYes\n\nPossible Interpretations:\n${interpretations.map((item) => `- ${item}`).join("\n")}\n\nInstruction:\nAsk one concise clarification question.\nDo not assume any interpretation.\nWait for the user's answer before continuing.`;
      } else {
        const metadata = {
          ambiguous: intentResolution.ambiguous,
          confidence: intentResolution.confidence,
          clarificationRequired: intentResolution.clarificationRequired,
          candidates: intentResolution.candidates.map((c) => c.name),
          resolvedIntent: intentResolution.intent,
        };
        structuredSystemInstruction += `\n\n[INTENT RESOLUTION METADATA]\n${JSON.stringify(metadata, null, 2)}`;
      }
    }

    if (selection.contextPackage) {
      const contextBlock = this.serializeContextPackage(selection.contextPackage);
      structuredSystemInstruction += `\n\n[COGNITIVE CONTEXT]\n${contextBlock}`;
    }

    const understandingsBlock = getUnderstandingContext(prompt, selection.filterUnderstandings);
    if (understandingsBlock) {
      structuredSystemInstruction += `\n\n${understandingsBlock}`;
    }

    const insightsBlock = getInsightContext(prompt);
    if (insightsBlock) {
      structuredSystemInstruction += `\n\n${insightsBlock}`;
    }

    if (selection.resolvedContext) {
      const resolvedBlock = this.serializeResolvedContext(selection.resolvedContext);
      structuredSystemInstruction += `\n\n[RESOLVED CONTEXT]\n${resolvedBlock}`;
    }

    if (selection.workspaceRelevant) {
      try {
        const state = getWorkspaceProvider().getState();
        if (state && state.projects && state.projects.length > 0) {
          structuredSystemInstruction +=
            `\n\n[AVAILABLE PROJECTS]\n` +
            state.projects.map((p) => `- ${p.name} (Tag: ${p.tag})`).join("\n") +
            `\nIf the user asks to start/continue work or select a project, ask them to clarify which project they want to work on. Encourage them to pick one of the available projects above.`;
        }
      } catch (e) {
        console.warn("Failed to append workspace projects to system instruction:", e);
      }
    }

    return structuredSystemInstruction;
  },

  serializeContextPackage(pkg: ContextPackage): string {
    let block = `Session ID: ${pkg.contextSessionId}\n`;

    if (pkg.activeCandidates.length > 0) {
      block += `\nRelevant Long-Term Memories:\n`;
      for (const item of pkg.activeCandidates) {
        const candidate = item.data;
        const memory = memoryService.getMemories().find((m) => m.id === candidate.memoryId);
        if (memory) {
          block += `- ${memory.description} (Reason: ${item.inclusionReason} | ID: ${memory.id})\n`;
        }
      }
    }

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
      block += `\nRecent Activity History:\n`;
      for (const summary of pkg.recentActivitySummary) {
        let resolvedSummary = summary;
        const idMatch = summary.match(/Recall active memory node \(([^)]+)\)/);
        if (idMatch && idMatch[1]) {
          const memoryId = idMatch[1];
          const memory = memoryService.getMemories().find((m) => m.id === memoryId);
          if (memory) {
            resolvedSummary = summary.replace(
              `Recall active memory node (${memoryId})`,
              `Recall active memory node [${memory.description}]`,
            );
          }
        }
        block += `- ${resolvedSummary}\n`;
      }
    }

    return block.trim();
  },

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
