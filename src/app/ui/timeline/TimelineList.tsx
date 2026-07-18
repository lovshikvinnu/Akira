import { useState } from "react";
import { TimelineEvent } from "@/akira-os/timeline/types";
import { groupEventsByDate } from "./utils/grouping";
import { RendererRegistry } from "./RendererRegistry";
import { DetailDrawer } from "./DetailDrawer";
import { AlertCircle, History } from "lucide-react";
import { EmptyState } from "@/app/ui/primitives";

export type TimelineUIState = "idle" | "loading" | "empty" | "error" | "displaying";

interface TimelineListProps {
  uiState: TimelineUIState;
  events: TimelineEvent[];
  onRetry?: () => void;
}

export function TimelineList({ uiState, events, onRetry }: TimelineListProps) {
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleOpenDetails = (event: TimelineEvent) => {
    setSelectedEvent(event);
    setDrawerOpen(true);
  };

  // State Machine Renderers
  if (uiState === "loading") {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((n) => (
          <div key={n} className="animate-pulse space-y-3">
            <div className="h-4 w-20 rounded bg-white/[0.04]" />
            <div className="h-20 rounded-xl border border-white/5 bg-white/[0.015]" />
          </div>
        ))}
      </div>
    );
  }

  if (uiState === "error") {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rose-500/20 bg-rose-500/[0.02] p-8 text-center w-full">
        <AlertCircle className="h-8 w-8 text-rose-400 mb-3" />
        <h3 className="font-semibold text-white text-sm">Failed to load timeline</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
          An error occurred while fetching chronological event logs from the SQLite database.
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
          >
            Retry Fetching
          </button>
        )}
      </div>
    );
  }

  if (uiState === "empty" || events.length === 0) {
    return (
      <EmptyState
        title="No timeline history found"
        hint="Start working, completing tasks, or editing notes to log activities here."
        icon={History}
      />
    );
  }

  // Segment flat list chronologically
  const groups = groupEventsByDate(events);

  return (
    <div className="relative space-y-8 pl-4">
      {/* Central continuous vertical timeline line */}
      <div className="absolute left-[19px] top-2 bottom-2 w-[1px] bg-white/5" />

      {groups.map((group) => (
        <div key={group.title} className="relative space-y-4">
          {/* Section Date Title */}
          <div className="relative z-10 -ml-4 flex items-center">
            <span className="rounded-md bg-[oklch(0.16_0.025_270)] border border-white/5 px-2.5 py-1 text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest shadow-sm">
              {group.title}
            </span>
          </div>

          {/* Group Items */}
          <div className="space-y-4">
            {group.items.map((event) => {
              const CardComponent = RendererRegistry.resolveCard(event.eventType);
              return (
                <div key={event.id} className="relative z-10">
                  <CardComponent event={event} onOpenDetails={() => handleOpenDetails(event)} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Shared detail inspector drawer */}
      <DetailDrawer open={drawerOpen} onOpenChange={setDrawerOpen} event={selectedEvent} />
    </div>
  );
}
