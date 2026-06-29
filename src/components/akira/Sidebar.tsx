import { Home, Rocket, Brain, Target, MessageSquare, Settings } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAkira } from "@/services/akira-store";

const items = [
  { icon: Home, label: "Home", to: "/" as const },
  { icon: Rocket, label: "Projects", to: "/projects" as const },
  { icon: Brain, label: "Brain Dump", to: "/brain-dump" as const },
  { icon: Target, label: "Daily Mission", to: "/daily-mission" as const },
  { icon: MessageSquare, label: "Chat", to: "/chat" as const },
  { icon: Settings, label: "Settings", to: "/settings" as const },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const profile = useAkira((s) => s.profile);

  return (
    <aside className="glass-panel sticky top-6 ml-6 mt-6 hidden h-[calc(100vh-3rem)] w-[244px] flex-col p-5 md:flex">
      <Link to="/" className="flex items-center gap-2.5 px-2 pb-6">
        <div className="relative h-8 w-8">
          <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-violet to-electric opacity-80 blur-[6px]" />
          <div className="relative grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-electric font-display text-sm font-bold text-white">
            A
          </div>
        </div>
        <div>
          <div className="font-display text-[15px] font-semibold tracking-wide">AKIRA</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            v1.0.3 · Foundation
          </div>
        </div>
      </Link>

      <div className="hairline mb-4" />

      <nav className="flex flex-1 flex-col gap-1">
        {items.map(({ icon: Icon, label, to }) => {
          const active =
            to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={label}
              to={to}
              className={[
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                active
                  ? "bg-white/[0.06] text-foreground shadow-[inset_0_1px_0_oklch(1_0_0_/_0.08)]"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
              ].join(" ")}
            >
              <span
                className={[
                  "grid h-7 w-7 place-items-center rounded-lg transition-colors",
                  active
                    ? "bg-gradient-to-br from-violet/30 to-electric/20 text-foreground"
                    : "bg-white/[0.03] text-muted-foreground group-hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              </span>
              <span className="font-medium">{label}</span>
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-glow shadow-[0_0_10px_oklch(0.85_0.13_200)]" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="hairline my-4" />

      <Link
        to="/settings"
        className="block rounded-2xl bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-violet/60 to-electric/60 font-display text-sm font-semibold text-white">
            {profile.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{profile.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{profile.role}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-1 w-1 rounded-full bg-cyan-glow" />
          {profile.motto}
        </div>
      </Link>
    </aside>
  );
}
