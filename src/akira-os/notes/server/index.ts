import { createServerFn } from "@tanstack/react-start";
import type { Note } from "../../../shared/types/store-types";

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

export const persistAddNote = createServerFn({ method: "POST" })
  .validator((input: AddNoteInput) => input)
  .handler(async ({ data: input }) => {
    const { noteRepository } = await import("../../../persistence/repositories");
    return noteRepository.add(input);
  });

export const persistUpdateNote = createServerFn({ method: "POST" })
  .validator((input: { id: string; patch: Partial<Note> }) => input)
  .handler(async ({ data: { id, patch } }) => {
    const { noteRepository } = await import("../../../persistence/repositories");
    noteRepository.update(id, patch);
  });

export const persistDeleteNote = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const { noteRepository } = await import("../../../persistence/repositories");
    noteRepository.delete(id);
  });
