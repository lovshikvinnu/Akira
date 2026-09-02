/**
 * GENESIS retention policy.
 *
 * Every cognitive store in GENESIS was an unbounded in-memory array. That was
 * harmless while the pipeline was disconnected and nothing flowed into it. Now
 * that real platform events reach GENESIS, each of these grows for as long as
 * the tab is open, and the AI prompt grows with them.
 *
 * One global array limit is not enough, because the stores grow for different
 * reasons:
 *
 *   - `memories` grow with promoted candidates.
 *   - `candidateHistory` grows with *matched events*, including ones that were
 *     never promoted, so it outpaces memories.
 *   - a story's `relatedMemoryIds` grows within a fixed number of stories.
 *   - a memory's importance `signalHistory` grows on every recalculation, so it
 *     grows even when the memory count is stable.
 *   - the AI context is assembled by string concatenation from several of the
 *     above, so it needs its own bound regardless of what is retained in RAM.
 *
 * Hence one cap per growth axis, declared here rather than scattered as magic
 * numbers at the call sites.
 */

/** Caps on what GENESIS keeps in memory, and on what it puts in a prompt. */
export interface GenesisRetentionPolicy {
  /** Validated long-term memories. The root source; everything else derives from it. */
  readonly maxMemories: number;
  /** Candidate audit trail. Larger than maxMemories because not every candidate promotes. */
  readonly maxCandidates: number;
  /** Narrative arcs. One per project in practice. */
  readonly maxStories: number;
  /** Memory references held by a single story. */
  readonly maxMemoriesPerStory: number;
  /** Recalculation entries kept per memory's importance profile. */
  readonly maxImportanceHistoryPerMemory: number;
  /** Detected relationships between memories. */
  readonly maxRelationships: number;

  /**
   * Independent bound on what reaches the model.
   *
   * Deliberately far smaller than the in-memory caps: retention decides what
   * GENESIS can still reason over, while these decide what is worth spending
   * prompt tokens on. Raising a memory cap must not silently enlarge a prompt.
   */
  readonly context: {
    readonly maxStories: number;
    readonly maxRecallCandidates: number;
    readonly maxIdentityObservations: number;
    readonly maxGoals: number;
    readonly maxRecentActivity: number;
  };
}

export const DEFAULT_RETENTION_POLICY: GenesisRetentionPolicy = {
  maxMemories: 500,
  maxCandidates: 500,
  maxStories: 100,
  maxMemoriesPerStory: 200,
  maxImportanceHistoryPerMemory: 20,
  maxRelationships: 1000,
  context: {
    maxStories: 12,
    maxRecallCandidates: 12,
    maxIdentityObservations: 12,
    maxGoals: 8,
    maxRecentActivity: 12,
  },
};

let activePolicy: GenesisRetentionPolicy = DEFAULT_RETENTION_POLICY;

export function getRetentionPolicy(): GenesisRetentionPolicy {
  return activePolicy;
}

/**
 * Overrides the policy. Intended for tests, which need small caps to reach a
 * boundary without generating hundreds of events.
 */
export function setRetentionPolicy(policy: Partial<GenesisRetentionPolicy>): void {
  activePolicy = {
    ...activePolicy,
    ...policy,
    context: { ...activePolicy.context, ...(policy.context ?? {}) },
  };
}

export function resetRetentionPolicy(): void {
  activePolicy = DEFAULT_RETENTION_POLICY;
}

/**
 * Trims `items` in place to at most `max`, dropping from the front.
 *
 * Callers hold their collections oldest-first, so the front is the coldest end.
 * Returns what was removed, which is what lets callers notify downstream and
 * keep references consistent.
 */
export function trimOldest<T>(items: T[], max: number): T[] {
  if (max < 0 || items.length <= max) return [];
  return items.splice(0, items.length - max);
}

/**
 * Trims `items` in place to at most `max`, dropping from the end.
 *
 * For collections held newest-first, such as the candidate audit trail.
 */
export function trimNewestFirst<T>(items: T[], max: number): T[] {
  if (max < 0 || items.length <= max) return [];
  return items.splice(max);
}
