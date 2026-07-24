import { createServerFn } from "@tanstack/react-start";

export const persistStartSession = createServerFn({ method: "POST" })
  .validator((input: { projectId: string; task?: string }) => input)
  .handler(async ({ data: { projectId, task } }) => {
    const { sessionRepository } = await import("../../../persistence/repositories");
    sessionRepository.start(projectId, task);
  });

export const persistEndSession = createServerFn({ method: "POST" })
  .validator((notes?: string) => notes)
  .handler(async ({ data: notes }) => {
    const { sessionRepository } = await import("../../../persistence/repositories");
    sessionRepository.end(notes);
  });

export const persistUpdateActiveTask = createServerFn({ method: "POST" })
  .validator((task: string) => task)
  .handler(async ({ data: task }) => {
    const { sessionRepository } = await import("../../../persistence/repositories");
    sessionRepository.updateActiveTask(task);
  });
