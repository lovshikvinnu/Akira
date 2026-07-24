import React, { useState, useEffect, useMemo, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, Terminal, AlertTriangle, Play, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Shell, PageHeader } from "@/app/shell/Shell";
import { CardShell, CardLabel } from "@/app/ui/primitives";
import { getVisibleTools, Tool } from "@/akira-os/tools/registry";

export const Route = createFileRoute("/tools/")({
  head: () => ({
    meta: [
      { title: "Tools Hub — AKIRA" },
      { name: "description", content: "Access advanced cognitive and system tools inside AKIRA." },
    ],
  }),
  component: ToolsHubPage,
});

const CATEGORIES = ["Productivity", "Knowledge", "Automation", "System", "Developer"] as const;
type Category = (typeof CATEGORIES)[number];

function ToolsHubPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [devMode, setDevMode] = useState(false);
  const cardRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // 1. Sync Developer Mode state
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

  // 2. Fetch and filter tools dynamically based on search and dev mode
  const visibleTools = useMemo(() => {
    const tools = getVisibleTools(devMode);
    const query = q.trim().toLowerCase();
    if (!query) return tools;

    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query),
    );
  }, [q, devMode]);

  // 3. Group filtered tools by category
  const groupedTools = useMemo(() => {
    const groups: Record<Category, Tool[]> = {
      Productivity: [],
      Knowledge: [],
      Automation: [],
      System: [],
      Developer: [],
    };

    visibleTools.forEach((tool) => {
      if (tool.category in groups) {
        groups[tool.category as Category].push(tool);
      }
    });

    return groups;
  }, [visibleTools]);

  const handleToolClick = (tool: Tool) => {
    if (tool.status === "coming-soon") {
      toast.info(`${tool.name} subsystem initialization is planned for a future update.`);
      return;
    }

    // Navigate to tool route
    navigate({ to: tool.route });
  };

  const handleKeyDown = (e: React.KeyboardEvent, tool: Tool) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToolClick(tool);
    }
  };

  // Check if a category has any visible items
  const hasItems = (cat: Category) => groupedTools[cat].length > 0;

  return (
    <Shell>
      <PageHeader
        eyebrow="AKIRA · SUBSYSTEMS"
        title="Tools Hub"
        subtitle="Manage and execute advanced cognitive modules and system resources."
      />

      {/* Search and Control Bar */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="glass-panel flex h-11 min-w-[280px] flex-1 items-center gap-3 rounded-2xl px-4 focus-within:border-violet/40 transition-colors">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tools & subsystems…"
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search tools"
          />
        </div>
      </div>

      {/* Dynamic categorized grid */}
      <div className="mt-8 space-y-10">
        {CATEGORIES.map((category) => {
          if (!hasItems(category)) return null;

          return (
            <div key={category} className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/80 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-violet animate-pulse" />
                {category}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupedTools[category].map((tool) => {
                  const Icon = tool.icon as React.ComponentType<any>;
                  const isReady = tool.status === "ready";
                  const isComing = tool.status === "coming-soon";
                  const isExperimental = tool.status === "experimental";

                  return (
                    <div
                      key={tool.id}
                      ref={(el) => {
                        cardRefs.current[tool.id] = el;
                      }}
                      onClick={() => handleToolClick(tool)}
                      onKeyDown={(e) => handleKeyDown(e, tool)}
                      tabIndex={0}
                      role="button"
                      aria-label={`${tool.name} tool. Status: ${tool.status}. ${tool.description}`}
                      className={`group glass-panel rounded-2xl p-5 text-left transition-all duration-300 outline-none select-none border border-white/5 ${
                        isComing
                          ? "opacity-60 cursor-not-allowed hover:bg-white/[0.01]"
                          : "cursor-pointer hover:border-violet/30 hover:bg-white/[0.04] focus:border-violet/40 focus:ring-1 focus:ring-violet/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`grid h-10 w-10 place-items-center rounded-xl transition-colors ${
                              isComing
                                ? "bg-white/[0.02] text-muted-foreground"
                                : "bg-gradient-to-br from-violet/20 to-electric/15 text-violet group-hover:text-white"
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="font-display text-sm font-semibold tracking-wide text-foreground group-hover:text-violet-glow transition-colors">
                              {tool.name}
                            </h3>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              {tool.category}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide border uppercase ${
                            isReady
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : isComing
                                ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}
                        >
                          {tool.status === "coming-soon" ? "Coming Soon" : tool.status}
                        </span>
                      </div>

                      <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                        {tool.description}
                      </p>

                      {!isComing && (
                        <div className="mt-4 flex items-center justify-end text-[10px] text-muted-foreground group-hover:text-violet transition-colors">
                          <span className="mr-1">Launch Subsystem</span>
                          <Play className="h-2.5 w-2.5 transform group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {visibleTools.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center border border-white/5 rounded-2xl bg-white/[0.01]">
            <HelpCircle className="h-10 w-10 text-muted-foreground/50" />
            <h3 className="mt-4 font-semibold text-sm">No matching tools found</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Try adjusting your query or enabling Developer Mode.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}
