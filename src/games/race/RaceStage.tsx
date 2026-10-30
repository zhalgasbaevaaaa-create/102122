/**
 * GAME 4 — «Ұлы дала бәйгесі» (3D racing)
 *
 * Pseudo-3D WebGL world: a wandering steppe path with checkpoints. Reaching a
 * checkpoint triggers a timed historical question through the Challenge API;
 * a correct answer grants a speed boost, a wrong answer costs time.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Timer, Flag, Zap, Gauge } from 'lucide-react';
import type { GameDef, LevelDef } from '@shared/games';
import { useChallenge } from '../GameShell';
import { Badge, ProgressBar } from '../../components/UI';

export function RaceStage({ game, level, paused }: { game: GameDef; level: LevelDef; paused?: boolean }) {
  const challenge = useChallenge();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const checkpoints = level.goal.checkpoints ?? 10;
  const timeLimit = level.goal.time ?? 130;

  const [hud, setHud] = useState({ speed: 0, progress: 0, time: timeLimit, boost: 0, cp: 0 });
  const [finished, setFinished] = useState<null | 'win' | 'timeout'>(null);
  const ctrl = useRef({ asking: false, done: false });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#141a2b');
    scene.fog = new THREE.Fog('#141a2b', 30, 120);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.borderRadius = '14px';

    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
    scene.add(new THREE.HemisphereLight('#b8d4e6', '#1a1420', 0.9));
    const key = new THREE.DirectionalLight('#ffe9c4', 1.3);
    key.position.set(20, 40, 10);
    scene.add(key);

    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 1400, 1, 1),
      new THREE.MeshStandardMaterial({ color: '#26313d', roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -600;
    scene.add(ground);

    // track ribbon
    const trackPts: THREE.Vector3[] = [];
    for (let i = 0; i < 80; i++) {
      const z = -i * 12;
      const x = Math.sin(i * 0.35) * 9 + Math.sin(i * 0.12) * 5;
      trackPts.push(new THREE.Vector3(x, 0.06, z));
    }
    const curve = new THREE.CatmullRomCurve3(trackPts);
    const track = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 300, 7, 8, false),
      new THREE.MeshStandardMaterial({ color: '#3a4250', roughness: 0.95, side: THREE.DoubleSide }),
    );
    track.scale.y = 0.04;
    scene.add(track);

    // side markers / rocks
    for (let i = 0; i < 120; i++) {
      const z = -i * 7;
      const side = i % 2 === 0 ? 1 : -1;
      const x = Math.sin(i * 0.35) * 9 + Math.sin(i * 0.12) * 5 + side * (10 + (i % 5));
      const rock = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.8 + (i % 4) * 0.5, 0),
        new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? '#2f4858' : '#39424e', flatShading: true }),
      );
      rock.position.set(x, 0.4, z);
      scene.add(rock);
    }

    // checkpoint rings
    const cpObjects: THREE.Mesh[] = [];
    for (let i = 0; i < checkpoints; i++) {
      const t = (i + 1) / (checkpoints + 1);
      const p = curve.getPoint(t);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(7.5, 0.35, 8, 32),
        new THREE.MeshStandardMaterial({ color: '#d9a94a', emissive: '#d9a94a', emissiveIntensity: 0.75 }),
      );
      ring.position.set(p.x, 5, p.z);
      scene.add(ring);
      const light = new THREE.PointLight('#d9a94a', 1.4, 34);
      light.position.set(p.x, 5, p.z);
      scene.add(light);
      cpObjects.push(ring);
    }

    // horse (stylised)
    const horse = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#8a5a3b', roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.9, 4, 12), bodyMat);
    torso.rotation.z = Math.PI / 2;
    torso.position.y = 1.75;
    horse.add(torso);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.52, 1.5, 10), bodyMat);
    neck.position.set(0, 2.4, 1.15);
    neck.rotation.x = -0.45;
    horse.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 1.1), bodyMat);
    head.position.set(0, 2.95, 1.85);
    horse.add(head);
    const legs: THREE.Mesh[] = [];
    for (const [lx, lz] of [[-0.45, 1.0], [0.45, 1.0], [-0.45, -1.0], [0.45, -1.0]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 1.7, 6), bodyMat);
      leg.position.set(lx, 0.85, lz);
      horse.add(leg);
      legs.push(leg);
    }
    const rider = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 8), new THREE.MeshStandardMaterial({ color: '#2fb3a8', roughness: 0.6 }));
    rider.position.set(0, 3.1, -0.2);
    horse.add(rider);
    scene.add(horse);

    const state = {
      progress: 0.001,
      speed: 0,
      boosting: 0,
      time: timeLimit,
      nextCp: 0,
      lane: 0,
      laneVel: 0,
      finished: false,
    };

    const keys = new Set<string>();
    const down = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    // touch: left half / right half steering
    const el = renderer.domElement;
    const touchDir = { l: false, r: false };
    const onTouchStart = (e: TouchEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      if (x < rect.width / 2) touchDir.l = true;
      else touchDir.r = true;
    };
    const onTouchEnd = () => { touchDir.l = false; touchDir.r = false; };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd);

    const resize = () => {
      const w = mount.clientWidth;
      const h = Math.max(320, Math.min(520, Math.round(w * 0.56)));
      renderer.setSize(w, h, true);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    let last = performance.now();
    let clock = 0;

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt;

      if (!pausedRef.current && !ctrl.current.asking && !state.finished) {
        state.time = Math.max(0, state.time - dt);

        // steering
        let steer = 0;
        if (keys.has('a') || keys.has('arrowleft') || touchDir.l) steer -= 1;
        if (keys.has('d') || keys.has('arrowright') || touchDir.r) steer += 1;
        state.laneVel += steer * 26 * dt;
        state.laneVel *= 0.9;
        state.lane = Math.max(-6.5, Math.min(6.5, state.lane + state.laneVel * dt));

        // speed with boost decay
        const base = 46 + (challenge.baseScore > 600 ? 6 : 0);
        state.boosting = Math.max(0, state.boosting - dt * 0.55);
        state.speed = base + state.boosting * 42 + (keys.has(' ') ? 12 : 0);
        state.progress += (state.speed / 1400) * dt * 10;

        if (state.time <= 0) {
          state.finished = true;
          setFinished('timeout');
        }
        if (state.progress >= 0.999) {
          state.finished = true;
          setFinished('win');
        }
      }

      // checkpoint crossing
      const cpT = (state.nextCp + 1) / (checkpoints + 1);
      if (!ctrl.current.asking && !state.finished && state.progress >= cpT && state.nextCp < checkpoints) {
        const idx = state.nextCp;
        state.nextCp += 1;
        ctrl.current.asking = true;
        challenge.sound('whoosh');
        void challenge.ask().then((ok) => {
          if (ok) {
            state.boosting = Math.min(2.2, state.boosting + 1.4);
            challenge.addScore(110);
          } else {
            state.time = Math.max(1, state.time - 5);
            challenge.addScore(10);
          }
          ctrl.current.asking = false;
          setHud({
            speed: Math.round(state.speed * 2.2),
            progress: state.progress * 100,
            time: Math.round(state.time),
            boost: Math.round(state.boosting * 100),
            cp: state.nextCp,
          });
        });
        if (cpObjects[idx]) scene.remove(cpObjects[idx]);
      }

      // horse placement along the curve
      const p = curve.getPoint(Math.min(0.999, state.progress));
      const tangent = curve.getTangent(Math.min(0.999, state.progress));
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      horse.position.set(p.x + side.x * state.lane, 0, p.z + side.z * state.lane);
      horse.rotation.y = Math.atan2(tangent.x, tangent.z);
      horse.position.y = Math.abs(Math.sin(clock * 14)) * 0.22;
      legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(clock * 14 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.5;
      });

      // camera chase
      const camPos = new THREE.Vector3(horse.position.x, 7.2, horse.position.z + 12.5);
      camera.position.lerp(camPos, 0.14);
      camera.lookAt(horse.position.x, 2.6, horse.position.z - 8);

      // rings spin
      cpObjects.forEach((r, i) => {
        if (r.parent) r.rotation.z += 0.01 + i * 0.0005;
      });

      renderer.render(scene, camera);

      if (Math.random() < 0.05) {
        setHud({
          speed: Math.round(state.speed * 2.2),
          progress: state.progress * 100,
          time: Math.round(state.time),
          boost: Math.round(state.boosting * 100),
          cp: state.nextCp,
        });
      }
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      ro.disconnect();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.n, checkpoints, timeLimit]);

  return (
    <div className="glass-strong p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <Badge tone="gold"><Timer size={11} /> {hud.time}s</Badge>
        <Badge tone="teal"><Flag size={11} /> {hud.cp} / {checkpoints}</Badge>
        <Badge><Gauge size={11} /> {hud.speed} км/сағ</Badge>
        {hud.boost > 0 && <Badge tone="gold"><Zap size={11} /> жеделдету {hud.boost}%</Badge>}
      </div>
      <div className="mb-2"><ProgressBar value={hud.progress} tone="gold" height={5} /></div>

      <div className="relative">
        <div ref={mountRef} className="w-full rounded-xl overflow-hidden border border-white/10 min-h-[320px]" />
        {finished && (
          <div className="absolute inset-0 grid place-items-center bg-black/65 rounded-xl">
            <div className="text-center animate-pop px-4">
              <p className="font-display text-2xl text-parchment">
                {finished === 'win' ? 'Мәреге жеттіңіз!' : 'Уақыт бітті'}
              </p>
              <p className="text-xs text-white/60 mt-1">
                {finished === 'win' ? `${checkpoints} бақылау пункті өтілді. Деңгейді аяқтауға болады.` : 'Тарихи сұрақтарға дұрыс жауап беру қосымша жылдамдық береді.'}
              </p>
            </div>
          </div>
        )}
        <div className="sm:hidden absolute bottom-3 left-3 right-3 flex justify-between">
          <button
            className="w-16 h-16 rounded-full bg-black/55 border border-white/25 text-2xl text-white/80 active:bg-gold/30"
            onTouchStart={() => { const e = new KeyboardEvent('keydown', { key: 'a' }); window.dispatchEvent(e); }}
            onTouchEnd={() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }))}
          >
            ◀
          </button>
          <button
            className="w-16 h-16 rounded-full bg-black/55 border border-white/25 text-2xl text-white/80 active:bg-gold/30"
            onTouchStart={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))}
            onTouchEnd={() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' }))}
          >
            ▶
          </button>
        </div>
      </div>
      <p className="text-[10px] text-white/35 mt-1.5">
        Бағыттау: A / D немесе экранның жартысын басу. Жылдамдық: Space. Әр бақылау пунктінде тарихи сұрақ қойылады.
      </p>
    </div>
  );
}
