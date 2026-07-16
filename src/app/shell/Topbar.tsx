import { Search, Bell, Plus } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAkira, akira } from "@/akira-os";

export function Topbar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const profile = useAkira((s) => s.profile);
  const [q, setQ] = useState("");

  return (
    <header className="flex items-center justify-between gap-4">
      <form
        className="glass-panel flex h-11 w-full max-w-md items-center gap-3 rounded-2xl px-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim()) return;
          if (pathname.startsWith("/projects")) {
            navigate({ to: "/projects", search: { q } as never });
          } else {
            akira.addNote(q);
            toast.success("Captured to Brain Dump");
          }
          setQ("");
        }}
      >
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask AKIRA anything…"
          className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </form>
      <div className="flex items-center gap-2">
        <IconButton label="Notifications" onClick={() => toast("All clear. No new pings.")}>
          <Bell className="h-4 w-4" />
        </IconButton>
        <IconButton label="Go to Projects" onClick={() => navigate({ to: "/projects" })}>
          <Plus className="h-4 w-4" />
        </IconButton>
        <button
          onClick={() => navigate({ to: "/settings" })}
          aria-label="Settings profile"
          className="ml-1 grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-violet/60 to-electric/60 font-display text-sm font-semibold text-white shadow-[0_0_0_1px_oklch(1_0_0_/_0.1)] transition-transform hover:scale-105"
        >
          {profile.name.charAt(0)}
        </button>
      </div>
    </header>
  );
}

function IconButton({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-muted-foreground transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-foreground"
    >
      {children}
    </button>
  );
}
