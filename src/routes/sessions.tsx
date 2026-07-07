import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Clock,
  Calendar,
  Sparkles,
  Search,
  ChevronRight,
  X,
  Activity,
  FileSpreadsheet,
  Brain,
  BookOpen,
  UserCheck,
} from "lucide-react";

import { Shell, PageHeader } from "@/components/akira/Shell";
import { CardShell, CardLabel, EmptyState, GhostButton } from "@/components/akira/primitives";
import { useAkira } from "@/services/akira-store";
import { candidateService } from "@/services/memory/candidate-service";
import { memoryService } from "@/services/memory/validation/memory-service";
import { storyService } from "@/services/stories/story-service";
import { identityService } from "@/services/identity/identity-service";

export const Route = createFileRoute("/sessions")({
  head: () => ({
    meta: [
      { title: "Session History — AKIRA" },
      { name: "description", content: "Review and inspect previous companion focus sessions." },
    ],
  }),
  component: SessionsHistoryPage,
});

type WorkSessionType = {
  id: string;
  projectId: string;
  task: string;
  startedAt: string;
  endedAt: string;
  duration: number;
  notes?: string;
};

function SessionsHistoryPage() {
  const sessions = useAkira((s) => s.sessions || []);
  const projects = useAkira((s) => s.projects || []);
  const memoriesLog = useAkira((s) => s.memories || []);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSession, setSelectedSession] = useState<WorkSessionType | null>(null);

  // Memoize search results
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const p = projects.find((proj) => proj.id === s.projectId);
      const projectName = p ? p.name : "Unknown Project";
      const matchesSearch =
        s.task.toLowerCase().includes(searchQuery.toLowerCase()) ||
        projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.notes && s.notes.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesSearch;
    });
  }, [sessions, projects, searchQuery]);

  // Dynamically resolve cognitive outcomes logged within the session timeframe
  const activeOutcomes = useMemo(() => {
    if (!selectedSession) return null;

    const start = new Date(selectedSession.startedAt).getTime();
    const end = new Date(selectedSession.endedAt).getTime();

    const events = memoriesLog.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= start && t <= end;
    });

    const candidates = candidateService.getCandidates().filter((c) => {
      const t = new Date(c.timestamp).getTime();
      return t >= start && t <= end;
    });

    const promoted = memoryService.getMemories().filter((m) => {
      const t = new Date(m.timestamp).getTime();
      return t >= start && t <= end;
    });

    const stories = storyService.getStories().filter((s) => {
      const t = new Date(s.updatedAt).getTime();
      return t >= start && t <= end;
    });

    const identity = identityService.getObservations().filter((o) => {
      const t = new Date(o.updatedAt).getTime();
      return t >= start && t <= end;
    });

    return { events, candidates, promoted, stories, identity };
  }, [selectedSession, memoriesLog]);

  return (
    <Shell>
      <PageHeader
        eyebrow="AKIRA · JOURNAL"
        title="Session History"
        subtitle="Review, audit, and reopen summaries of previous companion focus cycles."
      />

      <div className="mt-8 space-y-6">
        {/* Search bar */}
        {sessions.length > 0 && (
          <div className="glass-panel p-4 flex items-center gap-2 bg-[#0c0f16] max-w-md">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search sessions by task or project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none text-xs text-white outline-none w-full"
            />
          </div>
        )}

        {/* Sessions list */}
        {filteredSessions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSessions.map((sess) => {
              const project = projects.find((p) => p.id === sess.projectId);
              const projectName = project ? project.name : "Unknown Project";

              return (
                <div
                  key={sess.id}
                  onClick={() => setSelectedSession(sess)}
                  className="glass-card glass-card-hover p-5 flex flex-col justify-between cursor-pointer border-white/5 bg-white/[0.02]"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-glow font-mono">
                        {projectName}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1 font-mono">
                        <Clock className="h-3 w-3" /> {sess.duration} mins
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-white font-display leading-snug">
                      {sess.task || "Workspace Focus Session"}
                    </h4>

                    {sess.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-normal pt-1 italic">
                        "{sess.notes}"
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-muted-foreground/60">
                    <span className="flex items-center gap-1 font-mono">
                      <Calendar className="h-3 w-3" />{" "}
                      {new Date(sess.startedAt).toLocaleDateString()} ·{" "}
                      {new Date(sess.startedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-cyan-glow flex items-center gap-0.5 hover:text-white font-semibold">
                      Details <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : searchQuery ? (
          <EmptyState
            title="No Matching Sessions"
            hint="Try adjusting your keyword filter queries."
            icon={Search}
          />
        ) : (
          <EmptyState
            title="No Focus Sessions"
            hint="You haven't completed any focus cycles yet. Start a focus session in Chat Workspace."
            icon={Clock}
          />
        )}
      </div>

      {/* Reopen Summary dialog modal */}
      {selectedSession && activeOutcomes && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-xl p-7 animate-scale-in relative border-white/10 max-h-[85vh] flex flex-col">
            <button
              onClick={() => setSelectedSession(null)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="border-b border-white/5 pb-4 mb-4">
              <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-glow font-mono">
                {projects.find((p) => p.id === selectedSession.projectId)?.name ||
                  "Unknown Project"}
              </span>
              <h3 className="font-display text-lg font-bold text-white mt-1 leading-snug">
                {selectedSession.task || "Focus Workspace Session"}
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground/60 mt-1 font-mono">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />{" "}
                  {new Date(selectedSession.startedAt).toLocaleString()}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {selectedSession.duration} Minutes Duration
                </span>
              </div>
            </div>

            {/* Scrollable outcomes details */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1.5 scrollbar">
              {/* Notes */}
              <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
                <h5 className="text-[10px] uppercase tracking-wider text-cyan-glow font-bold">
                  Reflection Notes Summary
                </h5>
                <p className="text-xs text-foreground/95 leading-relaxed mt-2 italic">
                  {selectedSession.notes
                    ? `"${selectedSession.notes}"`
                    : "No reflection summary was entered."}
                </p>
              </div>

              {/* Events logged */}
              <div className="rounded-xl border border-white/5 bg-white/[0.015] p-4">
                <h5 className="text-[10px] uppercase tracking-wider text-cyan-glow font-bold flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-cyan-glow" /> Events Captured (
                  {activeOutcomes.events.length})
                </h5>
                {activeOutcomes.events.length > 0 ? (
                  <ul className="mt-2.5 space-y-2 text-xs text-muted-foreground">
                    {activeOutcomes.events.map((evt, idx) => (
                      <li
                        key={idx}
                        className="border-b border-white/[0.03] pb-1.5 last:border-0 last:pb-0"
                      >
                        • <strong className="text-foreground/85">{evt.title}</strong>:{" "}
                        {evt.description}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-xs text-muted-foreground/50 italic block mt-1.5">
                    No events recorded in this time window.
                  </span>
                )}
              </div>

              {/* Candidates evaluated */}
              <div className="rounded-xl border border-white/5 bg-white/[0.015] p-4">
                <h5 className="text-[10px] uppercase tracking-wider text-violet font-bold flex items-center gap-1.5">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-violet" /> Candidates Evaluated (
                  {activeOutcomes.candidates.length})
                </h5>
                {activeOutcomes.candidates.length > 0 ? (
                  <ul className="mt-2.5 space-y-2 text-xs text-muted-foreground">
                    {activeOutcomes.candidates.map((cand, idx) => (
                      <li
                        key={idx}
                        className="border-b border-white/[0.03] pb-1.5 last:border-0 last:pb-0"
                      >
                        • <strong className="text-foreground/85">{cand.title}</strong>
                        <span className="block text-[10px] text-muted-foreground/60 mt-0.5">
                          Reason: {cand.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-xs text-muted-foreground/50 italic block mt-1.5">
                    No candidate memory nodes triggered.
                  </span>
                )}
              </div>

              {/* Memories promoted */}
              <div className="rounded-xl border border-white/5 bg-white/[0.015] p-4">
                <h5 className="text-[10px] uppercase tracking-wider text-electric font-bold flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 text-electric" /> Memories Promoted (
                  {activeOutcomes.promoted.length})
                </h5>
                {activeOutcomes.promoted.length > 0 ? (
                  <ul className="mt-2.5 space-y-2.5 text-xs text-muted-foreground">
                    {activeOutcomes.promoted.map((mem, idx) => (
                      <li key={idx} className="rounded border border-white/5 bg-white/[0.01] p-2.5">
                        <strong className="text-white font-medium block">{mem.title}</strong>
                        <span className="text-muted-foreground block mt-0.5">
                          {mem.description}
                        </span>
                        <span className="text-[10px] text-electric block mt-1">
                          Outcome explanation: {mem.explanation}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-xs text-muted-foreground/50 italic block mt-1.5">
                    No long-term memories promoted in this timeframe.
                  </span>
                )}
              </div>

              {/* Stories & Trait changes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Stories updated */}
                <div className="rounded-xl border border-white/5 bg-white/[0.015] p-4">
                  <h5 className="text-[10px] uppercase tracking-wider text-cyan-glow font-bold flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-cyan-glow" /> Stories Altered (
                    {activeOutcomes.stories.length})
                  </h5>
                  {activeOutcomes.stories.length > 0 ? (
                    <ul className="mt-2.5 space-y-1.5 text-xs text-muted-foreground">
                      {activeOutcomes.stories.map((s, idx) => (
                        <li key={idx}>• {s.title}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/50 italic block mt-1.5">
                      No narrative arcs updated.
                    </span>
                  )}
                </div>

                {/* Identity observations */}
                <div className="rounded-xl border border-white/5 bg-white/[0.015] p-4">
                  <h5 className="text-[10px] uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-amber-400" /> Identity observations (
                    {activeOutcomes.identity.length})
                  </h5>
                  {activeOutcomes.identity.length > 0 ? (
                    <ul className="mt-2.5 space-y-1.5 text-xs text-muted-foreground">
                      {activeOutcomes.identity.map((obs, idx) => (
                        <li key={idx}>
                          • <span className="font-semibold">{obs.name}</span>: "{obs.value}"
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/50 italic block mt-1.5">
                      No trait changes registered.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-white/5 flex justify-end">
              <GhostButton
                onClick={() => setSelectedSession(null)}
                className="h-10 text-xs font-semibold px-5"
              >
                Close Summary
              </GhostButton>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
