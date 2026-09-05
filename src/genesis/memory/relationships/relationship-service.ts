import { memoryService } from "../memory-service";
import { Memory } from "../../validation/types";
import { MemoryRelationship } from "./types";
import { relationshipRules } from "./relationship-rules";
import { getRetentionPolicy } from "../../retention/policy";

type RelationshipListener = (relationship: MemoryRelationship) => void;
const listeners = new Set<RelationshipListener>();

const relationshipCache: MemoryRelationship[] = [];

/**
 * Adjacency index: memory id -> the relationships with that memory at either end.
 *
 * A projection of `relationshipCache`, which stays canonical. It exists because
 * `getRelationshipsForMemory` was a linear filter over the whole cache, and at
 * the retention ceiling that single query was measured at 47% of the cost of
 * one completed task: importance recalculates 201 story members per event and
 * two of its six rules ask this question, so the cache -- 1,000 entries at its
 * cap -- was scanned 402 times per user action, ~15.9 ms of a ~34 ms event.
 *
 * Both ends are indexed because the query matches either. A relationship whose
 * two ends are the same memory would otherwise be listed twice, so it is stored
 * once; `detectRelationships` never builds one, but the guard makes the index
 * agree with the filter it replaces rather than with the loop that feeds it.
 *
 * Order is preserved, not merely membership. The filter returned matches in
 * cache order; the cache only ever gains entries at the back and loses them
 * from the front or by targeted removal, so appending here in push order yields
 * the same sequence the scan produced.
 *
 * Maintained at the three places the cache changes -- creation (including the
 * `maxRelationships` eviction that trims it), `forgetMemories`, and
 * `clearHistory`. Reconstruction needs no special handling: it clears and
 * replays through those same paths.
 */
const byMemory = new Map<string, MemoryRelationship[]>();

/** How many relationships this memory currently holds. */
function degreeOf(memoryId: string): number {
  return byMemory.get(memoryId)?.length ?? 0;
}

/**
 * Attaches to one memory's list, evicting that memory's oldest if it would go
 * over its bound.
 *
 * Eviction is symmetric -- the displaced relationship leaves *both* of its
 * ends. A link one end believes in and the other has forgotten is not a
 * relationship, and the two importance rules would then answer differently
 * about the same pair depending on which memory was asked.
 *
 * Only the peer end can reach this path now that creation is bounded: the new
 * memory stops creating at its own bound, so it never overflows. A peer can,
 * because it accumulates incoming links from every later memory.
 */
function indexAttach(
  memoryId: string,
  relationship: MemoryRelationship,
  evicted: Set<MemoryRelationship>,
): void {
  const max = getRetentionPolicy().maxRelationshipsPerMemory;
  if (max <= 0) {
    evicted.add(relationship);
    return;
  }

  let list = byMemory.get(memoryId);
  if (!list) {
    list = [];
    byMemory.set(memoryId, list);
  }
  list.push(relationship);

  // `indexRemove` splices this same array, so the length falls each pass and
  // the loop terminates. It also drops the map entry when the list empties,
  // which is why the entry is restored below.
  while (list.length > max) {
    const displaced = list[0];
    indexRemove(displaced);
    evicted.add(displaced);
  }

  if (list.length > 0) byMemory.set(memoryId, list);
}

/** Indexes a new relationship, bounding both of its ends. */
function indexAdd(relationship: MemoryRelationship, evicted: Set<MemoryRelationship>): void {
  indexAttach(relationship.sourceMemoryId, relationship, evicted);
  if (relationship.targetMemoryId !== relationship.sourceMemoryId) {
    indexAttach(relationship.targetMemoryId, relationship, evicted);
  }
}

/**
 * Removes an evicted set from the creation-ordered cache in a single pass.
 *
 * Not a splice per eviction: that is O(cache) each time, and it is the shape of
 * cost the global cap used to impose from inside the creation loop. One pass
 * per detection is O(cache) in total and preserves creation order, which
 * `getRelationships()` and the Brain Inspector both read.
 */
function compactCache(evicted: Set<MemoryRelationship>): void {
  if (evicted.size === 0) return;

  let write = 0;
  for (let read = 0; read < relationshipCache.length; read++) {
    const link = relationshipCache[read];
    if (evicted.has(link)) continue;
    relationshipCache[write] = link;
    write += 1;
  }
  relationshipCache.length = write;
}

function indexDetach(memoryId: string, relationship: MemoryRelationship): void {
  const list = byMemory.get(memoryId);
  if (!list) return;
  const at = list.indexOf(relationship);
  if (at !== -1) list.splice(at, 1);
  // An empty list is indistinguishable from an absent one to every reader, and
  // keeping it would leak an entry per memory retention has finished with.
  if (list.length === 0) byMemory.delete(memoryId);
}

function indexRemove(relationship: MemoryRelationship): void {
  indexDetach(relationship.sourceMemoryId, relationship);
  if (relationship.targetMemoryId !== relationship.sourceMemoryId) {
    indexDetach(relationship.targetMemoryId, relationship);
  }
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const relationshipService = {
  /**
   * Subscribe to new memory relationships generated in the system.
   */
  subscribe(listener: RelationshipListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Get all active memory relationships.
   */
  getRelationships(): MemoryRelationship[] {
    return relationshipCache;
  },

  /**
   * Get all relationships associated with a specific memory ID.
   */
  getRelationshipsForMemory(memoryId: string): MemoryRelationship[] {
    // A copy, because the filter this replaces returned one. Callers read
    // `.length`, run `.filter()` and render -- none mutates today -- but
    // handing out the index's own array would make the index corruptible by
    // any future caller that did.
    const list = byMemory.get(memoryId);
    return list ? list.slice() : [];
  },

  /**
   * Clear relationship log cache.
   */
  clearHistory(): void {
    relationshipCache.length = 0;
    byMemory.clear();
  },

  /**
   * Fetch candidates for comparison.
   * Decoupled to allow future indexing/filtering (e.g. by project bucket or date range)
   * instead of scanning the full memory log.
   */
  getComparisonCandidates(newMemory: Memory): Memory[] {
    return memoryService.getMemories();
  },

  /**
   * Process a newly promoted memory and check for relationships against comparison candidates.
   */
  detectRelationships(newMemory: Memory): MemoryRelationship[] {
    const detected: MemoryRelationship[] = [];
    const candidates = this.getComparisonCandidates(newMemory);
    const max = getRetentionPolicy().maxRelationshipsPerMemory;

    // Evictions gathered across the pass and applied to the cache once at the
    // end; see compactCache.
    const evicted = new Set<MemoryRelationship>();

    // Newest peers first.
    //
    // The bound is applied at creation rather than after it, and that ordering
    // is what makes the bound mean something. Creating a link against every
    // peer and then trimming to the bound looks equivalent and is not: eviction
    // is symmetric, so each discarded link also leaves the peer's list, and the
    // next memory strips them again. Measured, that left 36 relationships out
    // of 7,260 created and covered 9 memories out of 241 -- worse than the
    // global cap it replaced.
    //
    // Creating only what is kept avoids that entirely: nothing is discarded, so
    // no peer loses a link it already had, and coverage is complete.
    //
    // Newest-first because the budget is small and recency is the only ordering
    // the candidate list carries. Oldest-first would spend all eight links on
    // the start of a project and leave a long-running one with nothing recent.
    for (let i = candidates.length - 1; i >= 0; i--) {
      const existing = candidates[i];

      // Do not link a memory to itself
      if (existing.id === newMemory.id) continue;

      // Budget spent: stop evaluating, keep walking.
      //
      // Worth being exact about what this does and does not preserve, because
      // it is easy to claim more. Once the budget is gone a further match could
      // not be created anyway, so evaluating the remaining peers would cost
      // four rule calls each and change nothing -- "scan every peer and create
      // at most eight" yields the same relationships as stopping, only slower.
      //
      // What the walk *does* preserve is the budget guarantee: the loop keeps
      // going until eight relationships exist, not until eight peers have been
      // looked at. A peer that matches no rule costs a step rather than a slot,
      // so a memory surrounded by unrelated peers still gets its eight.
      //
      // What neither form preserves is a rare rule matching a distant peer:
      // the budget is spent by whichever rule matches first, and here that is
      // always Project Membership. Fixing that needs per-type budgeting, which
      // is a cognitive decision and is not this change.
      if (degreeOf(newMemory.id) >= max) continue;

      for (const rule of relationshipRules) {
        const result = rule.evaluate(newMemory, existing);
        // `basis` is required alongside the rest. A rule that detects a link
        // without saying where it came from is not recorded at all, so an
        // unclassified relationship cannot reach the cache and be counted as
        // though the user had established it.
        if (result.detected && result.type && result.basis && result.evidence) {
          const relationship: MemoryRelationship = {
            id: uid(),
            sourceMemoryId: newMemory.id,
            targetMemoryId: existing.id,
            type: result.type,
            basis: result.basis,
            evidence: result.evidence,
            timestamp: new Date().toISOString(),
          };

          relationshipCache.push(relationship);
          indexAdd(relationship, evicted);

          detected.push(relationship);

          listeners.forEach((listener) => {
            try {
              listener(relationship);
            } catch (err) {
              console.error("Error executing relationship subscriber callback:", err);
            }
          });

          if (degreeOf(newMemory.id) >= max) break;
        }
      }
    }

    compactCache(evicted);

    return detected;
  },
  /** Test helper: the adjacency index as plain data, for consistency assertions. */
  getAdjacencyIndexSnapshot(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [memoryId, links] of byMemory) out[memoryId] = links.map((l) => l.id);
    return out;
  },

  /**
   * Drops relationships that point at memories retention has evicted. A
   * relationship needs both ends to mean anything.
   */
  forgetMemories(evictedMemoryIds: string[]): void {
    if (evictedMemoryIds.length === 0) return;
    const evicted = new Set(evictedMemoryIds);

    for (let i = relationshipCache.length - 1; i >= 0; i--) {
      const link = relationshipCache[i];
      if (evicted.has(link.sourceMemoryId) || evicted.has(link.targetMemoryId)) {
        relationshipCache.splice(i, 1);
        indexRemove(link);
      }
    }
  },
};

let memorySub: (() => void) | null = null;
let clearSub: (() => void) | null = null;

export const relationshipEngine = {
  /**
   * Initialize memory subscription.
   */
  initialize(): void {
    if (!memorySub) {
      memorySub = memoryService.subscribe((memory) => {
        relationshipService.detectRelationships(memory);
      });
    }

    if (!clearSub) {
      clearSub = memoryService.subscribeClear(() => {
        relationshipService.clearHistory();
      });
    }
  },

  /**
   * Dispose memory subscription.
   */
  dispose(): void {
    if (memorySub) {
      memorySub();
      memorySub = null;
    }
    if (clearSub) {
      clearSub();
      clearSub = null;
    }
  },
};

// Automatic integration: initialize on load
relationshipEngine.initialize();
