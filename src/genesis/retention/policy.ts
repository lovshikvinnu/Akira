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
  /**
   * The durable MemoryEvent stream — GENESIS's intake record, and the only
   * cognitive state that survives a reload. Everything else is rebuilt from it,
   * so this is the cap that decides how much history a restart can recover.
   *
   * This bounds the *Episodic* class only: routine, high-volume activity.
   * Milestones and user-authored facts are bounded separately by
   * {@link GenesisRetentionPolicy.maxCoreMemoryEvents}, so a project you
   * started last year is not evicted by a thousand completed tasks.
   */
  readonly maxMemoryEvents: number;
  /**
   * The durable stream's Core class: milestones and things the user wrote.
   *
   * Deliberately far larger than the Episodic cap and consumed far more slowly.
   * Core events arrive at a handful per day even for an active user, where
   * task completions arrive in dozens, so this is what lets AKIRA still know
   * about a project from eighteen months ago.
   */
  readonly maxCoreMemoryEvents: number;
  /**
   * Validated long-term memories of the Episodic class -- the active window of
   * routine activity that stories, recall and understanding reason over.
   *
   * Core memories are bounded separately by
   * {@link GenesisRetentionPolicy.maxCoreMemories}. The two together bound the
   * runtime set.
   */
  readonly maxMemories: number;
  /**
   * Validated long-term memories of the Core class.
   *
   * Deliberately equal to {@link GenesisRetentionPolicy.maxCoreMemoryEvents}.
   * Anything the durable stream protects must remain reachable to cognition,
   * and a smaller runtime cap would not fix that -- it would only move the
   * point at which a milestone becomes stored-but-invisible. Making the two
   * agree is what lets "it is in the durable stream" mean "GENESIS can still
   * reason about it".
   */
  readonly maxCoreMemories: number;
  /** Candidate audit trail. Larger than maxMemories because not every candidate promotes. */
  readonly maxCandidates: number;
  /** Narrative arcs. One per project in practice. */
  readonly maxStories: number;
  /** Memory references held by a single story. */
  readonly maxMemoriesPerStory: number;
  /** Recalculation entries kept per memory's importance profile. */
  readonly maxImportanceHistoryPerMemory: number;
  /**
   * Confidence entries, and provenance segments, kept per identity
   * observation.
   *
   * Observations merge on (category, name), so the number of observations
   * tracks distinct traits. What grew was the inside of one: identity is
   * rebuilt from stories and stories update on every memory, so the same
   * trait is reinforced indefinitely and both its history array and its
   * provenance string gained an entry each time.
   */
  readonly maxObservationHistory: number;
  /**
   * Detected relationships retained per memory.
   *
   * Bounded per memory rather than globally. A single global cap made coverage
   * a function of cache position: one completed task in a large project emits
   * a relationship against every peer, so the shared cache turned over faster
   * than anything could read it and only the newest ~50% of memories held any
   * relationship at all. The two importance rules that consume them returned
   * null for everyone else, which made a memory's measured connectedness
   * depend on when it was looked at rather than on what it was connected to.
   *
   * Eight sits above the point where both consumers stop distinguishing:
   * `min(1, 0.4 + n * 0.15)` reaches 1.0 at four relationships and
   * `min(1, 0.4 + n * 0.2)` at three. Retaining more changes no signal any
   * rule can currently express, and eight leaves headroom for one that counts
   * further.
   */
  readonly maxRelationshipsPerMemory: number;
  /**
   * Recall sessions kept as history.
   *
   * The bound that matters here is not the entry count but what each entry
   * pins: a session holds the candidate snapshot of its cycle, so the memory
   * retained is roughly this number multiplied by the live candidate count.
   * See the note on the default below.
   */
  readonly maxRecallSessions: number;

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
  // Slightly above maxMemories: not every recorded event promotes to a memory,
  // so the stream needs headroom to still yield a full memory set on replay.
  maxMemoryEvents: 750,
  // ~5 Core events/day for an active user puts this at well over a year of
  // milestones and notes; the worst case is bounded rather than open-ended.
  maxCoreMemoryEvents: 2000,
  maxMemories: 500,
  maxCoreMemories: 2000,
  maxCandidates: 500,
  maxStories: 100,
  maxMemoriesPerStory: 200,
  maxImportanceHistoryPerMemory: 20,
  // Matches the importance history limit: both answer the same question,
  // which is how much of a derived signal's recalculation trail is worth
  // keeping to explain the current value.
  maxObservationHistory: 20,
  maxRelationshipsPerMemory: 8,
  // Lower than the 50 this replaces. Nothing reads `getSessionHistory()`; it is
  // kept for inspection, and each entry holds a full candidate snapshot, so 50
  // retained roughly 50 x maxMemories candidate objects at steady state --
  // measured at ~17,900 held objects after only 90 completed tasks. Twelve
  // keeps the trail useful for debugging at a small fraction of that.
  maxRecallSessions: 12,
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

/**
 * How durable one kind of intake event is.
 *
 * The problem this solves: the durable stream was truncated by recency alone,
 * so a project milestone from months ago was discarded ahead of a task
 * completed yesterday. GENESIS computes a rich importance signal per memory and
 * then forgot by age regardless -- and because the stream is the only state
 * that survives a reload, that forgetting was permanent.
 *
 * Importance cannot decide this. It is derived *from* memories, so consulting
 * it here would make the root store depend on something downstream of itself,
 * and it does not exist yet at the moment an event is written. Durability is
 * therefore decided by a property the event already carries at intake: what
 * kind of occurrence it is.
 *
 *   Core      a milestone, or something the user authored. Rare, and the
 *             answer to "what has this person been doing with their life".
 *   Episodic  routine activity. Individually unremarkable, valuable in
 *             aggregate and only while recent.
 *
 * Each class is bounded independently and evicts by recency *within* its class,
 * so high-volume Episodic traffic can never displace a Core event.
 */
export type DurabilityClass = "Core" | "Episodic";

/**
 * The durability of each intake event type.
 *
 * This table is the product decision, stated in one place rather than implied
 * by scattered conditionals. Changing a row changes what AKIRA promises to
 * remember about someone.
 *
 * `mission_completed` is Episodic despite being an achievement: it is an
 * aggregate of task completions that are Episodic themselves, it carries no
 * content of its own beyond a count, and it fires whenever the day's list
 * happens to empty rather than once per day.
 *
 * `note_created` covers both notes the user writes and the corrections the
 * goals, habits, knowledge, relationships, companion-state and reflection
 * services record. Both are deliberate user acts, so both are Core -- though
 * those services sharing an event type with real notes is a modelling smell
 * worth separating later.
 */
const DURABILITY_BY_EVENT_TYPE: Readonly<Record<string, DurabilityClass>> = Object.freeze({
  project_created: "Core",
  project_updated: "Core",
  note_created: "Core",
  note_edited: "Core",

  task_completed: "Episodic",
  project_continued: "Episodic",
  mission_completed: "Episodic",
  presence_updated: "Episodic",
});

/**
 * Classifies an event type. Unknown types are Episodic: a new event type must
 * earn durability explicitly rather than inherit it by omission, which keeps
 * the protected class from filling with whatever a future subsystem emits.
 */
export function classifyDurability(eventType: string): DurabilityClass {
  return DURABILITY_BY_EVENT_TYPE[eventType] ?? "Episodic";
}

/**
 * Applies per-class retention to the durable stream.
 *
 * Takes the stream newest-first -- the order `akira-store` holds it in -- and
 * returns the events that survive, in that same order. Each class is counted
 * independently, so the result is "the newest N Core events and the newest M
 * Episodic ones", interleaved exactly as they occurred.
 *
 * One pass, no sorting, no clock and no derived state: the same input always
 * yields the same output, which is what keeps reconstruction deterministic.
 */
export function applyDurableRetention<T extends { eventType: string }>(
  newestFirst: readonly T[],
): T[] {
  const policy = getRetentionPolicy();
  const limits: Record<DurabilityClass, number> = {
    Core: policy.maxCoreMemoryEvents,
    Episodic: policy.maxMemoryEvents,
  };
  const kept: T[] = [];
  const counts: Record<DurabilityClass, number> = { Core: 0, Episodic: 0 };

  for (const event of newestFirst) {
    const durability = classifyDurability(event.eventType);
    if (counts[durability] >= limits[durability]) continue;
    counts[durability] += 1;
    kept.push(event);
  }

  return kept;
}

/**
 * Applies per-class retention to the runtime memory set, in place.
 *
 * The durable stream protects Core events from Episodic volume; this is the
 * same policy one layer down, and without it the protection stopped at the
 * disk. `memories` was trimmed by age alone, and replay promotes oldest-first,
 * so the Core events the stream had carefully kept were the very first evicted
 * on reconstruction -- a founding project could be permanently stored and
 * entirely absent from stories, recall, understanding and identity. Measured
 * before this change: a founding project and note present in the durable
 * stream, absent from `memories[]` and from every derived store, both live and
 * after reconstruction.
 *
 * Mirrors `trimOldest`'s contract -- mutates `oldestFirst` and returns what was
 * removed, oldest first -- so the eviction fan-out that keeps stories,
 * importance and relationships free of dangling references is unchanged.
 *
 * Deterministic: one reverse pass to decide, one forward pass to compact, no
 * clock and no derived state, so replaying the same stream always evicts the
 * same set.
 */
export function applyRuntimeRetention<T extends { eventType: string }>(oldestFirst: T[]): T[] {
  const policy = getRetentionPolicy();
  const limits: Record<DurabilityClass, number> = {
    Core: policy.maxCoreMemories,
    Episodic: policy.maxMemories,
  };
  const counts: Record<DurabilityClass, number> = { Core: 0, Episodic: 0 };
  const doomed = new Set<number>();

  // Newest first, so what survives is the newest N of each class.
  for (let i = oldestFirst.length - 1; i >= 0; i--) {
    const durability = classifyDurability(oldestFirst[i].eventType);
    if (counts[durability] >= limits[durability]) doomed.add(i);
    else counts[durability] += 1;
  }

  if (doomed.size === 0) return [];

  const evicted: T[] = [];
  let write = 0;
  for (let read = 0; read < oldestFirst.length; read++) {
    if (doomed.has(read)) evicted.push(oldestFirst[read]);
    else oldestFirst[write++] = oldestFirst[read];
  }
  oldestFirst.length = write;

  return evicted;
}
