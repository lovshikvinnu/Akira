import { Story } from "./types";
import { getRetentionPolicy, trimOldest } from "../retention/policy";
import { isBatching, markDirty, registerFlusher } from "../batch";

export type StoryListener = (event: {
  type: "Created" | "Updated" | "Completed";
  story: Story;
  /**
   * Members this update removed, if any.
   *
   * Carried on the event because a subscriber cannot recover it: once the
   * update lands, the story no longer mentions them and nothing else records
   * that it ever did. `importanceBuilder` needs exactly this -- a memory's
   * Story Influence signal is derived from a membership, so when the
   * membership ends the signal has to be recomputed, and recalculating the
   * story's *current* members can never reach a memory that just left it.
   */
  departedMemoryIds?: string[];
}) => void;
const listeners = new Set<StoryListener>();

/**
 * Told when a whole story is evicted, with the members it held.
 *
 * Separate from `StoryListener` on purpose. An eviction is not an update, and
 * the story listeners are read by UI that appends `event.story` to a visible
 * list -- announcing a removal through that channel would put a deleted story
 * on screen. This carries only what a derived store needs to clean up after
 * itself: the members, whose own memories are still alive.
 */
export type StoryEvictionListener = (evicted: { story: Story; memberIds: string[] }) => void;
const evictionListeners = new Set<StoryEvictionListener>();

const storyCache: Story[] = [];

/**
 * Membership index: story id -> the memory ids that story currently holds.
 *
 * A projection of `relatedMemoryIds`, never a second source of truth. The array
 * on the story stays canonical -- it is what rules read for `.length`, what the
 * Brain Inspector renders, and what every test asserts against -- and this Map
 * exists only so that "does this story contain this memory?" costs a Set probe
 * instead of a scan of up to `maxMemoriesPerStory` entries.
 *
 * It earns its keep on the hot path. At 500 memories one completed task ran
 * that question roughly 540,000 times across four call sites: twice per
 * detected relationship while clustering, once per memory in the recall
 * rebuild, again per memory inside the recall rules, and once per member during
 * importance recalculation.
 *
 * SYNCHRONISATION
 * ---------------
 * Every write rebuilds the Set from the canonical array rather than patching it
 * incrementally. That is deliberate: `addMemoryToStory` both appends and
 * *removes* -- the `maxMemoriesPerStory` window slices off the oldest members --
 * so an append-only index would answer true for members that had already aged
 * out. Deriving from the array cannot drift from it.
 *
 * The maintenance points are the five places story state can change:
 * `createStory` (including the `maxStories` eviction that has no other hook),
 * `updateStory` (the choke point every membership patch flows through),
 * `forgetMemories` (which bypasses `updateStory` and can delete a story
 * outright), and `clearHistory`. Reconstruction needs no special handling: it
 * clears and replays through those same paths.
 */
const memberIndex = new Map<string, Set<string>>();

/**
 * Stories touched by a relationship during the open transaction.
 *
 * One completed task detects a relationship against every other memory in its
 * project, and each detection announced a story-wide change. Those events carry
 * no distinct information -- a relationship append does not alter the story's
 * membership, so every consumer re-derived the same answer from the same
 * evidence. Collapsing them to one event per story is what makes the count per
 * action constant instead of linear in project size.
 */
const touchedStoryIds = new Set<string>();
let touchFlusherRegistered = false;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Emits one "Updated" per story touched during the transaction.
 *
 * Declared outside the service literal so it can be registered from inside a
 * method without depending on the literal being fully constructed. A story that
 * retention removed mid-transaction is dropped rather than resurrected.
 */
function flushTouchedStories(): void {
  if (touchedStoryIds.size === 0) return;

  const ids = [...touchedStoryIds];
  touchedStoryIds.clear();

  for (const id of ids) {
    if (!storyCache.some((s) => s.id === id)) continue;
    storyService.updateStory(id, {});
  }
}

export const storyService = {
  /**
   * Subscribe to new or updated stories in the system.
   */
  subscribeEviction(listener: StoryEvictionListener): () => void {
    evictionListeners.add(listener);
    return () => {
      evictionListeners.delete(listener);
    };
  },

  subscribe(listener: StoryListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Get all active and archived stories.
   */
  getStories(): Story[] {
    return storyCache;
  },

  /**
   * Clear stories log cache.
   */
  clearHistory(): void {
    storyCache.length = 0;
    memberIndex.clear();
  },

  /**
   * Create a new story.
   */
  createStory(input: Omit<Story, "id" | "createdAt" | "updatedAt" | "relatedMemoryIds">): Story {
    const story: Story = {
      id: uid(),
      title: input.title,
      summary: input.summary,
      kind: input.kind,
      relatedProjectId: input.relatedProjectId ?? null,
      status: input.status,
      relatedMemoryIds: [],
      ruleProvenance: input.ruleProvenance,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    storyCache.push(story);
    memberIndex.set(story.id, new Set());

    // Stories are created in order, so the front is the least recently created.
    //
    // The return value matters here and is the only signal that a story has
    // gone. Discarding it would leave the index holding entries for stories
    // that no longer exist -- a slow leak -- and would strand every signal a
    // derived store computed from membership in the evicted arc.
    const evictedStories = trimOldest(storyCache, getRetentionPolicy().maxStories);
    for (const evicted of evictedStories) {
      memberIndex.delete(evicted.id);
      // The members outlive the story. Anything that derived state from their
      // membership has to be told, or it keeps evidence of an arc that is no
      // longer in the cache -- measured at 12 orphaned Story Influence signals
      // of 42 memories with `maxStories` at 3, reproduced identically across
      // reconstruction. This path never touches `updateStory`, so the departed
      // ids it computes cannot reach here.
      evictionListeners.forEach((listener) => {
        try {
          listener({ story: evicted, memberIds: evicted.relatedMemoryIds });
        } catch (err) {
          console.error("Error executing story eviction listener callback:", err);
        }
      });
    }

    this.notify("Created", story);
    return story;
  },

  /**
   * Update details of an existing story.
   */
  updateStory(id: string, patch: Partial<Omit<Story, "id" | "createdAt">>): Story | null {
    const idx = storyCache.findIndex((s) => s.id === id);
    if (idx === -1) return null;

    const oldStory = storyCache[idx];
    const updated = {
      ...oldStory,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    storyCache[idx] = updated;

    // Rebuilt unconditionally rather than only when `patch.relatedMemoryIds` is
    // present. This is the one method every membership change routes through,
    // and it is public with an open patch shape, so keying off the patch would
    // make a future caller's correctness depend on remembering this index
    // exists. Two calls per event at steady state makes the cost of being
    // unconditional irrelevant.
    memberIndex.set(id, new Set(updated.relatedMemoryIds));

    // Who this update dropped. The sliding window in `addMemoryToStory` is the
    // only path that removes a member while the memory itself stays alive, and
    // it routes through here like every other membership change.
    const stillMember = new Set(updated.relatedMemoryIds);
    const departed = oldStory.relatedMemoryIds.filter((memoryId) => !stillMember.has(memoryId));

    if (patch.status === "Completed" && oldStory.status !== "Completed") {
      this.notify("Completed", updated, departed);
    } else {
      this.notify("Updated", updated, departed);
    }
    return updated;
  },

  /**
   * Add a memory ID reference to a story's narrative.
   */
  addMemoryToStory(storyId: string, memoryId: string): void {
    const story = storyCache.find((s) => s.id === storyId);
    if (!story) return;
    if (story.relatedMemoryIds.includes(memoryId)) return;

    // A single long-running project would otherwise accumulate memory ids
    // without limit even though the story count stays flat. Oldest drop first.
    const nextIds = [...story.relatedMemoryIds, memoryId];
    const max = getRetentionPolicy().maxMemoriesPerStory;

    this.updateStory(storyId, {
      relatedMemoryIds: nextIds.length > max ? nextIds.slice(nextIds.length - max) : nextIds,
    });
  },

  /**
   * Marks a story as having gained a detected relationship between two of its
   * memories.
   *
   * This used to append the relationship id to a `relatedRelationshipIds` array
   * on the story. That array had no reader anywhere -- not in cognition, not in
   * persistence (stories are runtime-only), not in the Brain Inspector, which
   * sources relationship provenance from `relationshipService` instead. It was
   * write-only state, and an expensive kind: one append per relationship meant
   * an O(R) membership scan and an O(R) copy against an array that reached
   * N(N-1)/2 entries -- 5,050 of them at 101 memories -- with no retention cap
   * and no pruning when a memory was evicted. It was 84% of the remaining
   * per-event cost after the notification cascade was fixed.
   *
   * Relationship provenance is owned by `relationshipService`, which already
   * holds every relationship, already bounds the set at `maxRelationships`, and
   * is already what reads of it go through.
   *
   * The notification stays. The story genuinely did gain a relationship between
   * two of its memories, and that event is what `identityBuilder` accrues
   * confidence from -- one reinforcement per detected relationship. Dropping it
   * would have changed identity semantics, which is a separate decision from
   * where provenance lives. Relationship ids are freshly generated per
   * detection, so the guard this replaces never once suppressed a notification:
   * the event stream is unchanged.
   */
  touchStory(storyId: string): void {
    const story = storyCache.find((s) => s.id === storyId);
    if (!story) return;

    if (isBatching()) {
      if (!touchFlusherRegistered) {
        registerFlusher("stories", () => flushTouchedStories());
        touchFlusherRegistered = true;
      }
      touchedStoryIds.add(storyId);
      markDirty("stories");
      return;
    }

    this.updateStory(storyId, {});
  },

  /**
   * True when `storyId` currently holds `memoryId`.
   *
   * The predicate form exists for the clustering rule, which asks whether a
   * given story holds either end of a relationship. Expressing that as two
   * `findStoryContainingMemory` calls would return the first story holding the
   * source rather than the first story holding either end -- the same answer
   * whenever a memory belongs to one arc, which is what the rules produce
   * today, but a different one the moment that stops being true. Preserving the
   * caller's iteration keeps the change to a lookup cost.
   */
  storyContainsMemory(storyId: string, memoryId: string): boolean {
    return memberIndex.get(storyId)?.has(memoryId) ?? false;
  },

  /**
   * The first story holding `memoryId`, in cache order, or undefined.
   *
   * Cache order is the contract: this replaces
   * `getStories().find((s) => s.relatedMemoryIds.includes(memoryId))` at three
   * call sites and must resolve ties identically. Iterating `storyCache` and
   * probing the index preserves that exactly, while turning an O(members) scan
   * into an O(1) lookup. The outer loop stays O(stories), which is bounded at
   * `maxStories` and is one or two in practice.
   */
  findStoryContainingMemory(memoryId: string): Story | undefined {
    for (const story of storyCache) {
      if (memberIndex.get(story.id)?.has(memoryId)) return story;
    }
    return undefined;
  },

  /** Test helper: the index as plain data, for consistency assertions. */
  getMembershipIndexSnapshot(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [storyId, members] of memberIndex) out[storyId] = [...members];
    return out;
  },

  /**
   * Notify subscribers of story events.
   */
  /**
   * Drops references to memories retention has evicted.
   *
   * A story whose every memory has aged out no longer describes anything, so it
   * is removed rather than left as an empty arc. If the project sees activity
   * again, the clustering rule creates a fresh one.
   */
  forgetMemories(evictedMemoryIds: string[]): void {
    if (evictedMemoryIds.length === 0) return;
    const evicted = new Set(evictedMemoryIds);

    for (let i = storyCache.length - 1; i >= 0; i--) {
      const story = storyCache[i];
      const remaining = story.relatedMemoryIds.filter((id) => !evicted.has(id));
      if (remaining.length === story.relatedMemoryIds.length) continue;

      if (remaining.length === 0) {
        storyCache.splice(i, 1);
        memberIndex.delete(story.id);
        continue;
      }
      story.relatedMemoryIds = remaining;
      memberIndex.set(story.id, new Set(remaining));
      story.updatedAt = new Date().toISOString();
    }
  },

  notify(
    type: "Created" | "Updated" | "Completed",
    story: Story,
    departedMemoryIds: string[] = [],
  ): void {
    listeners.forEach((listener) => {
      try {
        listener({ type, story, departedMemoryIds });
      } catch (err) {
        console.error("Error executing story listener callback:", err);
      }
    });
  },
};
