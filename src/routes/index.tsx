import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Mic,
  CheckCircle2,
  Circle,
  Cpu,
  Sparkles,
  Plus,
  CheckSquare,
  RefreshCw,
  FileText,
  Activity,
  Folder,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/app/shell/Shell";
import { AiCore } from "@/app/ui/AiCore";
import { CardShell, CardLabel, ProjectIcon } from "@/app/ui/primitives";
import { StreakIcon } from "@/app/ui/streak-icon";
import { CaptureThoughtDialog } from "@/app/ui/dialogs/CaptureThoughtDialog";
import { VoiceComingSoonDialog } from "@/app/ui/dialogs/VoiceComingSoonDialog";
import { useAkira, akira, selectors } from "@/akira-os";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AKIRA — AI Companion for Growth" },
      {
        name: "description",
        content:
          "Your futuristic AI companion. Daily missions, projects, brain dump and deep focus.",
      },
      { property: "og:title", content: "AKIRA — AI Companion for Growth" },
      { property: "og:description", content: "A premium AI operating system for personal growth." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const profile = useAkira((s) => s.profile);

  return (
    <Shell>
      <section className="mt-8 grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-cyan-glow shadow-[0_0_10px_oklch(0.85_0.13_200)]" />
            AKIRA · ONLINE
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight md:text-5xl">
            <span className="text-gradient-akira">Good evening, {profile.name}</span>
            <span className="ml-2 inline-block animate-akira-float">👋</span>
          </h1>
          <p className="mt-3 max-w-lg text-base text-muted-foreground">
            One step closer to <span className="text-foreground">Lovshik 2.0</span>. What are we
            building today?
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate({ to: "/tasks" })}
              className="btn-glow inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
            >
              <Sparkles className="h-4 w-4" />
              Start daily mission
            </button>
            <button
              onClick={() => setVoiceOpen(true)}
              className="inline-flex items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-foreground/90 transition-all hover:border-white/20 hover:bg-white/[0.06]"
            >
              <Mic className="h-4 w-4" />
              Voice brain dump
            </button>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5">
          <AiCore />
        </div>
      </section>

      <section className="mt-10 grid grid-cols-12 gap-5">
        <ContinueYesterday />
        <TodaysMission />
        <BrainDumpCard onCapture={() => setCaptureOpen(true)} onVoice={() => setVoiceOpen(true)} />
        <ProjectsCard />
        <ConsistencyCard />
        <TodaysActivity />
      </section>

      <CaptureThoughtDialog open={captureOpen} onOpenChange={setCaptureOpen} />
      <VoiceComingSoonDialog open={voiceOpen} onOpenChange={setVoiceOpen} />
    </Shell>
  );
}

function ContinueYesterday() {
  const navigate = useNavigate();
  const projects = useAkira((s) => s.projects);
  const tasks = useAkira((s) => s.tasks);
  const memories = useAkira((s) => s.memories || []);
  const sessions = useAkira((s) => s.sessions || []);
  const lastProjectId = useAkira((s) => s.lastProjectId);

  const lastActiveProject = useMemo(() => {
    if (sessions.length > 0) {
      const p = projects.find((proj) => proj.id === sessions[0].projectId);
      if (p) return p;
    }
    return projects.find((p) => p.id === lastProjectId) ?? projects[0];
  }, [sessions, projects, lastProjectId]);

  const yesterdayStats = useMemo(() => {
    const yesterdayStart = new Date();
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date();
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const yesterdayMemories = memories.filter((m) => {
      const t = new Date(m.timestamp).getTime();
      return t >= yesterdayStart.getTime() && t <= yesterdayEnd.getTime();
    });

    const yesterdaySessions = sessions.filter((s) => {
      const t = new Date(s.startedAt).getTime();
      return t >= yesterdayStart.getTime() && t <= yesterdayEnd.getTime();
    });

    const workedMinutes = yesterdaySessions.reduce((acc, s) => acc + s.duration, 0);
    const projectsWorkedCount = new Set(yesterdaySessions.map((s) => s.projectId)).size;
    const completedTasksCount = yesterdayMemories.filter(
      (m) => m.eventType === "task_completed",
    ).length;
    const createdNotesCount = yesterdayMemories.filter(
      (m) => m.eventType === "note_created",
    ).length;

    return {
      workedMinutes,
      projectsWorkedCount,
      completedTasksCount,
      createdNotesCount,
    };
  }, [memories, sessions]);

  if (!lastActiveProject) {
    return (
      <CardShell className="col-span-12 md:col-span-7">
        <CardLabel accent="electric">Continue yesterday</CardLabel>
        <h3 className="mt-3 font-display text-2xl font-semibold">No active project</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Create one to pick up where you left off.
        </p>
        <button
          onClick={() => navigate({ to: "/projects" })}
          className="btn-glow mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> New project
        </button>
      </CardShell>
    );
  }

  const lastCompletedTask = tasks.find((t) => t.done && t.projectId === lastActiveProject.id);
  const nextSuggestedTask = lastActiveProject.nextTask || "Define next milestone";

  return (
    <CardShell className="col-span-12 md:col-span-7">
      <div className="grid grid-cols-12 gap-6 h-full">
        {/* Left Side: Active project action */}
        <div className="col-span-12 sm:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div
                className={`grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br ${lastActiveProject.color} opacity-85`}
              >
                <ProjectIcon icon={lastActiveProject.icon} className="h-3.5 w-3.5 text-white" />
              </div>
              <CardLabel accent="electric">Continue yesterday</CardLabel>
            </div>
            <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              {lastActiveProject.name}
            </h3>

            <div className="mt-4 space-y-2 text-xs">
              {lastCompletedTask && (
                <div className="text-muted-foreground">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block">
                    Last completed task
                  </span>
                  <span className="font-medium text-foreground/90">{lastCompletedTask.title}</span>
                </div>
              )}
              <div className="text-muted-foreground">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block">
                  Next suggested task
                </span>
                <span className="font-semibold text-cyan-glow animate-pulse">
                  {nextSuggestedTask}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              akira.touchProject(lastActiveProject.id);
              navigate({ to: "/projects/$id", params: { id: lastActiveProject.id } });
            }}
            className="btn-glow mt-6 self-start inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Vertical divider */}
        <div className="hidden sm:block sm:col-span-1 w-px bg-white/[0.06] self-stretch justify-self-center" />

        {/* Right Side: Yesterday summary */}
        <div className="col-span-12 sm:col-span-4 flex flex-col justify-center">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Yesterday you
          </span>
          <ul className="mt-4 space-y-3.5 text-xs text-foreground/95">
            <li className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-glow" />
              <span>
                Worked{" "}
                <strong className="text-cyan-glow font-semibold">
                  {yesterdayStats.workedMinutes}
                </strong>{" "}
                minutes
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-violet" />
              <span>
                Active in{" "}
                <strong className="text-violet font-semibold">
                  {yesterdayStats.projectsWorkedCount}
                </strong>{" "}
                Project{yesterdayStats.projectsWorkedCount === 1 ? "" : "s"}
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>
                Completed{" "}
                <strong className="text-emerald-400 font-semibold">
                  {yesterdayStats.completedTasksCount}
                </strong>{" "}
                task{yesterdayStats.completedTasksCount === 1 ? "" : "s"}
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-electric" />
              <span>
                Created{" "}
                <strong className="text-electric font-semibold">
                  {yesterdayStats.createdNotesCount}
                </strong>{" "}
                note{yesterdayStats.createdNotesCount === 1 ? "" : "s"}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </CardShell>
  );
}

function TodaysMission() {
  const navigate = useNavigate();
  const tasks = useAkira((s) => s.tasks);
  const pct = useAkira(selectors.taskProgress);
  const circ = 2 * Math.PI * 32;

  const remainingMinutes = useMemo(() => {
    return tasks.filter((t) => !t.done).reduce((acc, t) => acc + (t.estimatedDuration || 0), 0);
  }, [tasks]);

  const formattedRemaining = useMemo(() => {
    if (remainingMinutes === 0) return "Done";
    const hrs = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    if (hrs > 0) return `${hrs}h ${mins}m left`;
    return `${remainingMinutes}m left`;
  }, [remainingMinutes]);

  const completedCount = tasks.filter((t) => t.done).length;

  return (
    <CardShell className="col-span-12 md:col-span-5">
      <div className="flex items-start justify-between">
        <div>
          <CardLabel accent="violet">Today's mission</CardLabel>
          <h3 className="mt-3 font-display text-xl font-semibold">
            {tasks.length} mission{tasks.length === 1 ? "" : "s"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {completedCount} of {tasks.length} done · {formattedRemaining}
          </p>
        </div>
        <div className="relative h-20 w-20">
          <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="32"
              stroke="oklch(1 0 0 / 0.08)"
              strokeWidth="6"
              fill="none"
            />
            <circle
              cx="40"
              cy="40"
              r="32"
              stroke="url(#missGrad)"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            />
            <defs>
              <linearGradient id="missGrad" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.78 0.2 295)" />
                <stop offset="100%" stopColor="oklch(0.78 0.18 220)" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 grid place-items-center font-display text-base font-semibold">
            {pct}%
          </div>
        </div>
      </div>

      <ul className="mt-5 space-y-2.5">
        {tasks.slice(0, 5).map((task) => (
          <li key={task.id}>
            <button
              onClick={() => akira.toggleTask(task.id)}
              className="group flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left text-sm transition-colors hover:bg-white/[0.03]"
            >
              {task.done ? (
                <CheckCircle2 className="h-4 w-4 text-cyan-glow" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
              )}
              <span
                className={task.done ? "text-muted-foreground line-through" : "text-foreground/90"}
              >
                {task.title}
              </span>
            </button>
          </li>
        ))}
        {tasks.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
            <CheckSquare
              className="h-4 w-4 mx-auto mb-2 text-muted-foreground/40"
              strokeWidth={1.5}
            />
            <span>No missions active today. Click below to add one.</span>
          </div>
        )}
      </ul>

      <button
        onClick={() => navigate({ to: "/tasks" })}
        className="mt-4 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Manage missions →
      </button>
    </CardShell>
  );
}

function BrainDumpCard({ onCapture, onVoice }: { onCapture: () => void; onVoice: () => void }) {
  const notes = useAkira((s) => s.notes);

  return (
    <CardShell className="col-span-12 md:col-span-5">
      <div className="flex items-center justify-between">
        <CardLabel accent="cyan">Brain dump</CardLabel>
        <button
          onClick={onVoice}
          title="Voice capture"
          aria-label="Voice capture"
          className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-cyan-glow transition-all hover:scale-105 hover:border-white/25"
        >
          <Mic className="h-3.5 w-3.5" />
        </button>
      </div>
      <h3 className="mt-3 font-display text-xl font-semibold">Recent thoughts</h3>
      <ul className="mt-5 space-y-3">
        {notes.slice(0, 3).map((n) => (
          <li
            key={n.id}
            className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-sm text-foreground/85"
          >
            {n.title && (
              <div className="font-semibold text-[11px] text-cyan-glow mb-1">{n.title}</div>
            )}
            <div className="line-clamp-2 text-foreground/90">{n.content}</div>
          </li>
        ))}
        {notes.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
            <FileText className="h-4 w-4 mx-auto mb-2 text-muted-foreground/40" strokeWidth={1.5} />
            <span>No thoughts captured yet.</span>
          </div>
        )}
      </ul>
      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={onCapture}
          className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Capture thought
        </button>
        <Link
          to="/notes"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Open Brain Dump →
        </Link>
      </div>
    </CardShell>
  );
}

function ProjectsCard() {
  const projects = useAkira((s) => s.projects);
  const navigate = useNavigate();

  return (
    <CardShell className="col-span-12 md:col-span-7">
      <div className="flex items-center justify-between">
        <CardLabel accent="violet">Projects</CardLabel>
        <Link
          to="/projects"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          View all →
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        {projects.slice(0, 3).map((p) => {
          const edited = new Date(p.lastWorked);
          return (
            <button
              key={p.id}
              onClick={() => navigate({ to: "/projects/$id", params: { id: p.id } })}
              className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-left transition-all hover:-translate-y-[2px] hover:border-white/20"
            >
              <div className="flex items-center justify-between">
                <div
                  className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${p.color} opacity-90`}
                >
                  <ProjectIcon icon={p.icon} className="h-4 w-4 text-white" />
                </div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {p.tag}
                </span>
              </div>
              <div className="mt-4 font-display text-base font-semibold">{p.name}</div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full bg-gradient-to-r ${p.color}`}
                  style={{ width: `${p.progress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{p.progress}%</span>
                <span>{relativeTime(edited)}</span>
              </div>
            </button>
          );
        })}
        {projects.length === 0 && (
          <div className="col-span-3 py-8 text-center text-xs text-muted-foreground border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
            <Folder className="h-4 w-4 mx-auto mb-2 text-muted-foreground/40" strokeWidth={1.5} />
            <span>No projects created yet. Use the link above to start.</span>
          </div>
        )}
      </div>
    </CardShell>
  );
}

function ConsistencyCard() {
  const streaks = useAkira((s) => s.streaks);
  return (
    <CardShell className="col-span-12 lg:col-span-8">
      <div className="flex items-center justify-between">
        <CardLabel accent="electric">Consistency</CardLabel>
        <span className="text-xs text-muted-foreground">Last 30 days</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {streaks.map((s) => {
          const r = 26;
          const circ = 2 * Math.PI * r;
          return (
            <button
              key={s.id}
              onClick={() => toast(`${s.label}: ${s.days} day streak`)}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-left transition-all hover:-translate-y-[2px] hover:border-white/20"
            >
              <div className="flex items-center justify-between">
                <div
                  className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${s.color} opacity-90`}
                >
                  <StreakIcon icon={s.icon} className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="relative h-14 w-14">
                  <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
                    <circle
                      cx="32"
                      cy="32"
                      r={r}
                      stroke="oklch(1 0 0 / 0.08)"
                      strokeWidth="4"
                      fill="none"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r={r}
                      stroke="url(#sgrad)"
                      strokeWidth="4"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${(s.pct / 100) * circ} ${circ}`}
                    />
                    <defs>
                      <linearGradient id="sgrad" x1="0" x2="1" y1="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.78 0.2 295)" />
                        <stop offset="100%" stopColor="oklch(0.85 0.13 200)" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 grid place-items-center text-[11px] font-semibold">
                    {s.pct}%
                  </div>
                </div>
              </div>
              <div className="mt-3 font-display text-sm font-semibold">{s.label}</div>
              <div className="text-[11px] text-muted-foreground">{s.days} day streak</div>
            </button>
          );
        })}
      </div>
    </CardShell>
  );
}

function TodaysActivity() {
  const memories = useAkira((s) => s.memories);
  const projects = useAkira((s) => s.projects);

  const todayMemories = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return memories.filter((m) => new Date(m.timestamp).getTime() >= todayStart.getTime());
  }, [memories]);

  const notesCount = todayMemories.filter((m) => m.eventType === "note_created").length;
  const workedProjects = useMemo(() => {
    const projectIds = todayMemories
      .filter((m) => m.eventType === "project_continued")
      .map((m) => m.relatedProjectId)
      .filter(Boolean);
    const uniqueIds = Array.from(new Set(projectIds));
    return uniqueIds.map((id) => projects.find((p) => p.id === id)?.name).filter(Boolean);
  }, [todayMemories, projects]);
  const completedTasks = todayMemories.filter((m) => m.eventType === "task_completed").length;
  const projectUpdates = todayMemories.filter((m) => m.eventType === "project_updated").length;

  return (
    <CardShell className="col-span-12 lg:col-span-4">
      <div className="flex items-center justify-between">
        <CardLabel accent="cyan">Today's Activity</CardLabel>
        <span className="text-xs text-muted-foreground">Today</span>
      </div>
      <h3 className="mt-3 font-display text-xl font-semibold">Today you:</h3>
      <ul className="mt-5 space-y-3 text-sm">
        <li className="flex items-center gap-3 text-foreground/90">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-glow/15 text-cyan-glow">
            <FileText className="h-3.5 w-3.5" />
          </span>
          <span>
            Created <strong className="text-cyan-glow font-semibold">{notesCount}</strong> note
            {notesCount === 1 ? "" : "s"}
          </span>
        </li>
        <li className="flex items-center gap-3 text-foreground/90">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet/15 text-violet">
            <Activity className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">
            Worked on{" "}
            <strong className="text-violet font-semibold">
              {workedProjects.length > 0 ? workedProjects.join(", ") : "no projects"}
            </strong>
          </span>
        </li>
        <li className="flex items-center gap-3 text-foreground/90">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <CheckSquare className="h-3.5 w-3.5" />
          </span>
          <span>
            Completed <strong className="text-emerald-400 font-semibold">{completedTasks}</strong>{" "}
            task{completedTasks === 1 ? "" : "s"}
          </span>
        </li>
        <li className="flex items-center gap-3 text-foreground/90">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-electric/15 text-electric">
            <RefreshCw className="h-3.5 w-3.5" />
          </span>
          <span>
            Added <strong className="text-electric font-semibold">{projectUpdates}</strong> project
            update{projectUpdates === 1 ? "" : "s"}
          </span>
        </li>
      </ul>
    </CardShell>
  );
}

function relativeTime(date: Date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
