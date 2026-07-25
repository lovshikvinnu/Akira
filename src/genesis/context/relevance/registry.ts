import { RelevanceStrategy } from "./types";

export class RelevanceStrategyRegistry {
  private readonly strategies = new Map<string, RelevanceStrategy>();

  /**
   * Registers a relevance strategy.
   * Throws an error if the strategy has a duplicate ID or invalid configuration.
   */
  public register(strategy: RelevanceStrategy): void {
    if (!strategy) {
      throw new Error("Cannot register null or undefined strategy");
    }
    if (!strategy.id) {
      throw new Error("Strategy must have a valid non-empty ID");
    }
    if (this.strategies.has(strategy.id)) {
      throw new Error(`Duplicate strategy ID registered: ${strategy.id}`);
    }
    this.strategies.set(strategy.id, strategy);
  }

  /**
   * Retrieves all registered strategies.
   *
   * Current Milestone Implementation Policy:
   * Strategies are returned sorted alphabetically by their ID to ensure deterministic execution order.
   */
  public getStrategies(): readonly RelevanceStrategy[] {
    const sorted = Array.from(this.strategies.values()).sort((a, b) => a.id.localeCompare(b.id));
    return Object.freeze(sorted);
  }

  /**
   * Clears the registered strategies map. Useful for isolated testing environments.
   */
  public clear(): void {
    this.strategies.clear();
  }
}

export const relevanceStrategyRegistry = new RelevanceStrategyRegistry();
