import {
  Home,
  Rocket,
  Brain,
  Target,
  MessageSquare,
  Settings,
  Terminal,
  Clock,
  History,
  Search,
  Wrench,
} from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAkira } from "@/akira-os";
import { useState, useEffect } from "react";

const dailyWorkItems = [
  { icon: History, label: "Timeline", to: "/timeline" as const },
  { icon: Rocket, label: "Projects", to: "/projects" as const },
  { icon: Target, label: "Tasks", to: "/tasks" as const },
  { icon: Brain, label: "Notes", to: "/notes" as const },
  { icon: MessageSquare, label: "Chat", to: "/chat" as const },
  { icon: Clock, label: "Sessions", to: "/sessions" as const },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const profile = useAkira((s) => s.profile);
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    const checkDevMode = () => {
      setDevMode(localStorage.getItem("akira:dev_mode") === "true");
    };
    checkDevMode();
    window.addEventListener("storage", checkDevMode);
    window.addEventListener("akira:dev_mode_change", checkDevMode);
    return () => {
      window.removeEventListener("storage", checkDevMode);
      window.removeEventListener("akira:dev_mode_change", checkDevMode);
    };
  }, []);

  const renderNavItem = (Icon: React.ComponentType<any>, label: string, to: string) => {
    const active = to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
    return (
      <Link
        key={label}
        to={to}
        title={label}
        className={[
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all outline-none justify-center lg:justify-start",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/50 focus-visible:bg-white/[0.06] focus-visible:text-foreground",
          active
            ? "bg-white/[0.06] text-foreground shadow-[inset_0_1px_0_oklch(1_0_0_/_0.08)]"
            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
        ].join(" ")}
      >
        <span
          className={[
            "grid h-7 w-7 place-items-center rounded-lg transition-colors shrink-0",
            active
              ? "bg-gradient-to-br from-violet/30 to-electric/20 text-foreground"
              : "bg-white/[0.03] text-muted-foreground group-hover:text-foreground",
          ].join(" ")}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <span className="font-medium hidden lg:block">{label}</span>
        {active && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-glow shadow-[0_0_10px_oklch(0.85_0.13_200)] hidden lg:block" />
        )}
      </Link>
    );
  };

  return (
    <aside className="glass-panel sticky top-6 ml-6 mt-6 hidden h-[calc(100vh-3rem)] w-[76px] lg:w-[244px] flex-col p-3 lg:p-5 md:flex transition-all duration-300">
      <Link to="/" className="flex items-center gap-2.5 px-2 pb-6 justify-center lg:justify-start">
        <div className="relative h-8 w-8 shrink-0">
          <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-violet to-electric opacity-80 blur-[6px]" />
          <div className="relative grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-electric font-display text-sm font-bold text-white">
            A
          </div>
        </div>
        <div className="hidden lg:block">
          <div className="font-display text-[15px] font-semibold tracking-wide">AKIRA</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            v1.0.3 · Foundation
          </div>
        </div>
      </Link>

      <div className="hairline mb-4" />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden scrollbar-none">
        {/* Home */}
        {renderNavItem(Home, "Home", "/")}

        {/* Daily Work Label */}
        <div className="hidden lg:block text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 px-3 mt-4 mb-1.5 select-none">
          Daily Work
        </div>
        <div className="lg:hidden h-2" />

        {/* Daily Work Items */}
        {dailyWorkItems.map(({ icon, label, to }) => renderNavItem(icon, label, to))}

        <div className="hairline my-3" />

        {/* Search */}
        {renderNavItem(Search, "Search", "/search")}

        <div className="hairline my-3" />

        {/* Tools */}
        {renderNavItem(Wrench, "Tools", "/tools")}

        {/* Settings */}
        {renderNavItem(Settings, "Settings", "/settings")}

        {/* Developer tools under Developer Mode */}
        {devMode && renderNavItem(Terminal, "Brain Inspector", "/brain")}
      </nav>

      <div className="hairline my-4" />

      <Link
        to="/settings"
        title="Settings & Profile"
        className="block rounded-2xl bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/50"
      >
        <div className="flex items-center gap-3 justify-center lg:justify-start">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-violet/60 to-electric/60 font-display text-sm font-semibold text-white shrink-0">
            {profile.name.charAt(0)}
          </div>
          <div className="min-w-0 hidden lg:block">
            <div className="truncate text-sm font-medium">{profile.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{profile.role}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground hidden lg:flex">
          <span className="h-1 w-1 rounded-full bg-cyan-glow" />
          {profile.motto}
        </div>
      </Link>
    </aside>
  );
}
