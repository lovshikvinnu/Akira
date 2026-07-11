import { understandingEngine } from "./engine";
import { Understanding } from "./types";
import { Insight, InsightFragment } from "./insight-types";
import { insightRules } from "./insight-rules";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export type InsightListener = (insights: Insight[]) => void;

let insights: Insight[] = [];
const listeners = new Set<InsightListener>();
let understandingSub: (() => void) | null = null;
let isInitialized = false;

// Helper to compare two string arrays
const arraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, index) => val === sortedB[index]);
};

/**
 * Builds the immutable Insight Graph, preserving references of unchanged insights.
 */
function buildInsightGraph(
  understandings: Understanding[],
  existingInsights: Insight[] = [],
): Insight[] {
  // 1. Evaluate rules and collect fragments
  const fragments: InsightFragment[] = [];
  for (const rule of insightRules) {
    try {
      fragments.push(...rule.evaluate(understandings));
    } catch (err) {
      console.error(`Error running insight rule ${rule.name}:`, err);
    }
  }

  const newInsights: Insight[] = [];
  const now = new Date().toISOString();

  // 2. Reconcile against existing insights to preserve identity
  for (const fragment of fragments) {
    const existing = existingInsights.find((ins) => ins.canonicalKey === fragment.canonicalKey);

    if (existing) {
      const supportingChanged = !arraysEqual(
        existing.supportingUnderstandingIds,
        fragment.supportingUnderstandingIds,
      );
      const confidenceChanged = existing.confidence !== fragment.confidence;

      if (supportingChanged || confidenceChanged) {
        newInsights.push({
          ...existing,
          confidence: fragment.confidence,
          supportingUnderstandingIds: fragment.supportingUnderstandingIds,
          updatedAt: now,
        });
      } else {
        newInsights.push(existing);
      }
    } else {
      newInsights.push({
        id: uid(),
        canonicalKey: fragment.canonicalKey,
        category: fragment.category,
        confidence: fragment.confidence,
        supportingUnderstandingIds: fragment.supportingUnderstandingIds,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return newInsights;
}

function rebuildInsights(understandings: Understanding[]): void {
  const nextInsights = buildInsightGraph(understandings, insights);

  // Check if graph changed
  let changed = nextInsights.length !== insights.length;
  if (!changed) {
    for (let i = 0; i < nextInsights.length; i++) {
      if (nextInsights[i] !== insights[i]) {
        changed = true;
        break;
      }
    }
  }

  if (changed) {
    insights = nextInsights;
    notifyListeners();
  }
}

function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener(insights);
    } catch (err) {
      console.error("Error executing insight listener:", err);
    }
  });
}

export const insightEngine = {
  /**
   * Initializes the insight engine by subscribing to updates from the understanding engine.
   */
  initialize(): void {
    if (isInitialized) return;
    isInitialized = true;

    // 1. Perform initial build based on current understandings
    rebuildInsights(understandingEngine.getUnderstandings());

    // 2. Subscribe to understanding updates
    understandingSub = understandingEngine.subscribe((understandings) => {
      rebuildInsights(understandings);
    });
  },

  /**
   * Disposes subscriptions and clears the in-memory insights graph.
   */
  dispose(): void {
    if (!isInitialized) return;

    if (understandingSub) {
      understandingSub();
      understandingSub = null;
    }

    insights = [];
    isInitialized = false;
  },

  /**
   * Returns the current array of immutable insights.
   */
  getInsights(): Insight[] {
    return insights;
  },

  /**
   * Retrieves a specific insight by ID.
   */
  getInsight(id: string): Insight | undefined {
    return insights.find((ins) => ins.id === id);
  },

  /**
   * Subscribes a listener to insight graph updates.
   */
  subscribe(listener: InsightListener): () => void {
    listeners.add(listener);
    // Emit current state immediately
    listener(insights);
    return () => {
      listeners.delete(listener);
    };
  },
};

// Automatic integration: initialize on load
insightEngine.initialize();
