import { Project } from "../../shared/types/store-types";

export interface ProjectRepository {
  getAll(): Project[];
  getById(id: string): Project | undefined;
  add(input: {
    id?: string;
    name: string;
    tag?: string;
    description?: string;
    color?: string;
    icon?: string;
  }): string;
  update(id: string, patch: Partial<Project>): void;
  delete(id: string): void;
  touch(id: string): void;
}
