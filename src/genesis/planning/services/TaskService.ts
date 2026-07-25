import { Task } from "../types";
import { TaskRepository } from "../repositories/TaskRepository";
import { InMemoryTaskRepository } from "../repositories/InMemoryTaskRepository";
import { planningValidationService } from "./PlanningValidationService";
import { eventService } from "../../events/event-service";
import { Events, DomainEventName } from "../../../contracts/events";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export class TaskService {
  private repository!: TaskRepository;

  constructor(repository?: TaskRepository) {
    this.repository = repository || new InMemoryTaskRepository();
  }

  public initialize(repository: TaskRepository): void {
    this.repository = repository;
  }

  public setRepository(repository: TaskRepository): void {
    this.repository = repository;
  }

  public createTask(input: Omit<Task, "id" | "createdAt" | "updatedAt">): Task {
    const task: Task = {
      ...input,
      id: uid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validation = planningValidationService.validateTask(task);
    if (!validation.isValid) {
      throw new Error(validation.error || "Task validation failed.");
    }

    const created = this.repository.createTask(task);

    eventService.record(
      Events.TASK_CREATED as DomainEventName,
      "Task Created",
      `Task "${created.title}" created for milestone ${created.milestoneId}`,
      null,
      null,
      { task: created },
    );

    return created;
  }

  public updateTask(
    id: string,
    input: Partial<Omit<Task, "id" | "milestoneId" | "createdAt" | "updatedAt">>,
  ): Task {
    const existing = this.repository.getTask(id);
    if (!existing) {
      throw new Error(`Task with ID ${id} does not exist.`);
    }

    const updated: Task = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    };

    const validation = planningValidationService.validateTask(updated);
    if (!validation.isValid) {
      throw new Error(validation.error || "Task validation failed.");
    }

    return this.repository.updateTask(updated);
  }

  public completeTask(id: string): Task {
    const existing = this.repository.getTask(id);
    if (!existing) {
      throw new Error(`Task with ID ${id} does not exist.`);
    }

    const updated: Task = {
      ...existing,
      status: "Completed",
      updatedAt: new Date().toISOString(),
    };

    const saved = this.repository.updateTask(updated);

    eventService.record(
      Events.TASK_COMPLETED as DomainEventName,
      "Task Completed",
      `Task "${saved.title}" completed`,
      null,
      null,
      { task: saved },
    );

    return saved;
  }

  public listTasks(milestoneId?: string): Task[] {
    return this.repository.listTasks(milestoneId);
  }
}

export const taskService = new TaskService();
