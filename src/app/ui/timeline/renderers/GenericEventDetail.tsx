import { EventDetailProps } from "../types";

export function GenericEventDetail({ event }: EventDetailProps) {
  const keys = Object.keys(event.payload);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Event Properties
        </h4>
        <div className="mt-2 rounded-xl border border-white/5 bg-white/[0.01] p-3 text-xs space-y-2.5">
          <div className="flex justify-between border-b border-white/5 pb-2">
            <span className="text-muted-foreground">Event Type</span>
            <span className="font-mono text-white/80">{event.eventType}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-2">
            <span className="text-muted-foreground">Payload Version</span>
            <span className="font-mono text-white/80">v{event.payloadVersion}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-2">
            <span className="text-muted-foreground">Project Link</span>
            <span className="font-mono text-white/80">{event.projectId || "None"}</span>
          </div>
          <div className="flex justify-between pb-1">
            <span className="text-muted-foreground">Occurred At</span>
            <span className="font-mono text-white/80">
              {new Date(event.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {keys.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Raw Data Payload
          </h4>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-white/5 bg-black/40 p-4 font-mono text-[11px] text-muted-foreground/90 leading-relaxed max-h-[300px]">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
