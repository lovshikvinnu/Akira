import { Activity } from "lucide-react";
import { EventCardProps } from "../types";

export function GenericEventCard({ event, onOpenDetails }: EventCardProps) {
  const displayTitle =
    event.payload.title || event.payload.name || `Activity logged: ${event.eventType}`;

  const timeStr = event.timestamp
    ? new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="group relative flex items-start gap-4 rounded-xl border border-white/5 bg-white/[0.015] p-4 transition-all hover:border-white/10 hover:bg-white/[0.04]">
      {/* Left Gutter with category Icon and timeline line segment */}
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03] text-muted-foreground/80 border border-white/5 transition-transform group-hover:scale-105">
          <Activity className="h-4 w-4" />
        </div>
      </div>

      {/* Center content panel */}
      <div className="flex-grow min-w-0">
        <h4 className="text-sm font-semibold text-white/90 truncate">{displayTitle}</h4>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-white/[0.03] border border-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {event.eventType}
          </span>
          {event.projectId && (
            <span className="inline-flex items-center rounded-md bg-violet/10 border border-violet/20 px-2 py-0.5 text-[10px] font-medium text-violet-glow">
              {event.projectId}
            </span>
          )}
        </div>
      </div>

      {/* Right Gutter metadata */}
      <div className="flex flex-col items-end gap-2 text-right self-stretch justify-between">
        <time className="text-xs font-mono text-muted-foreground/60">{timeStr}</time>
        <button
          onClick={onOpenDetails}
          className="text-xs font-semibold text-violet hover:text-violet-glow cursor-pointer transition-colors"
        >
          Details
        </button>
      </div>
    </div>
  );
}
