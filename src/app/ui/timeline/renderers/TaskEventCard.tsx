import { CheckCircle2, PlusCircle, ClipboardList, Flame, Edit, Trash2 } from "lucide-react";
import { EventCardProps, EventDetailProps } from "../types";

export function TaskEventCard({ event, onOpenDetails }: EventCardProps) {
  const isCompleted = event.eventType === "task.completed" || event.eventType === "mission.completed";
  const title = event.payload.title || "Untitled Task";

  const timeStr = event.timestamp
    ? new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  let icon = <ClipboardList className="h-4 w-4 text-cyan-glow" />;
  let iconBg = "bg-cyan-glow/10 border-cyan-glow/20";
  let statusBadge = "Task Event";

  if (event.eventType === "task.completed") {
    icon = <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    iconBg = "bg-emerald-500/10 border-emerald-500/20";
    statusBadge = "Completed";
  } else if (event.eventType === "task.created") {
    icon = <PlusCircle className="h-4 w-4 text-sky-400" />;
    iconBg = "bg-sky-500/10 border-sky-500/20";
    statusBadge = "Created";
  } else if (event.eventType === "task.updated") {
    icon = <Edit className="h-4 w-4 text-amber-400" />;
    iconBg = "bg-amber-500/10 border-amber-500/20";
    statusBadge = "Updated";
  } else if (event.eventType === "task.deleted") {
    icon = <Trash2 className="h-4 w-4 text-rose-400" />;
    iconBg = "bg-rose-500/10 border-rose-500/20";
    statusBadge = "Deleted";
  } else if (event.eventType === "mission.completed") {
    icon = <Flame className="h-4 w-4 text-amber-500" />;
    iconBg = "bg-amber-500/15 border-amber-500/30";
    statusBadge = "Mission Clear";
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
        <h4
          className={`text-sm font-semibold truncate ${
            isCompleted ? "text-muted-foreground line-through" : "text-white/95"
          }`}
        >
          {title}
        </h4>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-white/[0.03] border border-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {statusBadge}
          </span>
          {event.payload.priority && (
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium border ${
                event.payload.priority === "High"
                  ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                  : event.payload.priority === "Medium"
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    : "bg-slate-500/10 border-slate-500/20 text-slate-400"
              }`}
            >
              {event.payload.priority}
            </span>
          )}
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

export function TaskEventDetail({ event }: EventDetailProps) {
  const payload = event.payload;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Task Detail
        </h4>
        <div className="mt-2 rounded-xl border border-white/5 bg-white/[0.01] p-3 text-xs space-y-2.5">
          <div className="flex justify-between border-b border-white/5 pb-2">
            <span className="text-muted-foreground">Title</span>
            <span className="font-semibold text-white/90">{payload.title || "Untitled"}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-2">
            <span className="text-muted-foreground">Priority</span>
            <span className="font-mono text-white/80">{payload.priority || "Normal"}</span>
          </div>
          {payload.description && (
            <div className="border-b border-white/5 pb-2 space-y-1">
              <span className="text-muted-foreground block">Description</span>
              <p className="text-white/80 leading-relaxed">{payload.description}</p>
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
