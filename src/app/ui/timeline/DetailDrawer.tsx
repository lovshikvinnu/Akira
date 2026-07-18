import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/app/ui/sheet";
import { RendererRegistry } from "./RendererRegistry";
import { TimelineEvent } from "@/akira-os/timeline/types";

interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: TimelineEvent | null;
}

export function DetailDrawer({ open, onOpenChange, event }: DetailDrawerProps) {
  if (!event) return null;

  // Resolve the custom detail view renderer from registry
  const DetailComponent = RendererRegistry.resolveDetail(event.eventType);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="glass-panel border-white/10 bg-[oklch(0.16_0.025_270_/_0.95)] text-foreground sm:max-w-[440px] overflow-y-auto"
      >
        <SheetHeader className="mb-6 text-left">
          <SheetTitle className="font-display text-lg font-bold text-white">
            Event Inspector
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Detailed snapshots and event context metadata.
          </SheetDescription>
        </SheetHeader>

        {/* Lazy evaluation check: only render when drawer is open */}
        {open && <DetailComponent event={event} />}
      </SheetContent>
    </Sheet>
  );
}
