import type { ReactNode } from "react";
import { Dumbbell, BookOpen, Moon, Cpu, Sparkles, Rocket } from "lucide-react";

export function ProjectIcon({ icon, className }: { icon: string; className?: string }) {
  const map: Record<string, typeof Sparkles> = {
    dumbbell: Dumbbell,
    cpu: Cpu,
    book: BookOpen,
    sparkles: Sparkles,
    moon: Moon,
    rocket: Rocket,
  };
  const Icon = map[icon] || Sparkles;
  return <Icon className={className} />;
}

export function CardShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`glass-card glass-card-hover p-6 ${className}`}>{children}</div>;
}

export function CardLabel({
  children,
  accent = "violet",
}: {
  children: ReactNode;
  accent?: "violet" | "electric" | "cyan";
}) {
  const dot =
    accent === "violet"
      ? "bg-violet shadow-[0_0_10px_oklch(0.68_0.22_295)]"
      : accent === "electric"
        ? "bg-electric shadow-[0_0_10px_oklch(0.72_0.19_250)]"
        : "bg-cyan-glow shadow-[0_0_10px_oklch(0.85_0.13_200)]";
  return (
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </div>
  );
}

export function GhostButton({
  children,
  onClick,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-foreground/90 transition-all hover:border-white/20 hover:bg-white/[0.06] ${className}`}
    >
      {children}
    </button>
  );
}

export function FieldInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string },
) {
  const { label, className = "", ...rest } = props;
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
      )}
      <input
        {...rest}
        className={`h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-violet/60 focus:bg-white/[0.06] ${className}`}
      />
    </label>
  );
}

export function FieldTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string },
) {
  const { label, className = "", ...rest } = props;
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
      )}
      <textarea
        {...rest}
        className={`min-h-[110px] w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-violet/60 focus:bg-white/[0.06] ${className}`}
      />
    </label>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {hint && <p className="mt-2 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
