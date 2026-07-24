import type { Note } from "../../../shared/types/store-types";
import { persistAddNote, persistUpdateNote, persistDeleteNote } from "../server";

type AddNoteInput =
  | string
  | {
      title?: string;
      content: string;
      tags?: string[];
      pinned?: boolean;
      favorite?: boolean;
      projectId?: string | null;
    };

export const notesService = {
  getAll() {
    throw new Error("notesService.getAll should be read via getInitialState on startup");
  },
  getById() {
    throw new Error("notesService.getById should be read from reactive local store");
  },
  async add(input: AddNoteInput): Promise<string> {
    return persistAddNote({ data: input });
  },
  async update(id: string, patch: Partial<Note>): Promise<void> {
    await persistUpdateNote({ data: { id, patch } });
  },
  async delete(id: string): Promise<void> {
    await persistDeleteNote({ data: id });
  },
};
