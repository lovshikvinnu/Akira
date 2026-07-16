import { createServerFn } from "@tanstack/react-start";

export const persistStartSession = createServerFn({ method: "POST" })
  .validator((input: { projectId: string; task?: string }) => input)
  .handler(async ({ data: { projectId, task } }) => {
    const { sessionRepository } = await import("../../persistence/repositories");
    sessionRepository.start(projectId, task);
  });

export const persistEndSession = createServerFn({ method: "POST" })
  .validator((notes?: string) => notes)
  .handler(async ({ data: notes }) => {
    const { sessionRepository } = await import("../../persistence/repositories");
    sessionRepository.end(notes);
  });

export const persistUpdateActiveTask = createServerFn({ method: "POST" })
  .validator((task: string) => task)
  .handler(async ({ data: task }) => {
    const { sessionRepository } = await import("../../persistence/repositories");
    sessionRepository.updateActiveTask(task);
  });

export const sessionsService = {
  getAll() {
    throw new Error("sessionsService.getAll should be read via getInitialState on startup");
  },
  getActive() {
    throw new Error("sessionsService.getActive should be read via getInitialState on startup");
  },
  async start(projectId: string, task?: string): Promise<void> {
    await persistStartSession({ data: { projectId, task } });
  },
  async end(notes?: string): Promise<void> {
    await persistEndSession({ data: notes });
  },
  async updateActiveTask(task: string): Promise<void> {
    await persistUpdateActiveTask({ data: task });
  },
};
