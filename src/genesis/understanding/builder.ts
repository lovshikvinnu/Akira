import { Memory } from "../validation/types";
import { Story } from "../stories/types";
import { Understanding, UnderstandingFragment } from "./types";
import { rules } from "./rules";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Deterministically builds the complete Understanding Graph from memories and stories,
 * while preserving identical object references for understandings that did not change.
 */
export function buildUnderstandingGraph(
  memories: Memory[],
  stories: Story[],
  existingGraph: Understanding[] = [],
): Understanding[] {
  // 1. Gather understanding fragments from all rules
  const fragments: UnderstandingFragment[] = [];
  for (const rule of rules) {
    try {
      fragments.push(...rule.evaluate(memories, stories));
    } catch (err) {
      console.error(`Error running rule ${rule.name}:`, err);
    }
  }

  // 2. Merge fragments with identical canonicalKey
  const mergedMap = new Map<string, UnderstandingFragment>();
  for (const fragment of fragments) {
    const key = fragment.canonicalKey;
    if (!mergedMap.has(key)) {
      mergedMap.set(key, {
        canonicalKey: fragment.canonicalKey,
        label: fragment.label,
        category: fragment.category,
        confidence: fragment.confidence,
        status: fragment.status,
        supportingMemoryIds: [...fragment.supportingMemoryIds],
        supportingStoryIds: [...fragment.supportingStoryIds],
      });
    } else {
      const merged = mergedMap.get(key)!;

      // Merge memory IDs
      for (const memId of fragment.supportingMemoryIds) {
        if (!merged.supportingMemoryIds.includes(memId)) {
          merged.supportingMemoryIds.push(memId);
        }
      }

      // Merge story IDs
      for (const storyId of fragment.supportingStoryIds) {
        if (!merged.supportingStoryIds.includes(storyId)) {
          merged.supportingStoryIds.push(storyId);
        }
      }

      // Keep the first label offered. Fragments sharing a key describe one
      // subject, so a later one cannot rename it -- and a rule that supplies
      // no label must not blank a label another fragment already provided.
      if (!merged.label && fragment.label) {
        merged.label = fragment.label;
      }

      // Reconcile status: Active takes precedence
      if (fragment.status === "Active" || merged.status === "Active") {
        merged.status = "Active";
      } else if (fragment.status === "Completed" || merged.status === "Completed") {
        merged.status = "Completed";
      } else {
        merged.status = fragment.status;
      }

      // Reconcile confidence: High > Medium > Low or numeric comparison
      const confOrder = { High: 3, Medium: 2, Low: 1 };
      const currentConfValue =
        typeof merged.confidence === "number"
          ? merged.confidence
          : confOrder[merged.confidence as keyof typeof confOrder] || 1;
      const fragConfValue =
        typeof fragment.confidence === "number"
          ? fragment.confidence
          : confOrder[fragment.confidence as keyof typeof confOrder] || 1;
      if (fragConfValue > currentConfValue) {
        merged.confidence = fragment.confidence;
      }
    }
  }

  /**
   * Multiset equality, counted rather than sorted.
   *
   * This answers one question -- "did this understanding's supporting ids
   * change" -- and it is asked twice per existing understanding on every
   * rebuild, which happens once per user action. The previous implementation
   * copied both arrays and sorted both copies to answer it. At the retention
   * ceiling the two understandings hold 501 and 500 supporting memory ids, so
   * that was four array copies and four sorts of ~500 elements per action, and
   * it measured 0.42-0.45 ms of a 2.33-3.36 ms understanding phase.
   *
   * Counting is the same predicate, not a cheaper approximation of it. Sorting
   * both sides and comparing element-wise is true exactly when the two arrays
   * are permutations of each other; decrementing a tally of `a` once per
   * element of `b`, with the lengths already known equal, is true under exactly
   * the same condition. Duplicates are preserved rather than collapsed, which
   * is why this is a count and not a `Set` -- a `Set` would call [x, x, y] and
   * [x, y, y] equal, and the sorted comparison does not. Nothing here relies on
   * the ids happening to be unique today.
   */
  const arraysEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const remaining = new Map<string, number>();
    for (const value of a) remaining.set(value, (remaining.get(value) ?? 0) + 1);
    for (const value of b) {
      const count = remaining.get(value);
      if (count === undefined || count === 0) return false;
      remaining.set(value, count - 1);
    }
    return true;
  };

  const newGraph: Understanding[] = [];
  const now = new Date().toISOString();

  // 3. Match against existing understandings to preserve identity and detect changes
  for (const [key, merged] of mergedMap.entries()) {
    const existing = existingGraph.find((u) => u.canonicalKey === key);

    if (existing) {
      const memoryIdsChanged = !arraysEqual(
        existing.supportingMemoryIds,
        merged.supportingMemoryIds,
      );
      const storyIdsChanged = !arraysEqual(existing.supportingStoryIds, merged.supportingStoryIds);
      const statusChanged = existing.status !== merged.status;
      const confidenceChanged = existing.confidence !== merged.confidence;
      // A rename changes nothing else about the understanding, so without this
      // the graph would keep showing the project's old name indefinitely.
      const labelChanged = existing.label !== merged.label;

      if (
        memoryIdsChanged ||
        storyIdsChanged ||
        statusChanged ||
        confidenceChanged ||
        labelChanged
      ) {
        // Something changed: return updated object reference with refreshed timestamp
        newGraph.push({
          ...existing,
          label: merged.label,
          confidence: merged.confidence,
          status: merged.status,
          supportingMemoryIds: merged.supportingMemoryIds,
          supportingStoryIds: merged.supportingStoryIds,
          updatedAt: now,
        });
      } else {
        // Unchanged: reuse exact existing object reference
        newGraph.push(existing);
      }
    } else {
      // Brand new understanding key detected
      newGraph.push({
        id: uid(),
        canonicalKey: merged.canonicalKey,
        label: merged.label,
        category: merged.category,
        confidence: merged.confidence,
        status: merged.status,
        supportingMemoryIds: merged.supportingMemoryIds,
        supportingStoryIds: merged.supportingStoryIds,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return newGraph;
}
