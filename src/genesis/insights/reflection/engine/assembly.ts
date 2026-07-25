import { ReflectionCollection, ReflectionResult } from "./types";

export class ReflectionAssemblyService {
  /**
   * Accepts a ReflectionCollection and packages it into a ReflectionResult.
   *
   * Responsibility is packaging only. It does not recreate, transform, or modify
   * individual Reflection instances, maintaining the exact ordering and properties.
   */
  public assemble(collection: ReflectionCollection): ReflectionResult {
    if (!collection) {
      throw new Error("ReflectionCollection is required");
    }

    return Object.freeze({
      items: collection.reflections,
    });
  }
}
