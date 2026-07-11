import { RecallCandidate, RecallSession, RecallAuditEntry, RecallContext } from "./types";

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
        // Retain inactive history for context package rules
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

    if (sessionHistory.length > 50) {
      sessionHistory.shift(); // Cap history to prevent memory leak
    }

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
