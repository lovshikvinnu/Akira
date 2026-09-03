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

    // Stale candidates from previous cycle transition to Inactive
    for (const old of recallCache) {
      const isNewActive = activeCandidates.some((c) => c.memoryId === old.memoryId);
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
        if (!liveMemoryIds || liveMemoryIds.has(old.memoryId)) {
          nextCache.push(old);
        }
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
