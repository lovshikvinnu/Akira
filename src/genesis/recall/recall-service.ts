import { RecallCandidate, RecallSession, RecallAuditEntry, RecallContext } from "./types";
import { getRetentionPolicy, trimOldest } from "../retention/policy";

type RecallListener = (event: { type: "Updated"; session: RecallSession }) => void;
const listeners = new Set<RecallListener>();

let activeSession: RecallSession | null = null;
const sessionHistory: RecallSession[] = [];
let recallCache: RecallCandidate[] = [];

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const recallService = {
  /**
   * Subscribe to recall session updates.
   */
  subscribe(listener: RecallListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Fetch currently tracked recall candidates (includes active and inactive).
   */
  getRecallCandidates(): RecallCandidate[] {
    return recallCache;
  },

  /**
   * Fetch current active recall session details.
   */
  getActiveSession(): RecallSession | null {
    return activeSession;
  },

  /**
   * Fetch history of recent recall sessions.
   */
  getSessionHistory(): RecallSession[] {
    return sessionHistory;
  },

  /**
   * Clear all session caches and history logs.
   */
  clearHistory(): void {
    recallCache = [];
    sessionHistory.length = 0;
    activeSession = null;
  },

  /**
   * Evaluate a recall cycle, creating an immutable session and updating statuses.
   */
  startRecallSession(
    newActiveCandidates: Omit<RecallCandidate, "status">[],
    context?: RecallContext,
    liveMemoryIds?: ReadonlySet<string>,
  ): RecallSession {
    const sessionId = uid();
    const timestamp = new Date().toISOString();

    const nextCache: RecallCandidate[] = [];
    const auditTrail: RecallAuditEntry[] = [];

    // All newly selected candidates are marked Active
    const activeCandidates: RecallCandidate[] = newActiveCandidates.map((c) => {
      const candidate: RecallCandidate = { ...c, status: "Active" };
      auditTrail.push({
        memoryId: candidate.memoryId,
        reason: `Activated: ${candidate.recallReasons.join(", ")}`,
        timestamp,
      });
      return candidate;
    });

    nextCache.push(...activeCandidates);

    // Membership keys for the diff below, derived once.
    //
    // That diff asked `activeCandidates.some((c) => c.memoryId === old.memoryId)`
    // for every cached candidate. The predicate reads one field, the matched
    // object is never used, and the result is consumed only as a boolean -- so
    // it was a membership test written as a scan. At the retention ceiling both
    // collections hold 500 entries and `some` short-circuits on the match,
    // which still cost 125,250 string comparisons per rebuild, measured at
    // 2.3 ms of a ~19 ms event.
    //
    // A Set is exactly equivalent here rather than merely faster: memory ids
    // are unique within each collection, so no duplicate can be collapsed, and
    // SameValueZero and `===` agree on strings. Iteration order over
    // `recallCache` and the order entries are pushed into `nextCache` are
    // untouched, so the resulting cache is identical entry for entry.
    const activeMemoryIds = new Set(activeCandidates.map((c) => c.memoryId));

    // Stale candidates from previous cycle transition to Inactive
    for (const old of recallCache) {
      const isNewActive = activeMemoryIds.has(old.memoryId);

      // A candidate whose memory is gone is dropped outright rather than
      // deactivated. The liveness guard used to sit only on the Inactive branch
      // below, so an Active candidate whose memory had just been evicted was
      // demoted to Inactive and only discarded on the *following* cycle. That
      // was invisible while every importance update triggered its own rebuild,
      // because the following cycle arrived microseconds later inside the same
      // user action. With one rebuild per action the entry survives until the
      // next one, which is exactly the dangling reference
      // `tests/genesis-recall-candidate-bounds.test.ts` forbids. Applying the
      // guard on both branches makes the invariant hold in one cycle instead of
      // depending on there being another.
      const memoryStillExists = !liveMemoryIds || liveMemoryIds.has(old.memoryId);

      if (!memoryStillExists) {
        auditTrail.push({
          memoryId: old.memoryId,
          reason: "Dropped: Memory no longer exists.",
          timestamp,
        });
        continue;
      }

      if (old.status === "Active" && !isNewActive) {
        const inactiveCandidate: RecallCandidate = {
          ...old,
          status: "Inactive",
          recallTimestamp: timestamp,
        };
        nextCache.push(inactiveCandidate);
        auditTrail.push({
          memoryId: old.memoryId,
          reason: "Deactivated: No longer meets active recall criteria.",
          timestamp,
        });
      } else if (old.status === "Inactive" && !isNewActive) {
        // Carry the candidate forward only while its memory still exists.
        //
        // This is the cache's only bound, and it is a referential one rather
        // than a count. The builder derives candidates solely from live
        // memories, so once a memory is evicted its candidate can never become
        // Active again -- it is unreachable data, and keeping it meant the
        // cache grew with everything the process had ever recalled rather than
        // with what it currently holds. Each retained session references the
        // array containing them, so the leak was pinned several times over.
        //
        // `liveMemoryIds` is optional so a caller that has no view of memory
        // keeps the previous behaviour instead of silently discarding history.
        // The check itself now happens once, above, for both branches.
        nextCache.push(old);
      }
    }

    recallCache = nextCache;

    const session: RecallSession = {
      sessionId,
      candidates: recallCache,
      auditTrail,
      timestamp,
      context,
    };

    activeSession = session;
    sessionHistory.push(session);

    // Oldest sessions go first: the trail exists to show what recall did
    // recently, and a stale cycle describes candidates that have since been
    // superseded. `activeSession` is held separately, so trimming here can
    // never remove the session the UI is displaying.
    //
    // The limit lives in the retention policy rather than here so it sits
    // beside every other cognitive bound and can be tuned and tested.
    trimOldest(sessionHistory, getRetentionPolicy().maxRecallSessions);

    this.notify(session);
    return session;
  },

  /**
   * Broadcast session details.
   */
  notify(session: RecallSession): void {
    listeners.forEach((listener) => {
      try {
        listener({ type: "Updated", session });
      } catch (err) {
        console.error("Error executing recall listener callback:", err);
      }
    });
  },
};
