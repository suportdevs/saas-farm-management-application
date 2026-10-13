'use client';

import { useEffect, useRef } from 'react';

export interface CanvasFrame {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Seconds since the animation started. */
  time: number;
  /** Seconds since the previous frame (capped to avoid jumps after tab switches). */
  dt: number;
  pointer: { x: number; y: number } | null;
  /** Resolved theme colours, refreshed when the theme toggles. */
  colors: { primary: string; foreground: string; muted: string };
}

/**
 * Full-size, DPR-aware canvas animation loop. `setup` runs on mount and every
 * resize (create your particles there); `draw` runs each frame. With
 * prefers-reduced-motion a single static frame is drawn.
 */
export function useCanvasAnimation<S>(setup: (w: number, h: number) => S, draw: (state: S, frame: CanvasFrame) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const setupRef = useRef(setup);
  const drawRef = useRef(draw);
  setupRef.current = setup;
  drawRef.current = draw;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const readColors = () => {
      const css = getComputedStyle(document.documentElement);
      return {
        primary: css.getPropertyValue('--primary').trim() || '#6366f1',
        foreground: css.getPropertyValue('--foreground').trim() || '#0f172a',
        muted: css.getPropertyValue('--muted-foreground').trim() || '#64748b',
      };
    };

    let colors = readColors();
    let width = 0;
    let height = 0;
    let state: S;
    let pointer: { x: number; y: number } | null = null;
    let raf = 0;
    const start = performance.now();
    let last = start;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state = setupRef.current(width, height);
      if (reduced) frame(performance.now());
    };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, width, height);
      drawRef.current(state, { ctx, width, height, time: (now - start) / 1000, dt, pointer, colors });
      if (!reduced) raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => (pointer = null);
    // Theme toggles flip the `dark` class on <html>.
    const themeObserver = new MutationObserver(() => (colors = readColors()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerleave', onLeave);
    resize();
    if (!reduced) raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return ref;
}
