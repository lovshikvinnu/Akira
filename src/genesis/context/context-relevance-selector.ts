import { getWorkspaceProvider } from "../../contracts/workspace-provider";
import { intentClassifier } from "../understanding/intent-classifier";
import { ContextPackage } from "./types";
import { ResolvedContext } from "./context-resolution/types";
import { Understanding } from "../understanding/types";
import { IntentResolution } from "../understanding/intent-resolver";

export interface SelectedContext {
  contextPackage?: ContextPackage;
  resolvedContext?: ResolvedContext | null;
  workspaceRelevant: boolean;
  filterUnderstandings(understandings: Understanding[]): Understanding[];
}

export const contextRelevanceSelector = {
  selectContext(
    prompt: string,
    contextPackage?: ContextPackage,
    resolvedContext?: ResolvedContext | null,
    intentResolution?: IntentResolution,
  ): SelectedContext {
    // 1. Get project names and tags dynamically from workspace state
    const projectNamesAndTags: string[] = [];
    try {
      const state = getWorkspaceProvider().getState();
      if (state && state.projects) {
        for (const p of state.projects) {
          if (p.name) projectNamesAndTags.push(p.name.toLowerCase());
          if (p.tag) projectNamesAndTags.push(p.tag.toLowerCase());
        }
      }
    } catch (e) {
      console.warn("Failed to get workspace projects for relevance selection:", e);
    }

    // 2. Classify workspace relevance using Intent Classifier
    let workspaceRelevant = false;
    if (!intentResolution?.clarificationRequired) {
      workspaceRelevant = intentClassifier.classifyWorkspaceIntent(prompt, projectNamesAndTags);
    }

    // 3. Filter Context Package if workspace is not relevant
    let filteredPackage = contextPackage;
    if (!workspaceRelevant && contextPackage) {
      filteredPackage = {
        ...contextPackage,
        // Exclude active stories (projects)
        activeStories: [],
        // Exclude goals related to projects
        currentGoals: contextPackage.currentGoals.filter((g) => {
          const lowerGoal = g.data.toLowerCase();
          return !lowerGoal.includes("project arc:") && !lowerGoal.includes("complete project");
        }),
      };
    }

    // 4. Filter Resolved Context if workspace is not relevant
    let filteredResolved = resolvedContext;
    if (!workspaceRelevant && resolvedContext) {
      filteredResolved = {
        ...resolvedContext,
        provenance: {
          ...resolvedContext.provenance,
          // Exclude companion state active project focus/metadata
          companionState: resolvedContext.provenance.companionState
            ? {
                ...resolvedContext.provenance.companionState,
                activeProject: null,
              }
            : null,
        },
        // Exclude workspace/project priorities
        currentPriorities: resolvedContext.currentPriorities.filter((p) => {
          return !p.startsWith("Active Focus:") && !p.startsWith("Goal Priority: Project");
        }),
        // Exclude active goals related to projects/tasks
        activeGoals: [],
        // Exclude social relationships relevant only to projects
        importantRelationships: [],
        // Exclude habit routines relevant only to projects
        relevantHabits: [],
        // Exclude active project focus details
        currentFocus: null,
        // Exclude relevant context details containing Active Project
        relevantContext: resolvedContext.relevantContext.filter((c) => {
          return !c.startsWith("Active Project:");
        }),
      };
    }

    // 5. Define understanding filtering function
    const filterUnderstandings = (understandings: Understanding[]): Understanding[] => {
      if (!workspaceRelevant) {
        // Exclude Project category understandings
        return understandings.filter((u) => u.category !== "Project");
      }
      return understandings;
    };

    return {
      contextPackage: filteredPackage,
      resolvedContext: filteredResolved,
      workspaceRelevant,
      filterUnderstandings,
    };
  },
};
