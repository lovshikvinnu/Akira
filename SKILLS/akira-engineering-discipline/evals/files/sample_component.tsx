import React from "react";
import { useNoteData } from "../hooks/useNoteData";

interface NoteCardProps {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

export const NoteCard: React.FC<NoteCardProps> = ({ id, title, content, updatedAt }) => {
  const { isSaving, handleSave } = useNoteData(id);

  return (
    <div className="rounded-lg border border-border p-4 bg-card shadow-sm">
      <div className="flex items-center justify-between pb-2">
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
        <span className="text-xs text-muted-foreground">{updatedAt}</span>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-3">{content}</p>
      {isSaving && <span className="text-xs text-amber-500 mt-2 block">Saving...</span>}
    </div>
  );
};
