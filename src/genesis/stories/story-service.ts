import { Story } from "./types";
import { getRetentionPolicy, trimOldest } from "../retention/policy";

export type StoryListener = (event: {
  type: "Created" | "Updated" | "Completed";
  story: Story;
}) => void;
const listeners = new Set<StoryListener>();

const storyCache: Story[] = [];

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const storyService = {
  /**
   * Subscribe to new or updated stories in the system.
   */
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
  },

  /**
   * Create a new story.
   */
  createStory(
    input: Omit<
      Story,
      "id" | "createdAt" | "updatedAt" | "relatedMemoryIds" | "relatedRelationshipIds"
    >,
  ): Story {
    const story: Story = {
      id: uid(),
      title: input.title,
      summary: input.summary,
      status: input.status,
      relatedMemoryIds: [],
      relatedRelationshipIds: [],
      ruleProvenance: input.ruleProvenance,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    storyCache.push(story);
    // Stories are created in order, so the front is the least recently created.
    trimOldest(storyCache, getRetentionPolicy().maxStories);
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

    if (patch.status === "Completed" && oldStory.status !== "Completed") {
      this.notify("Completed", updated);
    } else {
      this.notify("Updated", updated);
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
   * Add a relationship ID reference to a story's narrative.
   */
  addRelationshipToStory(storyId: string, relationshipId: string): void {
    const story = storyCache.find((s) => s.id === storyId);
    if (!story) return;
    if (story.relatedRelationshipIds.includes(relationshipId)) return;

    this.updateStory(storyId, {
      relatedRelationshipIds: [...story.relatedRelationshipIds, relationshipId],
    });
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
        continue;
      }
      story.relatedMemoryIds = remaining;
      story.updatedAt = new Date().toISOString();
    }
  },

  notify(type: "Created" | "Updated" | "Completed", story: Story): void {
    listeners.forEach((listener) => {
      try {
        listener({ type, story });
      } catch (err) {
        console.error("Error executing story listener callback:", err);
      }
    });
  },
};
