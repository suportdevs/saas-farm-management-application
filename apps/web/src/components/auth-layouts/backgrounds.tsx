'use client';

import { useCanvasAnimation } from './use-canvas';

const layer = 'pointer-events-none absolute inset-0 h-full w-full';

// ─── Particle network ─────────────────────────────────────────────────────

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Drifting dots joined by lines when close; the pointer pulls in nearby links. */
export function ParticleNetwork() {
  const ref = useCanvasAnimation<Node[]>(
    (w, h) =>
      Array.from({ length: Math.round(Math.min(90, (w * h) / 14000)) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
      })),
    (nodes, { ctx, width, height, dt, pointer, colors }) => {
      const LINK = 130;
      for (const n of nodes) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      }
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]!;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            ctx.globalAlpha = (1 - d / LINK) * 0.35;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        if (pointer) {
          const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          if (d < LINK * 1.4) {
            ctx.globalAlpha = (1 - d / (LINK * 1.4)) * 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(pointer.x, pointer.y);
            ctx.stroke();
          }
        }
      }
      ctx.fillStyle = colors.primary;
      ctx.globalAlpha = 0.7;
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  );
  return <canvas ref={ref} className={layer} aria-hidden />;
}

// ─── Animated birds (boids) ───────────────────────────────────────────────

interface Bird extends Node {
  phase: number;
}

/** A flock following the classic boids rules: separation, alignment and cohesion. */
export function AnimatedBirds() {
  const ref = useCanvasAnimation<Bird[]>(
    (w, h) =>
      Array.from({ length: Math.round(Math.min(70, w / 18)) }, () => {
        const angle = Math.random() * Math.PI * 2;
        return { x: Math.random() * w, y: Math.random() * h * 0.7, vx: Math.cos(angle) * 60, vy: Math.sin(angle) * 30, phase: Math.random() * Math.PI * 2 };
      }),
    (birds, { ctx, width, height, dt, time, pointer, colors }) => {
      const VIEW = 70;
      const MAX = 90;
      for (const b of birds) {
        let ax = 0;
        let ay = 0;
        let cx = 0;
        let cy = 0;
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (const o of birds) {
          if (o === b) continue;
          const dx = o.x - b.x;
          const dy = o.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d > VIEW) continue;
          n++;
          ax += o.vx;
          ay += o.vy;
          cx += o.x;
          cy += o.y;
          if (d < 22) {
            sx -= dx / (d || 1);
            sy -= dy / (d || 1);
          }
        }
        if (n) {
          b.vx += ((ax / n - b.vx) * 0.6 + (cx / n - b.x) * 0.4 + sx * 40) * dt;
          b.vy += ((ay / n - b.vy) * 0.6 + (cy / n - b.y) * 0.4 + sy * 40) * dt;
        }
        // Birds scatter away from the pointer.
        if (pointer) {
          const dx = b.x - pointer.x;
          const dy = b.y - pointer.y;
          const d = Math.hypot(dx, dy);
          if (d < 120) {
            b.vx += (dx / d) * 300 * dt;
            b.vy += (dy / d) * 300 * dt;
          }
        }
        // Gentle drift to the right and away from the ground.
        b.vx += 8 * dt;
        if (b.y > height * 0.75) b.vy -= 40 * dt;
        const speed = Math.hypot(b.vx, b.vy);
        if (speed > MAX) {
          b.vx = (b.vx / speed) * MAX;
          b.vy = (b.vy / speed) * MAX;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x > width + 20) b.x = -20;
        if (b.x < -20) b.x = width + 20;
        if (b.y > height + 20) b.y = -20;
        if (b.y < -20) b.y = height + 20;
      }

      ctx.strokeStyle = colors.foreground;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.55;
      for (const b of birds) {
        const heading = Math.atan2(b.vy, b.vx);
        const flap = Math.sin(time * 9 + b.phase) * 4;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(heading);
        ctx.beginPath();
        // A gull silhouette: two curved wings meeting at the body.
        ctx.moveTo(-5, -7 - flap);
        ctx.quadraticCurveTo(-1, -2, 2, 0);
        ctx.quadraticCurveTo(-1, 2, -5, 7 + flap);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  );
  return (
    <>
      <div className={`${layer} bg-gradient-to-b from-sky-200 via-orange-100 to-rose-100 dark:from-slate-950 dark:via-indigo-950 dark:to-violet-900`} />
      <canvas ref={ref} className={layer} aria-hidden />
    </>
  );
}

// ─── Aurora waves ─────────────────────────────────────────────────────────

/** Soft, slowly drifting blurred colour ribbons. Pure CSS. */
export function AuroraWaves() {
  const blobs = [
    'left-[-10%] top-[-20%] h-[60vmax] w-[60vmax] bg-primary/40',
    'right-[-15%] top-[10%] h-[50vmax] w-[50vmax] bg-amber-400/30 [animation-delay:-6s]',
    'bottom-[-25%] left-[20%] h-[55vmax] w-[55vmax] bg-lime-400/25 [animation-delay:-12s]',
  ];
  return (
    <div className={`${layer} overflow-hidden bg-background`} aria-hidden>
      {blobs.map((cls) => (
        <div key={cls} className={`animate-aurora absolute rounded-full blur-[100px] ${cls}`} />
      ))}
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
        style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      />
    </div>
  );
}

// ─── Tidal ────────────────────────────────────────────────────────────────

const WAVE = 'M0 40 Q 150 0 300 40 T 600 40 T 900 40 T 1200 40 V 120 H 0 Z';

/** Layered ocean waves rolling along the bottom of the page. */
export function Tidal() {
  const layers = [
    { cls: 'fill-primary/15', duration: '22s', bottom: '0', height: 'h-48' },
    { cls: 'fill-primary/25', duration: '16s', bottom: '0', height: 'h-36' },
    { cls: 'fill-primary/40', duration: '11s', bottom: '0', height: 'h-24' },
  ];
  return (
    <div className={`${layer} overflow-hidden bg-gradient-to-b from-background via-background to-primary/10`} aria-hidden>
      {layers.map((l) => (
        <svg
          key={l.duration}
          className={`animate-tide absolute bottom-0 left-0 w-[200%] ${l.height}`}
          style={{ animationDuration: l.duration }}
          viewBox="0 0 2400 120"
          preserveAspectRatio="none"
        >
          {/* Two copies side by side so translating by -50% loops seamlessly. */}
          <path className={l.cls} d={WAVE} />
          <path className={l.cls} d={WAVE} transform="translate(1200 0)" />
        </svg>
      ))}
    </div>
  );
}

// ─── Fullscreen gradient ──────────────────────────────────────────────────

export function GradientMesh() {
  return (
    <div
      className={layer}
      aria-hidden
      style={{
        backgroundColor: 'var(--background)',
        backgroundImage: [
          'radial-gradient(at 15% 20%, color-mix(in oklch, var(--primary) 55%, transparent) 0, transparent 50%)',
          'radial-gradient(at 85% 10%, color-mix(in oklch, #ec4899 45%, transparent) 0, transparent 45%)',
          'radial-gradient(at 70% 90%, color-mix(in oklch, #06b6d4 40%, transparent) 0, transparent 50%)',
          'radial-gradient(at 10% 85%, color-mix(in oklch, #f59e0b 30%, transparent) 0, transparent 45%)',
        ].join(','),
      }}
    />
  );
}

// ─── YouTube video ────────────────────────────────────────────────────────

/** Muted, looping background video. Falls back to the gradient when no id is configured. */
export function YouTubeBackground({ videoId }: { videoId?: string }) {
  if (!videoId) return <GradientMesh />;
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    loop: '1',
    playlist: videoId,
    controls: '0',
    modestbranding: '1',
    playsinline: '1',
    rel: '0',
    disablekb: '1',
  });
  return (
    <div className={`${layer} overflow-hidden bg-black`} aria-hidden>
      {/* Sized to always cover the viewport at 16:9. */}
      <iframe
        title="Background video"
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params}`}
        allow="autoplay; encrypted-media"
        tabIndex={-1}
        className="absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full -translate-x-1/2 -translate-y-1/2 border-0"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/30" />
    </div>
  );
}
