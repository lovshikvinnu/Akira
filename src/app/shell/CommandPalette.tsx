import { Command } from "cmdk";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Folder, FileText, CheckSquare, Terminal, Plus, Settings } from "lucide-react";
import { useAkira, akira } from "@/akira-os";
import { Dialog, DialogContent } from "@/app/ui/dialog";
import { toast } from "sonner";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const projects = useAkira((s) => s.projects);
  const notes = useAkira((s) => s.notes);
  const tasks = useAkira((s) => s.tasks);

  // Toggle command palette on Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (action: () => void) => {
    action();
    setOpen(false);
    setSearch("");
  };

  // Filter commands, projects, notes, and tasks based on search query
  const filteredProjects = useMemo(() => {
    if (!search) return [];
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.tag.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase()),
    );
  }, [projects, search]);

  const filteredNotes = useMemo(() => {
    if (!search) return [];
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.content.toLowerCase().includes(search.toLowerCase()) ||
        n.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase())),
    );
  }, [notes, search]);

  const filteredTasks = useMemo(() => {
    if (!search) return [];
    return tasks.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()));
  }, [tasks, search]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="glass-panel border-white/10 bg-[oklch(0.16_0.025_270_/_0.95)] text-foreground p-0 overflow-hidden sm:max-w-[550px] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)]">
        <Command className="w-full flex flex-col">
          <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5">
            <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search commands, projects, notes, tasks..."
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none border-none"
            />
            <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-foreground select-none">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[320px] overflow-y-auto p-2 scrollbar-thin">
            <Command.Empty className="py-8 text-center">
              <span className="text-muted-foreground block text-xs">
                No matching projects, notes, or tasks found.
              </span>
              {search.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    akira.addNote({ content: search });
                    toast.success(`Saved "${search}" as a new thought`);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-cyan-glow hover:border-white/20 hover:bg-white/[0.06] transition-all hover:scale-105 active:scale-95"
                >
                  <Plus className="h-3 w-3" /> Capture "{search}" as thought
                </button>
              )}
            </Command.Empty>

            {/* Static Commands */}
            <Command.Group
              heading="Commands"
              className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 py-1.5"
            >
              <CommandItem
                onSelect={() => runCommand(() => navigate({ to: "/" }))}
                icon={<Terminal className="h-3.5 w-3.5" />}
                title="Go Home"
              />
              <CommandItem
                onSelect={() => runCommand(() => navigate({ to: "/projects" }))}
                icon={<Folder className="h-3.5 w-3.5" />}
                title="Projects"
              />
              <CommandItem
                onSelect={() => runCommand(() => navigate({ to: "/brain-dump" }))}
                icon={<FileText className="h-3.5 w-3.5" />}
                title="Brain Dump"
              />
              <CommandItem
                onSelect={() => runCommand(() => navigate({ to: "/daily-mission" }))}
                icon={<CheckSquare className="h-3.5 w-3.5" />}
                title="Daily Mission"
              />
              <CommandItem
                onSelect={() => runCommand(() => navigate({ to: "/settings" }))}
                icon={<Settings className="h-3.5 w-3.5" />}
                title="Settings"
              />
              <CommandItem
                onSelect={() =>
                  runCommand(() => {
                    navigate({ to: "/projects" });
                    toast("Navigated to Projects. Click 'Create project' to start!");
                  })
                }
                icon={<Plus className="h-3.5 w-3.5 text-cyan-glow" />}
                title="Create Project"
              />
              <CommandItem
                onSelect={() =>
                  runCommand(() => {
                    navigate({ to: "/brain-dump" });
                    toast("Navigated to Brain Dump. Click 'Capture thought' or press Ctrl+N!");
                  })
                }
                icon={<Plus className="h-3.5 w-3.5 text-cyan-glow" />}
                title="Create Note"
              />
            </Command.Group>

            {/* Projects */}
            {filteredProjects.length > 0 && (
              <Command.Group
                heading="Projects"
                className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 py-1.5 mt-2"
              >
                {filteredProjects.map((p) => (
                  <CommandItem
                    key={p.id}
                    onSelect={() =>
                      runCommand(() => navigate({ to: "/projects/$id", params: { id: p.id } }))
                    }
                    icon={<Folder className="h-3.5 w-3.5" />}
                    title={p.name}
                    subtitle={p.tag}
                  />
                ))}
              </Command.Group>
            )}

            {/* Notes */}
            {filteredNotes.length > 0 && (
              <Command.Group
                heading="Notes"
                className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 py-1.5 mt-2"
              >
                {filteredNotes.map((n) => (
                  <CommandItem
                    key={n.id}
                    onSelect={() => runCommand(() => navigate({ to: "/brain-dump" }))}
                    icon={<FileText className="h-3.5 w-3.5" />}
                    title={n.title || "Untitled Thought"}
                    subtitle={n.content}
                  />
                ))}
              </Command.Group>
            )}

            {/* Tasks */}
            {filteredTasks.length > 0 && (
              <Command.Group
                heading="Tasks"
                className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 py-1.5 mt-2"
              >
                {filteredTasks.map((t) => (
                  <CommandItem
                    key={t.id}
                    onSelect={() =>
                      runCommand(() => {
                        akira.toggleTask(t.id);
                        toast.success(t.done ? "Marked task incomplete" : "Completed task");
                      })
                    }
                    icon={
                      <CheckSquare className={`h-3.5 w-3.5 ${t.done ? "text-cyan-glow" : ""}`} />
                    }
                    title={t.title}
                    subtitle={t.done ? "Completed" : "Incomplete (Click to toggle)"}
                  />
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandItem({
  onSelect,
  icon,
  title,
  subtitle,
}: {
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-white/[0.04] cursor-pointer transition-colors data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-foreground"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-muted-foreground">{icon}</span>
        <div className="flex flex-col min-w-0">
          <span className="truncate">{title}</span>
          {subtitle && <span className="text-xs text-muted-foreground truncate">{subtitle}</span>}
        </div>
      </div>
    </Command.Item>
  );
}
