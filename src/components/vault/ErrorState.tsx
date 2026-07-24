import { AlertTriangle } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = "An error occurred while loading the File Vault contents.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="glass-panel flex min-h-[320px] flex-col items-center justify-center rounded-3xl p-8 text-center border border-destructive/10 bg-destructive/[0.01] backdrop-blur-xl">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/[0.05] border border-destructive/10 mb-4 text-destructive">
        <AlertTriangle className="h-8 w-8 animate-bounce" />
      </div>
      <h3 className="text-lg font-medium text-foreground tracking-tight">Access Error</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-6 btn-glow px-5 py-2.5 text-xs font-semibold bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
export default ErrorState;
