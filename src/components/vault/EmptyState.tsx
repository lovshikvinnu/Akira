import React from "react";
import { FolderOpen } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  title = "This folder is empty",
  description = "Upload a file or create a folder to get started.",
  icon = <FolderOpen className="h-10 w-10 text-muted-foreground" />,
  action,
}: EmptyStateProps) {
  return (
    <div className="glass-panel flex min-h-[320px] flex-col items-center justify-center rounded-3xl p-8 text-center border border-white/5 bg-white/[0.01] backdrop-blur-xl">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/5 mb-4 shadow-inner">
        {icon}
      </div>
      <h3 className="text-lg font-medium text-foreground tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm leading-relaxed">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
export default EmptyState;
