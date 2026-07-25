import { Dependency } from "../types";

export interface DependencyRepository {
  getDependency(id: string): Dependency | null;
  createDependency(dependency: Dependency): Dependency;
  removeDependency(id: string): void;
  listDependencies(): Dependency[];
}
