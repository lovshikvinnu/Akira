import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Send,
  Sparkles,
  Power,
  PanelRightOpen,
  PanelRightClose,
  Brain,
  Goal,
  ShieldAlert,
  HelpCircle,
  Eye,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  Folder,
  Play,
  ArrowRight,
  Cpu,
} from "lucide-react";
import { toast } from "sonner";

import { Shell, PageHeader } from "@/components/akira/Shell";
import { GhostButton } from "@/components/akira/primitives";
import { useAkira, akira, type ChatMessage } from "@/services/akira-store";
import { eventService } from "@/services/events/event-service";
import { candidateService } from "@/services/memory/candidate-service";
import { memoryService } from "@/services/memory/validation/memory-service";
import { storyService } from "@/services/stories/story-service";
import { identityService } from "@/services/identity/identity-service";
import { contextService } from "@/services/context/context-service";
import { contextBuilder } from "@/services/context/context-builder";
import { hypothesesService } from "@/services/identity/hypotheses";
import { aiContextEngine } from "@/services/ai/context-engine";
import { ContextPackage } from "@/services/context/types";
import { MarkdownRenderer } from "@/components/akira/MarkdownRenderer";
import { useAIProviderManager } from "@/services/ai/provider-manager";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Companion Workspace — AKIRA" },
      { name: "description", content: "AKIRA Companion Workspace - Active Session and Awareness." },
    ],
  }),
  component: CompanionWorkspacePage,
});

interface LoggedEvent {
  title: string;
  description: string;
}

interface CandidateNode {
  title: string;
  reason: string;
}

interface PermanentMemory {
  title: string;
  description: string;
  explanation: string;
}

interface StoryNarrative {
  title: string;
}

interface EmergentTrait {
  name: string;
  value: string;
}

function CompanionWorkspacePage() {
  const profile = useAkira((s) => s.profile);
  const activeSession = useAkira((s) => s.activeSession);
  const projects = useAkira((s) => s.projects);
  const messages = useAkira((s) => s.chat);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const providerState = useAIProviderManager();

  // UI Panel configurations
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Dynamic Context Package state
  const [contextPackage, setContextPackage] = useState<ContextPackage | null>(() =>
    contextService.getActiveContext(),
  );

  // Session Initiation States
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [focusTask, setFocusTask] = useState("");

  // Session Closing States
  const [showNotesForm, setShowNotesForm] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  const [isEndingFinished, setIsEndingFinished] = useState(false);

  // Session Outcomes Accumulator State (REAL Reflection Summary Data)
  const [sessionEvents, setSessionEvents] = useState<LoggedEvent[]>([]);
  const [sessionCandidates, setSessionCandidates] = useState<CandidateNode[]>([]);
  const [sessionMemories, setSessionMemories] = useState<PermanentMemory[]>([]);
  const [sessionStories, setSessionStories] = useState<StoryNarrative[]>([]);
  const [sessionIdentity, setSessionIdentity] = useState<EmergentTrait[]>([]);

  // Streaming & loading states
  const [companionState, setCompanionState] = useState<
    "idle" | "preparing" | "thinking" | "responding"
  >("idle");
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeMessageIdRef = useRef<string | null>(null);
  const currentResponseTextRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);

  // Auto-scroll chat
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);

  // Focus and keyboard shortcuts
  useEffect(() => {
    inputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus input on '/'
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      // Cancel on Escape
      if (e.key === "Escape" && isLoading) {
        handleCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLoading]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const threshold = 100;
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
    isNearBottomRef.current = isAtBottom;
  };

  // Subscribe to real Context Package updates
  useEffect(() => {
    const unsub = contextService.subscribe((event) => {
      if (event.type === "Created" || event.type === "Updated") {
        setContextPackage(event.package);
      } else if (event.type === "Expired") {
        setContextPackage(null);
      }
    });
    return unsub;
  }, []);

  // Listen to outcomes created during an active work session
  useEffect(() => {
    if (!activeSession) {
      setSessionEvents([]);
      setSessionCandidates([]);
      setSessionMemories([]);
      setSessionStories([]);
      setSessionIdentity([]);
      return;
    }

    // Restore temporary session state (Session Continuity/Crash Recovery)
    const start = new Date(activeSession.startedAt).getTime();

    const initialEvents = akira
      .getState()
      .memories.filter((e) => new Date(e.timestamp).getTime() >= start)
      .map((e) => ({ title: e.title, description: e.description }));

    const initialCandidates = candidateService
      .getCandidates()
      .filter((c) => new Date(c.timestamp).getTime() >= start)
      .map((c) => ({ title: c.title, reason: c.reason }));

    const initialMemories = memoryService
      .getMemories()
      .filter((m) => new Date(m.timestamp).getTime() >= start)
      .map((m) => ({ title: m.title, description: m.description, explanation: m.explanation }));

    const initialStories = storyService
      .getStories()
      .filter((s) => new Date(s.updatedAt).getTime() >= start)
      .map((s) => ({ title: s.title }));

    const initialIdentity = identityService
      .getObservations()
      .filter((o) => new Date(o.updatedAt).getTime() >= start)
      .map((o) => ({ name: o.name, value: o.value }));

    setSessionEvents(initialEvents as LoggedEvent[]);
    setSessionCandidates(initialCandidates as CandidateNode[]);
    setSessionMemories(initialMemories as PermanentMemory[]);
    setSessionStories(initialStories as StoryNarrative[]);
    setSessionIdentity(initialIdentity as EmergentTrait[]);

    const unsubEvent = eventService.onRecord((evt) => {
      setSessionEvents((prev) => [...prev, evt as LoggedEvent]);
    });

    const unsubCandidate = candidateService.subscribe((cand) => {
      setSessionCandidates((prev) => [...prev, cand as CandidateNode]);
    });

    const unsubMemory = memoryService.subscribe((mem) => {
      setSessionMemories((prev) => [...prev, mem as PermanentMemory]);
    });

    const unsubStory = storyService.subscribe((evt) => {
      setSessionStories((prev) => [...prev, evt.story as StoryNarrative]);
    });

    const unsubIdentity = identityService.subscribe((evt) => {
      setSessionIdentity((prev) => [...prev, evt.observation as EmergentTrait]);
    });

    return () => {
      unsubEvent();
      unsubCandidate();
      unsubMemory();
      unsubStory();
      unsubIdentity();
    };
  }, [activeSession]);

  // Handle beginning a focus session
  const handleBeginSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      toast.error("Please select a project.");
      return;
    }

    const project = projects.find((p) => p.id === selectedProjectId);
    if (!project) return;

    // Call store to start session
    akira.startSession(selectedProjectId, focusTask);

    // Record Event: Session Started
    eventService.record(
      "project_continued",
      "Companion Session Started",
      `Initiated companion workspace session for "${project.name}" focusing on: "${focusTask || "Unspecified task"}"`,
      selectedProjectId,
    );

    // Force rebuild of context package to load newly activated project and session metadata
    contextBuilder.rebuildContextPackage();

    toast.success(`Companion session active: ${project.name}`);
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setCompanionState("idle");
      if (activeMessageIdRef.current) {
        akira.updateChatMessage(
          activeMessageIdRef.current,
          currentResponseTextRef.current + " *[Response interrupted by user]*",
        );
      }
      toast.info("AI response streaming cancelled.");
    }
  };

  // Handle message sending via real AI Context Engine
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;

    const userText = draft.trim();
    setDraft("");

    // Force scroll to bottom on user send
    isNearBottomRef.current = true;

    // Append user message to store
    akira.addChatMessage("user", userText);

    // Record interaction event in Brain Pipeline (which could trigger Candidates)
    eventService.record(
      "note_created",
      "Workspace Interaction",
      `User query submitted to AKIRA: "${userText}"`,
      activeSession?.projectId,
    );

    setIsLoading(true);
    setCompanionState("preparing");
    currentResponseTextRef.current = "";

    // 1. Preparing Context Phase (subtle 500ms delay to show AKIRA assembling snapshot)
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (abortControllerRef.current?.signal.aborted) return;

    setCompanionState("thinking");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Create the empty/thinking placeholder message for AKIRA in the store
    const aiMessage = akira.addChatMessage("akira", "");
    activeMessageIdRef.current = aiMessage.id;

    try {
      await aiContextEngine.executeRequestStream(
        userText,
        (chunk) => {
          setCompanionState("responding");
          currentResponseTextRef.current += chunk;

          // Update the message in the store
          akira.updateChatMessage(aiMessage.id, currentResponseTextRef.current);

          // Auto-scroll if appropriate
          if (isNearBottomRef.current && scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
          }
        },
        contextPackage || undefined,
        {
          systemInstruction:
            "You are AKIRA, a helpful and premium AI companion for personal growth. Respond with the approved presence guidelines: truth before comfort, compassion, accountability, humility, and earned familiarity. Speak directly and thoughtfully. Use formatting like lists, headers, quotes, and code blocks only when they genuinely aid understanding, and keep responses concise and grounded.",
          signal: controller.signal,
        },
      );
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === "AbortError" || error.message?.includes("abort")) {
        // Already handled in handleCancel or caught here
      } else {
        console.error("AI engine stream query failed:", err);
        let errorMessage =
          "I encountered an issue connecting to my cognitive core. Please verify your network or retry.";

        const apiKey = providerState.geminiKey;
        if (!apiKey) {
          errorMessage =
            "I'm running in Local Companion Mode. To connect me to live cognitive services, please configure an API key in settings.";
        } else if (error.message?.includes("API key") || error.message?.includes("key")) {
          errorMessage =
            "My cognitive services API key appears to be invalid. Please verify the API key configured in settings.";
        } else if (
          error.message?.includes("timeout") ||
          error.message?.includes("Failed to fetch")
        ) {
          errorMessage =
            "The connection timed out while awaiting a response. Let's try again in a moment when your network stabilizes.";
        }

        akira.updateChatMessage(aiMessage.id, `⚠️ **System Note:** ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
      setCompanionState("idle");
      abortControllerRef.current = null;
      activeMessageIdRef.current = null;

      if (isNearBottomRef.current && scrollRef.current) {
        setTimeout(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        }, 50);
      }
    }
  };

  // Close session action
  const handleCloseSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeSession) return;

    const project = projects.find((p) => p.id === activeSession.projectId);
    const projectName = project ? project.name : "Unknown Project";

    // Record Event: Session Ended
    eventService.record(
      "note_edited",
      "Companion Session Ended",
      `Concluded workspace session for "${projectName}". Summary notes: "${sessionNotes || "No notes added"}"`,
      activeSession.projectId,
    );

    // End active session in store
    akira.endSession(sessionNotes);

    // Transition UI to outcome report
    setShowNotesForm(false);
    setIsEndingFinished(true);
  };

  // Compute average confidence from active traits
  const avgConfidence =
    contextPackage && contextPackage.identityObservations.length > 0
      ? Math.round(
          (contextPackage.identityObservations.reduce((acc, o) => acc + o.data.confidence, 0) /
            contextPackage.identityObservations.length) *
            100,
        )
      : 80;

  // Active Story titles
  const activeStoriesTitles =
    contextPackage && contextPackage.activeStories.length > 0
      ? contextPackage.activeStories.map((s) => s.data.title).join(", ")
      : "No active narrative anchors loaded";

  // Awareness Gaps (Proposed hypotheses from hypothesesService)
  const activeGaps = hypothesesService.getHypotheses().filter((h) => h.status === "Proposed");

  // View: No active workspace session
  if (!activeSession && !isEndingFinished) {
    return (
      <Shell>
        <PageHeader
          eyebrow="AKIRA · ENTRY"
          title="Companion Workspace"
          subtitle="Choose a project focus and define your intent to begin the session."
        />

        <section className="mt-8 grid grid-cols-12 gap-6">
          <div className="glass-panel col-span-12 max-w-xl p-8 mx-auto lg:col-span-8 lg:mx-0">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet/10 text-violet shadow-[0_0_15px_oklch(0.68_0.22_295_/_0.2)]">
                <Play className="h-5 w-5 animate-pulse" />
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold text-white">
                  Initialize Companion Session
                </h3>
                <p className="text-xs text-muted-foreground">
                  Loads long-term goals and configures the active Awareness Snapshot.
                </p>
              </div>
            </div>

            <form onSubmit={handleBeginSession} className="mt-8 space-y-6">
              {/* Project Select */}
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Select Working Project
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        if (p.nextTask) setFocusTask(p.nextTask);
                      }}
                      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                        selectedProjectId === p.id
                          ? "border-violet/60 bg-violet/5 shadow-[0_4px_20px_oklch(0.68_0.22_295_/_0.15)]"
                          : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-cyan-glow">
                        <Folder className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold truncate text-foreground">
                          {p.name}
                        </span>
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">
                          {p.tag}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Task/Focus Input */}
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Define Active Focus Target
                </span>
                <input
                  type="text"
                  value={focusTask}
                  onChange={(e) => setFocusTask(e.target.value)}
                  placeholder="e.g. Debug compiler parsing grammar rules..."
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0f16] px-4 text-sm text-white outline-none transition-colors focus:border-violet/60"
                  required
                />
              </div>

              {/* Action Button */}
              <button
                type="submit"
                disabled={!selectedProjectId}
                className="btn-glow flex w-full h-11 items-center justify-center gap-2 text-sm font-semibold disabled:opacity-40"
              >
                Start Companion Session <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      </Shell>
    );
  }

  // View: Reflection Outcomes Summary (Session Closed)
  if (isEndingFinished) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#05070b] text-foreground">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 h-[450px] w-[450px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet/10 blur-[130px] animate-akira-pulse" />
        </div>

        <div className="relative flex max-w-xl w-full flex-col p-6 text-center animate-fade-in">
          <div className="mb-6 flex flex-col items-center">
            <CheckCircle2 className="h-14 w-14 text-cyan-glow animate-pulse" />
            <h3 className="mt-4 font-display text-2xl font-bold tracking-tight text-white font-semibold">
              Reflection Stage Completed
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Events successfully consolidated and evaluated by long-term Brain engines.
            </p>
          </div>

          {/* Genuine Outcomes Display */}
          <div className="space-y-4 text-left max-h-[50vh] overflow-y-auto pr-2 scrollbar">
            {/* Events logged */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <h4 className="text-[10px] uppercase tracking-wider text-cyan-glow font-bold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-glow shadow-[0_0_8px_oklch(0.85_0.13_200)]" />
                Real Events Logged ({sessionEvents.length})
              </h4>
              {sessionEvents.length > 0 ? (
                <ul className="mt-2.5 space-y-1.5 text-xs text-muted-foreground">
                  {sessionEvents.map((evt, idx) => (
                    <li key={idx}>
                      • <strong className="text-foreground/80">{evt.title}</strong>:{" "}
                      {evt.description}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground/60 mt-1.5">
                  No telemetry events captured.
                </p>
              )}
            </div>

            {/* Candidates generated */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <h4 className="text-[10px] uppercase tracking-wider text-violet font-bold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-violet shadow-[0_0_8px_oklch(0.68_0.22_295)]" />
                Candidates Evaluated ({sessionCandidates.length})
              </h4>
              {sessionCandidates.length > 0 ? (
                <ul className="mt-2.5 space-y-1.5 text-xs text-muted-foreground">
                  {sessionCandidates.map((c, idx) => (
                    <li key={idx}>
                      • <strong className="text-foreground/85">{c.title}</strong> (Reason:{" "}
                      {c.reason})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground/60 mt-1.5">
                  No candidate nodes triggered evaluation threshold.
                </p>
              )}
            </div>

            {/* Memories promoted */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <h4 className="text-[10px] uppercase tracking-wider text-electric font-bold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-electric shadow-[0_0_8px_oklch(0.72_0.19_250)]" />
                Permanent Memories Promoted ({sessionMemories.length})
              </h4>
              {sessionMemories.length > 0 ? (
                <ul className="mt-2.5 space-y-1.5 text-xs text-muted-foreground">
                  {sessionMemories.map((m, idx) => (
                    <li key={idx} className="rounded border border-white/5 bg-white/[0.01] p-2">
                      <span className="font-semibold text-foreground/90 block">{m.title}</span>
                      <span className="block text-[11px] mt-0.5 text-muted-foreground">
                        {m.description}
                      </span>
                      <span className="block text-[9px] text-electric mt-1">
                        Explanation: {m.explanation}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground/60 mt-1.5">
                  No memories consolidated to permanent store during this session.
                </p>
              )}
            </div>

            {/* Stories and emergent identity traits */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <h4 className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
                  Stories Mutated
                </h4>
                {sessionStories.length > 0 ? (
                  <ul className="mt-2 text-xs text-muted-foreground space-y-1">
                    {sessionStories.map((s, idx) => (
                      <li key={idx}>• {s.title}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] text-muted-foreground/50 mt-1.5">No stories altered.</p>
                )}
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <h4 className="text-[10px] uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
                  Emergent Identity
                </h4>
                {sessionIdentity.length > 0 ? (
                  <ul className="mt-2 text-xs text-muted-foreground space-y-1">
                    {sessionIdentity.map((obs, idx) => (
                      <li key={idx}>
                        • {obs.name}: {obs.value}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                    No emergent trait changes.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-10">
            <button
              onClick={() => {
                setIsEndingFinished(false);
                setSessionNotes("");
              }}
              className="btn-glow w-full max-w-xs py-3 text-sm font-semibold tracking-wide"
            >
              See you later
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Shell>
      <PageHeader
        eyebrow="AKIRA · SESSION"
        title="Companion Workspace"
        subtitle="Conversational companion workspace connected directly to your Brain core."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-muted-foreground transition-all hover:bg-white/[0.06] hover:text-white"
            >
              {isSidebarOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => setShowNotesForm(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/25"
            >
              <Power className="h-3.5 w-3.5" /> Close Session
            </button>
          </div>
        }
      />

      <div className="mt-8 grid grid-cols-12 gap-6">
        {/* Left/Chat Column */}
        <div
          className={`col-span-12 transition-all duration-300 ${isSidebarOpen ? "lg:col-span-8" : "col-span-12"}`}
        >
          {/* Active Work Session Stats */}
          <div className="glass-card mb-5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03] text-cyan-glow">
                  <TrendingUp className="h-4 w-4 animate-pulse" />
                </span>
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 block">
                    Active Session Focus
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {activeSession?.task || "General Workspace Focus"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Session Started:</span>
                <span className="rounded-lg border border-white/10 bg-[#0c0f16] px-2.5 py-1 text-xs font-semibold text-cyan-glow">
                  {activeSession ? new Date(activeSession.startedAt).toLocaleTimeString() : "--:--"}
                </span>
              </div>
            </div>
          </div>

          {/* Conversation view or Local Mode Card */}
          {providerState.geminiKey ? (
            <div className="glass-card flex h-[52vh] flex-col p-0 overflow-hidden">
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 space-y-6 overflow-y-auto px-6 py-6 scrollbar"
              >
                {messages.map((m) => (
                  <ChatMessageItem key={m.id} m={m} isUser={m.role === "user"} />
                ))}

                {isLoading && companionState !== "responding" && (
                  <div className="flex justify-start animate-fade-in">
                    <div className="max-w-[80%] w-full rounded-2xl rounded-tl-sm border border-cyan-glow/15 bg-cyan-glow/[0.02] px-5 py-4 text-sm text-foreground/80 flex flex-col gap-2 shadow-[0_4px_24px_rgba(0,180,216,0.06)]">
                      <div className="flex items-center gap-3">
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-glow opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-glow"></span>
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-glow">
                          {companionState === "preparing"
                            ? "Preparing Context Package..."
                            : "Synthesizing Reflection Core..."}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground/85 font-mono">
                        {companionState === "preparing" && (
                          <span className="animate-pulse">
                            Accessing brain memory nodes, narrative anchors, and active projects...
                          </span>
                        )}
                        {companionState === "thinking" && (
                          <span className="animate-pulse">
                            Assembling parameters and consulting long-term memory engine...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input Form */}
              <form
                onSubmit={handleSend}
                className="flex items-center gap-2 border-t border-white/[0.06] p-3 bg-white/[0.01]"
              >
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Talk to your companion... (Press '/' to focus)"
                  className="h-11 flex-1 rounded-xl border border-white/10 bg-[#0c0f16] px-4 text-sm text-white outline-none transition-colors focus:border-violet/60"
                  disabled={isLoading}
                />
                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-5 text-sm font-semibold text-red-400 transition-all hover:bg-red-500/20"
                  >
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="btn-glow inline-flex h-11 items-center gap-2 px-5 text-sm font-medium disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" /> Send
                  </button>
                )}
              </form>
            </div>
          ) : (
            <div className="glass-panel flex flex-col items-center justify-center p-8 text-center animate-fade-in my-6 border-violet/20 bg-violet/5 shadow-[0_4px_30px_rgba(139,92,246,0.05)]">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet/10 text-violet shadow-[0_0_15px_oklch(0.68_0.22_295_/_0.2)] mb-5">
                <Cpu className="h-6 w-6 animate-pulse" />
              </span>
              <h3 className="font-display text-lg font-bold tracking-tight text-white mb-2">
                Local Companion Mode
              </h3>
              <p className="max-w-md text-sm text-muted-foreground leading-relaxed mb-4">
                AKIRA is currently operating without an external AI provider. The Brain, Memory
                Engine, Reflection Engine, Sessions, and Brain Inspector remain fully operational.
              </p>
              <p className="max-w-md text-sm text-muted-foreground leading-relaxed mb-6">
                Configure an AI provider to enable live conversations.
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: "/settings", search: { tab: "providers" } })}
                className="btn-glow px-6 py-2.5 text-sm font-semibold"
              >
                Configure Provider
              </button>
            </div>
          )}
        </div>

        {/* Right/Transparency Column */}
        {isSidebarOpen && (
          <div className="col-span-12 lg:col-span-4 animate-fade-in">
            <div className="glass-card flex flex-col h-full p-5 space-y-6">
              <div>
                <h3 className="font-display text-sm font-bold tracking-wide flex items-center gap-2 text-white uppercase tracking-[0.08em]">
                  <Brain className="h-4.5 w-4.5 text-cyan-glow" /> Real Awareness Snapshot
                </h3>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Active working model read dynamically from your Brain.
                </p>
              </div>

              <div className="hairline" />

              {/* Data list displays */}
              <div className="space-y-4 flex-1">
                {/* Confidence Level */}
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 block mb-1">
                    Cognitive Confidence
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-glow bg-cyan-glow/5 border border-cyan-glow/10 px-2 py-0.5 rounded-md">
                      Active
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Average: <strong className="text-foreground">{avgConfidence}%</strong>
                    </span>
                  </div>
                </div>

                {/* Active Story Anchor */}
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 block mb-1.5">
                    Active Story Anchor
                  </span>
                  <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3 flex items-center gap-3">
                    <div className="grid h-7 w-7 place-items-center rounded bg-gradient-to-br from-violet/20 to-electric/20 text-violet shrink-0">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="block text-xs font-semibold truncate text-foreground/90">
                        {activeStoriesTitles}
                      </span>
                      <span className="block text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">
                        Story Narrative
                      </span>
                    </div>
                  </div>
                </div>

                {/* Current Goals */}
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 block mb-2 flex items-center gap-1 font-bold">
                    <Goal className="h-3.5 w-3.5 text-electric" /> Current Goals (
                    {contextPackage?.currentGoals.length || 0})
                  </span>
                  {contextPackage && contextPackage.currentGoals.length > 0 ? (
                    <ul className="space-y-2">
                      {contextPackage.currentGoals.map((g, idx) => (
                        <li
                          key={idx}
                          className="flex gap-2 text-xs text-muted-foreground align-top"
                        >
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-electric shrink-0" />
                          <span>{g.data}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 italic">No goals defined</p>
                  )}
                </div>

                {/* Awareness Gaps */}
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 block mb-2 flex items-center gap-1 font-bold">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500/80" /> Awareness Gaps (
                    {activeGaps.length})
                  </span>
                  {activeGaps.length > 0 ? (
                    <ul className="space-y-2">
                      {activeGaps.map((gap, idx) => (
                        <li
                          key={idx}
                          className="flex gap-2 rounded-lg bg-amber-500/5 border border-amber-500/10 p-2.5 text-xs text-amber-300/80 align-top"
                        >
                          <HelpCircle className="h-4 w-4 shrink-0 text-amber-400" />
                          <div>
                            <strong className="block text-[11px] text-foreground/95">
                              {gap.name}
                            </strong>
                            <span className="block mt-0.5">{gap.description}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 italic">
                      No active knowledge gaps detected
                    </p>
                  )}
                </div>
              </div>

              <div className="hairline" />

              <div className="flex gap-2 text-[10px] text-muted-foreground/60">
                <Eye className="h-4 w-4 shrink-0" />
                <p>
                  Transparency Panel reads directly from Context Package. Ephemeral snapshot unloads
                  at closure.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Closure Form Modal Overlay */}
      {showNotesForm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md p-6 animate-scale-in">
            <h3 className="font-display text-lg font-semibold text-white">End Focus Session</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Add reflections or notes on the work accomplished. These will be logged as structured
              outcomes in the Brain.
            </p>

            <form onSubmit={handleCloseSessionSubmit} className="mt-5 space-y-4">
              <textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="Describe what was done, what challenges were hit, or what next steps exist..."
                className="w-full min-h-[100px] rounded-xl border border-white/10 bg-[#0c0f16] px-3.5 py-3 text-sm text-foreground outline-none transition-colors focus:border-violet/60"
              />

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNotesForm(false)}
                  className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-glow px-4 py-2 text-xs font-semibold">
                  Confirm & Consolidate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Shell>
  );
}

const ChatMessageItem = React.memo(({ m, isUser }: { m: ChatMessage; isUser: boolean }) => {
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-message-enter`}>
      <div
        className={
          isUser
            ? "max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-violet/40 to-electric/30 px-4.5 py-3.5 text-sm text-foreground shadow-[0_8px_24px_-12px_oklch(0.55_0.22_290_/_0.4)]"
            : "max-w-[80%] w-full rounded-2xl rounded-tl-sm border border-white/[0.06] bg-white/[0.03] px-5 py-4 text-sm text-foreground/90 shadow-sm"
        }
      >
        {isUser ? (
          <div className="mb-1.5 flex items-center justify-end gap-2 text-[9px] uppercase tracking-[0.18em] text-violet font-semibold">
            <span className="text-muted-foreground/30 font-mono font-normal tracking-normal lowercase mr-1">
              {new Date(m.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            You
          </div>
        ) : (
          <div className="mb-2 flex items-center justify-between border-b border-white/5 pb-2 text-[10px] uppercase tracking-[0.2em] font-bold">
            <div className="flex items-center gap-1.5 text-cyan-glow">
              <Sparkles className="h-3.5 w-3.5 animate-spin-slow" /> AKIRA
            </div>
            <span className="text-muted-foreground/30 font-mono font-normal tracking-normal lowercase">
              {new Date(m.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}

        {isUser ? (
          <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
        ) : (
          <MarkdownRenderer content={m.text} />
        )}
      </div>
    </div>
  );
});

ChatMessageItem.displayName = "ChatMessageItem";
