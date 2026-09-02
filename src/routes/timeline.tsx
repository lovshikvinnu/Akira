import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  Search,
  ArrowUpDown,
  X,
  RotateCw,
  Activity,
  ListTodo,
  FileText,
  Timer,
} from "lucide-react";

import { Shell, PageHeader } from "@/app/shell/Shell";
import { useAkira, timelineService } from "@/akira-os";
import { TimelineList, TimelineUIState } from "@/app/ui/timeline/TimelineList";
import { DetailDrawer } from "@/app/ui/timeline/DetailDrawer";
import { TimelineCursor, TimelineEvent, TimelineQueryResult } from "@/akira-os/timeline/types";
import { RendererRegistry } from "@/app/ui/timeline/RendererRegistry";
import { TimelineErrorBoundary } from "@/app/ui/timeline/TimelineErrorBoundary";

// 2. URL Parameter Validation Schema
const timelineSearchSchema = z.object({
  search: z.string().optional().catch(""),
  projectId: z.string().optional().catch(""),
  categories: z
    .array(z.enum(["tasks", "notes", "sessions"]))
    .optional()
    .catch(undefined),
  sort: z.enum(["asc", "desc"]).default("desc").catch("desc"),
  v: z.number().default(1).catch(1), // URL Schema Versioning
});

export const Route = createFileRoute("/timeline")({
  validateSearch: timelineSearchSchema,
  head: () => ({
    meta: [
      { title: "Timeline — AKIRA" },
      { name: "description", content: "Interactive activity ledger of your progress." },
    ],
  }),
  component: TimelinePage,
});

function TimelinePage() {
  const { search, projectId, categories, sort } = Route.useSearch() as any;
  const navigate = useNavigate();
  const projects = useAkira((s) => s.projects);

  const [searchText, setSearchText] = useState(search || "");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Synchronize local search text with URL changes
  useEffect(() => {
    setSearchText(search || "");
  }, [search]);

  // Debounce typing for search param
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText !== (search || "")) {
        navigate({ search: (prev: any) => ({ ...prev, search: searchText || undefined }) } as any);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchText, search, navigate]);

  // 3. TanStack Query Fetching with staleTime/gcTime configurations
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isError,
    refetch,
    status,
  } = useInfiniteQuery({
    queryKey: ["timeline", search, projectId, categories, sort],
    queryFn: async ({ pageParam, signal }) => {
      const result = await timelineService.getEvents(
        {
          limit: 15,
          cursor: pageParam,
          projectId: projectId || undefined,
          categories: categories || undefined,
          sort: sort || "desc",
        },
        signal,
      );
      return result as TimelineQueryResult;
    },
    initialPageParam: undefined as TimelineCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 10000, // Stale Time: 10 seconds
    gcTime: 300000, // Garbage Collection Cache Time: 5 minutes
  });

  const flatEvents = data?.pages.flatMap((page) => page.items) ?? [];

  // Determine UI State Machine
  let uiState: TimelineUIState = "displaying";
  if (status === ("pending" as any)) {
    uiState = "loading";
  } else if (isError) {
    uiState = "error";
  } else if (flatEvents.length === 0) {
    uiState = "empty";
  }

  // 4. Virtual Scrolling configuration
  const virtualizer = useWindowVirtualizer({
    count: flatEvents.length,
    estimateSize: () => 96, // baseline estimated height
    overscan: 3, // pre-render buffer size
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Infinite Scroll Intersection Sentinel
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || isFetching) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [hasNextPage, isFetchingNextPage, isFetching, fetchNextPage]);

  // Keyboard Shortcuts (J/K list traversal, Enter to open details, Esc to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA") {
        return; // Skip if user is typing
      }

      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        document.getElementById("timeline-search-field")?.focus();
        return;
      }

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const nextIndex = prev < flatEvents.length - 1 ? prev + 1 : prev;
          // Scroll virtual item into view if keyboard navigated
          virtualizer.scrollToIndex(nextIndex);
          return nextIndex;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const nextIndex = prev > 0 ? prev - 1 : 0;
          virtualizer.scrollToIndex(nextIndex);
          return nextIndex;
        });
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < flatEvents.length) {
          setSelectedEvent(flatEvents[focusedIndex]);
          setDrawerOpen(true);
        }
      } else if (e.key === "Escape") {
        setDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flatEvents, focusedIndex, virtualizer]);

  // Helpers to update composite filters
  const toggleCategory = (cat: "tasks" | "notes" | "sessions") => {
    const prev = categories || [];
    const next = prev.includes(cat) ? prev.filter((c: string) => c !== cat) : [...prev, cat];
    navigate({
      search: (p: any) => ({ ...p, categories: next.length > 0 ? next : undefined }),
    } as any);
  };

  const clearAllFilters = () => {
    setSearchText("");
    navigate({
      search: {
        sort: "desc",
        v: 1,
      },
    } as any);
  };

  const handleOpenDetails = (event: TimelineEvent) => {
    setSelectedEvent(event);
    setDrawerOpen(true);

    // Telemetry log
    console.log(`[Observability] Inspected event ${event.id} of type ${event.eventType}`);
  };

  return (
    <Shell>
      <PageHeader
        eyebrow="Activity"
        title="Timeline"
        subtitle="Chronological ledger of your tasks, notes, sessions, and project history."
      />

      <div className="space-y-6">
        {/* Interaction Toolbar */}
        <div className="flex flex-col gap-4 rounded-xl border border-white/5 bg-white/[0.01] p-4 sm:flex-row sm:items-center justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search Input */}
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <input
                id="timeline-search-field"
                type="text"
                placeholder="Search events... (Press 'T' to focus)"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] pl-10 pr-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-violet/60 focus:bg-white/[0.05]"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Project Filter */}
            <select
              value={projectId || ""}
              onChange={(e) =>
                navigate({
                  search: (p: any) => ({ ...p, projectId: e.target.value || undefined }),
                } as any)
              }
              className="h-10 rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-foreground outline-none focus:border-violet/60"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Category Pills */}
            <button
              onClick={() => toggleCategory("tasks")}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                categories?.includes("tasks")
                  ? "bg-violet/20 border-violet/40 text-violet-glow"
                  : "bg-white/[0.02] border-white/5 text-muted-foreground hover:text-white"
              }`}
            >
              <ListTodo className="h-3.5 w-3.5" />
              Tasks
            </button>
            <button
              onClick={() => toggleCategory("notes")}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                categories?.includes("notes")
                  ? "bg-violet/20 border-violet/40 text-violet-glow"
                  : "bg-white/[0.02] border-white/5 text-muted-foreground hover:text-white"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Notes
            </button>
            <button
              onClick={() => toggleCategory("sessions")}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                categories?.includes("sessions")
                  ? "bg-violet/20 border-violet/40 text-violet-glow"
                  : "bg-white/[0.02] border-white/5 text-muted-foreground hover:text-white"
              }`}
            >
              <Timer className="h-3.5 w-3.5" />
              Sessions
            </button>

            {/* Sort Toggle */}
            <button
              onClick={() =>
                navigate({
                  search: (p: any) => ({ ...p, sort: sort === "asc" ? "desc" : "asc" }),
                } as any)
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer text-muted-foreground hover:text-white transition-colors"
              title={`Sort: ${sort === "asc" ? "Oldest First" : "Newest First"}`}
            >
              <ArrowUpDown className="h-4 w-4" />
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => refetch()}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer text-muted-foreground hover:text-white transition-colors ${
                isFetching ? "animate-spin" : ""
              }`}
              title="Refresh timeline logs"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Filter Resets Notice */}
        {(searchText || projectId || categories) && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Showing filter matches ({flatEvents.length} events loaded).</span>
            <button
              onClick={clearAllFilters}
              className="text-violet hover:text-violet-glow font-semibold transition-colors cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* State Machine Event List */}
        <div className="space-y-4">
          {uiState === "displaying" ? (
            <div className="relative pl-4">
              {/* Central timeline connector line */}
              <div className="absolute left-[19px] top-2 bottom-2 w-[1px] bg-white/5" />

              {/* Virtual Scroll Window Recycler Viewport */}
              <div
                ref={listRef}
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualItems.map((virtualItem) => {
                  const event = flatEvents[virtualItem.index];
                  const CardComponent = RendererRegistry.resolveCard(event.eventType);
                  const isFocused = focusedIndex === virtualItem.index;
                  const isSelected = selectedEvent?.id === event.id;

                  return (
                    <div
                      key={virtualItem.key}
                      ref={virtualizer.measureElement}
                      data-index={virtualItem.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
                      }}
                      className="pb-4"
                    >
                      <div
                        className={`relative z-10 rounded-xl transition-all duration-200 ${
                          isFocused ? "ring-2 ring-violet/50 border-violet/40 scale-[1.01]" : ""
                        } ${isSelected ? "bg-violet/[0.02] border-violet/10" : ""}`}
                        onClick={() => setFocusedIndex(virtualItem.index)}
                      >
                        <TimelineErrorBoundary>
                          <CardComponent
                            event={event}
                            onOpenDetails={() => handleOpenDetails(event)}
                          />
                        </TimelineErrorBoundary>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <TimelineList uiState={uiState} events={[]} onRetry={() => refetch()} />
          )}

          {/* Infinite Scroll Sentinel indicator */}
          {hasNextPage && (
            <div ref={sentinelRef} className="py-8 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet border-t-transparent" />
            </div>
          )}
        </div>
      </div>

      {/* Details Slide Sheet Drawer */}
      <DetailDrawer open={drawerOpen} onOpenChange={setDrawerOpen} event={selectedEvent} />
    </Shell>
  );
}
