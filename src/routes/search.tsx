import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { z } from "zod";
import {
  Search,
  Folder,
  FileText,
  CheckSquare,
  Timer,
  Activity,
  Clock,
  ArrowRight,
  Filter,
  X,
  Plus,
} from "lucide-react";
import { Shell, PageHeader } from "@/app/shell/Shell";
import { useAkira, akira } from "@/akira-os";
import { searchService, searchHistoryService } from "@/akira-os/search";
import type { SearchResult } from "@/contracts/search";
import type { SearchHistoryEntry } from "@/contracts/repositories/SearchHistoryRepository";
import { Drawer, DrawerContent } from "@/app/ui/drawer";
import { ScrollArea } from "@/app/ui/scroll-area";
import { SearchErrorBoundary } from "@/app/ui/search/SearchErrorBoundary";
import { toast } from "sonner";

const searchParamsSchema = z.object({
  q: z.string().optional().catch(""),
  category: z
    .enum(["all", "project", "task", "note", "session", "timeline"])
    .default("all")
    .catch("all"),
});

export const Route = createFileRoute("/search")({
  validateSearch: searchParamsSchema,
  head: () => ({
    meta: [
      { title: "Workspace Search — AKIRA" },
      {
        name: "description",
        content: "Search across all notes, tasks, projects, sessions, and events.",
      },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q, category } = Route.useSearch();
  const navigate = useNavigate();

  const [query, setQuery] = useState(q || "");
  const [activeCategory, setActiveCategory] = useState<string>(category || "all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sync state with URL search params changes
  useEffect(() => {
    setQuery(q || "");
    setActiveCategory(category || "all");
  }, [q, category]);

  // Load search history from SQLite on mount
  const loadHistory = () => {
    searchHistoryService.getRecent(10).then((data) => {
      setHistory(data);
    });
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Debounce search query input by 150ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 150);
    return () => clearTimeout(handler);
  }, [query]);

  // Live search when debouncedQuery or category changes
  useEffect(() => {
    const trimmed = debouncedQuery.trim();

    // Update URL search parameters to make it linkable and shareable
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigate as any)({
      search: (prev: unknown) => {
        const p = prev as Record<string, unknown>;
        return {
          ...p,
          q: trimmed || undefined,
          category:
            activeCategory !== "all"
              ? (activeCategory as z.infer<typeof searchParamsSchema>["category"])
              : undefined,
        };
      },
    });

    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const scope =
      activeCategory !== "all"
        ? [activeCategory as "project" | "note" | "task" | "session" | "timeline"]
        : undefined;

    searchService
      .search({ query: trimmed, scope })
      .then((res) => {
        setResults(res);
        if (res.length > 0) {
          setActiveId(res[0].id);
        } else {
          setActiveId("");
        }
      })
      .catch((err) => {
        console.error("Search failed:", err);
      })
      .finally(() => {
        setLoading(false);
        loadHistory(); // Reload history logs
      });
  }, [debouncedQuery, activeCategory, navigate]);

  const activeResult = useMemo(() => {
    return results.find((r) => r.id === activeId);
  }, [results, activeId]);

  const handleSelectResult = (result: SearchResult) => {
    setDrawerOpen(false);

    switch (result.type) {
      case "project":
        navigate({ to: "/projects/$id", params: { id: result.id } });
        break;
      case "task":
        navigate({ to: "/tasks" });
        break;
      case "note":
        navigate({ to: "/notes" });
        break;
      case "session":
        navigate({ to: "/sessions" });
        break;
      case "timeline":
        navigate({ to: "/timeline" });
        break;
      default:
        navigate({ to: "/" });
    }
  };

  return (
    <Shell>
      <div className="space-y-6 max-w-7xl mx-auto">
        <PageHeader
          eyebrow="Universal Search"
          title="Workspace Search"
          subtitle="Query notes, tasks, projects, sessions, and events."
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
          {/* Left panel: Filters (4 cols on desktop) */}
          <div className="lg:col-span-3 space-y-6">
            {/* Category Selector */}
            <div className="glass-panel border-white/5 bg-white/[0.02] p-4 rounded-2xl space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <Filter className="h-3.5 w-3.5" /> Filter Category
              </h3>
              <div className="flex flex-col gap-1.5">
                {[
                  { value: "all", label: "All Items" },
                  { value: "project", label: "Projects" },
                  { value: "task", label: "Tasks" },
                  { value: "note", label: "Notes" },
                  { value: "session", label: "Sessions" },
                  { value: "timeline", label: "Timeline" },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setActiveCategory(item.value)}
                    className={`text-left px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                      activeCategory === item.value
                        ? "bg-cyan-glow/10 text-cyan-glow border-l-2 border-cyan-glow"
                        : "text-foreground/75 hover:text-foreground hover:bg-white/[0.04]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Searches */}
            <div className="glass-panel border-white/5 bg-white/[0.02] p-4 rounded-2xl space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Recent Queries
              </h3>
              {history.length === 0 ? (
                <span className="text-xs text-muted-foreground block py-1">No search history.</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setQuery(h.query)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1 text-xs text-foreground/80 hover:text-foreground hover:border-white/10 hover:bg-white/[0.06] transition-all cursor-pointer"
                    >
                      <Clock className="h-3 w-3 opacity-60" /> {h.query}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Center + Right panels (9 cols on desktop) */}
          <div className="lg:col-span-9 grid grid-cols-1 lg:grid-cols-9 gap-6">
            {/* Center Panel: Search Query Input + Result lists (5 cols on desktop) */}
            <div className="lg:col-span-5 space-y-4 flex flex-col h-[600px]">
              {/* Search Bar Input */}
              <div className="relative flex items-center glass-panel border-white/5 bg-white/[0.02] rounded-2xl px-4 py-3 shadow-inner">
                <Search className="h-4 w-4 text-muted-foreground shrink-0 mr-3" strokeWidth={1.5} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type search terms here..."
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none border-none"
                  autoFocus
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="p-1 hover:bg-white/10 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Results Container */}
              <div className="glass-panel border-white/5 bg-white/[0.02] rounded-2xl flex-1 flex flex-col overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-4">
                    {/* Empty query prompt */}
                    {!query && (
                      <div className="py-12 text-center text-muted-foreground">
                        <Search className="h-10 w-10 opacity-20 mx-auto mb-3" strokeWidth={1.5} />
                        <p className="text-sm">
                          Type in the search bar above to query your workspace.
                        </p>
                      </div>
                    )}

                    {/* No Results */}
                    {!loading && query && results.length === 0 && (
                      <div className="py-12 text-center text-muted-foreground">
                        <Search className="h-10 w-10 opacity-20 mx-auto mb-3" strokeWidth={1.5} />
                        <p className="text-sm">No results match your query.</p>
                        <button
                          type="button"
                          onClick={() => {
                            akira.addNote({ content: query });
                            toast.success(`Saved "${query}" as a note`);
                            setQuery("");
                          }}
                          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-foreground hover:bg-white/10 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" /> Capture as note
                        </button>
                      </div>
                    )}

                    {/* Skeletons Loading */}
                    {loading && (
                      <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                          <div key={n} className="flex gap-3 py-2 px-3 animate-pulse">
                            <div className="h-4 w-4 rounded-full bg-white/10 mt-1" />
                            <div className="space-y-1.5 flex-1">
                              <div className="h-3.5 w-1/3 rounded bg-white/10" />
                              <div className="h-2.5 w-2/3 rounded bg-white/10" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Results Listing */}
                    {!loading && query && results.length > 0 && (
                      <div className="space-y-4">
                        {results.map((r) => (
                          <SearchErrorBoundary key={r.id}>
                            <div
                              onClick={() => {
                                setActiveId(r.id);
                                if (window.innerWidth < 1024) {
                                  setDrawerOpen(true);
                                }
                              }}
                              className={`flex gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                                activeId === r.id
                                  ? "bg-white/[0.06] border-white/10 shadow-md"
                                  : "bg-transparent border-transparent hover:bg-white/[0.02]"
                              }`}
                            >
                              <div className="mt-1 shrink-0">
                                {r.type === "project" && <Folder className="h-4 w-4 text-violet" />}
                                {r.type === "task" && (
                                  <CheckSquare className="h-4 w-4 text-coral" />
                                )}
                                {r.type === "note" && <FileText className="h-4 w-4 text-emerald" />}
                                {r.type === "session" && <Timer className="h-4 w-4 text-amber" />}
                                {r.type === "timeline" && (
                                  <Activity className="h-4 w-4 text-cyan-glow" />
                                )}
                              </div>
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex justify-between items-start gap-2">
                                  <h4 className="text-sm font-semibold text-foreground truncate">
                                    {r.title}
                                  </h4>
                                  <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider shrink-0 bg-white/[0.04] px-1.5 py-0.5 rounded">
                                    {r.type}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {r.description}
                                </p>
                              </div>
                            </div>
                          </SearchErrorBoundary>
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Right Panel: Interactive Preview Pane (4 cols on desktop) */}
            <div className="hidden lg:block lg:col-span-4 h-[600px]">
              <div className="glass-panel border-white/5 bg-white/[0.02] rounded-2xl h-full flex flex-col justify-between overflow-hidden">
                {activeResult ? (
                  <div className="flex flex-col h-full justify-between">
                    <ScrollArea className="flex-1">
                      <SearchErrorBoundary>
                        <ResultPreview result={activeResult} />
                      </SearchErrorBoundary>
                    </ScrollArea>
                    <div className="p-4 border-t border-white/[0.05]">
                      <button
                        type="button"
                        onClick={() => handleSelectResult(activeResult)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-glow/10 hover:bg-cyan-glow/20 border border-cyan-glow/20 px-4 py-2.5 text-sm font-semibold text-cyan-glow shadow-[0_0_15px_oklch(0.85_0.13_200_/_0.1)] transition-all cursor-pointer"
                      >
                        Open Details <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                    <Search className="h-8 w-8 opacity-20 mb-3" strokeWidth={1.5} />
                    <p className="text-sm">
                      Click a result card to see its full details preview here
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Drawer for smaller screen sizes */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="bg-[oklch(0.16_0.025_270)] border-white/10 text-foreground p-0 max-h-[85vh]">
          {activeResult && (
            <div className="p-4 space-y-6">
              <div className="p-0 border-b border-white/[0.05] pb-2">
                <h2 className="text-base font-semibold text-left">Quick Preview</h2>
              </div>
              <ScrollArea className="max-h-[50vh]">
                <SearchErrorBoundary>
                  <ResultPreview result={activeResult} />
                </SearchErrorBoundary>
              </ScrollArea>
              <div className="p-0 pt-4 border-t border-white/[0.05] flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectResult(activeResult)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-glow/15 border border-cyan-glow/30 px-4 py-2.5 text-sm font-semibold text-cyan-glow transition-all"
                >
                  Go to Resource <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </Shell>
  );
}

function ResultPreview({ result }: { result: SearchResult }) {
  if (!result) return null;

  switch (result.type) {
    case "project":
      return (
        <div className="space-y-4 p-4 text-left">
          <div className="flex items-center gap-2">
            <Folder className="h-5 w-5 text-violet" />
            <h3 className="font-display font-semibold text-lg">{result.title}</h3>
          </div>
          <span className="inline-block rounded bg-violet/10 px-2 py-0.5 text-xs text-violet">
            {result.metadata?.tag || "Project"}
          </span>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {result.description || "No description provided."}
          </p>
          {result.metadata?.updatedAt && (
            <div className="text-xs text-muted-foreground">
              Last modified: {new Date(result.metadata.updatedAt as string).toLocaleDateString()}
            </div>
          )}
        </div>
      );
    case "task":
      return (
        <div className="space-y-4 p-4 text-left">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-coral" />
            <h3 className="font-display font-semibold text-lg">{result.title}</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {result.description || "No task details provided."}
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-coral/10 px-2 py-0.5 text-coral font-medium">
              Priority: {result.metadata?.priority || "Medium"}
            </span>
            <span className="rounded bg-white/5 px-2 py-0.5 text-muted-foreground">
              Status: {result.metadata?.done ? "Completed" : "Active"}
            </span>
          </div>
        </div>
      );
    case "note":
      return (
        <div className="space-y-4 p-4 text-left">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald" />
            <h3 className="font-display font-semibold text-lg">{result.title}</h3>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm text-muted-foreground max-h-[300px] overflow-y-auto scrollbar-thin leading-relaxed whitespace-pre-wrap">
            {result.description}
          </div>
        </div>
      );
    case "session":
      return (
        <div className="space-y-4 p-4 text-left">
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-amber" />
            <h3 className="font-display font-semibold text-lg">{result.title}</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {result.description || "No session details logged."}
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-amber/10 px-2 py-0.5 text-amber font-medium">
              Duration: {result.metadata?.duration || 0} mins
            </span>
            <span className="rounded bg-white/5 px-2 py-0.5 text-muted-foreground">
              Date:{" "}
              {result.metadata?.updatedAt
                ? new Date(result.metadata.updatedAt as string).toLocaleDateString()
                : "N/A"}
            </span>
          </div>
        </div>
      );
    case "timeline":
      return (
        <div className="space-y-4 p-4 text-left">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-glow" />
            <h3 className="font-display font-semibold text-lg">{result.title}</h3>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {result.description}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {result.metadata?.updatedAt
                ? new Date(result.metadata.updatedAt as string).toLocaleString()
                : "N/A"}
            </span>
          </div>
        </div>
      );
    default:
      return null;
  }
}
