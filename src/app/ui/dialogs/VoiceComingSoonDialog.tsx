import { Mic } from "lucide-react";
import { GlassDialog } from "./glass-dialog";
import { GhostButton } from "@/app/ui/primitives";

export function VoiceComingSoonDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <GlassDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Voice Capture Coming Soon"
      description="AKIRA will soon listen, transcribe and refine your thoughts in real time."
    >
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="relative grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-violet/40 to-electric/30">
          <div className="absolute inset-0 animate-akira-pulse rounded-full bg-gradient-to-br from-violet/30 to-electric/20 blur-md" />
          <Mic className="relative h-7 w-7 text-cyan-glow" />
        </div>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          For now, type your thought instead — it lands in the same Brain Dump.
        </p>
        <GhostButton onClick={() => onOpenChange(false)}>Got it</GhostButton>
      </div>
    </GlassDialog>
  );
}
