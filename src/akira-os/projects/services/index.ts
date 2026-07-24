import type { Project } from "../../../shared/types/store-types";
import {
  persistAddProject,
  persistUpdateProject,
  persistDeleteProject,
  persistTouchProject,
} from "../server";

export const projectsService = {
  getAll() {
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
