import { useState } from "react";
import { toast } from "sonner";
import { GlassDialog } from "./glass-dialog";
import { FieldTextarea, GhostButton } from "@/components/akira/primitives";
import { akira } from "@/services/akira-store";

export function CaptureThoughtDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [text, setText] = useState("");
  return (
    <GlassDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setText("");
      }}
      title="Capture a thought"
      description="Quick, raw, unfiltered. You can refine it later."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          akira.addNote(text);
          toast.success("Thought captured");
          setText("");
          onOpenChange(false);
        }}
        className="space-y-4"
      >
        <FieldTextarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's on your mind?"
        />
        <div className="flex justify-end gap-2">
          <GhostButton onClick={() => onOpenChange(false)}>Cancel</GhostButton>
          <button
            type="submit"
            disabled={!text.trim()}
            className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Save thought
          </button>
        </div>
      </form>
    </GlassDialog>
  );
}
