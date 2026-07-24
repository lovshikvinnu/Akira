import { persistStartSession, persistEndSession, persistUpdateActiveTask } from "../server";

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
