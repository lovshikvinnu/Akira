import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  CheckCircle2,
  Circle,
  Trash2,
  Edit3,
  Check,
  X,
  GripVertical,
  Clock,
  Calendar,
  Flame,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Shell, PageHeader } from "@/app/shell/Shell";
import {
  CardShell,
  CardLabel,
  EmptyState,
  FieldInput,
  FieldTextarea,
  GhostButton,
} from "@/app/ui/primitives";
import { GlassDialog } from "@/app/ui/dialogs/glass-dialog";
import { useAkira, akira, selectors, type Task } from "@/akira-os";

export const Route = createFileRoute("/daily-mission")({
  head: () => ({
    meta: [
      { title: "Daily Mission — AKIRA" },
      { name: "description", content: "Today's missions. Stay on the path." },
    ],
  }),
  component: DailyMissionPage,
});

function DailyMissionPage() {
  const tasks = useAkira((s) => s.tasks);
  const streaks = useAkira((s) => s.streaks);
  const projects = useAkira((s) => s.projects);
  const pct = useAkira(selectors.taskProgress);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Drag and Drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Statistics calculation
  const completedTasksCount = useMemo(() => tasks.filter((t) => t.done).length, [tasks]);

  const remainingMinutes = useMemo(() => {
    return tasks.filter((t) => !t.done).reduce((acc, t) => acc + (t.estimatedDuration || 0), 0);
  }, [tasks]);

  const formattedRemaining = useMemo(() => {
    if (remainingMinutes === 0) return "No work remaining";
    const hrs = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    if (hrs > 0) return `${hrs}h ${mins}m left`;
    return `${remainingMinutes}m left`;
  }, [remainingMinutes]);

  const akiraStreak = useMemo(() => {
    return streaks.find((s) => s.label === "AKIRA")?.days ?? 0;
  }, [streaks]);

  // Keyboard shortcut Ctrl + Shift + M to open mission creation dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setEditingTask(null);
        setFormOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const circ = 2 * Math.PI * 54;

  // HTML5 Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const draggedIndex = tasks.findIndex((t) => t.id === draggedId);
    const targetIndex = tasks.findIndex((t) => t.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const updated = [...tasks];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, draggedItem);

    akira.reorderTasks(updated.map((t) => t.id));
    setDraggedId(null);
  };

  return (
    <Shell>
      <PageHeader
        eyebrow="AKIRA · DAILY MISSION"
        title="Today's mission"
        subtitle="Stay focused, complete tasks, and build momentum. Press Ctrl + Shift + M to add a mission."
        action={
          <button
            onClick={() => {
              setEditingTask(null);
              setFormOpen(true);
            }}
            className="btn-glow inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Create mission
          </button>
        }
      />

      <section className="mt-8 grid grid-cols-12 gap-5">
        {/* Statistics panel */}
        <CardShell className="col-span-12 lg:col-span-4 flex flex-col justify-between">
          <div>
            <CardLabel accent="violet">Progress & Stats</CardLabel>
            <div className="mt-4 grid place-items-center">
              <div className="relative h-44 w-44">
                <svg viewBox="0 0 130 130" className="h-full w-full -rotate-90">
                  <circle
                    cx="65"
                    cy="65"
                    r="54"
                    stroke="oklch(1 0 0 / 0.08)"
                    strokeWidth="8"
                    fill="none"
                  />
                  <circle
                    cx="65"
                    cy="65"
                    r="54"
                    stroke="url(#dmGrad)"
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${(pct / 100) * circ} ${circ}`}
                    className="transition-[stroke-dasharray] duration-500"
                  />
                  <defs>
                    <linearGradient id="dmGrad" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.78 0.2 295)" />
                      <stop offset="100%" stopColor="oklch(0.85 0.13 200)" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="font-display text-4xl font-semibold">{pct}%</div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      complete
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3.5 border-t border-white/[0.05] pt-5 text-sm text-foreground/90">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Completed today:</span>
              <span className="font-semibold">
                {completedTasksCount} of {tasks.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Work remaining:</span>
              <span className="font-semibold">{formattedRemaining}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Current streak:</span>
              <span className="flex items-center gap-1 font-semibold text-amber-400">
                <Flame className="h-4 w-4 fill-amber-400/20" /> {akiraStreak} days
              </span>
            </div>
          </div>
        </CardShell>

        {/* Mission List */}
        <CardShell className="col-span-12 lg:col-span-8">
          <div className="flex items-center justify-between">
            <CardLabel accent="electric">Missions</CardLabel>
            <span className="text-xs text-muted-foreground">{tasks.length} total</span>
          </div>

          <div className="mt-6">
            {tasks.length === 0 ? (
              <EmptyState
                title="No missions yet"
                hint="Set the first thing you want to execute today."
                action={
                  <button
                    onClick={() => {
                      setEditingTask(null);
                      setFormOpen(true);
                    }}
                    className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-sm font-medium"
                  >
                    <Plus className="h-4 w-4" /> Add mission
                  </button>
                }
              />
            ) : (
              <ul className="space-y-3.5">
                {tasks.map((task) => {
                  const proj = projects.find((p) => p.id === task.projectId);

                  // Priority color formatting
                  let priorityStyles = "bg-blue-500/10 text-blue-400 border-blue-500/25";
                  if (task.priority === "High") {
                    priorityStyles = "bg-rose-500/10 text-rose-400 border-rose-500/25";
                  } else if (task.priority === "Low") {
                    priorityStyles = "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
                  }

                  return (
                    <li
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, task.id)}
                      className={`group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-3 transition-all hover:border-white/15 cursor-grab active:cursor-grabbing ${
                        draggedId === task.id ? "opacity-40 border-dashed border-violet/30" : ""
                      }`}
                    >
                      <div className="mt-0.5 flex items-center gap-1.5 self-center">
                        <span className="text-muted-foreground/35 cursor-grab group-hover:text-muted-foreground/60 transition-colors">
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <button
                          onClick={() => {
                            akira.toggleTask(task.id);
                            toast.success(task.done ? "Mission in progress" : "Mission completed!");
                          }}
                          className="transition-transform hover:scale-105 active:scale-95"
                        >
                          {task.done ? (
                            <CheckCircle2 className="h-5 w-5 text-cyan-glow" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground hover:text-foreground" />
                          )}
                        </button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-sm font-medium transition-colors ${
                              task.done
                                ? "text-muted-foreground line-through"
                                : "text-foreground/90"
                            }`}
                          >
                            {task.title}
                          </span>

                          <span
                            className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${priorityStyles}`}
                          >
                            {task.priority || "Medium"}
                          </span>

                          {proj && (
                            <span
                              className={`rounded-full bg-gradient-to-br ${proj.color} px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white opacity-80`}
                            >
                              {proj.name}
                            </span>
                          )}
                        </div>

                        {task.description && (
                          <p className="mt-1 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                            {task.description}
                          </p>
                        )}

                        <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground/80">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {task.estimatedDuration || 30}m estimated
                          </span>
                          {task.dueDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> Due{" "}
                              {new Date(task.dueDate).toLocaleDateString(undefined, {
                                dateStyle: "medium",
                              })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 self-center">
                        <button
                          onClick={() => {
                            setEditingTask(task);
                            setFormOpen(true);
                          }}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
                          title="Edit"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            akira.deleteTask(task.id);
                            toast.success("Mission deleted");
                          }}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-muted-foreground hover:border-destructive/40 hover:text-foreground hover:bg-white/[0.05]"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </CardShell>
      </section>

      <MissionFormDialog open={formOpen} onOpenChange={setFormOpen} task={editingTask} />
    </Shell>
  );
}

function MissionFormDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: Task | null;
}) {
  const projects = useAkira((s) => s.projects);
  const isEdit = !!task;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [estimatedDuration, setEstimatedDuration] = useState(30);
  const [dueDate, setDueDate] = useState("");
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    if (open) {
      if (task) {
        setTitle(task.title);
        setDescription(task.description || "");
        setPriority(task.priority || "Medium");
        setEstimatedDuration(task.estimatedDuration || 30);
        setDueDate(task.dueDate ? task.dueDate.split("T")[0] : "");
        setProjectId(task.projectId || "");
      } else {
        setTitle("");
        setDescription("");
        setPriority("Medium");
        setEstimatedDuration(30);
        setDueDate("");
        setProjectId("");
      }
    }
  }, [open, task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Mission title is required");
      return;
    }
    const duration = Number(estimatedDuration);
    if (isNaN(duration) || duration <= 0) {
      toast.error("Estimated duration must be a positive number of minutes");
      return;
    }

    const values = {
      title: title.trim(),
      description: description.trim(),
      priority,
      estimatedDuration: duration,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      projectId: projectId || null,
    };

    if (isEdit && task) {
      akira.updateTaskDetails(task.id, values);
      toast.success("Mission updated");
    } else {
      akira.addTaskDetails(values);
      toast.success("Mission created");
    }
    onOpenChange(false);
  };

  return (
    <GlassDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit mission" : "Create daily mission"}
      description={
        isEdit ? "Refine your mission parameters." : "Set a concrete milestone for today."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldInput
          label="Mission Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What are we shipping?"
          required
        />
        <FieldTextarea
          label="Description (Optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Details, specifications or notes..."
          className="min-h-[80px]"
        />

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Priority
            </span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "Low" | "Medium" | "High")}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-foreground outline-none focus:border-violet/60 focus:bg-white/[0.06]"
            >
              <option value="Low" className="bg-[oklch(0.16_0.025_270)]">
                Low
              </option>
              <option value="Medium" className="bg-[oklch(0.16_0.025_270)]">
                Medium
              </option>
              <option value="High" className="bg-[oklch(0.16_0.025_270)]">
                High
              </option>
            </select>
          </label>
          <FieldInput
            type="number"
            label="Est. Duration (mins)"
            value={estimatedDuration}
            onChange={(e) => setEstimatedDuration(Number(e.target.value))}
            placeholder="30"
            min={1}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FieldInput
            type="date"
            label="Due Date (Optional)"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Link to Project
            </span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-foreground outline-none focus:border-violet/60 focus:bg-white/[0.06]"
            >
              <option value="" className="bg-[oklch(0.16_0.025_270)]">
                No Project
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-[oklch(0.16_0.025_270)]">
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <GhostButton onClick={() => onOpenChange(false)}>Cancel</GhostButton>
          <button
            type="submit"
            disabled={!title.trim()}
            className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            {isEdit ? "Save changes" : "Create"}
          </button>
        </div>
      </form>
    </GlassDialog>
  );
}
