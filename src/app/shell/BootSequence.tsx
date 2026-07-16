import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

export function BootSequence({ onComplete }: { onComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [fadeStatus, setFadeStatus] = useState<"in" | "out">("in");
  const [isExiting, setIsExiting] = useState(false);

  const steps = [
    "Initializing...",
    "Loading Brain...",
    "Loading Memory...",
    "Loading Projects...",
    "Loading Daily Mission...",
    "Preparing Awareness...",
    "Companion Ready.",
  ];

  useEffect(() => {
    if (currentStep >= steps.length) {
      // Complete!
      setIsExiting(true);
      const timeout = setTimeout(() => {
        onComplete();
        sessionStorage.setItem("akira:booted", "true");
      }, 800); // match exit transition
      return () => clearTimeout(timeout);
    }

    // Step transition time
    const duration = currentStep === steps.length - 1 ? 1200 : 600;

    const timer = setTimeout(() => {
      setFadeStatus("out");
      const fadeTimer = setTimeout(() => {
        setCurrentStep((prev) => prev + 1);
        setFadeStatus("in");
      }, 150);
      return () => clearTimeout(fadeTimer);
    }, duration);

    return () => clearTimeout(timer);
  }, [currentStep, onComplete, steps.length]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#05070b] text-foreground transition-opacity duration-700 ease-in-out ${
        isExiting ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* Background glow effects */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 h-[350px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet/10 blur-[100px] animate-akira-pulse" />
        <div className="absolute top-1/2 left-1/2 h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-electric/10 blur-[80px]" />
      </div>

      {/* Main Content */}
      <div className="relative flex flex-col items-center text-center">
        {/* Pulsating premium logo container */}
        <div className="relative mb-8 h-20 w-20">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet to-electric opacity-60 blur-md animate-akira-pulse" />
          <div className="relative grid h-20 w-20 place-items-center rounded-2xl border border-white/10 bg-[#0c0f16] font-display text-3xl font-bold text-white shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
            A
          </div>
        </div>

        {/* Brand name */}
        <h2 className="font-display text-xl font-semibold tracking-[0.2em] text-white">
          A K I R A
        </h2>
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-cyan-glow">
          <Sparkles className="h-3 w-3 animate-spin-slow" /> AI Companion
        </div>

        {/* Loading Progress Bar */}
        <div className="relative mt-8 h-1 w-48 overflow-hidden rounded-full bg-white/5">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-violet to-electric transition-all duration-500 ease-out"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Current status text */}
        <p
          className={`mt-4 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground transition-all duration-150 ${
            fadeStatus === "in" ? "translate-y-0 opacity-80" : "translate-y-1 opacity-0"
          }`}
        >
          {steps[Math.min(currentStep, steps.length - 1)]}
        </p>
      </div>
    </div>
  );
}
