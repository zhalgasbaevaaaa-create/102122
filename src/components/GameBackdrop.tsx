import { useEffect, useRef } from 'react';
import type { GameDef, LevelDef } from '@shared/games';

/**
 * Procedural cinematic backdrop drawn on a canvas: layered steppe horizon,
 * historical silhouettes and drifting particles. Themes shift per game/level so
 * each game has its own atmosphere without shipping image assets.
 */
export function GameBackdrop({ game, level }: { game: GameDef; level?: LevelDef }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Guard: a zero-sized container (hidden panel, display:none ancestor) would
    // make every x/y increment zero and spin the draw loop forever.
    if (!canvas.clientWidth || !canvas.clientHeight) return;

    let raf = 0;
    let w = canvas.width = canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1);
    let h = canvas.height = canvas.clientHeight * Math.min(2, window.devicePixelRatio || 1);
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const theme = {
      adventure: { sky: ['#101a2c', '#1b2a44'], sun: '#d9a94a', ground: '#0d1522', accent: '#2fb3a8' },
      strategy: { sky: ['#0e1626', '#243a3f'], sun: '#f0cd85', ground: '#0c141f', accent: '#2fb3a8' },
      defense: { sky: ['#1a1220', '#3a1f24'], sun: '#e08a6a', ground: '#130d13', accent: '#c96a4a' },
      race: { sky: ['#1a1a2e', '#3b2f4a'], sun: '#f0cd85', ground: '#12121e', accent: '#8fbf5f' },
      puzzle: { sky: ['#161024', '#2b1f42'], sun: '#c9a0f0', ground: '#100b1a', accent: '#7a4fa3' },
      battle: { sky: ['#0d1a22', '#173a3a'], sun: '#6fd8ce', ground: '#0a1418', accent: '#2fb3a8' },
    }[game.id];

    const tiles = Array.from({ length: 70 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.8 + 0.4,
      v: Math.random() * 0.35 + 0.08,
      a: Math.random() * 0.5 + 0.15,
    }));

    let t = 0;
    function draw() {
      if (!ctx || w <= 0 || h <= 0) return;
      t += 0.004;
      // sky
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, theme.sky[0]);
      g.addColorStop(0.62, theme.sky[1]);
      g.addColorStop(1, theme.ground);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // sun / moon disc
      const sunX = w * 0.72;
      const sunY = h * 0.3;
      const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.42);
      sg.addColorStop(0, theme.sun + 'cc');
      sg.addColorStop(0.28, theme.sun + '3a');
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);
      ctx.beginPath();
      ctx.arc(sunX, sunY, h * 0.075, 0, Math.PI * 2);
      ctx.fillStyle = theme.sun;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;

      // mountains
      const layers = [
        { y: 0.56, amp: 0.1, col: '#0e1a26', rough: 6, speed: 0.15 },
        { y: 0.64, amp: 0.075, col: '#0a1520', rough: 9, speed: 0.32 },
        { y: 0.73, amp: 0.05, col: '#070f18', rough: 13, speed: 0.5 },
      ];
      layers.forEach((L, li) => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        const step = Math.max(1, w / 120);
        for (let x = 0; x <= w; x += step) {
          const n =
            Math.sin(x / (w / L.rough) + t * L.speed + li) * 0.55 +
            Math.sin(x / (w / (L.rough * 2.3)) + t * L.speed * 1.7) * 0.3 +
            Math.sin(x / (w / (L.rough * 5)) + t * L.speed * 0.6) * 0.15;
          ctx.lineTo(x, h * L.y - n * h * L.amp);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = L.col;
        ctx.fill();
      });

      // ground haze
      const gh = ctx.createLinearGradient(0, h * 0.68, 0, h);
      gh.addColorStop(0, 'transparent');
      gh.addColorStop(1, theme.accent + '22');
      ctx.fillStyle = gh;
      ctx.fillRect(0, h * 0.68, w, h * 0.32);

      // silhouettes: yurts / horsemen / walls depending on the game
      const baseY = h * 0.86;
      ctx.fillStyle = '#04080e';
      if (game.id === 'adventure' || game.id === 'race') {
        for (let i = 0; i < 4; i++) {
          const x = ((i * 0.27 + 0.1) * w + Math.sin(t + i) * 6);
          const s = h * 0.09;
          ctx.beginPath();
          ctx.moveTo(x - s, baseY);
          ctx.quadraticCurveTo(x, baseY - s * 1.15, x + s, baseY);
          ctx.closePath();
          ctx.fill();
        }
        // horseman
        const hx = w * 0.2 + Math.sin(t * 0.6) * 10;
        ctx.beginPath();
        ctx.ellipse(hx, baseY - h * 0.045, h * 0.058, h * 0.026, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hx + h * 0.045, baseY - h * 0.038, h * 0.02, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(hx - h * 0.04, baseY - h * 0.02, h * 0.012, h * 0.05);
        ctx.fillRect(hx + h * 0.03, baseY - h * 0.02, h * 0.012, h * 0.05);
      } else if (game.id === 'defense' || game.id === 'strategy') {
        for (let i = 0; i < 3; i++) {
          const x = (0.18 + i * 0.3) * w;
          const bh = h * (0.12 + i * 0.02);
          ctx.fillRect(x, baseY - bh, w * 0.055, bh);
          for (let m = 0; m < 4; m++) ctx.fillRect(x + m * w * 0.015, baseY - bh - h * 0.018, w * 0.008, h * 0.018);
        }
      } else {
        for (let i = 0; i < 6; i++) {
          const x = (0.08 + i * 0.16) * w;
          const bw = w * 0.014;
          const bh = h * (0.05 + (i % 3) * 0.02);
          ctx.fillRect(x, baseY - bh, bw, bh);
          ctx.beginPath();
          ctx.arc(x + bw / 2, baseY - bh - bw * 0.6, bw * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // particles
      for (const p of tiles) {
        p.y -= p.v;
        if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
        ctx.globalAlpha = p.a * (0.6 + Math.sin(t * 2 + p.x) * 0.4);
        ctx.fillStyle = theme.accent;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * dpr * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    }
    draw();

    const onResize = () => {
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      w = canvas.width = canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1);
      h = canvas.height = canvas.clientHeight * Math.min(2, window.devicePixelRatio || 1);
      if (!raf) draw();
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [game.id, level?.n]);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full"
      aria-hidden="true"
      style={{ display: 'block' }}
    />
  );
}
