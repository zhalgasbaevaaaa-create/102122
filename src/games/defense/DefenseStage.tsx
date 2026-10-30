/**
 * GAME 3 — «Тарихи шеп» (tower defence / tactical)
 *
 * Non-graphic: attackers are abstract diamond markers, impacts are geometric
 * pulses. The player places towers along a path, earns resources by answering a
 * historical question before each wave, and must keep the fortification alive.
 */
import { useEffect, useRef, useState } from 'react';
import { Shield, Plus, Coins, Heart, Waves, Play } from 'lucide-react';
import type { GameDef, LevelDef } from '@shared/games';
import { useChallenge } from '../GameShell';
import { Badge, ProgressBar } from '../../components/UI';

interface Tower { x: number; y: number; range: number; rate: number; cd: number; dmg: number }
interface Enemy { x: number; y: number; t: number; hp: number; speed: number }
interface Shot { x1: number; y1: number; x2: number; y2: number; life: number }

const PATH: [number, number][] = [
  [0, 0.5], [0.16, 0.34], [0.3, 0.62], [0.46, 0.38], [0.6, 0.66], [0.74, 0.42], [0.88, 0.55], [1, 0.5],
];

function pointAt(t: number) {
  const segs = PATH.length - 1;
  const raw = t * segs;
  const i = Math.min(segs - 1, Math.floor(raw));
  const f = raw - i;
  const [x1, y1] = PATH[i];
  const [x2, y2] = PATH[i + 1];
  return { x: x1 + (x2 - x1) * f, y: y1 + (y2 - y1) * f };
}

export function DefenseStage({ game, level, paused }: { game: GameDef; level: LevelDef; paused?: boolean }) {
  const challenge = useChallenge();
  const waves = level.goal.waves ?? 6;
  const maxHp = level.goal.hp ?? 100;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    towers: [] as Tower[],
    enemies: [] as Enemy[],
    shots: [] as Shot[],
    coins: 60,
    hp: maxHp,
    wave: 0,
    spawnLeft: 0,
    spawnTimer: 0,
    running: false,
    paused: false,
    t: 0,
    score: 0,
  });
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const [ui, setUi] = useState({ coins: 60, hp: maxHp, wave: 0, running: false, score: 0, over: false, won: false });
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const s = stateRef.current;
    s.towers = [];
    s.enemies = [];
    s.shots = [];
    s.coins = 60;
    s.hp = maxHp;
    s.wave = 0;
    s.spawnLeft = 0;
    s.running = false;
    s.t = 0;
    s.score = 0;
    setUi({ coins: 60, hp: maxHp, wave: 0, running: false, score: 0, over: false, won: false });

    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    function resize() {
      if (!canvas) return;
      const w = canvas.clientWidth;
      const h = Math.max(280, Math.min(460, Math.round(w * 0.5)));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const toPx = (nx: number, ny: number) => ({ x: nx * canvas.clientWidth, y: ny * canvas.clientHeight });

    function draw() {
      if (!canvas || !ctx) return;
      raf = requestAnimationFrame(draw);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;

      // background
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#0b131c');
      g.addColorStop(1, '#131b26');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // grid
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // path
      ctx.beginPath();
      PATH.forEach((p, i) => {
        const { x, y } = toPx(p[0], p[1]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = 'rgba(217,169,74,0.28)';
      ctx.lineWidth = 26;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(47,179,168,0.12)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.stroke();
      ctx.setLineDash([]);

      // fortress at the end
      const fort = toPx(1, 0.5);
      ctx.fillStyle = '#2fb3a8';
      ctx.beginPath();
      ctx.roundRect(fort.x - 26, fort.y - 22, 22, 44, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(47,179,168,0.25)';
      ctx.beginPath();
      ctx.arc(fort.x - 15, fort.y, 34, 0, Math.PI * 2);
      ctx.fill();

      if (s.running && !pausedRef.current) {
        s.t += 1;

        // spawn
        if (s.spawnLeft > 0) {
          s.spawnTimer -= 1;
          if (s.spawnTimer <= 0) {
            s.spawnLeft -= 1;
            s.spawnTimer = 42 + Math.random() * 30;
            s.enemies.push({
              x: 0, y: 0, t: 0,
              hp: 20 + s.wave * 7,
              speed: 0.00045 + s.wave * 0.00005 + Math.random() * 0.00012,
            });
          }
        }

        // move enemies
        for (const e of s.enemies) {
          e.t += e.speed * 16;
          const p = pointAt(Math.min(0.999, e.t));
          e.x = p.x;
          e.y = p.y;
          if (e.t >= 0.999) {
            e.hp = -1;
            s.hp = Math.max(0, s.hp - 8);
          }
        }

        // towers fire
        for (const tw of s.towers) {
          tw.cd -= 16;
          if (tw.cd > 0) continue;
          const target = s.enemies
            .filter((e) => e.hp > 0)
            .map((e) => ({ e, d: Math.hypot(e.x - tw.x, e.y - tw.y) }))
            .filter((o) => o.d < tw.range)
            .sort((a, b) => b.e.t - a.e.t)[0];
          if (target) {
            tw.cd = tw.rate;
            target.e.hp -= tw.dmg;
            s.shots.push({ x1: tw.x, y1: tw.y, x2: target.e.x, y2: target.e.y, life: 1 });
          }
        }

        // cleanup
        const before = s.enemies.length;
        s.enemies = s.enemies.filter((e) => {
          if (e.hp <= 0) {
            if (e.hp > -1) {
              s.coins += 4;
              s.score += 12;
            }
            return false;
          }
          return true;
        });
        if (s.enemies.length < before) challenge.sound('collect');

        s.shots = s.shots.filter((sh) => (sh.life -= 0.12) > 0);

        // wave complete
        if (s.spawnLeft === 0 && s.enemies.length === 0 && s.wave >= waves) {
          s.running = false;
          setUi({ coins: s.coins, hp: s.hp, wave: s.wave, running: false, score: s.score, over: false, won: s.hp > 0 });
        } else if (s.hp <= 0) {
          s.running = false;
          setUi({ coins: s.coins, hp: s.hp, wave: s.wave, running: false, score: s.score, over: true, won: false });
        }
        if (Math.random() < 0.05) setUi({ coins: s.coins, hp: s.hp, wave: s.wave, running: s.running, score: s.score, over: false, won: false });
      }

      // towers
      for (const tw of s.towers) {
        const { x, y } = toPx(tw.x, tw.y);
        ctx.beginPath();
        ctx.arc(x, y, tw.range, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(47,179,168,0.06)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(47,179,168,0.22)';
        ctx.stroke();
        ctx.fillStyle = '#d9a94a';
        ctx.beginPath();
        ctx.roundRect(x - 9, y - 9, 18, 18, 3);
        ctx.fill();
        ctx.fillStyle = '#131008';
        ctx.fillRect(x - 2, y - 6, 4, 12);
      }

      // enemies
      for (const e of s.enemies) {
        const { x, y } = toPx(e.x, e.y);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#c96a4a';
        ctx.fillRect(-6, -6, 12, 12);
        ctx.restore();
        const maxE = 20 + s.wave * 7;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x - 8, y - 13, 16, 2.5);
        ctx.fillStyle = '#e08a6a';
        ctx.fillRect(x - 8, y - 13, 16 * Math.max(0, e.hp / maxE), 2.5);
      }

      // shots
      for (const sh of s.shots) {
        const a = toPx(sh.x1, sh.y1);
        const b = toPx(sh.x2, sh.y2);
        ctx.strokeStyle = `rgba(240,205,133,${sh.life})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    draw();

    const onClick = (ev: MouseEvent) => {
      if (pausedRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const nx = (ev.clientX - rect.left) / rect.width;
      const ny = (ev.clientY - rect.top) / rect.height;
      const cost = 25;
      if (s.coins < cost) return;
      // reject placements too close to the path centre
      const distToPath = Math.min(
        ...PATH.map((p) => Math.hypot(p[0] - nx, (p[1] - ny) * 0.55)),
      );
      if (distToPath < 0.055) return;
      s.towers.push({ x: nx, y: ny, range: 74, rate: 780, cd: 0, dmg: 9 });
      s.coins -= cost;
      setUi({ coins: s.coins, hp: s.hp, wave: s.wave, running: s.running, score: s.score, over: false, won: false });
    };
    canvas.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('click', onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.n, maxHp, waves]);

  async function startWave() {
    const s = stateRef.current;
    if (s.running) return;
    // one historical question before each wave
    const ok = await challenge.ask();
    if (ok) {
      s.coins += 25;
      challenge.addScore(90);
      challenge.sound('correct');
    } else {
      challenge.sound('wrong');
    }
    s.wave += 1;
    s.spawnLeft = 4 + s.wave;
    s.spawnTimer = 10;
    s.running = true;
    setUi({ coins: s.coins, hp: s.hp, wave: s.wave, running: true, score: s.score, over: false, won: false });
  }

  const hpPct = (ui.hp / maxHp) * 100;

  return (
    <div className="glass-strong p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <Badge tone="gold"><Coins size={11} /> {ui.coins}</Badge>
        <Badge tone={hpPct > 50 ? 'teal' : 'danger'}><Heart size={11} /> {ui.hp} / {maxHp}</Badge>
        <Badge><Waves size={11} /> Толқын {ui.wave} / {waves}</Badge>
        <button className="btn btn-gold px-3 py-1.5 text-xs ml-auto" onClick={() => void startWave()} disabled={ui.running || ui.over}>
          <Play size={12} /> {ui.wave === 0 ? 'Бірінші толқын' : 'Келесі толқын'}
        </button>
      </div>

      <div className="w-full mb-2">
        <ProgressBar value={hpPct} tone={hpPct > 50 ? 'teal' : 'danger'} height={5} />
      </div>

      <div className="relative">
        <canvas ref={canvasRef} className="w-full rounded-xl border border-white/10 block touch-manipulation" />
        <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
          <span className="chip bg-black/50 border-white/15 text-white/70"><Shield size={10} /> бекініс денсаулығы</span>
          <span className="chip bg-black/50 border-white/15 text-white/70"><Plus size={10} /> мұнара: 25 қазына</span>
        </div>
        {(ui.over || ui.won) && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 rounded-xl">
            <div className="text-center animate-pop px-4">
              <p className="font-display text-2xl text-parchment">{ui.won ? 'Бекініс сақталды!' : 'Бекініс құлады'}</p>
              <p className="text-xs text-white/55 mt-1">
                {ui.won ? 'Барлық толқындар тойтарылды. Деңгейді аяқтауға болады.' : 'Қайта байқап көріңіз — мұнараларды жол бойына орналастырыңыз.'}
              </p>
            </div>
          </div>
        )}
      </div>
      <p className="text-[10px] text-white/35 mt-1.5">
        Бос орынды басып мұнара орналастырыңыз. Әр толқын алдында тарихи сұрақ қойылады — дұрыс жауап қосымша қазына береді.
        Зорлық-зомбылық бейнеленбейді: қарсыластар геометриялық белгілер түрінде көрсетілген.
      </p>
    </div>
  );
}
