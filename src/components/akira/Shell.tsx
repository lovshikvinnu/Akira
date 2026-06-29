import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[520px] w-[520px] rounded-full bg-violet/20 blur-[140px]" />
        <div className="absolute bottom-[-200px] right-[-100px] h-[520px] w-[520px] rounded-full bg-electric/15 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(1 0 0 / 0.5) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.5) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          }}
        />
      </div>

      <div className="relative flex">
        <Sidebar />
        <main className="min-w-0 flex-1 px-6 pb-12 pt-6 md:px-10">
          <Topbar />
          {children}
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <section className="mt-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-cyan-glow shadow-[0_0_10px_oklch(0.85_0.13_200)]" />
          {eyebrow}
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight md:text-4xl">
          <span className="text-gradient-akira">{title}</span>
        </h1>
        {subtitle && <p className="mt-2 max-w-xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </section>
  );
}
