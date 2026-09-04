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

/** The single consolidated arc for reflections, matched by exact title. */
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

/** True when a story is the consolidated reflections arc. */
export function isReflectionsArc(story: { title: string }): boolean {
  return story.title === REFLECTIONS_ARC_TITLE;
}

/** True when a story is a per-project narrative arc. */
export function isProjectArc(story: { title: string }): boolean {
  return story.title.startsWith(PROJECT_ARC_TITLE_PREFIX);
}

/**
 * The display remainder of a project arc's title.
 *
 * Deliberately named for what it is rather than for what callers wish it were.
 * `identity-rules` matches hypotheses against this value as though it were the
 * project's name; measured, it is the translator's fixed event title for every
 * project, so that match cannot succeed. Kept exact so extracting the constant
 * changes nothing, and named so the next reader does not assume otherwise.
 */
export function projectArcTitleRemainder(story: { title: string }): string {
  return story.title.replace(PROJECT_ARC_TITLE_PREFIX, "").trim();
}
