import { Dependency } from "../types";
import { DependencyRepository } from "./DependencyRepository";

export class InMemoryDependencyRepository implements DependencyRepository {
  private dependencies: Map<string, Dependency> = new Map();

  public getDependency(id: string): Dependency | null {
    return this.dependencies.get(id) || null;
  }

  public createDependency(dependency: Dependency): Dependency {
    this.dependencies.set(dependency.id, { ...dependency });
    return this.getDependency(dependency.id)!;
  }

  public removeDependency(id: string): void {
    this.dependencies.delete(id);
  }

  public listDependencies(): Dependency[] {
    return Array.from(this.dependencies.values());
  }

  public clear(): void {
    this.dependencies.clear();
  }
}
