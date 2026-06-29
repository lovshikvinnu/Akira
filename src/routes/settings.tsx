import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, RotateCcw, Palette, User, Info, Tag } from "lucide-react";
import { toast } from "sonner";

import { Shell, PageHeader } from "@/components/akira/Shell";
import { CardShell, CardLabel, FieldInput, GhostButton } from "@/components/akira/primitives";
import { ConfirmDialog } from "@/components/akira/dialogs/ConfirmDialog";
import { useAkira, akira } from "@/services/akira-store";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — AKIRA" },
      { name: "description", content: "Personalize AKIRA, manage data, and review the build." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const profile = useAkira((s) => s.profile);
  const [name, setName] = useState(profile.name);
  const [role, setRole] = useState(profile.role);
  const [motto, setMotto] = useState(profile.motto);
  const [resetOpen, setResetOpen] = useState(false);

  const dirty = name !== profile.name || role !== profile.role || motto !== profile.motto;

  return (
    <Shell>
      <PageHeader
        eyebrow="AKIRA · SETTINGS"
        title="Settings"
        subtitle="Tune AKIRA to feel like yours."
      />

      <section className="mt-8 grid grid-cols-12 gap-5">
        <CardShell className="col-span-12 lg:col-span-7">
          <CardLabel accent="violet">
            <span className="inline-flex items-center gap-2">
              <User className="h-3.5 w-3.5" /> Profile
            </span>
          </CardLabel>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              akira.updateProfile({ name, role, motto });
              toast.success("Profile saved");
            }}
            className="mt-5 space-y-4"
          >
            <FieldInput label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <FieldInput label="Role" value={role} onChange={(e) => setRole(e.target.value)} />
            <FieldInput
              label="Motto"
              value={motto}
              onChange={(e) => setMotto(e.target.value)}
              placeholder="What are you building?"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!dirty}
                className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" /> Save profile
              </button>
            </div>
          </form>
        </CardShell>

        <CardShell className="col-span-12 lg:col-span-5">
          <CardLabel accent="electric">
            <span className="inline-flex items-center gap-2">
              <Palette className="h-3.5 w-3.5" /> Theme
            </span>
          </CardLabel>
          <p className="mt-4 text-sm text-muted-foreground">
            AKIRA ships dark-first. Light mode and accent variations land in v1.0.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { name: "Midnight", from: "from-violet", to: "to-electric", active: true },
              { name: "Aurora", from: "from-electric", to: "to-cyan-glow" },
              { name: "Solstice", from: "from-violet", to: "to-cyan-glow" },
            ].map((t) => (
              <button
                key={t.name}
                onClick={() => toast(`${t.name} theme coming soon`)}
                className={`group rounded-2xl border bg-white/[0.025] p-3 text-left transition-all hover:-translate-y-[2px] ${
                  t.active ? "border-violet/40" : "border-white/10 hover:border-white/20"
                }`}
              >
                <div className={`h-14 rounded-xl bg-gradient-to-br ${t.from} ${t.to} opacity-90`} />
                <div className="mt-2 text-xs font-medium">{t.name}</div>
                {t.active && <div className="text-[10px] text-cyan-glow">active</div>}
              </button>
            ))}
          </div>
        </CardShell>

        <CardShell className="col-span-12 lg:col-span-7">
          <CardLabel accent="cyan">
            <span className="inline-flex items-center gap-2">
              <Info className="h-3.5 w-3.5" /> About AKIRA
            </span>
          </CardLabel>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
            AKIRA is your AI Companion for Growth — a futuristic operating system for daily
            missions, projects, brain dump and consistency. Currently in alpha, powered by a local
            service layer.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <Info2
              icon={<Tag className="h-3.5 w-3.5" />}
              label="Version"
              value="1.0.3 · Foundation"
            />
            <Info2 icon={<Sparkles className="h-3.5 w-3.5" />} label="Build" value="frontend MVP" />
            <Info2 icon={<User className="h-3.5 w-3.5" />} label="Maker" value="Lovshik" />
          </div>
        </CardShell>

        <CardShell className="col-span-12 lg:col-span-5">
          <CardLabel accent="violet">Data</CardLabel>
          <p className="mt-4 text-sm text-muted-foreground">
            All data lives in your browser. Resetting clears projects, missions, notes and chat.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <GhostButton
              onClick={() => {
                const blob = new Blob([JSON.stringify(akira.getState(), null, 2)], {
                  type: "application/json",
                });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "akira-data.json";
                a.click();
                URL.revokeObjectURL(a.href);
                toast.success("Data exported");
              }}
            >
              Export JSON
            </GhostButton>
            <button
              onClick={() => setResetOpen(true)}
              className="inline-flex items-center gap-2 rounded-[14px] border border-destructive/40 bg-destructive/15 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-destructive/25"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset local data
            </button>
          </div>
        </CardShell>
      </section>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset all local data?"
        description="Projects, missions, notes and chat will be restored to defaults."
        confirmLabel="Reset"
        destructive
        onConfirm={() => {
          akira.reset();
          toast.success("AKIRA reset to defaults");
        }}
      />
    </Shell>
  );
}

function Info2({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-display text-sm font-semibold">{value}</div>
    </div>
  );
}
