import { Declaration, parseDeclaration } from "./declaration";
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
import { IdentityCategory } from "./identity-types";

/**
 * Declaration category -> the emergent store's own vocabulary.
 *
 * A `Record` keyed on `Declaration["category"]` rather than an if/else chain
 * ending in a `"Trait"` default. That default was unreachable -- the union has
 * five members and the chain handled all five -- but it was typed `any`, so
 * adding a sixth category to `Declaration` would have compiled and silently
 * written every instance of it to the emergent store as a Trait, and to the
 * foundation store not at all. As a `Record`, that same change fails to
 * compile here instead of diverging the two stores at runtime.
 */
const DECLARATION_IDENTITY_CATEGORY: Record<Declaration["category"], IdentityCategory> = {
  Goal: "Aspiration",
  Value: "Value",
  Interest: "Interest",
  Preference: "Preference",
  Habit: "Habit",
};

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

      // The id the story carries, before anything it says.
      //
      // `story-rules` has the project id in hand when it builds the arc and
      // writes it into the summary sentence; this read it back out with a
      // regex. Same value, round-tripped through prose inside GENESIS.
      //
      // The two fallbacks below are kept and reordered behind the field, not
      // because a legacy story format exists -- stories are never persisted, so
      // every story alive was produced by the current rules -- but because
      // `registerStoryRule` is public and a rule registered through it can
      // create an arc carrying neither the field nor the sentence.
      //
      // The last of them is why the order matters. `story.title.split(":")[1]`
      // on a `Project Arc: …` title yields the remainder, and `story-rules`
      // builds that remainder from `memory.title.split(":")[0]` -- which for
      // every memory the translator produces is a fixed label like
      // "Project Created". So that branch does not recover a project id, it
      // invents one out of a display string, and every memory reaching it would
      // be filed under a project named after an event type. It was already
      // unreachable while the summary matched; it is now behind two guards
      // rather than one, and documented rather than merely unvisited.
      if (story.relatedProjectId) {
        projectId = story.relatedProjectId;
      } else {
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

/**
 * A note's title reduced to the canonical key for its subject.
 *
 * Lowercased and hyphen-joined because that is the shape
 * `serializeUnderstanding` already expects: it splits the key on `[-_]+` and
 * title-cases the parts, so "RISC-V pipeline hazards" reaches the model as
 * "Risc V Pipeline Hazards". Normalising here is also what makes two notes
 * titled "Cache associativity" and "Cache Associativity" one subject rather
 * than two.
 *
 * Returns "" for a title with nothing alphanumeric in it, which the caller
 * treats as unresolvable rather than emitting an empty concept.
 */
function subjectKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

      // The subject comes off the memory, not out of the store.
      //
      // The key used to be `memory.relatedNoteId` itself.
      // `serializeUnderstanding` renders the half after the colon into "The
      // user is actively learning {concept}", so the model was being told,
      // verbatim:
      //
      //   The user is actively learning Ae4016cb C1d8 45e0 B1a9 Bb551f84350d.
      //
      // -- the title-caser splitting a UUID on its dashes into pseudo-words.
      // The sentence template has always required a subject; the producer was
      // the half that disagreed.
      //
      // `metadata.title` is the note's own title, already carried on the event
      // and already read here by `candidate-rules.ts`. Resolving it instead
      // from `getWorkspaceProvider().getState().notes` was tried and is wrong:
      // this rule runs while the event that created the note is still being
      // recorded, so the store has not committed it yet and the newest note is
      // missing from its own understanding until some later event rebuilds.
      // Measured -- three notes, three memories, two fragments. Reading the
      // memory has no such window, and it survives replay, where the store is
      // rebuilt from these events rather than the other way round.
      const noteSubject = memory.relatedNoteId
        ? (metadata.title as string | undefined)?.trim()
        : undefined;

      const knowledgeId =
        (noteSubject && subjectKey(noteSubject)) ||
        (metadata.knowledgeId as string) ||
        (metadata.category === "Knowledge" ? "general_knowledge" : null);

      // A note never given a title contributes nothing here on purpose.
      // Falling back to the id would put the UUID sentence above back into the
      // prompt, and a fragment that names nothing is worse than one fewer: it
      // spends context asserting something false.
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
          category: match.category,
          confidence: "High",
          status: "Active",
          supportingMemoryIds: [memory.id],
          supportingStoryIds: [],
        });

        const identityCategory = DECLARATION_IDENTITY_CATEGORY[match.category];

        // The two identity stores are written under separate guards so a
        // partial write is attributable.
        //
        // One try/catch wrapped both. The emergent observation is written
        // first, so a throw anywhere in the foundation half left it already
        // committed and logged "Error updating identity" -- one line naming
        // neither the store that failed nor the declaration, for a state where
        // the emergent store holds a claim the identity graph does not. The
        // stores had diverged and nothing said so.
        //
        // The foundation write stays conditional on the emergent one having
        // succeeded, which is what the single try/catch did by falling through
        // to the catch. Attempting it anyway would turn an emergent failure --
        // today a consistent no-op -- into the mirror-image divergence.
        let emergentWritten = false;
        try {
          identityService.addObservation({
            category: identityCategory,
            name: match.content,
            value: "Active",
            confidence: 1.0,
            supportingStoryIds: [],
            supportingMemoryIds: [memory.id],
            provenance: `Extracted via PersonalDeclarationRule from: "${text}"`,
          });
          emergentWritten = true;
        } catch (err) {
          console.error(
            `PersonalDeclarationRule: emergent identity write failed for ${identityCategory} ` +
              `"${match.content}" (memory ${memory.id}). Neither store was updated.`,
            err,
          );
        }

        if (emergentWritten) {
          try {
            let identity = identityFoundationService.getIdentity();
            if (!identity) {
              identity = identityFoundationService.createIdentity({});
            }
            const identityId = identity.id;

            /**
             * Attach the originating memory to the aspect's graph node.
             *
             * Every `create*` below already takes the memory id as
             * `initialEvidenceIds`, and every one of them loses it.
             * `IdentityGoalService.createGoal` and its siblings pass that array
             * to `linkEvidenceToNode(nodeId, evidenceId)`, which looks the id up
             * with `repository.getEvidence(id)` and returns false when it
             * misses. A Memory id is not an `IdentityEvidence` id, no such
             * record exists, the boolean is discarded, and the node ends with
             * `evidenceIds: []`. `calculateConfidence` is then correct to report
             * score 0 / "Unknown" -- there genuinely is no evidence.
             *
             * `addEvidence` is the call that creates the record rather than
             * looking for one: `sourceType` "Memory" and `sourceId` the memory
             * id are the designed pointer back to origin, so the evidence
             * references the memory instead of copying it. It also refreshes
             * confidence itself, so nothing here needs to call
             * `calculateConfidence`.
             *
             * `initialEvidenceIds` is deliberately still passed. It populates
             * the aspect's own `evidenceReferences` field, which is a separate
             * record from the graph edge; dropping it would lose that while
             * fixing this. The doomed `linkEvidenceToNode` call inside the
             * identity services stays a no-op and belongs to that subsystem.
             */
            const attachEvidence = (aspect: { confidenceReference: string }): void => {
              identityFoundationService.addEvidence(
                aspect.confidenceReference,
                "Memory",
                memory.id,
                text,
                // The memory's own instant, not this one. Reconstruction replays
                // the whole stream, so without this every reload would restamp a
                // years-old declaration as today's.
                { createdAt: memory.timestamp },
              );
            };

            if (match.category === "Goal") {
              const existingGoals = identityFoundationService.getGoals(identityId);
              const exists = existingGoals.some(
                (g: any) => g.title.toLowerCase() === match.content.toLowerCase(),
              );
              if (!exists) {
                attachEvidence(
                  identityFoundationService.createGoal(
                    identityId,
                    match.content,
                    `Explicitly declared goal: ${match.content}`,
                    "Personal",
                    "High",
                    [memory.id],
                  ),
                );
              }
            } else if (match.category === "Interest") {
              const existingInterests = identityFoundationService.getInterests(identityId);
              const exists = existingInterests.some(
                (i: any) => i.topic.toLowerCase() === match.content.toLowerCase(),
              );
              if (!exists) {
                attachEvidence(
                  identityFoundationService.createInterest(identityId, match.content, "Other", [
                    memory.id,
                  ]),
                );
              }
            } else if (match.category === "Preference") {
              const existingPrefs = identityFoundationService.getPreferences(identityId);
              const exists = existingPrefs.some(
                (p: any) => p.value.toLowerCase() === match.content.toLowerCase(),
              );
              if (!exists) {
                attachEvidence(
                  identityFoundationService.createPreference(identityId, "Other", match.content, [
                    memory.id,
                  ]),
                );
              }
            } else if (match.category === "Value") {
              const existingValues = identityFoundationService.getValues(identityId);
              const exists = existingValues.some(
                (v: any) => v.name.toLowerCase() === match.content.toLowerCase(),
              );
              if (!exists) {
                attachEvidence(
                  identityFoundationService.createValue(
                    identityId,
                    match.content,
                    "Personal",
                    [],
                    [memory.id],
                  ),
                );
              }
            } else if (match.category === "Habit") {
              const existingHabits = identityFoundationService.getHabits(identityId);
              const exists = existingHabits.some(
                (h: any) => h.name.toLowerCase() === match.content.toLowerCase(),
              );
              if (!exists) {
                attachEvidence(
                  identityFoundationService.createHabit(identityId, match.content, "Other", [
                    memory.id,
                  ]),
                );
              }
            } else {
              // Same guarantee as DECLARATION_IDENTITY_CATEGORY, for the half
              // that cannot be a lookup because each category calls a
              // different method. A sixth `Declaration` category makes this
              // assignment fail to compile rather than writing the emergent
              // store and silently skipping the foundation store.
              const unhandled: never = match.category;
              void unhandled;
            }
          } catch (err) {
            console.error(
              `PersonalDeclarationRule: foundation identity write failed for ${identityCategory} ` +
                `"${match.content}" (memory ${memory.id}). The emergent store holds this ` +
                `observation and the identity graph does not -- the two stores have diverged.`,
              err,
            );
          }
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
