import { Story } from "../stories/types";
import { memoryService } from "../memory/memory-service";
import { IdentityCategory } from "./identity-types";
import { hypothesesService } from "./hypotheses";
import {
  REFLECTIONS_ARC_TITLE,
  isProjectArc,
  isReflectionsArc,
  projectArcTitleRemainder,
} from "../stories/story-identity";

export interface IdentityRule {
  name: string;
  evaluateStory(story: Story): {
    detected: boolean;
    category?: IdentityCategory;
    observationName?: string;
    value?: string;
    confidence?: number;
    provenance?: string;
    hypothesisTrigger?: {
      targetHypothesisName: string;
      confirm: boolean;
    };
  };
}

/**
 * How many of a story's members are reflections the user wrote.
 *
 * `note_created` and `note_edited` are the two event types produced by a person
 * writing something down. Everything else that reaches the reflections arc got
 * there by carrying the same `reason`, which is a statement about clustering
 * rather than about authorship.
 *
 * Reads the memory set rather than the story because a `Story` holds only ids;
 * the discriminator lives on the Memory. A member the runtime set no longer
 * holds is not counted -- it cannot be evidence of anything.
 */
function writtenReflections(story: Story): number {
  const memories = memoryService.getMemories();
  const members = new Set(story.relatedMemoryIds);
  let n = 0;
  for (const memory of memories) {
    if (!members.has(memory.id)) continue;
    if (memory.eventType === "note_created" || memory.eventType === "note_edited") n += 1;
  }
  return n;
}

/**
 * Event types that represent work being done on a project.
 *
 * An allowlist rather than a list of exclusions, for the reason
 * `classifyDurability` gives about durability: a new event type should have to
 * earn its way into a claim about the user rather than inherit it by being
 * unlisted. `declaration_captured` is the one that made this necessary and is
 * deliberately absent -- saying what you intend to do is not doing it.
 */
const WORK_EVENT_TYPES: ReadonlySet<string> = new Set([
  "task_completed",
  "project_created",
  "project_updated",
  "project_continued",
  "mission_completed",
  "note_created",
  "note_edited",
]);

/** How many of a story's members represent work on the project. */
function workMemories(story: Story): number {
  const memories = memoryService.getMemories();
  const members = new Set(story.relatedMemoryIds);
  let n = 0;
  for (const memory of memories) {
    if (members.has(memory.id) && WORK_EVENT_TYPES.has(memory.eventType)) n += 1;
  }
  return n;
}

export const identityRules: IdentityRule[] = [
  {
    name: "Reflective Trait Evaluation",
    evaluateStory(story) {
      // Counted from what the user actually wrote down, not from the size of
      // the arc.
      //
      // The arc is a narrative bucket: everything with `reason` "Reflection
      // Worthy" clusters into it, and since the chat boundary landed that
      // includes `declaration_captured` -- an aspiration stated in
      // conversation. Arc membership had been standing in for "logged a
      // reflection", which the provenance below still says, and it stopped
      // being a proxy for that the moment a second kind of memory joined.
      //
      // Measured before this filter: five declarations and no written
      // reflection at all produced confidence 1.0, and one genuine reflection
      // that was below the threshold on its own reached 1.0 when four
      // aspirations were added around it. Nothing the user reflected on had
      // changed.
      const written = writtenReflections(story);
      if (isReflectionsArc(story) && written >= 2) {
        return {
          detected: true,
          category: "Trait",
          observationName: "Reflective",
          value: "Active",
          confidence: Math.min(1.0, 0.5 + written * 0.1),
          provenance: `Inferred reflective trait because user logged ${written} observations in the "${REFLECTIONS_ARC_TITLE}" story.`,
        };
      }
      return { shouldCluster: false } as any;
    },
  },
  {
    name: "Deep Work Focus Style Evaluation",
    evaluateStory(story) {
      // Counted from work, not from the size of the arc -- the same defect the
      // Reflective rule had, in the same shape, and still live here.
      //
      // A project arc gathers everything carrying the project's id, and since
      // the chat boundary landed that includes `declaration_captured`: an
      // aspiration stated while a project session is open is filed under that
      // project. This rule's own provenance says "work milestones and
      // sessions", and a stated intention is neither.
      //
      // Measured before this filter: three aspirations spoken during a session
      // took the arc from 4 members to 7 and the confidence from 0.60 to 0.75,
      // with no work done in between.
      const worked = workMemories(story);
      if (isProjectArc(story) && worked >= 3) {
        return {
          detected: true,
          category: "WorkStyle",
          observationName: "Deep Work Focus",
          value: "Active",
          confidence: Math.min(1.0, 0.4 + worked * 0.05),
          provenance: `Inferred Deep Work focus because project narrative "${story.title}" gathered ${worked} work milestones and sessions.`,
        };
      }
      return { shouldCluster: false } as any;
    },
  },
  {
    name: "Project Completion Hypothesis Confirmation",
    evaluateStory(story) {
      if (isProjectArc(story) && story.status === "Completed") {
        const projectName = projectArcTitleRemainder(story);

        const hypotheses = hypothesesService.getHypotheses();
        const matchingHyp = hypotheses.find(
          (h) =>
            h.category === "Aspiration" &&
            h.status === "Proposed" &&
            h.name.toLowerCase().includes(projectName.toLowerCase()),
        );

        if (matchingHyp) {
          return {
            detected: false,
            hypothesisTrigger: {
              targetHypothesisName: matchingHyp.name,
              confirm: true,
            },
          };
        }
      }
      return { shouldCluster: false } as any;
    },
  },
];

export function registerIdentityRule(rule: IdentityRule) {
  identityRules.unshift(rule);
}
