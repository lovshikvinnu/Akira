// src/genesis/planning/health/createHealthRuleEngine.ts
import { HealthRuleEngine } from "./HealthRuleEngine";

/** Factory returning a new HealthRuleEngine instance. */
export function createHealthRuleEngine(): HealthRuleEngine {
  return new HealthRuleEngine();
}
