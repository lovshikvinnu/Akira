/**
 * Which cognitive outcomes belong to a past session.
 *
 * A session is a closed window, `startedAt` to `endedAt`, and the question this
 * answers is what happened inside it. That is a historical fact: it was true
 * when the session ended and nothing later can change it.
 *
 * The route asked it with `updatedAt` for stories and identity observations,
 * and with the immutable `timestamp` for events, candidates and memories. Those
 * are not the same question. `updatedAt` moves every time the thing is touched,
 * so a story created during a session in March and reinforced today stops
 * falling inside March's window and starts falling inside today's -- it leaves
 * the session it happened in and joins one it did not. The history erodes as
 * the user keeps working, and the entries do not go missing quietly: they
 * reappear attributed to the wrong session.
 *
 * `createdAt` was the next answer, on the grounds that it never moves. That is
 * true of a row the user created and false of DERIVED state. Stories and
 * identity observations are not persisted: they are re-derived from the durable
 * memory stream on every startup, and the rebuild stamps them with the instant
 * of the rebuild. So a story's `createdAt` is a replay instant, and after the
 * first restart every past session reports nothing -- the same erosion, arriving
 * by a different route and all at once rather than gradually. Measured:
 *
 *     immediately after the session   createdAt-in-window  stories 1/2  identity 1/1
 *     after later unrelated activity  createdAt-in-window  stories 1/2  identity 1/2
 *     after a restart                 createdAt-in-window  stories 0/2  identity 0/2
 *
 * WHAT ACTUALLY SURVIVES IS THE EVIDENCE
 * --------------------------------------
 * A story cites `relatedMemoryIds` and an observation cites
 * `supportingMemoryIds`. Those memories carry `timestamp` off the durable
 * stream, which replay reproduces exactly -- so the evidence can be dated even
 * though the thing derived from it cannot. A derived artifact belongs to the
 * session whose window contains the evidence it rests on, which is also the
 * more truthful claim: the session is being credited with the work that
 * happened inside it, not with the bookkeeping instant of a later rebuild.
 * Stable in all three conditions above, 2/2 and 2/2 throughout.
 *
 * The timestamps are read from `promoted`, which is already the full memory
 * list, so nothing new has to be passed in and the call site is unchanged.
 *
 * One consequence, accepted rather than hidden: when runtime retention evicts
 * the memories a story rested on, the story can no longer be dated and drops
 * out of the session view. That is honest -- the evidence is gone -- and the
 * session's raw `events` are unaffected, because they are filtered on the
 * durable stream's own instant.
 *
 * Extracted from `sessions.tsx` so this is testable at all -- it was inline in
 * a `useMemo`, and a route holding this kind of logic is what MODULE_CONTRACT
 * 2.2 asks to be moved out anyway. The route now mounts and calls.
 *
 * Deliberately not "touched during the session". That would be a different and
 * defensible view of history, but it needs a record of every touch; `updatedAt`
 * holds only the most recent one, so it cannot answer that question either.
 */

/** A record that can be dated by the durable evidence it cites. */
interface HasEvidence {
  relatedMemoryIds?: string[];
  supportingMemoryIds?: string[];
}

/** A memory: an immutable instant reached by id from a derived artifact. */
interface HasId {
  id: string;
}

/** Anything carrying an immutable event instant. */
interface HasTimestamp {
  timestamp: string;
}

export interface SessionWindow {
  startedAt: string;
  endedAt: string;
}

export interface SessionOutcomes<E, C, M, S, I> {
  events: E[];
  candidates: C[];
  promoted: M[];
  stories: S[];
  identity: I[];
}

/** True when `iso` falls inside the closed window. */
function within(iso: string, start: number, end: number): boolean {
  const t = new Date(iso).getTime();
  return t >= start && t <= end;
}

/**
 * Groups the outcomes that belong to `session`.
 *
 * Records carrying their own immutable instant are filtered on it. Derived
 * artifacts have no such instant that survives a rebuild, so they are dated by
 * the durable evidence they cite.
 */
export function selectSessionOutcomes<
  E extends HasTimestamp,
  C extends HasTimestamp,
  M extends HasTimestamp & HasId,
  S extends HasEvidence,
  I extends HasEvidence,
>(
  session: SessionWindow,
  sources: { events: E[]; candidates: C[]; promoted: M[]; stories: S[]; identity: I[] },
): SessionOutcomes<E, C, M, S, I> {
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt).getTime();

  const memoryInstant = new Map<string, string>();
  for (const m of sources.promoted) memoryInstant.set(m.id, m.timestamp);

  /** True when any cited memory happened inside the window. */
  const restsOnWorkInWindow = (record: HasEvidence): boolean => {
    const cited = record.relatedMemoryIds ?? record.supportingMemoryIds ?? [];
    return cited.some((id) => {
      const instant = memoryInstant.get(id);
      return instant !== undefined && within(instant, start, end);
    });
  };

  return {
    events: sources.events.filter((e) => within(e.timestamp, start, end)),
    candidates: sources.candidates.filter((c) => within(c.timestamp, start, end)),
    promoted: sources.promoted.filter((m) => within(m.timestamp, start, end)),
    stories: sources.stories.filter(restsOnWorkInWindow),
    identity: sources.identity.filter(restsOnWorkInWindow),
  };
}
