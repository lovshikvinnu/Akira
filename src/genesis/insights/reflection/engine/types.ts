import { ContextAssemblyResult } from "../../../context/assembly/types";

export type ReflectionType = "Observation" | "Pattern" | "Contradiction";

export interface Reflection {
  readonly id: string;
  readonly strategyId: string;
  readonly type: ReflectionType;
  readonly insight: string;
}

export interface ReflectionCollection {
  readonly reflections: readonly Reflection[];
}

export interface ReflectionResult {
  readonly items: readonly Reflection[];
}

export interface ReflectionStrategy {
  readonly id: string;
  reflect(context: ContextAssemblyResult): readonly Reflection[];
}
