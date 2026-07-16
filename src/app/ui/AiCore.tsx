import { useEffect, useRef } from "react";

/**
 * AKIRA AI Core — animated SVG. Idle: slow concentric rotation, soft pulse, particles.
 */
export function AiCore() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    type P = { a: number; r: number; s: number; o: number };
    const particles: P[] = Array.from({ length: 36 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 60 + Math.random() * 120,
      s: 0.0008 + Math.random() * 0.0015,
      o: 0.2 + Math.random() * 0.6,
    }));

    const render = (t: number) => {
      const { width: w, height: h } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;

      // soft glow halo
      const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, 200);
      grd.addColorStop(0, "rgba(160,120,255,0.18)");
      grd.addColorStop(0.5, "rgba(80,140,255,0.08)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);

      // particles
      particles.forEach((p) => {
        p.a += p.s;
        const x = cx + Math.cos(p.a) * p.r;
        const y = cy + Math.sin(p.a) * p.r;
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,210,255,${p.o * (0.6 + 0.4 * Math.sin(t / 600 + p.a))})`;
        ctx.fill();
      });

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative aspect-square w-full max-w-[440px] mx-auto">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Rotating concentric SVG rings */}
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="ringA" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.78 0.2 295)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="oklch(0.78 0.18 250)" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="ringB" x1="1" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.85 0.13 200)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="oklch(0.7 0.2 285)" stopOpacity="0.15" />
          </linearGradient>
          <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="oklch(0.95 0.05 250)" stopOpacity="1" />
            <stop offset="55%" stopColor="oklch(0.65 0.22 290)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="oklch(0.3 0.15 270)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer ring */}
        <g className="origin-center animate-spin-slow" style={{ transformOrigin: "200px 200px" }}>
          <circle
            cx="200"
            cy="200"
            r="180"
            fill="none"
            stroke="url(#ringA)"
            strokeWidth="1"
            strokeDasharray="2 8"
          />
          <circle
            cx="200"
            cy="200"
            r="180"
            fill="none"
            stroke="oklch(1 0 0 / 0.05)"
            strokeWidth="1"
          />
          {/* tick marks */}
          {Array.from({ length: 60 }).map((_, i) => {
            const a = (i / 60) * Math.PI * 2;
            const x1 = 200 + Math.cos(a) * 172;
            const y1 = 200 + Math.sin(a) * 172;
            const x2 = 200 + Math.cos(a) * (i % 5 === 0 ? 160 : 167);
            const y2 = 200 + Math.sin(a) * (i % 5 === 0 ? 160 : 167);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="oklch(1 0 0 / 0.18)"
                strokeWidth="0.75"
              />
            );
          })}
        </g>

        {/* Mid ring (reverse) */}
        <g style={{ transformOrigin: "200px 200px" }} className="animate-spin-rev">
          <circle cx="200" cy="200" r="140" fill="none" stroke="url(#ringB)" strokeWidth="1.2" />
          <circle
            cx="200"
            cy="200"
            r="140"
            fill="none"
            stroke="oklch(1 0 0 / 0.06)"
            strokeWidth="1"
            strokeDasharray="40 8 4 8"
          />
          {/* node dots */}
          {[0, 60, 120, 180, 240, 300].map((deg) => {
            const a = (deg / 180) * Math.PI;
            return (
              <circle
                key={deg}
                cx={200 + Math.cos(a) * 140}
                cy={200 + Math.sin(a) * 140}
                r="2.5"
                fill="oklch(0.85 0.13 200)"
              />
            );
          })}
        </g>

        {/* Inner ring */}
        <g style={{ transformOrigin: "200px 200px" }} className="animate-spin-mid">
          <circle
            cx="200"
            cy="200"
            r="100"
            fill="none"
            stroke="oklch(0.78 0.18 270 / 0.45)"
            strokeWidth="1"
          />
          <path
            d="M120,200 A80,80 0 0 1 280,200"
            fill="none"
            stroke="oklch(0.85 0.13 200 / 0.8)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M140,220 A60,60 0 0 0 260,180"
            fill="none"
            stroke="oklch(0.75 0.2 295 / 0.6)"
            strokeWidth="1"
          />
        </g>

        {/* Core orb */}
        <g className="animate-akira-pulse" style={{ transformOrigin: "200px 200px" }}>
          <circle cx="200" cy="200" r="70" fill="url(#coreGrad)" />
          <circle cx="200" cy="200" r="36" fill="oklch(0.98 0.02 280 / 0.85)" />
          <circle cx="200" cy="200" r="18" fill="white" opacity="0.9" />
        </g>
      </svg>
    </div>
  );
}
