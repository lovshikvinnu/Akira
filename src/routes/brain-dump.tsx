import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Edit3, Trash2, Mic, Sparkles, Pin, Heart, Check, X } from "lucide-react";
import { toast } from "sonner";

import { Shell, PageHeader } from "@/components/akira/Shell";
import {
  CardShell,
  EmptyState,
  FieldInput,
  FieldTextarea,
  GhostButton,
} from "@/components/akira/primitives";
import { GlassDialog } from "@/components/akira/dialogs/glass-dialog";
import { VoiceComingSoonDialog } from "@/components/akira/dialogs/VoiceComingSoonDialog";
import { ConfirmDialog } from "@/components/akira/dialogs/ConfirmDialog";
import { useAkira, akira, type Note } from "@/services/akira-store";

export const Route = createFileRoute("/brain-dump")({
  head: () => ({
    meta: [
      { title: "Brain Dump — AKIRA" },
      { name: "description", content: "Capture every raw thought before it slips away." },
    ],
  }),
  component: BrainDumpPage,
});

type SortOption = "newest" | "oldest" | "pinned";

function BrainDumpPage() {
  const notes = useAkira((s) => s.notes);
  const projects = useAkira((s) => s.projects);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const [formOpen, setFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Note | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  // Keyboard shortcut Ctrl + N to open creation dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setEditingNote(null);
        setFormOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filter notes by query matching title, content, or tags
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(needle) ||
        n.content.toLowerCase().includes(needle) ||
        n.tags.some((tag) => tag.toLowerCase().includes(needle)),
    );
  }, [notes, q]);

  // Sort notes accordingly
  const sorted = useMemo(() => {
    const result = [...filtered];
    if (sortBy === "newest") {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === "oldest") {
      result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortBy === "pinned") {
      result.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    return result;
  }, [filtered, sortBy]);

  return (
    <Shell>
      <PageHeader
        eyebrow="AKIRA · BRAIN DUMP"
        title="Brain dump"
        subtitle="A frictionless place to land every half-formed idea. Press Ctrl + N for a new note."
        action={
          <>
            <GhostButton onClick={() => setVoiceOpen(true)}>
              <Mic className="h-3.5 w-3.5" /> Voice
            </GhostButton>
            <button
              onClick={() => {
                setEditingNote(null);
                setFormOpen(true);
              }}
              className="btn-glow inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
            >
              <Plus className="h-4 w-4" /> Capture thought
            </button>
          </>
        }
      />

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="glass-panel flex h-11 min-w-[260px] flex-1 items-center gap-3 rounded-2xl px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search thoughts by title, content or tags…"
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {[
            { value: "newest", label: "Newest" },
            { value: "oldest", label: "Oldest" },
            { value: "pinned", label: "Pinned" },
          ].map((sort) => (
            <button
              key={sort.value}
              onClick={() => setSortBy(sort.value as SortOption)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                sortBy === sort.value
                  ? "bg-white/[0.08] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {sort.label}
            </button>
          ))}
        </div>
      </div>

      <section className="mt-6">
        {sorted.length === 0 ? (
          <EmptyState
            title={q ? "No matching thoughts" : "Clear mind"}
            hint={
              q
                ? "Try a different search query."
                : "Drop the first thought to clear your head. Double-check shortcuts."
            }
            action={
              <button
                onClick={() => {
                  setEditingNote(null);
                  setFormOpen(true);
                }}
                className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-sm font-medium"
              >
                <Sparkles className="h-3.5 w-3.5" /> Capture thought
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-12 gap-4">
            {sorted.map((n) => {
              const proj = projects.find((p) => p.id === n.projectId);
              return (
                <CardShell
                  key={n.id}
                  className="col-span-12 md:col-span-6 xl:col-span-4 flex flex-col justify-between min-h-[190px]"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {n.pinned && (
                          <span className="flex items-center gap-1 rounded bg-cyan-glow/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-glow">
                            <Pin className="h-2 w-2" /> Pinned
                          </span>
                        )}
                        {n.favorite && (
                          <span className="flex items-center gap-1 rounded bg-pink-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-pink-400">
                            <Heart className="h-2 w-2" /> Favorite
                          </span>
                        )}
                        {proj && (
                          <span
                            className={`rounded bg-gradient-to-br ${proj.color} px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white opacity-85`}
                          >
                            {proj.name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-70 transition-opacity hover:opacity-100">
                        <IconBtn
                          onClick={() => {
                            setEditingNote(n);
                            setFormOpen(true);
                          }}
                          title="Edit"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn onClick={() => setConfirmDelete(n)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    </div>
                    {n.title && (
                      <h4 className="mt-3 font-display text-base font-semibold text-foreground/95">
                        {n.title}
                      </h4>
                    )}
                    <p className="mt-2 text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                      {n.content}
                    </p>
                  </div>
                  <div>
                    {n.tags && n.tags.length > 0 && (
                      <div className="mt-3.5 flex flex-wrap gap-1">
                        {n.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-lg border border-white/5 bg-white/[0.02] px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-between border-t border-white/[0.05] pt-3 text-[10px] text-muted-foreground">
                      <span>
                        {new Date(n.createdAt).toLocaleDateString(undefined, {
                          dateStyle: "medium",
                        })}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            akira.updateNote(n.id, { pinned: !n.pinned });
                            toast.success(n.pinned ? "Thought unpinned" : "Thought pinned");
                          }}
                          className={`transition-colors hover:text-cyan-glow ${n.pinned ? "text-cyan-glow" : ""}`}
                          title="Toggle Pin"
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            akira.updateNote(n.id, { favorite: !n.favorite });
                            toast.success(
                              n.favorite ? "Removed from favorites" : "Added to favorites",
                            );
                          }}
                          className={`transition-colors hover:text-pink-400 ${n.favorite ? "text-pink-400" : ""}`}
                          title="Toggle Favorite"
                        >
                          <Heart className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </CardShell>
              );
            })}
          </div>
        )}
      </section>

      <NoteFormDialog open={formOpen} onOpenChange={setFormOpen} note={editingNote} />
      <VoiceComingSoonDialog open={voiceOpen} onOpenChange={setVoiceOpen} />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete this thought?"
        description="It will be gone forever."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (!confirmDelete) return;
          akira.deleteNote(confirmDelete.id);
          toast.success("Thought deleted");
        }}
      />
    </Shell>
  );
}

function NoteFormDialog({
  open,
  onOpenChange,
  note,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  note?: Note | null;
}) {
  const projects = useAkira((s) => s.projects);
  const isEdit = !!note;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [pinned, setPinned] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Load values when note changes
  useEffect(() => {
    if (open) {
      if (note) {
        setTitle(note.title);
        setContent(note.content);
        setTagsInput(note.tags?.join(", ") ?? "");
        setPinned(note.pinned);
        setFavorite(note.favorite);
        setProjectId(note.projectId ?? "");
      } else {
        setTitle("");
        setContent("");
        setTagsInput("");
        setPinned(false);
        setFavorite(false);
        setProjectId("");
      }
      setSaveStatus("idle");
    }
  }, [open, note]);

  // Handle Autosave while typing
  useEffect(() => {
    if (!open || !note) return; // Only autosave when editing an existing note!

    const tags = tagsInput
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const hasChanges =
      title !== note.title ||
      content !== note.content ||
      pinned !== note.pinned ||
      favorite !== note.favorite ||
      projectId !== (note.projectId ?? "") ||
      JSON.stringify(tags) !== JSON.stringify(note.tags);

    if (!hasChanges) return;

    setSaveStatus("saving");
    const debounce = setTimeout(() => {
      akira.updateNote(note.id, {
        title,
        content,
        tags,
        pinned,
        favorite,
        projectId: projectId || null,
      });
      setSaveStatus("saved");
    }, 800);

    return () => clearTimeout(debounce);
  }, [title, content, tagsInput, pinned, favorite, projectId, note, open]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("Content is required");
      return;
    }
    const tags = tagsInput
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const values = {
      title,
      content,
      tags,
      pinned,
      favorite,
      projectId: projectId || null,
    };

    if (isEdit && note) {
      akira.updateNote(note.id, values);
      toast.success("Thought updated");
    } else {
      akira.addNote(values);
      toast.success("Thought captured");
    }
    onOpenChange(false);
  };

  return (
    <GlassDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit thought" : "Capture a thought"}
      description={isEdit ? "Refine your raw idea." : "Quick, raw, unfiltered."}
    >
      <form onSubmit={handleSave} className="space-y-4">
        <FieldInput
          label="Title (Optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give it a focus..."
        />
        <FieldTextarea
          autoFocus={!isEdit}
          label="Content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind?"
          className="min-h-[140px]"
          required
        />
        <FieldInput
          label="Tags (Comma separated)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="idea, verilog, personal"
        />
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Link to Project
            </span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-foreground outline-none transition-colors focus:border-violet/60 focus:bg-white/[0.06]"
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
          <div className="flex items-end justify-start gap-4 h-11 pb-1">
            <button
              type="button"
              onClick={() => setPinned(!pinned)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 transition-all ${
                pinned
                  ? "border-cyan-glow/30 bg-cyan-glow/10 text-cyan-glow"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground"
              }`}
            >
              <Pin className="h-3.5 w-3.5" />
              <span className="text-xs">Pin</span>
            </button>
            <button
              type="button"
              onClick={() => setFavorite(!favorite)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 transition-all ${
                favorite
                  ? "border-pink-500/30 bg-pink-500/10 text-pink-400"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground"
              }`}
            >
              <Heart className="h-3.5 w-3.5" />
              <span className="text-xs">Favorite</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground/80">
            {saveStatus === "saving" && "Saving changes..."}
            {saveStatus === "saved" && "Autosaved"}
          </span>
          <div className="flex justify-end gap-2">
            <GhostButton onClick={() => onOpenChange(false)}>Cancel</GhostButton>
            <button
              type="submit"
              disabled={!content.trim()}
              className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isEdit ? "Save changes" : "Capture"}
            </button>
          </div>
        </div>
      </form>
    </GlassDialog>
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
      onClick={onClick}
      title={title}
      aria-label={title}
      className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-muted-foreground transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-foreground"
    >
      {children}
    </button>
  );
}
