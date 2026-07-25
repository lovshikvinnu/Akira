import { Dependency } from "../types";
import { DependencyRepository } from "../repositories/DependencyRepository";
import { InMemoryDependencyRepository } from "../repositories/InMemoryDependencyRepository";
import { planningValidationService } from "./PlanningValidationService";
import { eventService } from "../../events/event-service";
import { Events, DomainEventName } from "../../../contracts/events";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export class DependencyService {
  private repository!: DependencyRepository;

  constructor(repository?: DependencyRepository) {
    this.repository = repository || new InMemoryDependencyRepository();
  }

  public initialize(repository: DependencyRepository): void {
    this.repository = repository;
  }

  public setRepository(repository: DependencyRepository): void {
    this.repository = repository;
  }

  public createDependency(input: Omit<Dependency, "id">): Dependency {
    const dependency: Dependency = {
      ...input,
      id: uid(),
    };

    const validation = planningValidationService.validateDependency(dependency);
    if (!validation.isValid) {
      throw new Error(validation.error || "Dependency validation failed.");
    }

    const created = this.repository.createDependency(dependency);

    eventService.record(
      Events.DEPENDENCY_CREATED as DomainEventName,
      "Dependency Created",
      `Task dependency created: ${created.predecessorTaskId} -> ${created.successorTaskId} (${created.type})`,
      null,
      null,
      { dependency: created },
    );

    return created;
  }

  public removeDependency(id: string): void {
    const existing = this.repository.getDependency(id);
    if (!existing) {
      throw new Error(`Dependency with ID ${id} does not exist.`);
    }

    this.repository.removeDependency(id);

    eventService.record(
      Events.DEPENDENCY_REMOVED as DomainEventName,
      "Dependency Removed",
      `Task dependency removed: ${existing.predecessorTaskId} -> ${existing.successorTaskId}`,
      null,
      null,
      { dependency: existing },
    );
  }

  public listDependencies(): Dependency[] {
    return this.repository.listDependencies();
  }
}

export const dependencyService = new DependencyService();
