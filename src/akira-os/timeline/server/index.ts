import { createServerFn } from "@tanstack/react-start";

export const getTimelineEvents = createServerFn({ method: "GET" })
  .validator((data: any) => {
    return data as {
      limit: number;
      cursor?: { timestamp: string; id: string };
      projectId?: string;
      categories?: ("tasks" | "notes" | "sessions")[];
      sort?: "asc" | "desc";
    };
  })
  .handler(async ({ data }) => {
    const start = performance.now();
    const { timelineService } = await import("../service");
    const result = await timelineService.getEvents({
      limit: data.limit,
      cursor: data.cursor,
      filterProjectIds: data.projectId ? [data.projectId] : undefined,
      filterCategories: data.categories,
      sortDirection: data.sort,
    });

    const duration = performance.now() - start;
    console.log(`[Observability] Database cursor fetch executed in ${duration.toFixed(2)}ms`);

    return result;
  });
