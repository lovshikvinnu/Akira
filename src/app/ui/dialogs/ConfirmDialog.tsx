import type { ReactNode } from "react";
import { GlassDialog } from "./glass-dialog";
import { GhostButton } from "@/app/ui/primitives";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  destructive = false,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
  children?: ReactNode;
}) {
  return (
    <GlassDialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {children}
      <div className="mt-4 flex justify-end gap-2">
        <GhostButton onClick={() => onOpenChange(false)}>Cancel</GhostButton>
        <button
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
          className={
            destructive
              ? "inline-flex items-center gap-2 rounded-[14px] border border-destructive/40 bg-destructive/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-destructive/30"
              : "btn-glow inline-flex items-center gap-2 px-4 py-2 text-sm font-medium"
          }
        >
          {confirmLabel}
        </button>
      </div>
    </GlassDialog>
  );
}
