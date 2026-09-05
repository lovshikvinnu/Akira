/**
 * The story titles that are load-bearing, declared once.
 *
 * Two narrative arcs are identified by their title text rather than by a type
 * or a flag, and both titles are read by subsystems that did not create them:
 *
 *   "Personal Growth Reflections"   story-rules finds and creates the arc
 *                                   recall-rules suppresses it under BOOTSTRAP
 *                                   identity-rules infers a Reflective trait
 *
 *   "Project Arc: ..."              story-rules finds and creates the arc
 *                                   context-rules derives a prompt goal
 *                                   identity-rules infers Deep Work Focus and
 *                                     confirms completion hypotheses
 *                                   understanding-rules falls back to it for a
 *                                     project id
 *
 * The prefix is still the identifier, but the *remainder* no longer is: the two
 * consumers that wanted a project name out of it now call
 * `projectArcProjectName`, which resolves the name from the arc's
 * `relatedProjectId`. The remainder was the fixed label "Project Created" for
 * every project, which silently gave every arc the same name -- see that
 * function for what it broke.
 *
 * Before this module those literals were written out in five files. Renaming a
 * title to read better in the Brain inspector would therefore have changed what
 * GENESIS recalls and what it concludes about the user, and no test would have
 * failed -- the string is presentation and it had quietly become the key.
 *
 * Declaring them here does not fix that coupling; the title is still the
 * identifier. What it fixes is the *silence*: there is now one definition to
 * change, the consumers are enumerated above, and
 * `tests/genesis-story-title-coupling.test.ts` fails if a subsystem stops
 * agreeing with the others.
 *
 * If the coupling is ever replaced by a structured discriminator on `Story`,
 * this module is the list of call sites that have to move.
 */

import { getWorkspaceProvider } from "../../contracts/workspace-provider";

/**
 * What a story *is*, as a value rather than as a sentence.
 *
 * The title was the identifier because there was nothing else to be one. This
 * is that something else: `story-rules` stamps it at creation, and the two
 * predicates below prefer it to the title whenever it is present.
 *
 * It is deliberately not exhaustive of every story a rule might invent. A
 * story with no `kind` is not "neither arc": `registerStoryRule` is public and
 * `newStoryData.kind` is optional, so an externally registered rule can create
 * one without a kind, and for those the title is still the best answer
 * available. That is why the predicates fall back rather than returning false.
 *
 * An earlier version of this comment also claimed the fallback covered stories
 * "restored from a snapshot that predates the field". That was wrong and it
 * survived review. Stories are never persisted -- `storyCache` in
 * `story-service` is a plain in-process array, rebuilt from the event stream on
 * every reconstruction -- so no story is ever restored from anything, and there
 * is no legacy story format to be compatible with. Every story that has ever
 * existed was produced by the current `story-rules`.
 */
export type StoryKind = "Reflections" | "Project";

/** The single consolidated arc for reflections. */
export const REFLECTIONS_ARC_TITLE = "Personal Growth Reflections";

/**
 * Prefix marking a per-project narrative arc.
 *
 * Matched with `startsWith`, and the remainder after it is treated as a display
 * name by `context-rules` and `identity-rules`. It is not a reliable project
 * name today -- `story-rules` builds it from the originating memory's title,
 * which the event translator sets to a fixed label -- so read the project id
 * from the summary rather than from here.
 */
export const PROJECT_ARC_TITLE_PREFIX = "Project Arc:";

/**
 * True when a story is the consolidated reflections arc.
 *
 * Reads the structured kind when the story carries one and falls back to the
 * title otherwise, so a story built by today's rules is identified by what it
 * is, and one restored from an older snapshot is still identified at all.
 * Renaming the arc to read better in the Brain inspector now changes a label;
 * before, it changed what GENESIS recalls at bootstrap.
 */
export function isReflectionsArc(story: { title: string; kind?: StoryKind }): boolean {
  if (story.kind) return story.kind === "Reflections";
  return story.title === REFLECTIONS_ARC_TITLE;
}

/** True when a story is a per-project narrative arc. See {@link isReflectionsArc}. */
export function isProjectArc(story: { title: string; kind?: StoryKind }): boolean {
  if (story.kind) return story.kind === "Project";
  return story.title.startsWith(PROJECT_ARC_TITLE_PREFIX);
}

/**
 * The display remainder of a project arc's title.
 *
 * Deliberately named for what it is rather than for what callers wish it were.
 * It is the translator's fixed event title for every project, not a project
 * name. Callers that want the name should use {@link projectArcProjectName};
 * this stays as the fallback for an arc whose project the workspace no longer
 * has.
 */
export function projectArcTitleRemainder(story: { title: string }): string {
  return story.title.replace(PROJECT_ARC_TITLE_PREFIX, "").trim();
}

/**
 * What the project behind an arc is actually called.
 *
 * Every project arc is titled `"Project Arc: Project Created"`, because
 * `story-rules` builds the title from `memory.title.split(":")[0]` and
 * `event-translation` sets a project memory's title to that fixed label. The
 * split has nothing to divide. Two consumers read the remainder as though it
 * were the project's name, and both were broken by it:
 *
 *   - `context-rules.extractGoals` emits one prompt goal per active arc and
 *     then dedupes with a Set. Identical titles collapse, so a workspace with
 *     two projects produced *one* goal line -- measured: 2 arcs, 2 distinct
 *     `relatedProjectId`s, 1 goal. Ten projects would also produce one, and it
 *     would name none of them.
 *   - `identity-rules` matches a completed arc against a proposed Aspiration by
 *     name, which is how finishing a project is meant to confirm a stated goal.
 *     Matching the constant `"Project Created"` cannot succeed for any project
 *     against any aspiration.
 *
 * RESOLVED FROM THE ID, AND AT READ TIME
 * --------------------------------------
 * The story carries `relatedProjectId` precisely so code stops reading names
 * out of prose, so the name is looked up rather than parsed. GENESIS holds the
 * workspace read-only (ARCHITECTURE §5), which is all this needs.
 *
 * It resolves on each call rather than being baked into the title at creation,
 * for two measured reasons. `akira-store.addProject` publishes
 * `PROJECT_CREATED` *before* the project enters state, so at the moment the arc
 * is created the workspace does not yet contain it -- a creation-time lookup
 * returns the fallback live and the real name only after a replay, which would
 * make an arc's title change on reload. Resolving here also means renaming a
 * project renames what the prompt calls it, with nothing to migrate.
 */
export function projectArcProjectName(story: {
  title: string;
  relatedProjectId?: string | null;
}): string {
  if (story.relatedProjectId) {
    const project = getWorkspaceProvider()
      .getState()
      .projects.find((p) => p.id === story.relatedProjectId);
    if (project) return project.name.trim() || projectArcTitleRemainder(story);
  }
  return projectArcTitleRemainder(story);
}
