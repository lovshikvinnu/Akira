import { ContextAssemblyResult } from "../../../../context/assembly/types";
import { Reflection, ReflectionStrategy } from "../types";

export class PatternReflectionStrategy implements ReflectionStrategy {
  public readonly id = "pattern-strategy";

  /**
   * Detects repeated themes or recurring information across multiple context items.
   * For this milestone, it checks for recurring context types across the collection,
   * producing pattern reflections with structured insights.
   */
  public reflect(context: ContextAssemblyResult): readonly Reflection[] {
    if (!context || !context.items) {
      return [];
    }

    const typeGroups = new Map<string, string[]>();

    for (const item of context.items) {
      const type = item.context.type;
      if (type) {
        if (!typeGroups.has(type)) {
          typeGroups.set(type, []);
        }
        typeGroups.get(type)!.push(item.context.id);
      }
    }

    const reflections: Reflection[] = [];
    const sortedTypes = Array.from(typeGroups.keys()).sort();

    for (const type of sortedTypes) {
      const ids = typeGroups.get(type)!;
      if (ids.length >= 2) {
        const pattern: Reflection = {
          id: `pattern-${type}`,
          strategyId: this.id,
          type: "Pattern",
          insight: `pattern:type-recurrence:${type}`,
        };
        reflections.push(Object.freeze(pattern));
      }
    }

    return Object.freeze(reflections);
  }
}
