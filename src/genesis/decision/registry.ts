import { DecisionStrategy } from "./types";

/**
 * DecisionStrategyRegistry
 *
 * Responsible only for managing decision strategies.
 * Maintains a deterministic alphabetical strategy ordering policy.
 * Contains no decision logic.
 */
export class DecisionStrategyRegistry {
  private readonly strategies = new Map<string, DecisionStrategy>();

  /**
   * Registers a decision strategy.
   * Throws an error if the strategy is null/undefined, missing an ID, or has a duplicate ID.
   */
  public register(strategy: DecisionStrategy): void {
    if (!strategy) {
      throw new Error("Cannot register null or undefined strategy");
    }
    if (!strategy.id || typeof strategy.id !== "string" || strategy.id.trim() === "") {
      throw new Error("Strategy must have a valid non-empty ID");
    }
    if (this.strategies.has(strategy.id)) {
      throw new Error(`Duplicate strategy ID registered: ${strategy.id}`);
    }
    this.strategies.set(strategy.id, strategy);
  }

  /**
   * Retrieves all registered strategies in deterministic order.
   *
   * Policy:
   * Strategies are returned sorted alphabetically by their ID to ensure deterministic execution order.
   */
  public getStrategies(): readonly DecisionStrategy[] {
    const sorted = Array.from(this.strategies.values()).sort((a, b) => a.id.localeCompare(b.id));
    return Object.freeze(sorted);
  }
}
