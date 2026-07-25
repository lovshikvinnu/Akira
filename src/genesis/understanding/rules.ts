import { Memory } from "../validation/types";
import { Story } from "../stories/types";
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
      } else if (story.title.startsWith("Project Arc:")) {
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

    const parseDeclaration = (text: string) => {
      let clean = text.trim();
      const prefixes = [
        "User query submitted to AKIRA:",
        "User query:",
        "Query submitted to AKIRA:",
        "User query submitted:",
      ];
      for (const prefix of prefixes) {
        if (clean.toLowerCase().startsWith(prefix.toLowerCase())) {
          clean = clean.slice(prefix.length).trim();
        }
      }

      // Strip surrounding quotes
      clean = clean.replace(/^["']|["']$/g, "").trim();

      // Strip trailing punctuation
      clean = clean.replace(/[^\w\s]+$/, "").trim();
      const lower = clean.toLowerCase();

      const normalizePayload = (payload: string) => {
        const index = clean.toLowerCase().indexOf(payload.toLowerCase());
        let normalized = payload.trim();
        if (index === 0 && normalized.length > 0) {
          const first = normalized.charAt(0);
          if (
            normalized.length > 1 &&
            normalized.charAt(1) === normalized.charAt(1).toUpperCase() &&
            normalized.charAt(1) !== " "
          ) {
            // Keep acronyms/proper nouns as is
          } else {
            normalized = first.toLowerCase() + normalized.slice(1);
          }
        }
        return normalized.replace(/\s+/g, " ");
      };

      // Goal
      if (lower.startsWith("my dream is ")) {
        let content = clean.slice("my dream is ".length).trim();
        if (content.toLowerCase().startsWith("to ")) content = content.slice(3).trim();
        if (content) return { category: "Goal", content: normalizePayload(content) };
      }
      if (lower.startsWith("my goal is ")) {
        let content = clean.slice("my goal is ".length).trim();
        if (content.toLowerCase().startsWith("to ")) content = content.slice(3).trim();
        if (content) return { category: "Goal", content: normalizePayload(content) };
      }
      if (lower.startsWith("i want to become ")) {
        const content = clean.slice("i want to become ".length).trim();
        if (content) return { category: "Goal", content: "become " + normalizePayload(content) };
      }
      if (lower.startsWith("i aspire to ")) {
        const content = clean.slice("i aspire to ".length).trim();
        if (content) return { category: "Goal", content: normalizePayload(content) };
      }
      if (lower.startsWith("my ambition is ")) {
        let content = clean.slice("my ambition is ".length).trim();
        if (content.toLowerCase().startsWith("to ")) content = content.slice(3).trim();
        if (content) return { category: "Goal", content: normalizePayload(content) };
      }
      if (lower.startsWith("i hope to become ")) {
        const content = clean.slice("i hope to become ".length).trim();
        if (content) return { category: "Goal", content: "become " + normalizePayload(content) };
      }
      if (lower.startsWith("i plan to become ")) {
        const content = clean.slice("i plan to become ".length).trim();
        if (content) return { category: "Goal", content: "become " + normalizePayload(content) };
      }
      if (lower.endsWith(" is my dream")) {
        const content = clean.slice(0, clean.length - " is my dream".length).trim();
        if (content) return { category: "Goal", content: normalizePayload(content) };
      }
      if (lower.endsWith(" is my goal")) {
        const content = clean.slice(0, clean.length - " is my goal".length).trim();
        if (content) return { category: "Goal", content: normalizePayload(content) };
      }

      // Interest
      if (lower.startsWith("i love ")) {
        const content = clean.slice("i love ".length).trim();
        if (content && content.toLowerCase() !== "it") {
          return { category: "Interest", content: normalizePayload(content) };
        }
      }
      if (lower.startsWith("i'm interested in ")) {
        const content = clean.slice("i'm interested in ".length).trim();
        if (content) return { category: "Interest", content: normalizePayload(content) };
      }
      if (lower.startsWith("i am interested in ")) {
        const content = clean.slice("i am interested in ".length).trim();
        if (content) return { category: "Interest", content: normalizePayload(content) };
      }
      if (lower.startsWith("i enjoy ")) {
        const content = clean.slice("i enjoy ".length).trim();
        if (content) return { category: "Interest", content: normalizePayload(content) };
      }

      // Preference
      if (lower.startsWith("i prefer ")) {
        const content = clean.slice("i prefer ".length).trim();
        if (content) return { category: "Preference", content: normalizePayload(content) };
      }
      if (lower.startsWith("i like ")) {
        const content = clean.slice("i like ".length).trim();
        if (content) return { category: "Preference", content: normalizePayload(content) };
      }
      if (lower.startsWith("i dislike ")) {
        const content = clean.slice("i dislike ".length).trim();
        if (content)
          return { category: "Preference", content: "dislike " + normalizePayload(content) };
      }
      if (lower.startsWith("i hate ")) {
        const content = clean.slice("i hate ".length).trim();
        if (content)
          return { category: "Preference", content: "hate " + normalizePayload(content) };
      }

      // Value
      if (lower.startsWith("i value ")) {
        const content = clean.slice("i value ".length).trim();
        if (content) return { category: "Value", content: normalizePayload(content) };
      }
      if (lower.startsWith("i believe ")) {
        let content = clean.slice("i believe ".length).trim();
        if (content.toLowerCase().startsWith("in ")) content = content.slice(3).trim();
        if (content) return { category: "Value", content: normalizePayload(content) };
      }
      if (lower.endsWith(" is important to me")) {
        const content = clean.slice(0, clean.length - " is important to me".length).trim();
        if (content) return { category: "Value", content: normalizePayload(content) };
      }
      if (lower.startsWith("what's important to me is ")) {
        const content = clean.slice("what's important to me is ".length).trim();
        if (content) return { category: "Value", content: normalizePayload(content) };
      }
      if (lower.startsWith("what is important to me is ")) {
        const content = clean.slice("what is important to me is ".length).trim();
        if (content) return { category: "Value", content: normalizePayload(content) };
      }
      if (lower.startsWith("i care deeply about ")) {
        const content = clean.slice("i care deeply about ".length).trim();
        if (content) return { category: "Value", content: normalizePayload(content) };
      }

      // Habit
      if (lower.startsWith("i usually ")) {
        const content = clean.slice("i usually ".length).trim();
        if (content) return { category: "Habit", content: normalizePayload(content) };
      }
      if (lower.startsWith("i always ")) {
        const content = clean.slice("i always ".length).trim();
        if (content) return { category: "Habit", content: normalizePayload(content) };
      }
      if (lower.startsWith("every morning i ")) {
        const content = clean.slice("every morning i ".length).trim();
        if (content) return { category: "Habit", content: normalizePayload(content) };
      }
      if (lower.startsWith("every day i ")) {
        const content = clean.slice("every day i ".length).trim();
        if (content) return { category: "Habit", content: normalizePayload(content) };
      }
      if (lower.endsWith(" every morning")) {
        let content = clean.slice(0, clean.length - " every morning".length).trim();
        if (content.toLowerCase().startsWith("i ")) content = content.slice(2).trim();
        if (content) return { category: "Habit", content: normalizePayload(content) };
      }
      if (lower.endsWith(" every day")) {
        let content = clean.slice(0, clean.length - " every day".length).trim();
        if (content.toLowerCase().startsWith("i ")) content = content.slice(2).trim();
        if (content) return { category: "Habit", content: normalizePayload(content) };
      }

      return null;
    };

    for (const memory of memories) {
      const text = memory.description || "";
      let match = parseDeclaration(text);
      if (!match && memory.title) {
        match = parseDeclaration(memory.title);
      }
      if (!match && text.includes("User query submitted to AKIRA: ")) {
        const queryText = text.split("User query submitted to AKIRA: ")[1];
        if (queryText) {
          const cleanQuery = queryText.replace(/^["']|["']$/g, "");
          match = parseDeclaration(cleanQuery);
        }
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
