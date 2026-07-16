import { createServerFn } from "@tanstack/react-start";
import type { Project } from "../../shared/types/store-types";

export const persistAddProject = createServerFn({ method: "POST" })
  .validator(
    (input: { name: string; tag?: string; description?: string; color?: string; icon?: string }) =>
      input,
  )
  .handler(async ({ data: input }) => {
    const { projectRepository } = await import("../../persistence/repositories");
    return projectRepository.add(input);
  });

export const persistUpdateProject = createServerFn({ method: "POST" })
  .validator((input: { id: string; patch: Partial<Project> }) => input)
  .handler(async ({ data: { id, patch } }) => {
    const { projectRepository } = await import("../../persistence/repositories");
    projectRepository.update(id, patch);
  });

export const persistDeleteProject = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const { projectRepository } = await import("../../persistence/repositories");
    projectRepository.delete(id);
  });

export const persistTouchProject = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const { projectRepository } = await import("../../persistence/repositories");
    projectRepository.touch(id);
  });

export const projectsService = {
  getAll() {
    // Dynamic import to prevent client loading
    throw new Error("projectsService.getAll should be read via getInitialState on startup");
  },
  getById() {
    throw new Error("projectsService.getById should be read from reactive local store");
  },
  async add(input: {
    name: string;
    tag?: string;
    description?: string;
    color?: string;
    icon?: string;
  }): Promise<string> {
    return persistAddProject({ data: input });
  },
  async update(id: string, patch: Partial<Project>): Promise<void> {
    await persistUpdateProject({ data: { id, patch } });
  },
  async delete(id: string): Promise<void> {
    await persistDeleteProject({ data: id });
  },
  async touch(id: string): Promise<void> {
    await persistTouchProject({ data: id });
  },
};
