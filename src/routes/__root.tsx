import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/app/ui/sonner";
import { BootSequence } from "@/app/shell/BootSequence";
import { presenceService, useAkiraHydrated, timelineService } from "@/akira-os";
import { goalService } from "@/genesis";
import { knowledgeService } from "@/genesis";
import { relationshipService } from "@/genesis";
import { habitService } from "@/genesis";
import { reflectionService } from "@/genesis";
import { contextResolutionService } from "@/genesis";
import { initiativeService } from "@/genesis";
import { companionStateService } from "@/genesis";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const isDevMode =
    typeof window !== "undefined" && localStorage.getItem("akira:dev_mode") === "true";

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  const handleCopyDetails = () => {
    const details = `${error.toString()}\n\nStack:\n${error.stack || "No stack trace available"}`;
    navigator.clipboard.writeText(details);
    setCopied(true);
    toast.success("Error details copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05070b] px-4 text-foreground relative">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/5 blur-[120px]" />
      </div>

      <div className="glass-panel relative max-w-md w-full p-8 text-center animate-fade-in border-red-500/10">
        <div className="flex flex-col items-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-red-500/10 text-red-400 border border-red-500/15">
            <span className="text-xl font-bold font-mono">!</span>
          </div>
          <h1 className="mt-4 font-display text-xl font-bold tracking-tight text-white">
            Application Interruption
          </h1>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            AKIRA encountered an unexpected boundary crash. You can safely trigger recovery or head
            back home.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="btn-glow inline-flex items-center gap-2 px-5 h-10 text-xs font-semibold"
          >
            Recover & Retry
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 h-10 text-xs font-semibold text-foreground/90 transition-all hover:bg-white/[0.06] hover:border-white/20"
          >
            Return Home
          </a>
        </div>

        {isDevMode && (
          <div className="mt-6 border-t border-white/5 pt-6 text-left">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 font-mono">
                Developer Debug Info
              </span>
              <button
                onClick={handleCopyDetails}
                className="rounded border border-white/10 bg-white/[0.02] px-2 py-1 text-[9px] font-mono text-muted-foreground hover:bg-white/[0.05] hover:text-white"
              >
                {copied ? "Copied!" : "Copy Details"}
              </button>
            </div>

            <button
              onClick={() => setShowDetails(!showDetails)}
              className="mt-2.5 flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground"
            >
              <span>{showDetails ? "Hide Stack Trace" : "Show Stack Trace"}</span>
              <span className="text-[10px]">{showDetails ? "▲" : "▼"}</span>
            </button>

            {showDetails && (
              <pre className="mt-2 rounded-lg bg-black/40 border border-white/5 p-3 text-[9px] font-mono text-red-400/90 overflow-x-auto max-h-48 scrollbar leading-normal">
                {error.stack || error.toString()}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AKIRA — AI Companion for Growth" },
      {
        name: "description",
        content: "AKIRA is a premium AI companion for focus, growth and daily missions.",
      },
      { name: "author", content: "AKIRA" },
      { property: "og:title", content: "AKIRA — AI Companion for Growth" },
      {
        property: "og:description",
        content: "A futuristic AI companion for daily missions, projects, and deep focus.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const hydrated = useAkiraHydrated();
  const [isBooting, setIsBooting] = useState(() => {
    if (typeof window === "undefined") return false;
    return !sessionStorage.getItem("akira:booted");
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const initializeDatabaseState = async () => {
      // 1. Perform migration if legacy data is found
      const legacyData = localStorage.getItem("akira:state:v1");
      if (legacyData) {
        try {
          const { migrateLegacyState } = await import("../persistence/migration");
          const res = await migrateLegacyState({ data: legacyData });
          if (res.success) {
            localStorage.setItem("akira:state:v1:migrated", legacyData);
            localStorage.removeItem("akira:state:v1");
            toast.success("Legacy state successfully migrated to SQLite database!");
          } else {
            console.error("Legacy state migration failed:", res.error);
            toast.error(`Legacy state migration failed: ${res.error}`);
          }
        } catch (err) {
          console.error("Migration coordinator error:", err);
          const errMsg = err instanceof Error ? err.message : String(err);
          toast.error(`Migration coordinator failed: ${errMsg}`);
        }
      }

      // 2. Hydrate client akira-store from the SQLite database
      try {
        const { getInitialState } = await import("../persistence/store-init");
        const { akira } = await import("../persistence/akira-store");
        const state = await getInitialState();
        akira.initializeState(state);
      } catch (err) {
        console.error("Failed to load initial state from SQLite:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to load initial state from SQLite: ${errMsg}`);
      }
    };

    initializeDatabaseState();
  }, []);

  useEffect(() => {
    // Initialize the Presence, Goal, Knowledge, Relationship, Habit, Reflection, Context Resolution, and Initiative Engines at application/session boot
    presenceService.initialize();
    timelineService.initialize();
    companionStateService.bootstrap();
    goalService.initialize();
    knowledgeService.initialize();
    relationshipService.initialize();
    habitService.initialize();
    reflectionService.initialize();
    contextResolutionService.initialize();
    initiativeService.initialize();

    return () => {
      // Wind down decay loops and clean context
      presenceService.shutdown();
      timelineService.shutdown();
      companionStateService.closeSession();
      goalService.shutdown();
      knowledgeService.shutdown();
      relationshipService.shutdown();
      habitService.shutdown();
      reflectionService.shutdown();
      contextResolutionService.shutdown();
      initiativeService.shutdown();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {isBooting && <BootSequence onComplete={() => setIsBooting(false)} />}
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      {hydrated ? <Outlet /> : null}
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}
