import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  Brain,
  MessageSquare,
  Activity,
  UserCheck,
  FileSpreadsheet,
  Network,
  BookOpen,
  Eye,
  Settings,
  Search,
  Filter,
  Copy,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Clock,
  Code,
  ArrowDown,
  Info,
  ExternalLink,
  Sparkles,
  Award,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

import { Shell, PageHeader } from "@/components/akira/Shell";
import { akira } from "@/services/akira-store";
import { eventService } from "@/services/events/event-service";
import { candidateService } from "@/services/memory/candidate-service";
import { memoryService } from "@/services/memory/validation/memory-service";
import { relationshipService } from "@/services/memory/relationships/relationship-service";
import { storyService } from "@/services/stories/story-service";
import { identityService } from "@/services/identity/identity-service";
import { hypothesesService } from "@/services/identity/hypotheses";
import { importanceService } from "@/services/importance/importance-service";
import { recallService } from "@/services/recall/recall-service";
import { contextService } from "@/services/context/context-service";
import { validator } from "@/services/memory/validation/validator";
import { logger, type LogEntry } from "@/lib/logger";
import { EmptyState } from "@/components/akira/primitives";

// Types
import { MemoryEvent } from "@/services/events/types";
import { MemoryCandidate } from "@/services/memory/candidate";
import { Memory } from "@/services/memory/validation/types";
import { MemoryRelationship } from "@/services/memory/relationships/types";
import { Story } from "@/services/stories/types";
import { IdentityObservation, IdentityHypothesis } from "@/services/identity/types";
import { MemoryImportance } from "@/services/importance/types";
import { RecallCandidate, RecallSession } from "@/services/recall/types";
import { ContextPackage } from "@/services/context/types";

export const Route = createFileRoute("/brain")({
  head: () => ({
    meta: [
      { title: "Brain Inspector — AKIRA Developer" },
      {
        name: "description",
        content: "Internal debugger and real-time inspector for the GENESIS cognitive engine.",
      },
    ],
  }),
  component: BrainInspectorPage,
});

function BrainInspectorPage() {
  // Pinned or active tabs: "pipeline" | "events" | "candidates" | "memories" | "stories" | "identity" | "importance" | "recall" | "context" | "logs"
  const [activeTab, setActiveTab] = useState<string>("pipeline");

  // Telemetry caches loaded and updated in real time
  const [events, setEvents] = useState<MemoryEvent[]>(() => [...akira.getState().memories]);
  const [candidates, setCandidates] = useState<MemoryCandidate[]>(() => [
    ...candidateService.getCandidates(),
  ]);
  const [memories, setMemories] = useState<Memory[]>(() => [...memoryService.getMemories()]);
  const [relationships, setRelationships] = useState<MemoryRelationship[]>(() => [
    ...relationshipService.getRelationships(),
  ]);
  const [stories, setStories] = useState<Story[]>(() => [...storyService.getStories()]);
  const [observations, setObservations] = useState<IdentityObservation[]>(() => [
    ...identityService.getObservations(),
  ]);
  const [hypotheses, setHypotheses] = useState<IdentityHypothesis[]>(() => [
    ...hypothesesService.getHypotheses(),
  ]);
  const [importanceList, setImportanceList] = useState<MemoryImportance[]>(() => [
    ...importanceService.getAllImportance(),
  ]);
  const [recallCandidates, setRecallCandidates] = useState<RecallCandidate[]>(() => [
    ...recallService.getRecallCandidates(),
  ]);
  const [activeRecallSession, setActiveRecallSession] = useState<RecallSession | null>(() =>
    recallService.getActiveSession(),
  );
  const [contextPkg, setContextPkg] = useState<ContextPackage | null>(() =>
    contextService.getActiveContext(),
  );
  const [activeSession, setActiveSession] = useState(() => akira.getState().activeSession);
  const [logs, setLogs] = useState<LogEntry[]>(() => [...logger.getLogs()]);

  // Performance slicing limits
  const [eventsLimit, setEventsLimit] = useState(100);
  const [candidatesLimit, setCandidatesLimit] = useState(100);
  const [memoriesLimit, setMemoriesLimit] = useState(100);
  const [logsLimit, setLogsLimit] = useState(100);

  // Active Pipeline Node highlights
  const [activePipelineNodes, setActivePipelineNodes] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterValue, setFilterValue] = useState("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const triggerHighlight = (node: string) => {
    setActivePipelineNodes((prev) => ({ ...prev, [node]: true }));
    setTimeout(() => {
      setActivePipelineNodes((prev) => ({ ...prev, [node]: false }));
    }, 1500);
  };

  // Wire up subscribers to the public APIs
  useEffect(() => {
    // 1. Events
    const unsubEvent = eventService.onRecord((evt) => {
      setEvents((prev) => [evt, ...prev]);
      setActiveSession(akira.getState().activeSession);
      triggerHighlight("Events");
      if (evt.eventType === "note_created" && evt.description.includes("submitted to AKIRA")) {
        triggerHighlight("Conversation");
      }
    });

    // 2. Candidates
    const unsubCandidate = candidateService.subscribe((cand) => {
      setCandidates((prev) => [cand, ...prev]);
      triggerHighlight("Candidates");
    });

    // 3. Memories
    const unsubMemory = memoryService.subscribe((mem) => {
      setMemories((prev) => [mem, ...prev]);
      triggerHighlight("Memory");
    });

    // 4. Relationships
    const unsubRelationship = relationshipService.subscribe((rel) => {
      setRelationships((prev) => [rel, ...prev]);
      triggerHighlight("Relationships");
    });

    // 5. Stories
    const unsubStory = storyService.subscribe(() => {
      setStories(() => [...storyService.getStories()]);
      triggerHighlight("Stories");
    });

    // 6. Identity
    const unsubIdentity = identityService.subscribe(() => {
      setObservations(() => [...identityService.getObservations()]);
      setHypotheses(() => [...hypothesesService.getHypotheses()]);
      triggerHighlight("Identity");
    });

    // 7. Importance
    const unsubImportance = importanceService.subscribe(() => {
      setImportanceList(() => [...importanceService.getAllImportance()]);
      triggerHighlight("Importance");
    });

    // 8. Recall
    const unsubRecall = recallService.subscribe((evt) => {
      setRecallCandidates(() => [...recallService.getRecallCandidates()]);
      setActiveRecallSession(evt.session);
      triggerHighlight("Recall");
    });

    // 9. Context Package
    const unsubContext = contextService.subscribe((evt) => {
      setContextPkg(evt.package);
      triggerHighlight("Context Package");
    });

    // 10. Structured Logs
    const unsubLogger = logger.subscribe((entry) => {
      setLogs((prev) => [entry, ...prev]);
    });

    return () => {
      unsubEvent();
      unsubCandidate();
      unsubMemory();
      unsubRelationship();
      unsubStory();
      unsubIdentity();
      unsubImportance();
      unsubRecall();
      unsubContext();
      unsubLogger();
    };
  }, []);

  // Utility helpers
  const copyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast.success("JSON copied to clipboard!");
  };

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 1. Filtered Events
  const sortedAndFilteredEvents = useMemo(() => {
    const filtered = events.filter((e) => {
      const matchesSearch =
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterValue === "all" || e.eventType === filterValue;
      return matchesSearch && matchesType;
    });

    return [...filtered].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
    });
  }, [events, searchQuery, filterValue, sortOrder]);

  // 2. Filtered Candidates
  const sortedAndFilteredCandidates = useMemo(() => {
    const filtered = candidates.filter((c) => {
      const matchesSearch =
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase());

      const outcomeStatus = memories.some((m) => m.candidateId === c.id)
        ? "Promoted"
        : validator.validate(c).outcome;
      const matchesType =
        filterValue === "all" ||
        c.reason === filterValue ||
        (filterValue === "Promoted" && outcomeStatus === "Promoted") ||
        (filterValue === "Hold" && outcomeStatus === "Hold") ||
        (filterValue === "Reject" && outcomeStatus === "Reject");

      return matchesSearch && matchesType;
    });

    return [...filtered].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
    });
  }, [candidates, memories, searchQuery, filterValue, sortOrder]);

  // 3. Filtered Memories
  const sortedAndFilteredMemories = useMemo(() => {
    const filtered = memories.filter((m) => {
      const matchesSearch =
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.reason.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
    });
  }, [memories, searchQuery, sortOrder]);

  // 4. Filtered Stories
  const sortedAndFilteredStories = useMemo(() => {
    return stories.filter((s) => {
      const matchesSearch =
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterValue === "all" || s.status === filterValue;
      return matchesSearch && matchesFilter;
    });
  }, [stories, searchQuery, filterValue]);

  // 5. Filtered Identity observations
  const sortedAndFilteredObservations = useMemo(() => {
    return observations.filter((o) => {
      const matchesSearch =
        o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterValue === "all" || o.category === filterValue;
      return matchesSearch && matchesFilter;
    });
  }, [observations, searchQuery, filterValue]);

  return (
    <Shell>
      <PageHeader
        eyebrow="GENESIS · CORE ENGINE"
        title="Brain Inspector"
        subtitle="Real-time debugger visualizing the compilation and consolidation of the Adaptive Memory Engine pipeline."
        action={
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
            <span className="text-xs font-semibold text-emerald-400 font-mono tracking-wider">
              Live Pipeline Connected
            </span>
          </div>
        }
      />

      {/* Tabs Selection Bar */}
      <div className="mt-8 flex flex-wrap gap-1 border-b border-white/5 pb-px">
        {[
          { id: "pipeline", label: "Pipeline Visualizer", icon: Network, accent: "violet" },
          { id: "events", label: `Events (${events.length})`, icon: Activity, accent: "cyan" },
          {
            id: "candidates",
            label: `Candidates (${candidates.length})`,
            icon: FileSpreadsheet,
            accent: "electric",
          },
          { id: "memories", label: `Memories (${memories.length})`, icon: Brain, accent: "violet" },
          { id: "stories", label: `Stories (${stories.length})`, icon: BookOpen, accent: "cyan" },
          { id: "identity", label: "Identity & Hypotheses", icon: UserCheck, accent: "electric" },
          { id: "importance", label: "Importance Signals", icon: TrendingUp, accent: "violet" },
          { id: "recall", label: "Recall Candidates", icon: Clock, accent: "cyan" },
          { id: "context", label: "Context Package", icon: Code, accent: "electric" },
          { id: "logs", label: `Logs (${logs.length})`, icon: Terminal, accent: "cyan" },
        ].map((t) => {
          const active = activeTab === t.id;
          const Icon = t.icon;
          const accentColor =
            t.accent === "violet"
              ? "text-violet border-violet bg-violet/5"
              : t.accent === "electric"
                ? "text-electric border-electric bg-electric/5"
                : "text-cyan-glow border-cyan-glow bg-cyan-glow/5";

          return (
            <button
              key={t.id}
              onClick={() => {
                setActiveTab(t.id);
                setSearchQuery("");
                setFilterValue("all");
              }}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold tracking-wide transition-all uppercase ${
                active
                  ? `${accentColor} border-current`
                  : "border-transparent text-muted-foreground hover:bg-white/[0.02] hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {/* ================================================================= */}
        {/* PIPELINE VISUALIZATION TAB */}
        {/* ================================================================= */}
        {activeTab === "pipeline" && (
          <div className="space-y-6 animate-fade-in">
            <div className="glass-card p-6">
              <h3 className="font-display text-base font-semibold text-white flex items-center gap-2 mb-2">
                <Network className="h-5 w-5 text-violet" /> GENESIS Unidirectional Cognitive Flow
              </h3>
              <p className="text-xs text-muted-foreground leading-normal mb-8">
                Interact with the companion or use workspace tools to trigger logs. Updates stream
                incrementally from the lowest event listener up through identity and recall,
                lighting up nodes on the flowchart in real time.
              </p>

              {/* Vertical connected flowchart */}
              <div className="flex flex-col items-center max-w-lg mx-auto py-4">
                {[
                  {
                    id: "Conversation",
                    title: "Conversation Stage",
                    desc: "User query input in focus chat",
                    color: "border-violet/40 bg-violet/5 hover:border-violet/60",
                    glow: "border-violet bg-violet/20 shadow-[0_0_20px_oklch(0.68_0.22_295_/_0.5)]",
                    stats: `Active: ${activeSession ? "1 Session" : "0"}`,
                  },
                  {
                    id: "Events",
                    title: "Workspace Events",
                    desc: "State mutations and action telemetry logged",
                    color: "border-cyan-glow/40 bg-cyan-glow/5 hover:border-cyan-glow/60",
                    glow: "border-cyan-glow bg-cyan-glow/20 shadow-[0_0_20px_oklch(0.85_0.13_200_/_0.5)]",
                    stats: `${events.length} Telemetry Node(s)`,
                  },
                  {
                    id: "Candidates",
                    title: "Memory Candidates",
                    desc: "Rules screen events for validation worthiness",
                    color: "border-electric/40 bg-electric/5 hover:border-electric/60",
                    glow: "border-electric bg-electric/20 shadow-[0_0_20px_oklch(0.72_0.19_250_/_0.5)]",
                    stats: `${candidates.length} In-Queue`,
                  },
                  {
                    id: "Memory",
                    title: "Promoted Memories",
                    desc: "Validator rules promote nodes to permanent storage",
                    color: "border-violet/40 bg-violet/5 hover:border-violet/60",
                    glow: "border-violet bg-violet/20 shadow-[0_0_20px_oklch(0.68_0.22_295_/_0.5)]",
                    stats: `${memories.length} Permanent Memory Node(s)`,
                  },
                  {
                    id: "Relationships",
                    title: "Relational Index",
                    desc: "Links forged between associated memories",
                    color: "border-cyan-glow/40 bg-cyan-glow/5 hover:border-cyan-glow/60",
                    glow: "border-cyan-glow bg-cyan-glow/20 shadow-[0_0_20px_oklch(0.85_0.13_200_/_0.5)]",
                    stats: `${relationships.length} Forged Link(s)`,
                  },
                  {
                    id: "Stories",
                    title: "Narrative Anchors",
                    desc: "Stories clustered to form project histories",
                    color: "border-electric/40 bg-electric/5 hover:border-electric/60",
                    glow: "border-electric bg-electric/20 shadow-[0_0_20px_oklch(0.72_0.19_250_/_0.5)]",
                    stats: `${stories.length} Narrative Story Arc(s)`,
                  },
                  {
                    id: "Identity",
                    title: "Identity Inference",
                    desc: "Emergent traits and aspirations validated",
                    color: "border-violet/40 bg-violet/5 hover:border-violet/60",
                    glow: "border-violet bg-violet/20 shadow-[0_0_20px_oklch(0.68_0.22_295_/_0.5)]",
                    stats: `${observations.length} Active Traits · ${hypotheses.length} Hypotheses`,
                  },
                  {
                    id: "Importance",
                    title: "Importance Signal Valuator",
                    desc: "Signals evaluate density, recency, and intent weight",
                    color: "border-cyan-glow/40 bg-cyan-glow/5 hover:border-cyan-glow/60",
                    glow: "border-cyan-glow bg-cyan-glow/20 shadow-[0_0_20px_oklch(0.85_0.13_200_/_0.5)]",
                    stats: `${importanceList.length} Importance Index Records`,
                  },
                  {
                    id: "Recall",
                    title: "Recall Retriever",
                    desc: "Active recall candidates loaded based on current context",
                    color: "border-electric/40 bg-electric/5 hover:border-electric/60",
                    glow: "border-electric bg-electric/20 shadow-[0_0_20px_oklch(0.72_0.19_250_/_0.5)]",
                    stats: `${recallCandidates.filter((r) => r.status === "Active").length} Recall Node(s) Active`,
                  },
                  {
                    id: "Context Package",
                    title: "Context Prompter",
                    desc: "Active snapshot compiled and dispatched to AI Engine",
                    color: "border-violet/40 bg-violet/5 hover:border-violet/60",
                    glow: "border-violet bg-violet/20 shadow-[0_0_20px_oklch(0.68_0.22_295_/_0.5)]",
                    stats: contextPkg ? "1 Active Package Compiled" : "Expired / Empty",
                  },
                ].map((node, index, arr) => {
                  const highlighted = activePipelineNodes[node.id];
                  const borderClasses = highlighted ? node.glow : node.color;

                  return (
                    <div key={node.id} className="w-full flex flex-col items-center">
                      <div
                        className={`w-full rounded-2xl border p-4 transition-all duration-300 ${borderClasses}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/60">
                              Step {index + 1}
                            </span>
                            <h4 className="text-sm font-semibold text-white font-display mt-0.5">
                              {node.title}
                            </h4>
                          </div>
                          <span className="rounded-lg bg-white/[0.04] border border-white/5 px-2 py-0.5 font-mono text-[10px] text-cyan-glow">
                            {node.stats}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">{node.desc}</p>
                      </div>

                      {index < arr.length - 1 && (
                        <div className="py-2.5 flex flex-col items-center">
                          <ArrowDown className="h-4.5 w-4.5 text-muted-foreground/30 animate-pulse" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* EVENTS INSPECTOR TAB */}
        {/* ================================================================= */}
        {activeTab === "events" && (
          <div className="space-y-4 animate-fade-in">
            {/* Search and Filters */}
            <div className="glass-panel p-4 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex items-center gap-2 bg-[#0c0f16] border border-white/10 rounded-xl px-3 py-2 w-full max-w-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none text-xs text-white outline-none w-full"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Type:</span>
                  <select
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[#0c0f16] px-2.5 py-1 text-xs text-foreground outline-none"
                  >
                    <option value="all">All Events</option>
                    <option value="project_created">project_created</option>
                    <option value="project_continued">project_continued</option>
                    <option value="project_updated">project_updated</option>
                    <option value="note_created">note_created</option>
                    <option value="note_edited">note_edited</option>
                    <option value="task_completed">task_completed</option>
                    <option value="mission_completed">mission_completed</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Sort:</span>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                    className="rounded-lg border border-white/10 bg-[#0c0f16] px-2.5 py-1 text-xs text-foreground outline-none"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Live Events Feed */}
            {sortedAndFilteredEvents.length > 0 ? (
              <div className="space-y-3">
                {sortedAndFilteredEvents.slice(0, eventsLimit).map((evt) => {
                  const expanded = expandedItems[evt.id];
                  return (
                    <div key={evt.id} className="glass-card p-5 space-y-3 animate-fade-in">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-glow/5 border border-cyan-glow/15 text-cyan-glow shrink-0 mt-0.5">
                            <Activity className="h-4.5 w-4.5" />
                          </span>
                          <div>
                            <h4 className="text-sm font-semibold text-white font-display">
                              {evt.title}
                            </h4>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground/70 mt-1 font-mono">
                              <span className="bg-white/[0.04] px-1.5 py-0.5 rounded text-cyan-glow font-bold uppercase">
                                {evt.eventType}
                              </span>
                              <span>•</span>
                              <span>ID: {evt.id}</span>
                              <span>•</span>
                              <span>{new Date(evt.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyJson(evt)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-white"
                          >
                            <Copy className="h-3 w-3" /> Copy JSON
                          </button>
                          <button
                            onClick={() => toggleExpand(evt.id)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-white"
                          >
                            {expanded ? (
                              <>
                                <ChevronDown className="h-3.5 w-3.5" /> Collapse
                              </>
                            ) : (
                              <>
                                <ChevronRight className="h-3.5 w-3.5" /> Expand
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed pl-12">
                        {evt.description}
                      </p>

                      {/* Expandable JSON details */}
                      {expanded && (
                        <div className="pl-12 pt-2">
                          <pre className="rounded-lg bg-black/40 border border-white/5 p-4 text-[10px] font-mono text-cyan-glow overflow-x-auto max-h-60 scrollbar leading-normal">
                            {JSON.stringify(evt, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}

                {sortedAndFilteredEvents.length > eventsLimit && (
                  <div className="pt-2 text-center">
                    <p className="text-xs text-muted-foreground mb-3 font-mono">
                      Showing {eventsLimit} of {sortedAndFilteredEvents.length} events log.
                    </p>
                    <button
                      onClick={() => setEventsLimit((prev) => prev + 100)}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5 text-xs font-semibold text-foreground/90 transition-all hover:bg-white/[0.06] hover:text-white"
                    >
                      Show 100 More
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                title="No Matching Events Found"
                hint="Try adjusting your keyword filter queries."
                icon={Activity}
              />
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* CANDIDATES INSPECTOR TAB */}
        {/* ================================================================= */}
        {activeTab === "candidates" && (
          <div className="space-y-4 animate-fade-in">
            {/* Search and Filters */}
            <div className="glass-panel p-4 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex items-center gap-2 bg-[#0c0f16] border border-white/10 rounded-xl px-3 py-2 w-full max-w-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search candidates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none text-xs text-white outline-none w-full"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Status / Type:</span>
                  <select
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[#0c0f16] px-2.5 py-1 text-xs text-foreground outline-none"
                  >
                    <option value="all">All Candidates</option>
                    <option value="Promoted">Promoted Only</option>
                    <option value="Hold">On Hold Only</option>
                    <option value="Reject">Rejected Only</option>
                    <option value="Milestone">Milestone</option>
                    <option value="Goal Progress">Goal Progress</option>
                    <option value="Reflection Worthy">Reflection Worthy</option>
                    <option value="Repeated Activity">Repeated Activity</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Sort:</span>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                    className="rounded-lg border border-white/10 bg-[#0c0f16] px-2.5 py-1 text-xs text-foreground outline-none"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Candidates Feed */}
            {sortedAndFilteredCandidates.length > 0 ? (
              <div className="space-y-3">
                {sortedAndFilteredCandidates.slice(0, candidatesLimit).map((cand) => {
                  const expanded = expandedItems[cand.id];
                  const isPromoted = memories.some((m) => m.candidateId === cand.id);
                  const validationResult = validator.validate(cand);
                  const status = isPromoted ? "Promoted" : validationResult.outcome;

                  const statusClass =
                    status === "Promoted"
                      ? "text-emerald-400 bg-emerald-400/5 border border-emerald-400/10"
                      : status === "Hold"
                        ? "text-amber-400 bg-amber-400/5 border border-amber-400/10"
                        : "text-red-400 bg-red-400/5 border border-red-400/10";

                  return (
                    <div key={cand.id} className="glass-card p-5 space-y-4 animate-fade-in">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-electric/5 border border-electric/15 text-electric shrink-0 mt-0.5">
                            <FileSpreadsheet className="h-4.5 w-4.5" />
                          </span>
                          <div>
                            <h4 className="text-sm font-semibold text-white font-display">
                              {cand.title}
                            </h4>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground/70 mt-1 font-mono">
                              <span className="bg-white/[0.04] px-1.5 py-0.5 rounded text-electric font-bold">
                                {cand.reason}
                              </span>
                              <span>•</span>
                              <span>ID: {cand.id}</span>
                              <span>•</span>
                              <span>{new Date(cand.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusClass}`}
                          >
                            {status}
                          </span>
                          <button
                            onClick={() => copyJson(cand)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-white"
                          >
                            <Copy className="h-3 w-3" /> Copy JSON
                          </button>
                          <button
                            onClick={() => toggleExpand(cand.id)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-white"
                          >
                            {expanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="pl-12 space-y-2">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {cand.description}
                        </p>
                        <div className="rounded-lg bg-white/[0.01] border border-white/5 p-3 text-xs leading-relaxed">
                          <strong className="block text-[10px] text-cyan-glow uppercase tracking-wider font-bold mb-0.5">
                            Validator Report:{" "}
                            {status === "Promoted"
                              ? "Rule Promotion Passed"
                              : "Rule Hold/Reject Reason"}
                          </strong>
                          {isPromoted
                            ? `Successfully evaluated and promoted to a long-term memory. Trigger Reason: ${cand.reason}.`
                            : validationResult.explanation}
                        </div>
                        <div className="text-[10px] text-muted-foreground/60 font-mono">
                          Source Event ID:{" "}
                          <span className="text-foreground/80">{cand.sourceEventId}</span>
                        </div>
                      </div>

                      {expanded && (
                        <div className="pl-12">
                          <pre className="rounded-lg bg-black/40 border border-white/5 p-4 text-[10px] font-mono text-cyan-glow overflow-x-auto max-h-60 scrollbar leading-normal">
                            {JSON.stringify(cand, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}

                {sortedAndFilteredCandidates.length > candidatesLimit && (
                  <div className="pt-2 text-center">
                    <p className="text-xs text-muted-foreground mb-3 font-mono">
                      Showing {candidatesLimit} of {sortedAndFilteredCandidates.length} candidates.
                    </p>
                    <button
                      onClick={() => setCandidatesLimit((prev) => prev + 100)}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5 text-xs font-semibold text-foreground/90 transition-all hover:bg-white/[0.06] hover:text-white"
                    >
                      Show 100 More
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                title="No Memory Candidates Found"
                hint="No telemetry events have met candidate rule criteria."
                icon={FileSpreadsheet}
              />
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* MEMORY INSPECTOR TAB */}
        {/* ================================================================= */}
        {activeTab === "memories" && (
          <div className="space-y-4 animate-fade-in">
            {/* Search */}
            <div className="glass-panel p-4 flex gap-4 items-center justify-between">
              <div className="flex items-center gap-2 bg-[#0c0f16] border border-white/10 rounded-xl px-3 py-2 w-full max-w-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search memories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none text-xs text-white outline-none w-full"
                />
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Sort:</span>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                  className="rounded-lg border border-white/10 bg-[#0c0f16] px-2.5 py-1 text-xs text-foreground outline-none"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
              </div>
            </div>

            {/* Memories Feed */}
            {sortedAndFilteredMemories.length > 0 ? (
              <div className="space-y-3">
                {sortedAndFilteredMemories.slice(0, memoriesLimit).map((mem) => {
                  const expanded = expandedItems[mem.id];
                  const importance = importanceService.getImportance(mem.id);
                  const linkedStories = stories.filter((s) => s.relatedMemoryIds.includes(mem.id));
                  const links = relationshipService.getRelationshipsForMemory(mem.id);

                  return (
                    <div key={mem.id} className="glass-card p-5 space-y-4 animate-fade-in">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet/5 border border-violet/15 text-violet shrink-0 mt-0.5">
                            <Brain className="h-4.5 w-4.5" />
                          </span>
                          <div>
                            <h4 className="text-sm font-semibold text-white font-display">
                              {mem.title}
                            </h4>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground/70 mt-1 font-mono">
                              <span className="bg-white/[0.04] px-1.5 py-0.5 rounded text-violet font-bold">
                                {mem.reason}
                              </span>
                              <span>•</span>
                              <span>ID: {mem.id}</span>
                              <span>•</span>
                              <span>{new Date(mem.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyJson(mem)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-white"
                          >
                            <Copy className="h-3 w-3" /> Copy JSON
                          </button>
                          <button
                            onClick={() => toggleExpand(mem.id)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-white"
                          >
                            {expanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="pl-12 space-y-3">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {mem.description}
                        </p>

                        {/* Sub-Inspectors Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                          {/* Signals & Provenance */}
                          <div className="rounded-xl bg-white/[0.01] border border-white/5 p-3 space-y-2">
                            <strong className="block text-[10px] text-violet uppercase tracking-wider font-bold">
                              Cognitive Provenance & Lineage
                            </strong>
                            <div className="space-y-1 text-xs text-muted-foreground font-mono text-[10px]">
                              <div>
                                Source Event:{" "}
                                <span className="text-foreground/80">{mem.sourceEventId}</span>
                              </div>
                              <div>
                                Candidate Ref:{" "}
                                <span className="text-foreground/80">{mem.candidateId}</span>
                              </div>
                              <div className="mt-1 leading-normal text-muted-foreground not-italic font-sans">
                                <strong>Rationale:</strong> {mem.explanation}
                              </div>
                            </div>
                          </div>

                          {/* Importance Signals */}
                          <div className="rounded-xl bg-white/[0.01] border border-white/5 p-3 space-y-2">
                            <strong className="block text-[10px] text-cyan-glow uppercase tracking-wider font-bold">
                              Importance Evaluators ({importance?.signals.length || 0})
                            </strong>
                            {importance && importance.signals.length > 0 ? (
                              <div className="space-y-1.5">
                                {importance.signals.map((s, idx) => (
                                  <div
                                    key={idx}
                                    className="text-xs flex items-center justify-between gap-4"
                                  >
                                    <span className="text-muted-foreground truncate">{s.type}</span>
                                    <span className="shrink-0 font-mono font-bold text-cyan-glow bg-cyan-glow/5 border border-cyan-glow/10 px-1.5 py-0.5 rounded text-[10px]">
                                      {Math.round(s.strength * 100)}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/60 italic block">
                                No active importance records
                              </span>
                            )}
                          </div>

                          {/* Story Narrative Links */}
                          <div className="rounded-xl bg-white/[0.01] border border-white/5 p-3 space-y-2">
                            <strong className="block text-[10px] text-electric uppercase tracking-wider font-bold">
                              Linked Stories ({linkedStories.length})
                            </strong>
                            {linkedStories.length > 0 ? (
                              <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4">
                                {linkedStories.map((story) => (
                                  <li key={story.id}>
                                    <span className="text-foreground/85 font-medium">
                                      {story.title}
                                    </span>{" "}
                                    (Status: {story.status})
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-xs text-muted-foreground/60 italic block">
                                No active story links
                              </span>
                            )}
                          </div>

                          {/* Relational Associations */}
                          <div className="rounded-xl bg-white/[0.01] border border-white/5 p-3 space-y-2">
                            <strong className="block text-[10px] text-violet uppercase tracking-wider font-bold">
                              Relationships ({links.length})
                            </strong>
                            {links.length > 0 ? (
                              <div className="space-y-1.5 text-xs text-muted-foreground">
                                {links.map((rel) => {
                                  const targetId =
                                    rel.sourceMemoryId === mem.id
                                      ? rel.targetMemoryId
                                      : rel.sourceMemoryId;
                                  const targetMem = memories.find((m) => m.id === targetId);
                                  return (
                                    <div
                                      key={rel.id}
                                      className="border-b border-white/5 pb-1 last:border-0 last:pb-0"
                                    >
                                      <span className="font-semibold text-foreground/85">
                                        {rel.type}:{" "}
                                      </span>
                                      <span>{targetMem ? targetMem.title : targetId}</span>
                                      <span className="block text-[10px] text-muted-foreground/70 italic mt-0.5">
                                        "{rel.evidence}"
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/60 italic block">
                                No associations detected
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {expanded && (
                        <div className="pl-12">
                          <pre className="rounded-lg bg-black/40 border border-white/5 p-4 text-[10px] font-mono text-cyan-glow overflow-x-auto max-h-60 scrollbar leading-normal">
                            {JSON.stringify({ ...mem, importance, relationships: links }, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}

                {sortedAndFilteredMemories.length > memoriesLimit && (
                  <div className="pt-2 text-center">
                    <p className="text-xs text-muted-foreground mb-3 font-mono">
                      Showing {memoriesLimit} of {sortedAndFilteredMemories.length} promoted
                      memories.
                    </p>
                    <button
                      onClick={() => setMemoriesLimit((prev) => prev + 100)}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5 text-xs font-semibold text-foreground/90 transition-all hover:bg-white/[0.06] hover:text-white"
                    >
                      Show 100 More
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                title="No Promoted Memories Found"
                hint="No long-term memories have passed validation evaluation."
                icon={Brain}
              />
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* STORIES INSPECTOR TAB */}
        {/* ================================================================= */}
        {activeTab === "stories" && (
          <div className="space-y-4 animate-fade-in">
            {/* Search and Filters */}
            <div className="glass-panel p-4 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex items-center gap-2 bg-[#0c0f16] border border-white/10 rounded-xl px-3 py-2 w-full max-w-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search stories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none text-xs text-white outline-none w-full"
                />
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Status:</span>
                <select
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  className="rounded-lg border border-white/10 bg-[#0c0f16] px-2.5 py-1 text-xs text-foreground outline-none"
                >
                  <option value="all">All Stories</option>
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>

            {/* Stories */}
            {sortedAndFilteredStories.length > 0 ? (
              <div className="space-y-3">
                {sortedAndFilteredStories.map((story) => {
                  const expanded = expandedItems[story.id];
                  const linkedMemDetails = story.relatedMemoryIds
                    .map((id) => memories.find((m) => m.id === id))
                    .filter((m) => !!m) as Memory[];

                  const isCompleted = story.status === "Completed";

                  return (
                    <div key={story.id} className="glass-card p-5 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-glow/5 border border-cyan-glow/15 text-cyan-glow shrink-0 mt-0.5">
                            <BookOpen className="h-4.5 w-4.5" />
                          </span>
                          <div>
                            <h4 className="text-sm font-semibold text-white font-display">
                              {story.title}
                            </h4>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground/70 mt-1 font-mono">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                  isCompleted
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                                    : "bg-blue-500/10 text-blue-400 border border-blue-500/15"
                                }`}
                              >
                                {story.status}
                              </span>
                              <span>•</span>
                              <span>ID: {story.id}</span>
                              <span>•</span>
                              <span>Created: {new Date(story.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyJson(story)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-white"
                          >
                            <Copy className="h-3 w-3" /> Copy JSON
                          </button>
                          <button
                            onClick={() => toggleExpand(story.id)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-white"
                          >
                            {expanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="pl-12 space-y-3">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {story.summary}
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                          {/* Linked memories progress list */}
                          <div className="rounded-xl bg-white/[0.01] border border-white/5 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <strong className="block text-[10px] text-cyan-glow uppercase tracking-wider font-bold">
                                Narrative Progress Index
                              </strong>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {story.relatedMemoryIds.length} Nodes linked
                              </span>
                            </div>

                            {/* Custom progress bar */}
                            <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                              <div
                                style={{
                                  width: `${Math.min(100, story.relatedMemoryIds.length * 20)}%`,
                                }}
                                className="h-full bg-gradient-to-r from-cyan-glow to-violet rounded-full shadow-[0_0_8px_oklch(0.85_0.13_200)]"
                              />
                            </div>

                            {linkedMemoryList(linkedMemDetails)}
                          </div>

                          {/* Rule Provenance info */}
                          <div className="rounded-xl bg-white/[0.01] border border-white/5 p-4 space-y-2">
                            <strong className="block text-[10px] text-electric uppercase tracking-wider font-bold">
                              Cognitive Association Rule
                            </strong>
                            <div className="space-y-2 text-xs text-muted-foreground">
                              <div>
                                <span className="block text-[10px] uppercase font-mono tracking-wide text-muted-foreground/60">
                                  Clustering Provenance ID
                                </span>
                                <span className="font-mono text-foreground/80 bg-white/[0.03] border border-white/5 px-2 py-0.5 rounded block mt-1">
                                  {story.ruleProvenance || "N/A"}
                                </span>
                              </div>
                              <p className="leading-relaxed mt-2 italic text-[11px]">
                                Stories cluster related event milestones using temporal proximity
                                and contextual density filters.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {expanded && (
                        <div className="pl-12">
                          <pre className="rounded-lg bg-black/40 border border-white/5 p-4 text-[10px] font-mono text-cyan-glow overflow-x-auto max-h-60 scrollbar leading-normal">
                            {JSON.stringify(story, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] py-14 text-center">
                <span className="block text-sm font-semibold text-muted-foreground">
                  No stories found
                </span>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* IDENTITY INSPECTOR TAB */}
        {/* ================================================================= */}
        {activeTab === "identity" && (
          <div className="space-y-6 animate-fade-in">
            {/* Grid Split: Observations & Onboarding Hypotheses */}
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-5">
              {/* Emergent Identity Traits (Left) */}
              <div className="lg:col-span-4 space-y-4">
                <div className="glass-panel p-4 flex flex-wrap gap-4 items-center justify-between">
                  <h3 className="font-display text-sm font-semibold text-white uppercase tracking-wider">
                    Emergent Identity observations
                  </h3>
                  <div className="flex items-center gap-2 text-xs">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <select
                      value={filterValue}
                      onChange={(e) => setFilterValue(e.target.value)}
                      className="rounded-lg border border-white/10 bg-[#0c0f16] px-2.5 py-1 text-xs text-foreground outline-none"
                    >
                      <option value="all">All Categories</option>
                      <option value="WorkStyle">WorkStyle</option>
                      <option value="Aspiration">Aspiration</option>
                      <option value="CoreValue">CoreValue</option>
                      <option value="Onboarding">Onboarding</option>
                    </select>
                  </div>
                </div>

                {sortedAndFilteredObservations.length > 0 ? (
                  <div className="space-y-3">
                    {sortedAndFilteredObservations.map((obs) => {
                      const expanded = expandedItems[obs.id];
                      return (
                        <div key={obs.id} className="glass-card p-5 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet/5 border border-violet/15 text-violet shrink-0">
                                <Award className="h-4 w-4" />
                              </span>
                              <div>
                                <h4 className="text-xs uppercase tracking-widest text-muted-foreground/60">
                                  {obs.category} · {obs.name}
                                </h4>
                                <span className="block text-sm font-bold text-white font-display mt-0.5">
                                  {obs.value}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="rounded-lg bg-cyan-glow/5 border border-cyan-glow/15 px-2 py-0.5 font-mono text-xs font-bold text-cyan-glow">
                                {Math.round(obs.confidence * 100)}% Confidence
                              </span>
                              <button
                                onClick={() => copyJson(obs)}
                                className="p-1 text-muted-foreground hover:text-white"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => toggleExpand(obs.id)}
                                className="p-1 text-muted-foreground hover:text-white"
                              >
                                {expanded ? (
                                  <ChevronDown className="h-4.5 w-4.5" />
                                ) : (
                                  <ChevronRight className="h-4.5 w-4.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="pl-10 space-y-2">
                            <div className="text-xs text-muted-foreground leading-relaxed">
                              <strong>Supporting Evidence:</strong> {obs.provenance}
                            </div>
                            <div className="text-[10px] text-muted-foreground/60 font-mono flex flex-wrap gap-2">
                              <span>Stories: {obs.supportingStoryIds.length}</span>
                              <span>•</span>
                              <span>Memories: {obs.supportingMemoryIds.length}</span>
                            </div>
                          </div>

                          {expanded && (
                            <div className="pl-10 space-y-3">
                              {/* Confidence logs */}
                              <div className="rounded-lg bg-black/35 border border-white/5 p-3 space-y-2">
                                <span className="block text-[10px] text-violet uppercase tracking-wider font-bold">
                                  Confidence Mutation Log
                                </span>
                                <div className="space-y-2">
                                  {obs.confidenceHistory.map((h, hIdx) => (
                                    <div
                                      key={hIdx}
                                      className="text-xs flex flex-col gap-0.5 border-b border-white/5 pb-1.5 last:border-0 last:pb-0"
                                    >
                                      <div className="flex items-center justify-between text-[10px] font-mono">
                                        <span className="text-cyan-glow font-bold">
                                          {Math.round(h.confidence * 100)}%
                                        </span>
                                        <span className="text-muted-foreground/60">
                                          {new Date(h.timestamp).toLocaleString()}
                                        </span>
                                      </div>
                                      <span className="text-muted-foreground">{h.reason}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <pre className="rounded-lg bg-black/40 border border-white/5 p-4 text-[10px] font-mono text-cyan-glow overflow-x-auto max-h-48 scrollbar leading-normal">
                                {JSON.stringify(obs, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] py-10 text-center">
                    <span className="block text-sm font-semibold text-muted-foreground">
                      No emergent traits resolved
                    </span>
                  </div>
                )}
              </div>

              {/* Onboarding Hypotheses (Right) */}
              <div className="lg:col-span-3 space-y-4">
                <div className="glass-panel p-4">
                  <h3 className="font-display text-sm font-semibold text-white uppercase tracking-wider">
                    Onboarding Hypotheses ({hypotheses.length})
                  </h3>
                </div>

                {hypotheses.length > 0 ? (
                  <div className="space-y-3">
                    {hypotheses.map((hyp) => (
                      <div key={hyp.id} className="glass-card p-4.5 space-y-3 border-white/5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-glow font-mono block">
                              {hyp.category}
                            </span>
                            <h4 className="text-sm font-bold text-white font-display mt-0.5">
                              {hyp.name}
                            </h4>
                          </div>

                          <span
                            className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase ${
                              hyp.status === "Confirmed"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                                : hyp.status === "Rejected"
                                  ? "bg-red-500/10 text-red-400 border border-red-500/15"
                                  : "bg-amber-500/10 text-amber-400 border border-amber-500/15"
                            }`}
                          >
                            {hyp.status}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground/90 leading-relaxed">
                          {hyp.description}
                        </p>

                        <div className="text-[9px] text-muted-foreground/60 font-mono">
                          Evidence Stories:{" "}
                          {hyp.evidenceStoryIds.length > 0
                            ? hyp.evidenceStoryIds.join(", ")
                            : "None loaded"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] py-10 text-center">
                    <span className="block text-sm font-semibold text-muted-foreground">
                      No onboarding hypotheses found
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* IMPORTANCE INSPECTOR TAB */}
        {/* ================================================================= */}
        {activeTab === "importance" && (
          <div className="space-y-4 animate-fade-in">
            <div className="glass-panel p-4">
              <h3 className="font-display text-sm font-semibold text-white uppercase tracking-wider mb-1">
                Memory Importance Signal Evidence
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Importance signals evaluate why a memory remains cached in the recall index. This
                panel displays the qualitative evidence and context evaluations for each signal type
                rather than numeric scores.
              </p>
            </div>

            {memories.length > 0 ? (
              <div className="space-y-4">
                {memories.map((mem) => {
                  const importance = importanceService.getImportance(mem.id);
                  return (
                    <div key={mem.id} className="glass-card p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded bg-violet/5 border border-violet/15 text-violet">
                          <Award className="h-4 w-4" />
                        </span>
                        <div>
                          <h4 className="text-sm font-semibold text-white">{mem.title}</h4>
                          <span className="block text-[9px] text-muted-foreground/50 font-mono mt-0.5">
                            Memory ID: {mem.id}
                          </span>
                        </div>
                      </div>

                      <div className="hairline my-2" />

                      {importance && importance.signals.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                          {[
                            "Milestone",
                            "Reinforcement",
                            "Story Influence",
                            "User Intent",
                            "Relationships",
                            "Recency",
                          ].map((signalType) => {
                            const sig = importance.signals.find((s) => s.type === signalType);
                            const hasSig = !!sig;
                            return (
                              <div
                                key={signalType}
                                className={`rounded-xl border p-3.5 space-y-1.5 transition-all ${
                                  hasSig
                                    ? "bg-white/[0.015] border-white/10"
                                    : "bg-white/[0.005] border-white/5 opacity-55"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-white uppercase font-display">
                                    {signalType}
                                  </span>
                                  {hasSig && (
                                    <span className="rounded bg-cyan-glow/5 border border-cyan-glow/15 px-1.5 py-0.5 font-mono text-[9px] text-cyan-glow">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-normal italic">
                                  {hasSig
                                    ? `"${sig.explanation}"`
                                    : "No qualifying signal evidence identified."}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/60 italic block pl-2">
                          No importance signal evaluation logs mapped to this memory node.
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] py-14 text-center">
                <span className="block text-sm font-semibold text-muted-foreground">
                  No memories found to review signals
                </span>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* RECALL INSPECTOR TAB */}
        {/* ================================================================= */}
        {activeTab === "recall" && (
          <div className="space-y-6 animate-fade-in">
            {/* Active Recall Session Metadata Card */}
            <div className="glass-panel p-5 space-y-4">
              <h3 className="font-display text-sm font-semibold text-white uppercase tracking-wider border-b border-white/5 pb-2">
                Active Recall Cycle Snapshot
              </h3>

              {activeRecallSession ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs text-muted-foreground">
                  <div>
                    <span className="block text-[10px] uppercase font-mono tracking-wider text-muted-foreground/50">
                      Session UUID ID
                    </span>
                    <span className="font-mono text-foreground/80 block mt-1 truncate">
                      {activeRecallSession.sessionId}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono tracking-wider text-muted-foreground/50">
                      Retrieve Timestamp
                    </span>
                    <span className="text-foreground/80 block mt-1">
                      {new Date(activeRecallSession.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono tracking-wider text-muted-foreground/50">
                      Snapshot Stats
                    </span>
                    <span className="text-foreground/80 block mt-1">
                      {activeRecallSession.candidates.filter((c) => c.status === "Active").length}{" "}
                      Nodes Active ·{" "}
                      {activeRecallSession.candidates.filter((c) => c.status === "Inactive").length}{" "}
                      Inactive History
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground/60 italic block">
                  No active recall cycle snapshot compiled.
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-7 gap-5">
              {/* Recall Candidates list (Left) */}
              <div className="lg:col-span-4 space-y-4">
                <div className="glass-panel p-4">
                  <h3 className="font-display text-sm font-semibold text-white uppercase tracking-wider">
                    Recall Candidates Index
                  </h3>
                </div>

                {recallCandidates.length > 0 ? (
                  <div className="space-y-3">
                    {recallCandidates.map((c, index) => {
                      const details = memories.find((m) => m.id === c.memoryId);
                      const active = c.status === "Active";
                      return (
                        <div key={index} className="glass-card p-5 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <span
                                className={`grid h-8 w-8 place-items-center rounded-lg border shrink-0 mt-0.5 ${
                                  active
                                    ? "bg-cyan-glow/5 border-cyan-glow/20 text-cyan-glow"
                                    : "bg-white/[0.02] border-white/5 text-muted-foreground"
                                }`}
                              >
                                <Clock className="h-4.5 w-4.5" />
                              </span>
                              <div>
                                <h4 className="text-sm font-semibold text-white">
                                  {details ? details.title : c.memoryId}
                                </h4>
                                <span className="block text-[9px] text-muted-foreground/50 font-mono mt-0.5">
                                  Memory Ref: {c.memoryId}
                                </span>
                              </div>
                            </div>

                            <span
                              className={`rounded-lg px-2 py-0.5 text-[9px] font-bold uppercase ${
                                active
                                  ? "bg-cyan-glow/10 text-cyan-glow border border-cyan-glow/15 shadow-[0_0_6px_rgba(0,180,216,0.15)]"
                                  : "bg-white/[0.04] text-muted-foreground/60 border border-white/5"
                              }`}
                            >
                              {c.status}
                            </span>
                          </div>

                          <div className="pl-10 space-y-2">
                            {details && (
                              <p className="text-xs text-muted-foreground leading-normal">
                                {details.description}
                              </p>
                            )}

                            {/* Reasons */}
                            <div className="flex flex-wrap gap-1.5 pt-1.5">
                              {c.recallReasons.map((r, rIdx) => (
                                <span
                                  key={rIdx}
                                  className="rounded bg-white/[0.03] border border-white/5 px-2 py-0.5 font-mono text-[9px] text-muted-foreground/80"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] py-14 text-center">
                    <span className="block text-sm font-semibold text-muted-foreground">
                      No recall candidates cached
                    </span>
                  </div>
                )}
              </div>

              {/* Session Audit trail (Right) */}
              <div className="lg:col-span-3 space-y-4">
                <div className="glass-panel p-4">
                  <h3 className="font-display text-sm font-semibold text-white uppercase tracking-wider">
                    Recall Audit Log Trail
                  </h3>
                </div>

                {activeRecallSession && activeRecallSession.auditTrail.length > 0 ? (
                  <div className="glass-card p-4 space-y-4 max-h-[70vh] overflow-y-auto scrollbar">
                    <div className="relative border-l border-white/5 pl-4 ml-2 space-y-4.5 py-1">
                      {activeRecallSession.auditTrail.map((audit, aIdx) => {
                        const mDetails = memories.find((m) => m.id === audit.memoryId);
                        const activated = audit.reason.startsWith("Activated");

                        return (
                          <div key={aIdx} className="relative">
                            {/* node dot */}
                            <span
                              className={`absolute -left-[20.5px] top-1 h-2.5 w-2.5 rounded-full border border-[#05070b] ${
                                activated
                                  ? "bg-cyan-glow shadow-[0_0_6px_oklch(0.85_0.13_200)]"
                                  : "bg-muted-foreground/40"
                              }`}
                            />

                            <div className="text-xs space-y-0.5">
                              <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground/50">
                                <span>{new Date(audit.timestamp).toLocaleTimeString()}</span>
                              </div>
                              <span className="block font-semibold text-white">
                                {mDetails ? mDetails.title : audit.memoryId}
                              </span>
                              <span className="block text-muted-foreground">{audit.reason}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] py-10 text-center">
                    <span className="block text-sm font-semibold text-muted-foreground">
                      No audit events logged
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* CONTEXT PACKAGE INSPECTOR TAB */}
        {/* ================================================================= */}
        {activeTab === "context" && (
          <div className="space-y-6 animate-fade-in">
            {/* Overview stats */}
            <div className="glass-panel p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-3">
                <h3 className="font-display text-sm font-semibold text-white uppercase tracking-wider">
                  Dispatched Prompt Package
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyJson(contextPkg)}
                    disabled={!contextPkg}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
                  >
                    <Copy className="h-3 w-3" /> Copy Full JSON
                  </button>
                </div>
              </div>

              {contextPkg ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5 text-xs text-muted-foreground">
                  <div>
                    <span className="block text-[10px] uppercase font-mono tracking-wider text-muted-foreground/50">
                      Context Session ID
                    </span>
                    <span className="font-mono text-foreground/80 block mt-1 truncate">
                      {contextPkg.contextSessionId}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono tracking-wider text-muted-foreground/50">
                      Compiled At
                    </span>
                    <span className="text-foreground/80 block mt-1">
                      {new Date(contextPkg.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono tracking-wider text-muted-foreground/50">
                      Active Session Focus
                    </span>
                    <span className="text-cyan-glow font-bold block mt-1 truncate">
                      {activeSession?.task || "General Focus"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono tracking-wider text-muted-foreground/50">
                      Goals & Preferences count
                    </span>
                    <span className="text-foreground/80 block mt-1">
                      {contextPkg.currentGoals.length} Goals · {contextPkg.userPreferences.length}{" "}
                      Prefs
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground/60 italic block">
                  No active Context Package compiled in contextService.
                </span>
              )}
            </div>

            {contextPkg ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Visual Segment Panels (Left/Middle) */}
                <div className="lg:col-span-8 space-y-4">
                  {/* Goals & Preferences */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Goals */}
                    <div className="glass-card p-4 space-y-3">
                      <strong className="block text-xs uppercase tracking-wider font-bold text-violet">
                        Grounded Goals ({contextPkg.currentGoals.length})
                      </strong>
                      {contextPkg.currentGoals.length > 0 ? (
                        <div className="space-y-2.5">
                          {contextPkg.currentGoals.map((g, idx) => (
                            <div
                              key={idx}
                              className="text-xs border-b border-white/5 pb-2 last:border-0 last:pb-0"
                            >
                              <span className="text-foreground/90 font-medium block">
                                • {g.data}
                              </span>
                              <span className="block text-[10px] text-muted-foreground/60 mt-0.5">
                                Provenance: "{g.inclusionReason}"
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50 italic block">
                          No active goals parsed
                        </span>
                      )}
                    </div>

                    {/* Preferences */}
                    <div className="glass-card p-4 space-y-3">
                      <strong className="block text-xs uppercase tracking-wider font-bold text-cyan-glow">
                        User Preferences ({contextPkg.userPreferences.length})
                      </strong>
                      {contextPkg.userPreferences.length > 0 ? (
                        <div className="space-y-2.5">
                          {contextPkg.userPreferences.map((p, idx) => (
                            <div
                              key={idx}
                              className="text-xs border-b border-white/5 pb-2 last:border-0 last:pb-0"
                            >
                              <span className="text-foreground/90 font-medium block">
                                • {p.data}
                              </span>
                              <span className="block text-[10px] text-muted-foreground/60 mt-0.5">
                                Provenance: "{p.inclusionReason}"
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50 italic block">
                          No active preferences loaded
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Narrative Arc Anchors */}
                  <div className="glass-card p-4 space-y-3">
                    <strong className="block text-xs uppercase tracking-wider font-bold text-electric">
                      Active Narrative Arcs ({contextPkg.activeStories.length})
                    </strong>
                    {contextPkg.activeStories.length > 0 ? (
                      <div className="space-y-3">
                        {contextPkg.activeStories.map((s, idx) => (
                          <div
                            key={idx}
                            className="text-xs rounded-xl bg-white/[0.01] border border-white/5 p-3 leading-relaxed"
                          >
                            <div className="flex items-center justify-between border-b border-white/5 pb-1.5 mb-1.5">
                              <span className="font-semibold text-white">{s.data.title}</span>
                              <span className="text-[10px] bg-electric/5 border border-electric/15 px-1.5 py-0.5 rounded text-electric font-bold uppercase">
                                {s.data.status}
                              </span>
                            </div>
                            <p className="text-muted-foreground">{s.data.summary}</p>
                            <span className="block text-[10px] text-muted-foreground/60 font-mono mt-1.5">
                              Reason: {s.inclusionReason}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/50 italic block">
                        No active story narratives referenced
                      </span>
                    )}
                  </div>

                  {/* Constraints & History */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Constraints */}
                    <div className="glass-card p-4 space-y-3">
                      <strong className="block text-xs uppercase tracking-wider font-bold text-violet">
                        Important Constraints ({contextPkg.importantConstraints.length})
                      </strong>
                      {contextPkg.importantConstraints.length > 0 ? (
                        <div className="space-y-2.5">
                          {contextPkg.importantConstraints.map((c, idx) => (
                            <div
                              key={idx}
                              className="text-xs border-b border-white/5 pb-2 last:border-0 last:pb-0"
                            >
                              <span className="text-foreground/90 font-medium block">
                                • {c.data}
                              </span>
                              <span className="block text-[10px] text-muted-foreground/60 mt-0.5">
                                Provenance: "{c.inclusionReason}"
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50 italic block">
                          No active constraints parsed
                        </span>
                      )}
                    </div>

                    {/* Activity logs */}
                    <div className="glass-card p-4 space-y-3">
                      <strong className="block text-xs uppercase tracking-wider font-bold text-cyan-glow">
                        Recent Activity Summary ({contextPkg.recentActivitySummary.length})
                      </strong>
                      {contextPkg.recentActivitySummary.length > 0 ? (
                        <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4 leading-normal">
                          {contextPkg.recentActivitySummary.map((act, idx) => (
                            <li key={idx}>{act}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-muted-foreground/50 italic block">
                          No recent activities compiled
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Identity Traits package values (Right) */}
                <div className="lg:col-span-4 space-y-4">
                  <div className="glass-card p-4 space-y-3">
                    <strong className="block text-xs uppercase tracking-wider font-bold text-electric">
                      Dispatched Emergent Identity Traits ({contextPkg.identityObservations.length})
                    </strong>

                    {contextPkg.identityObservations.length > 0 ? (
                      <div className="space-y-3">
                        {contextPkg.identityObservations.map((obs, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl border border-white/5 bg-white/[0.015] p-3 text-xs leading-relaxed"
                          >
                            <div className="flex items-center justify-between border-b border-white/5 pb-1.5 mb-1.5">
                              <div>
                                <span className="block text-[9px] uppercase tracking-wide text-muted-foreground/50 font-mono font-bold">
                                  Category: {obs.data.category}
                                </span>
                                <span className="font-semibold text-white mt-0.5 block">
                                  {obs.data.name}
                                </span>
                              </div>
                              <span className="rounded bg-cyan-glow/5 border border-cyan-glow/15 px-1.5 py-0.5 font-mono text-[9px] text-cyan-glow">
                                {Math.round(obs.data.confidence * 100)}% Conf
                              </span>
                            </div>
                            <div className="font-medium text-foreground/90">
                              Value:{" "}
                              <strong className="text-white font-semibold font-display">
                                "{obs.data.value}"
                              </strong>
                            </div>
                            <span className="block text-[10px] text-muted-foreground/60 font-mono mt-1.5">
                              Reason: {obs.inclusionReason}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/50 italic block">
                        No active identity observations parsed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] py-14 text-center">
                <span className="block text-sm font-semibold text-muted-foreground">
                  Launch a workspace session first to compile context packages.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* DEVELOPER LOGS TAB */}
        {/* ================================================================= */}
        {activeTab === "logs" && (
          <div className="space-y-4 animate-fade-in">
            <div className="glass-panel p-4 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex items-center gap-2 bg-[#0c0f16] border border-white/10 rounded-xl px-3 py-2 w-full max-w-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none text-xs text-white outline-none w-full"
                />
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => {
                    logger.clear();
                    setLogs([]);
                    toast.success("Structured developer logs cleared!");
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border-red-500/10 bg-red-500/5 px-3 py-1 text-[10px] font-bold text-red-400 hover:bg-red-500/10"
                >
                  Clear Logs
                </button>
              </div>
            </div>

            {/* Filtered Logs List */}
            {(() => {
              const filteredLogs = logs.filter((l) => {
                return (
                  l.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  l.level.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (l.details &&
                    JSON.stringify(l.details).toLowerCase().includes(searchQuery.toLowerCase()))
                );
              });

              return filteredLogs.length > 0 ? (
                <div className="space-y-2.5">
                  {filteredLogs.slice(0, logsLimit).map((l, idx) => {
                    const expanded = expandedItems[`log_${idx}`];
                    const levelColors =
                      l.level === "error"
                        ? "text-red-400 border-red-400/20 bg-red-400/5"
                        : l.level === "warn"
                          ? "text-amber-400 border-amber-400/20 bg-amber-400/5"
                          : "text-cyan-glow border-cyan-glow/20 bg-cyan-glow/5";

                    return (
                      <div
                        key={idx}
                        className="glass-card p-4 space-y-2 animate-fade-in border-white/5 bg-white/[0.015]"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase border ${levelColors}`}
                            >
                              {l.level}
                            </span>
                            <span className="text-xs font-semibold text-white leading-normal font-sans">
                              {l.message}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-muted-foreground/60">
                              {new Date(l.timestamp).toLocaleTimeString()}
                            </span>
                            {!!l.details && (
                              <button
                                onClick={() => toggleExpand(`log_${idx}`)}
                                className="inline-flex h-6 items-center justify-center rounded border border-white/5 bg-white/[0.02] px-2 text-[9px] text-muted-foreground hover:bg-white/[0.05]"
                              >
                                {expanded ? "Collapse" : "Details"}
                              </button>
                            )}
                          </div>
                        </div>

                        {expanded && !!l.details && (
                          <pre className="rounded bg-black/40 border border-white/5 p-3 text-[9px] font-mono text-cyan-glow/90 overflow-x-auto max-h-48 scrollbar">
                            {JSON.stringify(l.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  })}

                  {filteredLogs.length > logsLimit && (
                    <div className="pt-2 text-center">
                      <p className="text-xs text-muted-foreground mb-3 font-mono">
                        Showing {logsLimit} of {filteredLogs.length} log traces.
                      </p>
                      <button
                        onClick={() => setLogsLimit((prev) => prev + 100)}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5 text-xs font-semibold text-foreground/90 transition-all hover:bg-white/[0.06] hover:text-white"
                      >
                        Show 100 More
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  title="No Developer Logs Found"
                  hint="No log events match your filter query."
                  icon={Terminal}
                />
              );
            })()}
          </div>
        )}
      </div>
    </Shell>
  );
}

// Sub-components helpers to make code neat and ESLint clean
function linkedMemoryList(memList: Memory[]) {
  if (memList.length === 0) {
    return (
      <span className="text-xs text-muted-foreground/50 italic block mt-1">
        No memories resolved
      </span>
    );
  }

  return (
    <div className="space-y-1.5 text-xs text-muted-foreground mt-2">
      {memList.map((m) => (
        <div
          key={m.id}
          className="flex gap-2 items-start border-b border-white/[0.03] pb-1 last:border-0 last:pb-0"
        >
          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-glow shrink-0" />
          <div>
            <span className="font-semibold text-foreground/85">{m.title}</span>
            <span className="block text-[10px] text-muted-foreground/75 mt-0.5 truncate">
              {m.description}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
