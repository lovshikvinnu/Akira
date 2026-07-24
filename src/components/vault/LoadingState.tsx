import { Loader2 } from "lucide-react";

export function LoadingState() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse">
        <Loader2 className="h-6 w-6 text-foreground animate-spin" />
      </div>
      <p className="text-sm text-muted-foreground tracking-wide font-medium animate-pulse">
        Accessing Vault storage...
      </p>
    </div>
  );
}
export default LoadingState;
