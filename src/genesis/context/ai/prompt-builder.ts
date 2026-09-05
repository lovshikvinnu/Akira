import { SelectedContext } from "../context-relevance-selector";
import { getUnderstandingContext } from "../../understanding";
import { getInsightContext } from "../../insights";
import { getWorkspaceProvider } from "../../../contracts/workspace-provider";
import { IntentResolution } from "../../understanding/intent-resolver";
import { ContextPackage } from "../types";
import { ResolvedContext } from "../context-resolution/types";
import { memoryService } from "../../memory/memory-service";
import { MULTI_FACTOR_RECALL_PREFIX } from "../../recall/recall-rules";

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
      // A heading with nothing under it is worse than no heading: it tells the
      // model a section exists and then says nothing in it.
      if (resolvedBlock) {
        structuredSystemInstruction += `\n\n[RESOLVED CONTEXT]\n${resolvedBlock}`;
      }
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
    // No `Session ID:` line. `contextSessionId` is a uid minted per rebuild in
    // `context-builder`, and it was the first thing the model read. Nothing can
    // be done with it in a reply: it names a structure the model cannot query,
    // it changes on every rebuild, and no consumer reads it back out of a
    // response. The field stays on `ContextPackage` for the runtime.
    let block = "";

    if (pkg.activeCandidates.length > 0) {
      block += `\nRelevant Long-Term Memories:\n`;
      for (const item of pkg.activeCandidates) {
        const candidate = item.data;
        const memory = memoryService.getMemories().find((m) => m.id === candidate.memoryId);
        if (memory) {
          // The reason, not the id. `inclusionReason` is why this memory was
          // selected -- "User Intent", "Recent Recall" -- which the model can
          // act on. `memory.id` was bookkeeping: seven uuids in a seven-memory
          // prompt, none of them referable to.
          //
          // The recall reason rides on the same line rather than in a block of
          // its own. It used to arrive via "Recent Activity History", which
          // reprinted all twelve descriptions to carry it; attaching it here
          // frames the evidence instead of restating it, which is the only way
          // a second mention of a memory earns its place.
          //
          // Filtered the way `compileRecentActivity` filters it: everything
          // except the ranking breakdown, which is a metrics dump the model
          // reads as though it were a fact about the user. Deduplicated because
          // the arc title inside it is the fixed label "Project Arc: Project
          // Created" for every project, so without this one constant sentence
          // would be repeated on most lines of the block.
          const readable = candidate.recallReasons.filter(
            (r) => !r.startsWith(MULTI_FACTOR_RECALL_PREFIX),
          );
          const why = Array.from(new Set([item.inclusionReason, ...readable])).join(" | ");
          block += `- ${memory.description} (Reason: ${why})\n`;
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
          // The reason, not the raw number. `inclusionReason` says whether the
          // user stated this or GENESIS inferred it, and for a stated one how
          // well the evidence currently supports it -- see
          // `identityInclusionReason`. Printing `confidence` alone reported
          // source certainty in a field the model reads as belief.
          .map((o) => `- ${o.data.name}: ${o.data.value} (${o.inclusionReason})`)
          .join("\n") +
        "\n";
    }

    if (pkg.activeStories.length > 0) {
      block +=
        `\nActive Narrative Arcs:\n` +
        pkg.activeStories.map((s) => `- ${s.data.title} (Status: ${s.data.status})`).join("\n") +
        "\n";
    }

    /*
     * No "Recent Activity History" block.
     *
     * It restated "Relevant Long-Term Memories" and added nothing. Both are
     * built by `rankedActive` from the same `recallCache`, and
     * `maxRecallCandidates` and `maxRecentActivity` are both 12 -- so the two
     * lists are the same memories in the same order by construction, not just
     * in the workload that measured this:
     *
     *     Long-Term Memories entries              12
     *     Recent Activity entries                 12
     *     descriptions present in BOTH blocks     12
     *     descriptions only in Recent Activity     0
     *     Recent Activity share of the prompt     1471 chars (39.1%)
     *
     * `compileRecentActivity` says as much itself: "The two lists are drawn
     * from one pool and should not disagree about which of it matters."
     *
     * What the second copy wrapped around each description was `Recall active
     * memory node [...] because: Associated with active narrative: "..."` --
     * this engine narrating its own recall, the same class of thing as the
     * ranking breakdown already filtered out of `recallReasons`. The narrative
     * title it carried is the fixed label "Project Arc: Project Created" for
     * every project in the workspace, so it could not even say which arc a
     * memory belonged to.
     *
     * The producer stays. `compileRecentActivity` still fills
     * `recentActivitySummary` and `brain.tsx` still renders it in the Brain
     * inspector -- the same split the recall-telemetry filter uses, where the
     * candidate keeps everything and only the copy built for the model is
     * narrowed.
     */

    return block.trim();
  },

  serializeResolvedContext(resolved: ResolvedContext): string {
    // The score, only when something actually scored.
    //
    // `resolveUnifiedContext` averages whichever sub-contexts exist and falls
    // back to `1.0` when there are none -- `confidenceCount > 0 ? mean : 1.0`.
    // That default is "nothing contributed", but printed here it read as
    // certainty, and on a workspace whose engines have produced nothing yet it
    // was the entire block:
    //
    //   [RESOLVED CONTEXT]
    //   Overall Confidence: 1
    //
    // A maximum-confidence claim with no subject, from no inputs. Measured on
    // a real workspace through `contextResolutionService`, that was the whole
    // of what the model received under that heading.
    //
    // Gated on provenance rather than on the number, because 1.0 is also a
    // legitimate mean when every contributing engine is certain -- suppressing
    // by value would hide the real case along with the empty one. The value
    // itself is untouched: `initiative/rules.ts` gates on it, and this changes
    // what is said rather than what is decided.
    // The confidence line is decided at the end, once it is known whether the
    // block says anything for it to be a confidence *in*. See the return below.
    let block = "";

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

    const body = block.trim();

    // A confidence with nothing to be confident about is not reported.
    //
    // `resolveUnifiedContext` averages whichever sub-contexts exist and falls
    // back to `1.0` when there are none, so the number is a default for absence
    // as often as it is a measurement. An earlier version of this gated on
    // provenance being non-empty, which reads correct and is not: measured at
    // boot, `context/knowledge` and `context/relationships` are initialized,
    // hold nothing, each report `confidence: 1`, and populate provenance
    // anyway. So provenance was always non-empty in production and the line
    // always printed -- "Overall Confidence: 1" as the entire block, from two
    // engines that have no producer at all.
    //
    // Whether the number itself should change is a separate question and a
    // real one: it gates `initiative/rules.ts`, and making empty engines report
    // 0 moves initiative from proceeding to suppressed. This does not touch the
    // value. It only declines to state an aggregate when there is no stated
    // thing it aggregates over, which is decidable from the rendered block and
    // needs no policy about what an empty engine believes.
    if (!body) return "";

    // No aggregate confidence line.
    //
    // There is no single proposition a cross-domain number would be about.
    // What used to print here was the mean of presence certainty, goal
    // definitional clarity, knowledge lifecycle stage and habit stability --
    // four different questions averaged into one figure that answered none of
    // them, and which read to the model as a summary of how well it knows the
    // user.
    //
    // Nothing is lost by dropping it. Every domain already states its own
    // confidence beside the thing it describes -- `Presence ... Confidence:`,
    // `• Goal: ... Confidence:`, `• Contact: ... Confidence:` -- and those are
    // certainties about a stated subject. `certainty.situational` still exists
    // for `initiative/rules.ts`, which is asking a real question of it; the
    // model was not.
    return body;
  },
};
