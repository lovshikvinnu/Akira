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

  // Helper to check if two string arrays are equal
  const arraysEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, index) => val === sortedB[index]);
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

      if (memoryIdsChanged || storyIdsChanged || statusChanged || confidenceChanged) {
        // Something changed: return updated object reference with refreshed timestamp
        newGraph.push({
          ...existing,
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
