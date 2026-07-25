import { ContextAssemblyResult } from "../../../context/assembly/types";
import { Reflection, ReflectionStrategy } from "../types";

export class ContradictionReflectionStrategy implements ReflectionStrategy {
  public readonly id = "contradiction-strategy";

  /**
   * Detects directly conflicting information within the assembled context.
   * Compares items sharing the same normalized ID and checks for differences in content.
   */
  public reflect(context: ContextAssemblyResult): readonly Reflection[] {
    if (!context || !context.items) {
      return [];
    }

    const reflections: Reflection[] = [];
    const seen = new Map<string, { content: string; providerId: string }>();

    // Sort items to ensure deterministic execution
    const sortedItems = [...context.items].sort((a, b) => a.context.id.localeCompare(b.context.id));

    for (const item of sortedItems) {
      const candidate = item.context;
      const entityId = candidate.id;

      if (seen.has(entityId)) {
        const previous = seen.get(entityId)!;
        if (previous.content !== candidate.content) {
          const contradiction: Reflection = {
            id: `contradiction-${entityId}`,
            strategyId: this.id,
            type: "Contradiction",
            insight: `contradiction:conflict:${previous.providerId}:${candidate.providerId}`,
          };
          reflections.push(Object.freeze(contradiction));
        }
      } else {
        seen.set(entityId, {
          content: candidate.content,
          providerId: candidate.providerId,
        });
      }
    }

    return Object.freeze(reflections);
  }
}
