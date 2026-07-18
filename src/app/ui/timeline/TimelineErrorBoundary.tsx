import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class TimelineErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Timeline card rendering failed:", error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.02] p-4 text-xs text-rose-400 w-full">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <span className="font-semibold block text-white/90">Card Render Error</span>
              <span className="text-muted-foreground/80 leading-relaxed block mt-0.5">
                Failed to display timeline event (payload format mismatch).
              </span>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
