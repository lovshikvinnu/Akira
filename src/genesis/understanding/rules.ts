import { parseDeclaration } from "./declaration";
import { Memory } from "../validation/types";
import { Story } from "../stories/types";
import { isProjectArc } from "../stories/story-identity";
import {
  UnderstandingRule,
  UnderstandingFragment,
  UnderstandingConfidence,
  UnderstandingStatus,
} from "./types";
import { identityService } from "./identity-service";
import { identityService as identityFoundationService } from "../identity";

// Helper to determine status based on linked stories or memories
function determineStatus(stories: Story[], relatedStoryIds: string[]): UnderstandingStatus {
  const linkedStories = stories.filter((s) => relatedStoryIds.includes(s.id));
  if (linkedStories.length === 0) return "Active";

  // If all linked stories are completed or archived, transition status accordingly
  const allCompleted = linkedStories.every((s) => s.status === "Completed");
  if (allCompleted) return "Completed";

  const allArchived = linkedStories.every((s) => s.status === "Archived");
  if (allArchived) return "Archived";

  return "Active";
}

// Helper to determine a basic deterministic confidence placeholder
function calculateConfidence(memoryCount: number, storyCount: number): UnderstandingConfidence {
  const totalReferences = memoryCount + storyCount;
  if (totalReferences >= 4) return "High";
  if (totalReferences >= 2) return "Medium";
  return "Low";
}

export const projectRule: UnderstandingRule = {
  name: "Project Understanding Rule",
  evaluate(memories, stories) {
    const projectMap = new Map<string, { memories: string[]; stories: string[] }>();

    // 1. Scan memories for project links
    for (const memory of memories) {
      if (memory.relatedProjectId) {
        const id = memory.relatedProjectId;
        if (!projectMap.has(id)) {
          projectMap.set(id, { memories: [], stories: [] });
        }
        projectMap.get(id)!.memories.push(memory.id);
      }
    }

    // 2. Scan stories for project links (e.g. Project Arc stories)
    for (const story of stories) {
      let projectId: string | null = null;

      const summaryMatch =
        story.summary.match(/Project ID:\s*([a-zA-Z0-9-]+)/i) ||
        story.summary.match(/ID:\s*([a-zA-Z0-9-]+)/i);

      if (summaryMatch) {
        projectId = summaryMatch[1];
      } else if (isProjectArc(story)) {
        const parts = story.title.split(":");
        if (parts.length > 1) {
          projectId = parts[1].trim();
        }
      }

      if (projectId) {
        if (!projectMap.has(projectId)) {
          projectMap.set(projectId, { memories: [], stories: [] });
        }
        projectMap.get(projectId)!.stories.push(story.id);
      }
    }

    // 3. Build fragments
    const fragments: UnderstandingFragment[] = [];
    for (const [projectId, refs] of projectMap.entries()) {
      fragments.push({
        canonicalKey: `project:${projectId}`,
        category: "Project",
        confidence: calculateConfidence(refs.memories.length, refs.stories.length),
        status: determineStatus(stories, refs.stories),
        supportingMemoryIds: refs.memories,
        supportingStoryIds: refs.stories,
      });
    }

    return fragments;
  },
};

export const goalRule: UnderstandingRule = {
  name: "Goal Understanding Rule",
  evaluate(memories, stories) {
    const goalMap = new Map<string, { memories: string[]; stories: string[] }>();

    const addRef = (goalId: string, type: "memories" | "stories", id: string) => {
      if (!goalMap.has(goalId)) {
        goalMap.set(goalId, { memories: [], stories: [] });
      }
      goalMap.get(goalId)![type].push(id);
    };

    // 1. Scan memories
    for (const memory of memories) {
      const metadata = memory.metadata || {};
      const goalId =
        (metadata.goalId as string) ||
        (metadata.goalName as string) ||
        (memory.reason === "Goal Progress" ? "general_progress" : null);

      if (goalId) {
        addRef(goalId, "memories", memory.id);
      }
    }

    // 2. Scan stories
    for (const story of stories) {
      const isGoalStory =
        story.title.toLowerCase().includes("goal") || story.summary.toLowerCase().includes("goal");
      if (isGoalStory) {
        let goalId = "general_progress";
        const idMatch = story.summary.match(/Goal ID:\s*([a-zA-Z0-9-]+)/i);
        if (idMatch) {
          goalId = idMatch[1];
        }
        addRef(goalId, "stories", story.id);
      }
    }

    // 3. Build fragments
    const fragments: UnderstandingFragment[] = [];
    for (const [goalId, refs] of goalMap.entries()) {
      fragments.push({
        canonicalKey: `goal:${goalId}`,
        category: "Goal",
        confidence: calculateConfidence(refs.memories.length, refs.stories.length),
        status: determineStatus(stories, refs.stories),
        supportingMemoryIds: refs.memories,
        supportingStoryIds: refs.stories,
      });
    }

    return fragments;
  },
};

export const knowledgeRule: UnderstandingRule = {
  name: "Knowledge Understanding Rule",
  evaluate(memories, stories) {
    const knowledgeMap = new Map<string, { memories: string[]; stories: string[] }>();

    const addRef = (knowledgeId: string, type: "memories" | "stories", id: string) => {
      if (!knowledgeMap.has(knowledgeId)) {
        knowledgeMap.set(knowledgeId, { memories: [], stories: [] });
      }
      knowledgeMap.get(knowledgeId)![type].push(id);
    };

    for (const memory of memories) {
      const metadata = memory.metadata || {};
      const knowledgeId =
        memory.relatedNoteId ||
        (metadata.knowledgeId as string) ||
        (metadata.category === "Knowledge" ? "general_knowledge" : null);
      if (knowledgeId) {
        addRef(knowledgeId, "memories", memory.id);
      }
    }

    for (const story of stories) {
      const isKnowledgeStory =
        story.title.toLowerCase().includes("knowledge") ||
        story.summary.toLowerCase().includes("knowledge");
      if (isKnowledgeStory) {
        let knowledgeId = "general_knowledge";
        const idMatch = story.summary.match(/Knowledge ID:\s*([a-zA-Z0-9-]+)/i);
        if (idMatch) {
          knowledgeId = idMatch[1];
        }
        addRef(knowledgeId, "stories", story.id);
      }
    }

    const fragments: UnderstandingFragment[] = [];
    for (const [knowledgeId, refs] of knowledgeMap.entries()) {
      fragments.push({
        canonicalKey: `knowledge:${knowledgeId}`,
        category: "Knowledge",
        confidence: calculateConfidence(refs.memories.length, refs.stories.length),
        status: determineStatus(stories, refs.stories),
        supportingMemoryIds: refs.memories,
        supportingStoryIds: refs.stories,
      });
    }

    return fragments;
  },
};

export const habitRule: UnderstandingRule = {
  name: "Habit Understanding Rule",
  evaluate(memories, stories) {
    const habitMap = new Map<string, { memories: string[]; stories: string[] }>();

    const addRef = (habitId: string, type: "memories" | "stories", id: string) => {
      if (!habitMap.has(habitId)) {
        habitMap.set(habitId, { memories: [], stories: [] });
      }
      habitMap.get(habitId)![type].push(id);
    };

    for (const memory of memories) {
      const metadata = memory.metadata || {};
      const habitId =
        (metadata.habitId as string) ||
        (metadata.habitLabel as string) ||
        (metadata.category === "Habit" ? "general_habit" : null);
      if (habitId) {
        addRef(habitId, "memories", memory.id);
      }
    }

    for (const story of stories) {
      const isHabitStory =
        story.title.toLowerCase().includes("habit") ||
        story.summary.toLowerCase().includes("habit");
      if (isHabitStory) {
        let habitId = "general_habit";
        const idMatch = story.summary.match(/Habit ID:\s*([a-zA-Z0-9-]+)/i);
        if (idMatch) {
          habitId = idMatch[1];
        }
        addRef(habitId, "stories", story.id);
      }
    }

    const fragments: UnderstandingFragment[] = [];
    for (const [habitId, refs] of habitMap.entries()) {
      fragments.push({
        canonicalKey: `habit:${habitId}`,
        category: "Habit",
        confidence: calculateConfidence(refs.memories.length, refs.stories.length),
        status: determineStatus(stories, refs.stories),
        supportingMemoryIds: refs.memories,
        supportingStoryIds: refs.stories,
      });
    }

    return fragments;
  },
};

export const relationshipRule: UnderstandingRule = {
  name: "Relationship Understanding Rule",
  evaluate(memories, stories) {
    const relationshipMap = new Map<string, { memories: string[]; stories: string[] }>();

    const addRef = (relId: string, type: "memories" | "stories", id: string) => {
      if (!relationshipMap.has(relId)) {
        relationshipMap.set(relId, { memories: [], stories: [] });
      }
      relationshipMap.get(relId)![type].push(id);
    };

    for (const memory of memories) {
      const metadata = memory.metadata || {};
      const relId =
        (metadata.relationshipId as string) ||
        (metadata.person as string) ||
        (metadata.category === "Relationship" ? "general_relationship" : null);
      if (relId) {
        addRef(relId, "memories", memory.id);
      }
    }

    for (const story of stories) {
      const isRelStory =
        story.title.toLowerCase().includes("relationship") ||
        story.summary.toLowerCase().includes("relationship");
      if (isRelStory) {
        let relId = "general_relationship";
        const idMatch = story.summary.match(/Relationship ID:\s*([a-zA-Z0-9-]+)/i);
        if (idMatch) {
          relId = idMatch[1];
        }
        addRef(relId, "stories", story.id);
      }
    }

    const fragments: UnderstandingFragment[] = [];
    for (const [relId, refs] of relationshipMap.entries()) {
      fragments.push({
        canonicalKey: `relationship:${relId}`,
        category: "Relationship",
        confidence: calculateConfidence(refs.memories.length, refs.stories.length),
        status: determineStatus(stories, refs.stories),
        supportingMemoryIds: refs.memories,
        supportingStoryIds: refs.stories,
      });
    }

    return fragments;
  },
};

export const preferenceRule: UnderstandingRule = {
  name: "Preference Understanding Rule",
  evaluate(memories, stories) {
    const preferenceMap = new Map<string, { memories: string[]; stories: string[] }>();

    const addRef = (prefKey: string, type: "memories" | "stories", id: string) => {
      if (!preferenceMap.has(prefKey)) {
        preferenceMap.set(prefKey, { memories: [], stories: [] });
      }
      preferenceMap.get(prefKey)![type].push(id);
    };

    for (const memory of memories) {
      const metadata = memory.metadata || {};
      const prefKey =
        (metadata.preferenceKey as string) ||
        (metadata.category === "Preference" || metadata.isPreference === true
          ? "general_preference"
          : null);
      if (prefKey) {
        addRef(prefKey, "memories", memory.id);
      }
    }

    for (const story of stories) {
      const isPrefStory =
        story.title.toLowerCase().includes("preference") ||
        story.summary.toLowerCase().includes("preference");
      if (isPrefStory) {
        let prefKey = "general_preference";
        const idMatch = story.summary.match(/Preference Key:\s*([a-zA-Z0-9-]+)/i);
        if (idMatch) {
          prefKey = idMatch[1];
        }
        addRef(prefKey, "stories", story.id);
      }
    }

    const fragments: UnderstandingFragment[] = [];
    for (const [prefKey, refs] of preferenceMap.entries()) {
      fragments.push({
        canonicalKey: `preference:${prefKey}`,
        category: "Preference",
        confidence: calculateConfidence(refs.memories.length, refs.stories.length),
        status: determineStatus(stories, refs.stories),
        supportingMemoryIds: refs.memories,
        supportingStoryIds: refs.stories,
      });
    }

    return fragments;
  },
};

export const personalDeclarationRule: UnderstandingRule = {
  name: "Personal Declaration Rule",
  evaluate(memories, stories) {
    const fragments: UnderstandingFragment[] = [];

    for (const memory of memories) {
      // Two parse sites, not three.
      //
      // The third split the description on "User query submitted to AKIRA: "
      // and re-parsed the remainder. It was written for chat turns, which
      // reached here wrapped in that string -- but `parseDeclaration` strips
      // the same prefix and the same surrounding quotes as its first act, so
      // site 3 could only run on input site 1 had already rejected, after
      // normalising it to the identical string. `tests/genesis-declaration-parser.test.ts`
      // runs both pipelines over every sentence-and-wrapper combination and
      // requires them to agree; it passed before the site was removed, which
      // is what makes it evidence rather than a description of this code.
      //
      // Chat no longer arrives here at all -- a `chat_message` is transient and
      // produces no memory -- but the prefix stripping stays in the parser for
      // the wrapped memories already in the durable stream, which age out
      // rather than being migrated.
      const text = memory.description || "";
      let match = parseDeclaration(text);
      if (!match && memory.title) {
        match = parseDeclaration(memory.title);
      }

      if (match) {
        fragments.push({
          canonicalKey: `${match.category.toLowerCase()}:${match.content.toLowerCase().replace(/\s+/g, "-")}`,
          category: match.category as any,
          confidence: "High",
          status: "Active",
          supportingMemoryIds: [memory.id],
          supportingStoryIds: [],
        });

        try {
          let identityCategory: any = "Trait";
          if (match.category === "Goal") identityCategory = "Aspiration";
          else if (match.category === "Value") identityCategory = "Value";
          else if (match.category === "Interest") identityCategory = "Interest";
          else if (match.category === "Preference") identityCategory = "Preference";
          else if (match.category === "Habit") identityCategory = "Habit";

          identityService.addObservation({
            category: identityCategory,
            name: match.content,
            value: "Active",
            confidence: 1.0,
            supportingStoryIds: [],
            supportingMemoryIds: [memory.id],
            provenance: `Extracted via PersonalDeclarationRule from: "${text}"`,
          });

          if (identityFoundationService) {
            let identity = identityFoundationService.getIdentity();
            if (!identity) {
              identity = identityFoundationService.createIdentity({});
            }
            const identityId = identity.id;

            if (match.category === "Goal") {
              const existingGoals = identityFoundationService.getGoals(identityId);
              const exists = existingGoals.some(
                (g: any) => g.title.toLowerCase() === match.content.toLowerCase(),
              );
              if (!exists) {
                identityFoundationService.createGoal(
                  identityId,
                  match.content,
                  `Explicitly declared goal: ${match.content}`,
                  "Personal",
                  "High",
                  [memory.id],
                );
              }
            } else if (match.category === "Interest") {
              const existingInterests = identityFoundationService.getInterests(identityId);
              const exists = existingInterests.some(
                (i: any) => i.topic.toLowerCase() === match.content.toLowerCase(),
              );
              if (!exists) {
                identityFoundationService.createInterest(identityId, match.content, "Other", [
                  memory.id,
                ]);
              }
            } else if (match.category === "Preference") {
              const existingPrefs = identityFoundationService.getPreferences(identityId);
              const exists = existingPrefs.some(
                (p: any) => p.value.toLowerCase() === match.content.toLowerCase(),
              );
              if (!exists) {
                identityFoundationService.createPreference(identityId, "Other", match.content, [
                  memory.id,
                ]);
              }
            } else if (match.category === "Value") {
              const existingValues = identityFoundationService.getValues(identityId);
              const exists = existingValues.some(
                (v: any) => v.name.toLowerCase() === match.content.toLowerCase(),
              );
              if (!exists) {
                identityFoundationService.createValue(
                  identityId,
                  match.content,
                  "Personal",
                  [],
                  [memory.id],
                );
              }
            } else if (match.category === "Habit") {
              const existingHabits = identityFoundationService.getHabits(identityId);
              const exists = existingHabits.some(
                (h: any) => h.name.toLowerCase() === match.content.toLowerCase(),
              );
              if (!exists) {
                identityFoundationService.createHabit(identityId, match.content, "Other", [
                  memory.id,
                ]);
              }
            }
          }
        } catch (err) {
          console.error("Error updating identity from PersonalDeclarationRule:", err);
        }
      }
    }

    return fragments;
  },
};

export const rules: UnderstandingRule[] = [
  projectRule,
  goalRule,
  knowledgeRule,
  habitRule,
  relationshipRule,
  preferenceRule,
  personalDeclarationRule,
];
