import { memoryService } from "../memory/memory-service";
import { storyService } from "../stories/story-service";
import { buildUnderstandingGraph } from "./builder";
import { Understanding } from "./types";
import { isBatching, markDirty, registerFlusher, unregisterFlusher } from "../batch";

export type UnderstandingListener = (understandings: Understanding[]) => void;

let understandings: Understanding[] = [];
const listeners = new Set<UnderstandingListener>();

let memorySub: (() => void) | null = null;
let storySub: (() => void) | null = null;
let clearSub: (() => void) | null = null;

let isInitialized = false;

const TRIVIAL_PHRASES = new Set([
  "hello",
  "thanks",
  "thank you",
  "😂",
  "nice",
  "okay",
  "ok",
  "good morning",
  "good afternoon",
  "good evening",
  "hi",
  "hey",
  "bye",
  "smile",
]);

function isTrivial(text: string): boolean {
  const clean = text
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:]/g, "");
  return TRIVIAL_PHRASES.has(clean);
}

function isMemoryTrivial(m: { title: string; description?: string | null }): boolean {
  const titleTrivial = isTrivial(m.title || "");
  const descTrivial = !m.description || isTrivial(m.description || "");
  return titleTrivial && descTrivial;
}

function isStoryTrivial(s: { title: string; summary: string }): boolean {
  const titleTrivial = isTrivial(s.title || "");
  const summaryTrivial = !s.summary || isTrivial(s.summary || "");
  return titleTrivial && summaryTrivial;
}

function rebuildGraph(): void {
  const memories = memoryService.getMemories().filter((m) => !isMemoryTrivial(m));
  const stories = storyService.getStories().filter((s) => !isStoryTrivial(s));
  const nextGraph = buildUnderstandingGraph(memories, stories, understandings);

  let changed = nextGraph.length !== understandings.length;
  if (!changed) {
    for (let i = 0; i < nextGraph.length; i++) {
      if (nextGraph[i] !== understandings[i]) {
        changed = true;
        break;
      }
    }
  }

  if (changed) {
    understandings = nextGraph;
    notifyListeners();
  }
}

/**
 * Rebuilds now, or once at the end of the current cognitive transaction.
 *
 * `buildUnderstandingGraph` is deterministic in memories and stories --
 * `existingGraph` is consulted only to preserve object identity for entries
 * that did not change -- so one rebuild against settled state produces exactly
 * the graph the last of many rebuilds would have produced. That was already
 * observable before batching: of 10,153 rebuilds across 140 events, only 143
 * changed anything; the other 98.6% were computed and discarded by the equality
 * check in `rebuildGraph`.
 */
function scheduleRebuild(): void {
  if (isBatching()) {
    markDirty("understanding");
    return;
  }
  rebuildGraph();
}

function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener(understandings);
    } catch (err) {
      console.error("Error executing understanding listener:", err);
    }
  });
}

export const understandingEngine = {
  /**
   * Initializes the understanding engine by subscribing to updates from the memory
   * validation engine and story service.
   */
  initialize(): void {
    if (isInitialized) return;

    isInitialized = true;

    registerFlusher("understanding", rebuildGraph);

    // 1. Perform initial build from whatever is currently in memory/stories
    rebuildGraph();

    // 2. Subscribe to validated memories updates
    memorySub = memoryService.subscribe(() => {
      scheduleRebuild();
    });

    // 3. Subscribe to stories updates (Created / Updated / Completed)
    storySub = storyService.subscribe(() => {
      scheduleRebuild();
    });

    // 4. Subscribe to clear history events
    clearSub = memoryService.subscribeClear(() => {
      understandings = [];
      notifyListeners();
    });
  },

  /**
   * Unsubscribes from all event sources and resets the initialization state.
   */
  dispose(): void {
    if (!isInitialized) return;

    unregisterFlusher("understanding");

    if (memorySub) {
      memorySub();
      memorySub = null;
    }
    if (storySub) {
      storySub();
      storySub = null;
    }
    if (clearSub) {
      clearSub();
      clearSub = null;
    }

    understandings = [];
    isInitialized = false;
  },

  /**
   * Returns the current immutable array of understandings.
   */
  getUnderstandings(): Understanding[] {
    return understandings;
  },

  /**
   * Retrieves a specific understanding node by its ID.
   */
  getUnderstanding(id: string): Understanding | undefined {
    return understandings.find((u) => u.id === id);
  },

  /**
   * Subscribes a callback listener to graph updates.
   */
  subscribe(listener: UnderstandingListener): () => void {
    listeners.add(listener);
    listener(understandings);
    return () => {
      listeners.delete(listener);
    };
  },
};

// Automatic integration: initialize on load
understandingEngine.initialize();
