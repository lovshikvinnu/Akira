import { Play, Timer } from "lucide-react";
import { EventCardProps, EventDetailProps } from "../types";

export function SessionEventCard({ event, onOpenDetails }: EventCardProps) {
  const task = event.payload.task || "Focus Session";
  const duration = event.payload.duration ? `${event.payload.duration}m` : null;

  const timeStr = event.timestamp
    ? new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  let icon = <Play className="h-4 w-4 text-electric" />;
  let iconBg = "bg-electric/10 border-electric/20";
  let statusBadge = "Session Started";

  if (event.eventType === "session.ended") {
    icon = <Timer className="h-4 w-4 text-emerald-400" />;
    iconBg = "bg-emerald-500/10 border-emerald-500/20";
    statusBadge = `Session Ended ${duration ? `(${duration})` : ""}`;
  }

  return (
    <div className="group relative flex items-start gap-4 rounded-xl border border-white/5 bg-white/[0.015] p-4 transition-all hover:border-white/10 hover:bg-white/[0.04]">
      {/* Left Icon Gutter */}
      <div className="flex flex-col items-center">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-transform group-hover:scale-105 ${iconBg}`}
        >
          {icon}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-grow min-w-0">
        <h4 className="text-sm font-semibold text-white/95 truncate">{task}</h4>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-white/[0.03] border border-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {statusBadge}
          </span>
          {event.projectId && (
            <span className="inline-flex items-center rounded-md bg-violet/10 border border-violet/20 px-2 py-0.5 text-[10px] font-medium text-violet-glow">
              {event.projectId}
            </span>
          )}
        </div>
      </div>

      {/* Right Gutter */}
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

export function SessionEventDetail({ event }: EventDetailProps) {
  const payload = event.payload;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Session Detail
        </h4>
        <div className="mt-2 rounded-xl border border-white/5 bg-white/[0.01] p-3 text-xs space-y-2.5">
          <div className="flex justify-between border-b border-white/5 pb-2">
            <span className="text-muted-foreground">Focus Task</span>
            <span className="font-semibold text-white/90">{payload.task || "Focus Session"}</span>
          </div>
          {payload.duration !== undefined && (
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-mono text-white/80">{payload.duration} minutes</span>
            </div>
          )}
          {payload.notes && (
            <div className="border-b border-white/5 pb-2 space-y-1">
              <span className="text-muted-foreground block">Session Notes</span>
              <p className="text-white/80 leading-relaxed">{payload.notes}</p>
            </div>
          )}
          <div className="flex justify-between border-b border-white/5 pb-2">
            <span className="text-muted-foreground">Activity Type</span>
            <span className="font-mono text-white/80">{event.eventType}</span>
          </div>
          <div className="flex justify-between pb-1">
            <span className="text-muted-foreground">Date logged</span>
            <span className="font-mono text-white/80">
              {new Date(event.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
