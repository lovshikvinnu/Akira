import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Edit3, Trash2, ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Shell, PageHeader } from "@/app/shell/Shell";
import {
  CardShell,
  CardLabel,
  GhostButton,
  FieldInput,
  FieldTextarea,
  EmptyState,
  ProjectIcon,
} from "@/app/ui/primitives";
import { GlassDialog } from "@/app/ui/dialogs/glass-dialog";
import { ConfirmDialog } from "@/app/ui/dialogs/ConfirmDialog";
import { useAkira, akira, type Project } from "@/akira-os";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "Projects — AKIRA" },
      { name: "description", content: "Track every project you're building toward Lovshik 2.0." },
    ],
  }),
  component: ProjectsPage,
});

const FILTERS = ["All", "Active", "In progress", "Completed"] as const;
type Filter = (typeof FILTERS)[number];

function ProjectsPage() {
  const projects = useAkira((s) => s.projects);
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("All");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return projects.filter((p) => {
      const match =
        !needle ||
        p.name.toLowerCase().includes(needle) ||
        p.tag.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle);
      if (!match) return false;
      if (filter === "Completed") return p.progress >= 100;
      if (filter === "In progress") return p.progress > 0 && p.progress < 100;
      if (filter === "Active") return p.progress < 100;
      return true;
    });
  }, [projects, q, filter]);

  return (
    <Shell>
      <PageHeader
        eyebrow="AKIRA · PROJECTS"
        title="All projects"
        subtitle="Every quest you've taken on. Pick one to continue building."
        action={
          <button
            onClick={() => setCreateOpen(true)}
            className="btn-glow inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Create project
          </button>
        }
      />

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="glass-panel flex h-11 min-w-[260px] flex-1 items-center gap-3 rounded-2xl px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects…"
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-white/[0.08] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <section className="mt-6 grid grid-cols-12 gap-5">
        {filtered.length === 0 ? (
          <div className="col-span-12">
            <EmptyState
              title="No projects match"
              hint="Try a different filter or create something new."
              action={
                <button
                  onClick={() => setCreateOpen(true)}
                  className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-sm font-medium"
                >
                  <Plus className="h-3.5 w-3.5" /> Create project
                </button>
              }
            />
          </div>
        ) : (
          filtered.map((p) => {
            const labelAccent = p.color.includes("violet")
              ? "violet"
              : p.color.includes("electric")
                ? "electric"
                : "cyan";
            return (
              <CardShell key={p.id} className="col-span-12 md:col-span-6 xl:col-span-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br ${p.color} opacity-80`}
                    >
                      <ProjectIcon icon={p.icon} className="h-3 w-3 text-white" />
                    </div>
                    <CardLabel accent={labelAccent}>{p.tag}</CardLabel>
                  </div>
                  <div className="flex items-center gap-1 opacity-70 transition-opacity hover:opacity-100">
                    <IconBtn onClick={() => setEditing(p)} title="Edit">
                      <Edit3 className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn onClick={() => setConfirmDelete(p)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                </div>
                <Link
                  to="/projects/$id"
                  params={{ id: p.id }}
                  className="mt-3 block font-display text-2xl font-semibold transition-colors hover:text-cyan-glow"
                >
                  {p.name}
                </Link>
                {p.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                )}
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full bg-gradient-to-r ${p.color}`}
                    style={{ width: `${p.progress}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{p.progress}% complete</span>
                  <span>{p.timeSpentMinutes} min</span>
                </div>
                <div className="mt-5 flex items-center justify-between">
                  <Link
                    to="/projects/$id"
                    params={{ id: p.id }}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View details →
                  </Link>
                  <button
                    onClick={() => {
                      akira.touchProject(p.id);
                      navigate({ to: "/projects/$id", params: { id: p.id } });
                    }}
                    className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-xs font-medium"
                  >
                    Continue <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardShell>
            );
          })
        )}
      </section>

      <ProjectFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(values) => {
          const id = akira.addProject(values);
          toast.success(`Created "${values.name}"`);
          setCreateOpen(false);
          navigate({ to: "/projects/$id", params: { id } });
        }}
      />
      <ProjectFormDialog
        open={!!editing}
        project={editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onSubmit={(values) => {
          if (!editing) return;
          akira.updateProject(editing.id, values);
          toast.success("Project updated");
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.name ?? ""}"?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (!confirmDelete) return;
          akira.deleteProject(confirmDelete.id);
          toast.success("Project deleted");
        }}
      />
    </Shell>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      aria-label={title}
      className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-muted-foreground transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-foreground"
    >
      {children}
    </button>
  );
}

function ProjectFormDialog({
  open,
  onOpenChange,
  onSubmit,
  project,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (values: {
    name: string;
    tag: string;
    description: string;
    nextTask?: string;
    notes?: string;
    progress?: number;
    color: string;
    icon: string;
  }) => void;
  project?: Project | null;
}) {
  const isEdit = !!project;
  const [name, setName] = useState(project?.name ?? "");
  const [tag, setTag] = useState(project?.tag ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [nextTask, setNextTask] = useState(project?.nextTask ?? "");
  const [progress, setProgress] = useState(project?.progress ?? 0);
  const [color, setColor] = useState(project?.color ?? "from-violet to-electric");
  const [icon, setIcon] = useState(project?.icon ?? "sparkles");

  // reset when (re)opened
  useMemoReset(open, project, (p) => {
    setName(p?.name ?? "");
    setTag(p?.tag ?? "");
    setDescription(p?.description ?? "");
    setNextTask(p?.nextTask ?? "");
    setProgress(p?.progress ?? 0);
    setColor(p?.color ?? "from-violet to-electric");
    setIcon(p?.icon ?? "sparkles");
  });

  return (
    <GlassDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit project" : "Create project"}
      description={isEdit ? "Update the details of this project." : "Give your next quest a name."}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            toast.error("Project name is required");
            return;
          }
          onSubmit({ name, tag, description, nextTask, progress, color, icon });
        }}
        className="space-y-4"
      >
        <FieldInput
          autoFocus
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Verilog CPU"
        />
        <div>
          <FieldInput
            label="Tag / Category"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Hardware · AI · Personal OS"
          />
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
          placeholder="Why does this project matter?"
        />
        <FieldInput
          label="Next task"
          value={nextTask}
          onChange={(e) => setNextTask(e.target.value)}
          placeholder="What's the very next step?"
        />
        {isEdit && (
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
        )}
        <div className="flex justify-end gap-2">
          <GhostButton onClick={() => onOpenChange(false)}>Cancel</GhostButton>
          <button
            type="submit"
            disabled={!name.trim()}
            className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isEdit ? "Save changes" : "Create"}
          </button>
        </div>
      </form>
    </GlassDialog>
  );
}

// Tiny hook to reset form fields when dialog opens.
function useMemoReset<T>(open: boolean, dep: T, reset: (dep: T) => void) {
  const key = open ? "open" : "closed";
  useMemo(() => {
    if (open) reset(dep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dep]);
}
