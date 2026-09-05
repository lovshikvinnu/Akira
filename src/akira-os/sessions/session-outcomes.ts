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
 * `createdAt` is when the outcome came into existence, which is the thing a
 * session record is claiming. It never moves, so an old session shows the same
 * contents forever, which is what makes it a record.
 *
 * Extracted from `sessions.tsx` so this is testable at all -- it was inline in
 * a `useMemo`, and a route holding this kind of logic is what MODULE_CONTRACT
 * 2.2 asks to be moved out anyway. The route now mounts and calls.
 *
 * Deliberately not "touched during the session". That would be a different and
 * defensible view of history, but it needs a record of every touch; `updatedAt`
 * holds only the most recent one, so it cannot answer that question either.
 */

/** Anything the session view attributes by when it came into existence. */
interface HasCreatedAt {
  createdAt: string;
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
 * Groups the outcomes that came into existence during `session`.
 *
 * Every source is filtered on its own creation instant: `timestamp` where the
 * record is an event, `createdAt` where it is a thing that can later change.
 */
export function selectSessionOutcomes<
  E extends HasTimestamp,
  C extends HasTimestamp,
  M extends HasTimestamp,
  S extends HasCreatedAt,
  I extends HasCreatedAt,
>(
  session: SessionWindow,
  sources: { events: E[]; candidates: C[]; promoted: M[]; stories: S[]; identity: I[] },
): SessionOutcomes<E, C, M, S, I> {
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt).getTime();

  return {
    events: sources.events.filter((e) => within(e.timestamp, start, end)),
    candidates: sources.candidates.filter((c) => within(c.timestamp, start, end)),
    promoted: sources.promoted.filter((m) => within(m.timestamp, start, end)),
    stories: sources.stories.filter((s) => within(s.createdAt, start, end)),
    identity: sources.identity.filter((o) => within(o.createdAt, start, end)),
  };
}
