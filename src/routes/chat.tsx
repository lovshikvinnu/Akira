import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Send,
  Sparkles,
  Power,
  PanelRightOpen,
  PanelRightClose,
  PanelLeftOpen,
  PanelLeftClose,
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
  Plus,
  Trash2,
  History,
  MessageSquare,
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

const CHAT_HISTORY_STORAGE_KEY = "akira:chat:history:v1";

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function generateTitle(firstMessage: string): string {
  let text = firstMessage
    .replace(/[#*`_~[\]()]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length > 45) {
    text = text.slice(0, 42).trim() + "...";
  }

  return text || "New Conversation";
}

interface GroupedConversations {
  today: ChatConversation[];
  yesterday: ChatConversation[];
  last7Days: ChatConversation[];
  older: ChatConversation[];
}

function groupConversations(conversations: ChatConversation[]): GroupedConversations {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOf7DaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const grouped: GroupedConversations = {
    today: [],
    yesterday: [],
    last7Days: [],
    older: [],
  };

  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  for (const conv of sorted) {
    const time = new Date(conv.updatedAt).getTime();
    if (time >= startOfToday) {
      grouped.today.push(conv);
    } else if (time >= startOfYesterday) {
      grouped.yesterday.push(conv);
    } else if (time >= startOf7DaysAgo) {
      grouped.last7Days.push(conv);
    } else {
      grouped.older.push(conv);
    }
  }

  return grouped;
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

  // Local state for ChatGPT-like conversation lifecycle
  const [conversations, setConversations] = useState<ChatConversation[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);

  // Dynamic Context Package state
  const [contextPackage, setContextPackage] = useState<ContextPackage | null>(() =>
    contextService.getActiveContext(),
  );

  // Session Initiation States
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [focusTask, setFocusTask] = useState("");
  const [isConversing, setIsConversing] = useState(false);

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return "Good Morning";
    if (hr < 17) return "Good Afternoon";
    return "Good Evening";
  };

  const startProjectSession = (projectId: string, task?: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    akira.startSession(projectId, task || project.nextTask || "Continuing work");

    eventService.record(
      "project_continued",
      "Companion Session Started",
      `Initiated companion workspace session for "${project.name}" focusing on: "${task || project.nextTask || "Unspecified task"}"`,
      projectId,
    );

    contextBuilder.rebuildContextPackage();
    toast.success(`Companion session active: ${project.name}`);
  };

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

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const activeMessagesCount = activeConv?.messages.length || 0;

  // Initialize chat as fresh conversation on mount
  useEffect(() => {
    setActiveConversationId(null);
    setIsConversing(false);
    akira.clearChat();
    setDraft("");
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [activeMessagesCount]);

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

      const interruptedText = currentResponseTextRef.current + " *[Response interrupted by user]*";

      if (activeMessageIdRef.current) {
        akira.updateChatMessage(activeMessageIdRef.current, interruptedText);
      }

      // Update locally as well
      if (activeConversationId) {
        setConversations((prev) => {
          const updated = prev.map((c) => {
            if (c.id === activeConversationId) {
              return {
                ...c,
                messages: c.messages.map((m, idx) =>
                  idx === c.messages.length - 1 ? { ...m, text: interruptedText } : m,
                ),
                updatedAt: new Date().toISOString(),
              };
            }
            return c;
          });
          localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });
      }

      toast.info("AI response streaming cancelled.");
    }
  };

  const handleSelectConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setActiveConversationId(id);
    setIsConversing(true);

    // Sync to store for presence/intelligence services
    akira.clearChat();
    conv.messages.forEach((msg) => {
      akira.addChatMessage(msg.role, msg.text);
    });
  };

  const handleDeleteConversation = (id: string) => {
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);
    localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(updated));

    if (activeConversationId === id) {
      setActiveConversationId(null);
      setIsConversing(false);
      akira.clearChat();
    }
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
    setIsConversing(false);
    akira.clearChat();
    setDraft("");
  };

  // Handle message sending via real AI Context Engine
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;

    const userText = draft.trim();
    setDraft("");

    // Force scroll to bottom on user send
    isNearBottomRef.current = true;

    // Resolve or create active conversation
    let convId = activeConversationId;

    const currentHistory = activeConversationId
      ? conversations.find((c) => c.id === activeConversationId)?.messages || []
      : [];

    if (!convId) {
      convId = uid();

      const newConv: ChatConversation = {
        id: convId,
        title: generateTitle(userText),
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Update conversations state
      setConversations((prev) => {
        const updated = [newConv, ...prev];
        localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });

      setActiveConversationId(convId);
      setIsConversing(true);
      akira.clearChat();
    }

    // Create user message
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text: userText,
      createdAt: new Date().toISOString(),
    };

    // Append user message locally
    setConversations((prev) => {
      const updated = prev.map((c) => {
        if (c.id === convId) {
          return {
            ...c,
            messages: [...c.messages, userMsg],
            updatedAt: new Date().toISOString(),
          };
        }
        return c;
      });
      localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });

    // Also sync to global store's chat array using existing store methods
    akira.addChatMessage("user", userText);

    let currentProjectId: string | undefined = activeSession?.projectId;

    // If no active session, check if message or context selects a project
    if (!activeSession) {
      const matchedProject = projects.find((p) =>
        userText.toLowerCase().includes(p.name.toLowerCase()),
      );
      if (matchedProject) {
        startProjectSession(matchedProject.id);
        currentProjectId = matchedProject.id;
      } else {
        setIsConversing(true);
      }
    }

    // Record interaction event in Brain Pipeline (which could trigger Candidates)
    eventService.record(
      "note_created",
      "Workspace Interaction",
      `User query submitted to AKIRA: "${userText}"`,
      currentProjectId,
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

    // Create placeholder for AI message in global store
    const aiMessage = akira.addChatMessage("akira", "");
    activeMessageIdRef.current = aiMessage.id;

    // Create placeholder for AI message locally
    const aiLocalMsgId = uid();
    const aiLocalMsg: ChatMessage = {
      id: aiLocalMsgId,
      role: "akira",
      text: "",
      createdAt: new Date().toISOString(),
    };

    setConversations((prev) => {
      const updated = prev.map((c) => {
        if (c.id === convId) {
          return {
            ...c,
            messages: [...c.messages, aiLocalMsg],
            updatedAt: new Date().toISOString(),
          };
        }
        return c;
      });
      localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });

    // Sync context package
    const currentContext = contextService.getActiveContext() || undefined;

    try {
      await aiContextEngine.executeRequestStream(
        userText,
        (chunk) => {
          setCompanionState("responding");
          currentResponseTextRef.current += chunk;

          // Update message in global store
          akira.updateChatMessage(aiMessage.id, currentResponseTextRef.current);

          // Update message locally
          setConversations((prev) => {
            const updated = prev.map((c) => {
              if (c.id === convId) {
                return {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === aiLocalMsgId ? { ...m, text: currentResponseTextRef.current } : m,
                  ),
                  updatedAt: new Date().toISOString(),
                };
              }
              return c;
            });
            localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(updated));
            return updated;
          });

          // Auto-scroll if appropriate
          if (isNearBottomRef.current && scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
          }
        },
        currentContext,
        {
          systemInstruction:
            "You are AKIRA, a helpful and premium AI companion for personal growth. Respond with the approved presence guidelines: truth before comfort, compassion, accountability, humility, and earned familiarity. Speak directly and thoughtfully. Use formatting like lists, headers, quotes, and code blocks only when they genuinely aid understanding, and keep responses concise and grounded." +
            (activeSession || currentProjectId
              ? ""
              : `\n\n[AVAILABLE PROJECTS]\n` +
                projects.map((p) => `- ${p.name} (Tag: ${p.tag})`).join("\n") +
                `\nIf the user asks to start/continue work or select a project, ask them to clarify which project they want to work on. Encourage them to pick one of the available projects above.`),
          signal: controller.signal,
          history: currentHistory,
        },
      );
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === "AbortError" || error.message?.includes("abort")) {
        // Already handled in handleCancel
      } else {
        console.error("AI engine stream query failed:", err);
        let errorMessage =
          "I encountered an issue connecting to my cognitive core. Please verify your network or retry.";

        const activeProvider = providerState.activeProvider;
        const apiKey =
          activeProvider === "OpenRouter" ? providerState.openRouterKey : providerState.geminiKey;
        if (!apiKey) {
          errorMessage = `I'm running in Local Companion Mode. To connect me to live cognitive services via ${activeProvider}, please configure an API key in settings.`;
        } else if (error.message?.includes("API key") || error.message?.includes("key")) {
          errorMessage = `My ${activeProvider} API key appears to be invalid. Please verify the API key configured in settings.`;
        } else if (
          error.message?.includes("timeout") ||
          error.message?.includes("Failed to fetch")
        ) {
          errorMessage =
            "The connection timed out while awaiting a response. Let's try again in a moment when your network stabilizes.";
        }

        akira.updateChatMessage(aiMessage.id, `⚠️ **System Note:** ${errorMessage}`);

        // Update locally with error message
        setConversations((prev) => {
          const updated = prev.map((c) => {
            if (c.id === convId) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === aiLocalMsgId ? { ...m, text: `⚠️ **System Note:** ${errorMessage}` } : m,
                ),
                updatedAt: new Date().toISOString(),
              };
            }
            return c;
          });
          localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });
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
    setIsConversing(false);
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

  const renderHistoryGroup = (title: string, list: ChatConversation[]) => {
    if (list.length === 0) return null;
    return (
      <div className="space-y-1.5 pt-3 first:pt-0">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 px-2 font-mono">
          {title}
        </h4>
        <div className="space-y-1">
          {list.map((conv) => (
            <div
              key={conv.id}
              onClick={() => handleSelectConversation(conv.id)}
              className={`group relative flex items-center justify-between rounded-xl p-2.5 cursor-pointer text-xs transition-all border ${
                activeConversationId === conv.id
                  ? "border-violet/30 bg-violet/5 text-white"
                  : "border-transparent text-muted-foreground hover:bg-white/[0.03] hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2 truncate pr-6">
                <MessageSquare
                  className={`h-3.5 w-3.5 shrink-0 ${
                    activeConversationId === conv.id ? "text-violet" : "text-muted-foreground/60"
                  }`}
                />
                <span className="truncate font-medium">{conv.title}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteConversation(conv.id);
                }}
                title="Delete Chat"
                className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:bg-white/10 hover:text-red-400 transition-all animate-fade-in"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // View: No active workspace session & not conversing
  if (!activeSession && !isConversing && !isEndingFinished) {
    return (
      <Shell>
        <div className="flex gap-6 mt-8">
          {/* Chat History Sidebar */}
          {isHistoryOpen && (
            <div className="w-64 shrink-0 glass-card p-4 flex flex-col justify-between overflow-hidden animate-fade-in h-[70vh]">
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/5">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-glow font-mono flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" /> Chat History
                  </span>
                  <button
                    type="button"
                    onClick={handleNewChat}
                    title="New Conversation"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-muted-foreground transition-all hover:bg-white/[0.06] hover:text-white"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Conversations List Grouped */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar">
                  {conversations.length > 0 ? (
                    <>
                      {renderHistoryGroup("Today", groupConversations(conversations).today)}
                      {renderHistoryGroup("Yesterday", groupConversations(conversations).yesterday)}
                      {renderHistoryGroup(
                        "Previous 7 Days",
                        groupConversations(conversations).last7Days,
                      )}
                      {renderHistoryGroup("Older", groupConversations(conversations).older)}
                    </>
                  ) : (
                    <div className="text-center py-8 text-xs text-muted-foreground/45 italic">
                      No conversations yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Main Landing Area */}
          <div className="flex-grow flex min-h-[70vh] flex-col items-center justify-center px-4 py-12 text-center animate-page-enter relative">
            {/* Toggle History Button on Landing Page */}
            <div className="absolute top-0 left-0">
              <button
                type="button"
                onClick={() => setIsHistoryOpen((prev) => !prev)}
                title="Toggle Chat History"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-muted-foreground transition-all hover:bg-white/[0.06] hover:text-white"
              >
                {isHistoryOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Decorative glowing background */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute top-1/3 left-1/2 h-[350px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet/5 blur-[120px] animate-akira-pulse" />
            </div>

            <div className="relative w-full max-w-2xl space-y-10">
              {/* Header / Greetings */}
              <div className="space-y-4">
                <h2 className="font-display text-4xl font-bold tracking-tight text-white md:text-5xl">
                  {getGreeting()}
                </h2>
                <p className="text-lg text-muted-foreground font-medium">
                  What's on your mind today?
                </p>
              </div>

              {/* Input Form */}
              <form onSubmit={handleSend} className="relative group w-full">
                <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-violet/30 to-electric/30 opacity-40 blur-sm group-focus-within:opacity-100 transition duration-500" />
                <div className="relative flex items-center rounded-2xl border border-white/10 bg-[#0c0f16]/90 p-2 shadow-2xl backdrop-blur-md">
                  <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Message AKIRA..."
                    className="h-12 w-full bg-transparent px-4 py-3 text-base text-white outline-none placeholder:text-muted-foreground/50"
                    required
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="btn-glow flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-40"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
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
                setIsConversing(false);
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
              type="button"
              onClick={() => setIsHistoryOpen((prev) => !prev)}
              title="Toggle Chat History"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-muted-foreground transition-all hover:bg-white/[0.06] hover:text-white"
            >
              {isHistoryOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              title="Toggle Awareness Snapshot"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-muted-foreground transition-all hover:bg-white/[0.06] hover:text-white"
            >
              {isSidebarOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>
            {activeSession && (
              <button
                onClick={() => setShowNotesForm(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/25"
              >
                <Power className="h-3.5 w-3.5" /> Close Session
              </button>
            )}
          </div>
        }
      />

      <div className="mt-8 flex gap-6">
        {/* Chat History Sidebar */}
        {isHistoryOpen && (
          <div className="w-64 shrink-0 glass-card p-4 flex flex-col justify-between overflow-hidden animate-fade-in h-[52vh]">
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/5">
                <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-glow font-mono flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" /> Chat History
                </span>
                <button
                  type="button"
                  onClick={handleNewChat}
                  title="New Conversation"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-muted-foreground transition-all hover:bg-white/[0.06] hover:text-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Grouped Conversations List */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar">
                {conversations.length > 0 ? (
                  <>
                    {renderHistoryGroup("Today", groupConversations(conversations).today)}
                    {renderHistoryGroup("Yesterday", groupConversations(conversations).yesterday)}
                    {renderHistoryGroup(
                      "Previous 7 Days",
                      groupConversations(conversations).last7Days,
                    )}
                    {renderHistoryGroup("Older", groupConversations(conversations).older)}
                  </>
                ) : (
                  <div className="text-center py-8 text-xs text-muted-foreground/45 italic">
                    No conversations yet
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace Area (Chat + Right Sidebar) */}
        <div className="flex-grow min-w-0 grid grid-cols-12 gap-6">
          {/* Left/Chat Column */}
          <div
            className={`col-span-12 transition-all duration-300 ${isSidebarOpen ? "lg:col-span-8" : "col-span-12"}`}
          >
            {/* Active Work Session Stats */}
            {activeSession && (
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
                        {activeSession.task || "General Workspace Focus"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">
                      Session Started:
                    </span>
                    <span className="rounded-lg border border-white/10 bg-[#0c0f16] px-2.5 py-1 text-xs font-semibold text-cyan-glow">
                      {new Date(activeSession.startedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Conversation view or Local Mode Card */}
            {(
              providerState.activeProvider === "OpenRouter"
                ? providerState.openRouterKey
                : providerState.geminiKey
            ) ? (
              <div className="glass-card flex h-[52vh] flex-col p-0 overflow-hidden">
                <div
                  ref={scrollRef}
                  onScroll={handleScroll}
                  className="flex-1 space-y-6 overflow-y-auto px-6 py-6 scrollbar"
                >
                  {activeConv?.messages.map((m) => (
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
                              Accessing brain memory nodes, narrative anchors, and active
                              projects...
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
                    placeholder="Message AKIRA..."
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
                    Transparency Panel reads directly from Context Package. Ephemeral snapshot
                    unloads at closure.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
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
