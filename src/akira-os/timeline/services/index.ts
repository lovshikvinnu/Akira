import { timelineService as serverTimelineService } from "../service";
import { getTimelineEvents } from "../server";

export const timelineService = {
  initialize() {
    if (typeof window !== "undefined") {
      return;
    }
    return serverTimelineService.initialize();
  },
  shutdown() {
    if (typeof window !== "undefined") {
      return;
    }
    return serverTimelineService.shutdown();
  },
  async getEvents(
    params: {
      limit: number;
      cursor?: { timestamp: string; id: string };
      projectId?: string;
      categories?: ("tasks" | "notes" | "sessions")[];
      sort?: "asc" | "desc";
    },
    signal?: AbortSignal,
  ) {
    return getTimelineEvents({ data: params, signal });
  },
};
