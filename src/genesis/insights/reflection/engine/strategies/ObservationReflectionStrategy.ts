import { ContextAssemblyResult } from "../../../context/assembly/types";
import { Reflection, ReflectionStrategy } from "../types";

export class ObservationReflectionStrategy implements ReflectionStrategy {
  public readonly id = "observation-strategy";

  /**
   * Produces factual observations directly from individual context items.
   * Maps context content directly into the structured reflection without natural-language templates.
   */
  public reflect(context: ContextAssemblyResult): readonly Reflection[] {
    if (!context || !context.items) {
      return [];
    }

    const reflections: Reflection[] = [];

    for (const item of context.items) {
      const candidate = item.context;
      const observation: Reflection = {
        id: `observation-${candidate.providerId}-${candidate.id}`,
        strategyId: this.id,
        type: "Observation",
        insight: candidate.content,
      };
      reflections.push(Object.freeze(observation));
    }

    return Object.freeze(reflections);
  }
}
