import { Command } from "cmdk";
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  Folder,
  FileText,
  CheckSquare,
  Terminal,
  Plus,
  Settings,
  Timer,
  Activity,
  X,
  Clock,
  ArrowRight,
} from "lucide-react";
import { useAkira, akira } from "@/akira-os";
import { searchService, searchHistoryService } from "@/akira-os/search";
import type { SearchResult } from "@/contracts/search";
import type { SearchHistoryEntry } from "@/contracts/repositories/SearchHistoryRepository";
import { Dialog, DialogContent } from "@/app/ui/dialog";
import { Drawer, DrawerContent } from "@/app/ui/drawer";
import { ScrollArea } from "@/app/ui/scroll-area";
import { SearchErrorBoundary } from "@/app/ui/search/SearchErrorBoundary";
import { toast } from "sonner";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

  // Load history from SQLite on dialog open
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveId("");
      searchHistoryService.getRecent(5).then((data) => {
        setHistory(data);
      });
    }
  }, [open]);

  // Unified shortcut listener for Ctrl+P and Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "k")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Debounce search query input by 150ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 150);
    return () => clearTimeout(handler);
  }, [query]);

  // Execute Live Search when debouncedQuery changes
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    searchService
      .search({ query: trimmed })
      .then((res) => {
        setResults(res);
        // Highlight first item automatically
        if (res.length > 0) {
          setActiveId(res[0].id);
        }
      })
      .catch((err) => {
        console.error("Search failed:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [debouncedQuery]);

  // Find currently highlighted result for preview pane
  const activeResult = useMemo(() => {
    return results.find((r) => r.id === activeId);
  }, [results, activeId]);

  const handleSelectResult = (result: SearchResult) => {
    setOpen(false);
    setDrawerOpen(false);

    // Route to respective module detail pages
    switch (result.type) {
      case "project":
        navigate({ to: "/projects/$id", params: { id: result.id } });
        break;
      case "task":
        navigate({ to: "/daily-mission" });
        break;
      case "note":
        navigate({ to: "/brain-dump" });
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

  const handleHistoryClick = (q: string) => {
    setQuery(q);
  };

  const handleDeleteHistory = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await searchHistoryService.delete(id);
    const updated = await searchHistoryService.getRecent(5);
    setHistory(updated);
    toast.success("Removed search history item");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-panel border-white/10 bg-[oklch(0.16_0.025_270_/_0.95)] text-foreground p-0 overflow-hidden sm:max-w-[850px] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)]">
          <Command className="w-full flex flex-col" value={activeId} onValueChange={setActiveId}>
            {/* Search Header */}
            <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5">
              <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search projects, tasks, notes, sessions, timeline..."
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none border-none"
              />
              <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-foreground select-none">
                ESC
              </kbd>
            </div>

            {/* Split screen content layout */}
            <div className="grid grid-cols-1 lg:grid-cols-5 h-[380px]">
              {/* Left pane: Results list */}
              <div className="lg:col-span-3 border-r border-white/[0.05] flex flex-col h-full overflow-hidden">
                <ScrollArea className="flex-1">
                  <Command.List className="p-2 scrollbar-thin">
                    <Command.Empty className="py-8 text-center">
                      <span className="text-muted-foreground block text-xs">No matches found.</span>
                      {query.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            akira.addNote({ content: query });
                            toast.success(`Saved "${query}" as a note`);
                            setOpen(false);
                          }}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-cyan-glow hover:border-white/20 hover:bg-white/[0.06] transition-all"
                        >
                          <Plus className="h-3 w-3" /> Capture "{query}" as note
                        </button>
                      )}
                    </Command.Empty>

                    {/* Loading State */}
                    {loading && (
                      <div className="space-y-2 p-2">
                        {[1, 2, 3].map((n) => (
                          <div key={n} className="flex items-center gap-3 py-2 px-3 animate-pulse">
                            <div className="h-4 w-4 rounded-full bg-white/10" />
                            <div className="space-y-1.5 flex-1">
                              <div className="h-3.5 w-1/3 rounded bg-white/10" />
                              <div className="h-2.5 w-2/3 rounded bg-white/10" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* History / Recent Searches */}
                    {!loading && !query && (
                      <Command.Group
                        heading="Recent Searches"
                        className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 py-1.5"
                      >
                        {history.length === 0 ? (
                          <span className="text-[11px] font-normal lowercase tracking-normal text-muted-foreground block px-3 py-2">
                            No search history. Start typing to search!
                          </span>
                        ) : (
                          history.map((h) => (
                            <div
                              key={h.id}
                              onClick={() => handleHistoryClick(h.query)}
                              className="group flex items-center justify-between px-3 py-2 rounded-xl text-sm text-foreground/80 hover:text-foreground hover:bg-white/[0.04] cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{h.query}</span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteHistory(e, h.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded text-muted-foreground hover:text-foreground transition-opacity"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))
                        )}
                      </Command.Group>
                    )}

                    {/* Results grouped by entity type */}
                    {!loading && query && results.length > 0 && (
                      <div className="space-y-2">
                        {/* Map over categories */}
                        {["project", "task", "note", "session", "timeline"].map((cat) => {
                          const catItems = results.filter((r) => r.type === cat);
                          if (catItems.length === 0) return null;

                          return (
                            <Command.Group
                              key={cat}
                              heading={cat.charAt(0).toUpperCase() + cat.slice(1) + "s"}
                              className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 py-1.5 mt-2"
                            >
                              {catItems.map((r) => (
                                <SearchErrorBoundary key={r.id}>
                                  <Command.Item
                                    value={r.id}
                                    onSelect={() => {
                                      // On mobile/tablet, tapping open details drawer first, on desktop navigate
                                      if (window.innerWidth < 1024) {
                                        setDrawerOpen(true);
                                      } else {
                                        handleSelectResult(r);
                                      }
                                    }}
                                    className="flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-white/[0.04] cursor-pointer transition-colors data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-foreground"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      {r.type === "project" && (
                                        <Folder className="h-3.5 w-3.5 text-violet" />
                                      )}
                                      {r.type === "task" && (
                                        <CheckSquare className="h-3.5 w-3.5 text-coral" />
                                      )}
                                      {r.type === "note" && (
                                        <FileText className="h-3.5 w-3.5 text-emerald" />
                                      )}
                                      {r.type === "session" && (
                                        <Timer className="h-3.5 w-3.5 text-amber" />
                                      )}
                                      {r.type === "timeline" && (
                                        <Activity className="h-3.5 w-3.5 text-cyan-glow" />
                                      )}
                                      <div className="flex flex-col min-w-0">
                                        <span className="truncate">{r.title}</span>
                                        <span className="text-xs text-muted-foreground truncate font-normal">
                                          {r.description}
                                        </span>
                                      </div>
                                    </div>
                                  </Command.Item>
                                </SearchErrorBoundary>
                              ))}
                            </Command.Group>
                          );
                        })}
                      </div>
                    )}
                  </Command.List>
                </ScrollArea>
                <div className="px-4 py-2 bg-white/[0.02] border-t border-white/[0.05] text-[10px] text-muted-foreground flex justify-between select-none">
                  <span>Press ↑↓ to navigate</span>
                  <span>Enter to open</span>
                </div>
              </div>

              {/* Right pane: Preview card (Desktop only) */}
              <div className="hidden lg:block lg:col-span-2 bg-white/[0.01] overflow-y-auto">
                {activeResult ? (
                  <div className="h-full flex flex-col justify-between">
                    <SearchErrorBoundary>
                      <ResultPreview result={activeResult} />
                    </SearchErrorBoundary>
                    <div className="p-4 border-t border-white/[0.05]">
                      <button
                        type="button"
                        onClick={() => handleSelectResult(activeResult)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-glow/10 hover:bg-cyan-glow/20 border border-cyan-glow/20 px-4 py-2 text-sm font-semibold text-cyan-glow shadow-[0_0_15px_oklch(0.85_0.13_200_/_0.1)] transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                      >
                        Open Details <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                    <Search className="h-8 w-8 opacity-20 mb-3" strokeWidth={1.5} />
                    <p className="text-sm">Highlight a result to see its preview card here</p>
                  </div>
                )}
              </div>
            </div>
          </Command>
        </DialogContent>
      </Dialog>

      {/* Responsive Drawer for mobile preview screens */}
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
    </>
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
          <p className="text-sm text-muted-foreground line-clamp-4 leading-relaxed">
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
          <p className="text-sm text-muted-foreground line-clamp-4 leading-relaxed">
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
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm text-muted-foreground max-h-[180px] overflow-y-auto scrollbar-thin leading-relaxed whitespace-pre-wrap">
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
          <p className="text-sm text-muted-foreground line-clamp-4 leading-relaxed">
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
