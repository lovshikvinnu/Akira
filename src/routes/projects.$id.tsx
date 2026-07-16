import { createFileRoute, useNavigate, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Edit3,
  Trash2,
  Play,
  Clock,
  Target,
  FileText,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Shell } from "@/app/shell/Shell";
import {
  CardShell,
  CardLabel,
  GhostButton,
  FieldInput,
  FieldTextarea,
  ProjectIcon,
} from "@/app/ui/primitives";
import { GlassDialog } from "@/app/ui/dialogs/glass-dialog";
import { ConfirmDialog } from "@/app/ui/dialogs/ConfirmDialog";
import { useAkira, akira } from "@/akira-os";

export const Route = createFileRoute("/projects/$id")({
  head: ({ params }) => ({
    meta: [
      { title: "Project — AKIRA" },
      { name: "description", content: `AKIRA project ${params.id}` },
    ],
  }),
  component: ProjectDetail,
  notFoundComponent: () => (
    <Shell>
      <div className="mt-20 text-center">
        <h1 className="font-display text-3xl">Project not found</h1>
        <Link to="/projects" className="mt-4 inline-block text-cyan-glow">
          ← Back to Projects
        </Link>
      </div>
    </Shell>
  ),
});

function ProjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const project = useAkira((s) => s.projects.find((p) => p.id === id));
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [notes, setNotes] = useState(project?.notes ?? "");
  const [nextTask, setNextTask] = useState(project?.nextTask ?? "");

  useEffect(() => {
    setNotes(project?.notes ?? "");
    setNextTask(project?.nextTask ?? "");
  }, [project?.id, project?.notes, project?.nextTask]);

  // Start & End Work Session automatically on mount/unmount
  useEffect(() => {
    if (project) {
      akira.startSession(project.id, project.nextTask);

      const handleBeforeUnload = () => {
        akira.endSession();
      };
      window.addEventListener("beforeunload", handleBeforeUnload);

      return () => {
        akira.endSession();
        window.removeEventListener("beforeunload", handleBeforeUnload);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // Sync active task changes with current session context
  useEffect(() => {
    if (project) {
      akira.updateSessionTask(nextTask);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextTask]);

  if (!project) throw notFound();

  const last = new Date(project.lastWorked);

  return (
    <Shell>
      <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Projects
        </Link>
        <span>/</span>
        <span className="text-foreground">{project.name}</span>
      </div>

      <section className="mt-6 grid grid-cols-12 gap-5">
        <CardShell className="col-span-12 lg:col-span-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div
                  className={`grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br ${project.color} opacity-80`}
                >
                  <ProjectIcon icon={project.icon} className="h-3.5 w-3.5 text-white" />
                </div>
                <CardLabel
                  accent={
                    project.color.includes("violet")
                      ? "violet"
                      : project.color.includes("electric")
                        ? "electric"
                        : "cyan"
                  }
                >
                  {project.tag}
                </CardLabel>
              </div>
              <h1 className="mt-3 font-display text-4xl font-semibold">
                <span className="text-gradient-akira">{project.name}</span>
              </h1>
              {project.description && (
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                  {project.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <GhostButton onClick={() => setEditOpen(true)}>
                <Edit3 className="h-3.5 w-3.5" /> Edit
              </GhostButton>
              <button
                onClick={() => setDeleteOpen(true)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-foreground"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={`h-full bg-gradient-to-r ${project.color} transition-all`}
              style={{ width: `${project.progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{project.progress}% complete</span>
            <span>
              Last worked{" "}
              {last.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                akira.touchProject(project.id);
                toast.success("Session logged · +5 min");
              }}
              className="btn-glow inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
            >
              <Play className="h-4 w-4" /> Continue working
            </button>
            <GhostButton onClick={() => navigate({ to: "/daily-mission" })}>
              <Target className="h-3.5 w-3.5" /> Add to today's mission
            </GhostButton>
          </div>
        </CardShell>

        <div className="col-span-12 space-y-5 lg:col-span-4">
          <CardShell>
            <CardLabel accent="electric">At a glance</CardLabel>
            <ul className="mt-4 space-y-3 text-sm">
              <Stat
                icon={<Clock className="h-3.5 w-3.5" />}
                label="Time spent"
                value={`${project.timeSpentMinutes} min`}
              />
              <Stat
                icon={<Target className="h-3.5 w-3.5" />}
                label="Progress"
                value={`${project.progress}%`}
              />
              <Stat icon={<FileText className="h-3.5 w-3.5" />} label="Tag" value={project.tag} />
            </ul>
          </CardShell>

          <CardShell>
            <CardLabel accent="cyan">Next task</CardLabel>
            <FieldInput
              className="mt-3"
              value={nextTask}
              onChange={(e) => setNextTask(e.target.value)}
              onBlur={() => {
                if (nextTask !== project.nextTask) {
                  akira.updateProject(project.id, { nextTask });
                  toast.success("Next task saved");
                }
              }}
              placeholder="What's the very next step?"
            />
            <p className="mt-2 text-[11px] text-muted-foreground">Saved on blur.</p>
          </CardShell>
        </div>

        <CardShell className="col-span-12">
          <CardLabel accent="violet">Notes</CardLabel>
          <FieldTextarea
            className="mt-3 min-h-[200px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Decisions, links, blockers, ideas…"
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => {
                akira.updateProject(project.id, { notes });
                toast.success("Notes saved");
              }}
              className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-sm font-medium"
            >
              <Sparkles className="h-3.5 w-3.5" /> Save notes
            </button>
          </div>
        </CardShell>
      </section>

      <EditProjectDialog open={editOpen} onOpenChange={setEditOpen} projectId={project.id} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${project.name}"?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          akira.deleteProject(project.id);
          toast.success("Project deleted");
          navigate({ to: "/projects" });
        }}
      />
    </Shell>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium text-foreground">{value}</span>
    </li>
  );
}

function EditProjectDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
}) {
  const project = useAkira((s) => s.projects.find((p) => p.id === projectId));
  const [name, setName] = useState(project?.name ?? "");
  const [tag, setTag] = useState(project?.tag ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [progress, setProgress] = useState(project?.progress ?? 0);
  const [color, setColor] = useState(project?.color ?? "from-violet to-electric");
  const [icon, setIcon] = useState(project?.icon ?? "sparkles");

  useEffect(() => {
    if (open && project) {
      setName(project.name);
      setTag(project.tag);
      setDescription(project.description);
      setProgress(project.progress);
      setColor(project.color);
      setIcon(project.icon);
    }
  }, [open, project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) return null;
  return (
    <GlassDialog open={open} onOpenChange={onOpenChange} title="Edit project">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          akira.updateProject(project.id, { name, tag, description, progress, color, icon });
          toast.success("Project updated");
          onOpenChange(false);
        }}
        className="space-y-4"
      >
        <FieldInput label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <FieldInput label="Tag / Category" value={tag} onChange={(e) => setTag(e.target.value)} />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {["Personal OS", "AI Companion", "Hardware", "Software", "Health", "Research"].map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setTag(cat)}
                  className={`rounded-lg border px-2 py-1 text-[10px] font-medium transition-all ${
                    tag === cat
                      ? "border-violet/40 bg-violet/10 text-foreground"
                      : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/20 hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ),
            )}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Icon
          </span>
          <div className="flex gap-2">
            {["sparkles", "rocket", "cpu", "book", "dumbbell", "moon"].map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                className={`grid h-10 w-10 place-items-center rounded-xl border transition-all ${
                  icon === ic
                    ? "border-violet/40 bg-violet/10 text-foreground shadow-[0_0_12px_oklch(0.68_0.22_295_/_0.2)]"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground"
                }`}
              >
                <ProjectIcon icon={ic} className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Theme Color
          </span>
          <div className="flex flex-wrap gap-2.5">
            {[
              { value: "from-violet to-electric", label: "Midnight" },
              { value: "from-electric to-cyan-glow", label: "Aurora" },
              { value: "from-violet to-cyan-glow", label: "Solstice" },
              { value: "from-cyan-glow to-electric", label: "Nebula" },
            ].map((theme) => (
              <button
                key={theme.value}
                type="button"
                onClick={() => setColor(theme.value)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${
                  color === theme.value
                    ? "border-white/30 bg-white/[0.08]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }`}
                title={theme.label}
              >
                <span className={`h-3.5 w-3.5 rounded-full bg-gradient-to-br ${theme.value}`} />
                <span className="text-xs text-foreground/90">{theme.label}</span>
              </button>
            ))}
          </div>
        </div>
        <FieldTextarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Progress · {progress}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="w-full accent-[color:var(--violet)]"
          />
        </label>
        <div className="flex justify-end gap-2">
          <GhostButton onClick={() => onOpenChange(false)}>Cancel</GhostButton>
          <button
            type="submit"
            className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-sm font-medium"
          >
            <ArrowRight className="h-3.5 w-3.5" /> Save changes
          </button>
        </div>
      </form>
    </GlassDialog>
  );
}
