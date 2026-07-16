import { Note } from "../../shared/types/store-types";

export interface NoteRepository {
  getAll(): Note[];
  getById(id: string): Note | undefined;
  add(
    input:
      | string
      | {
          id?: string;
          title?: string;
          content: string;
          tags?: string[];
          pinned?: boolean;
          favorite?: boolean;
          projectId?: string | null;
        },
  ): string;
  update(id: string, patch: Partial<Note>): void;
  delete(id: string): void;
}
