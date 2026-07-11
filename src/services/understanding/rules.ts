import { Memory } from "../memory/validation/types";
import { Story } from "../stories/types";
import {
  UnderstandingRule,
  UnderstandingFragment,
  UnderstandingConfidence,
  UnderstandingStatus,
} from "./types";

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
      // Try to extract project ID from summary (e.g., "Project ID: <id>") or title
      let projectId: string | null = null;

      const summaryMatch =
        story.summary.match(/Project ID:\s*([a-zA-Z0-9-]+)/i) ||
        story.summary.match(/ID:\s*([a-zA-Z0-9-]+)/i);

      if (summaryMatch) {
        projectId = summaryMatch[1];
      } else if (story.title.startsWith("Project Arc:")) {
        // Fallback: extract last word or use custom pattern
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

    // Helper to register references
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
        // Extract goal identifier if possible, or fallback to generic
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

export const rules: UnderstandingRule[] = [
  projectRule,
  goalRule,
  knowledgeRule,
  habitRule,
  relationshipRule,
  preferenceRule,
];
