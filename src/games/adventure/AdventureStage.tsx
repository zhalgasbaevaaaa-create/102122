/**
 * GAME 1 — «Ұлы дала шежіресі» (3D adventure)
 *
 * A real Three.js world rendered with WebGL: terrain, a controllable hero,
 * collectible artifacts, NPC storytellers that trigger historical challenges
 * and a gate that only opens after the chapter's questions are answered.
 * Movement follows flat-plane projection (dx, dz) so screen-relative controls
 * stay correct on every aspect ratio.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GameDef, LevelDef } from '@shared/games';
import { useChallenge } from '../GameShell';
import { Badge, ProgressBar } from '../../components/UI';

interface Collectible { mesh: THREE.Mesh; kind: 'artifact'; taken: boolean; id: number }

export function AdventureStage({ game, level, paused }: { game: GameDef; level: LevelDef; paused: boolean }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const challenge = useChallenge();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const [hud, setHud] = useState({ artifacts: 0, npcs: 0, gateOpen: false, prompt: '' });
  const target = level.goal.artifacts ?? 8;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a1220');
    scene.fog = new THREE.Fog('#0a1220', 22, 78);

    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 300);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = false;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.borderRadius = '14px';

    const accent = new THREE.Color(game.accent);
    const accent2 = new THREE.Color(game.accent2);

    // lights
    scene.add(new THREE.HemisphereLight('#9fc6d8', '#101a24', 0.85));
    const sun = new THREE.DirectionalLight('#ffe6b8', 1.15);
    sun.position.set(18, 26, 12);
    scene.add(sun);

    // terrain (displaced plane)
    const size = 120;
    const geo = new THREE.PlaneGeometry(size, size, 56, 56);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const d = Math.sqrt(x * x + y * y);
      const h =
        Math.sin(x * 0.09) * Math.cos(y * 0.11) * 1.5 +
        Math.sin(x * 0.031 + y * 0.027) * 2.6 +
        (d < 12 ? 0 : Math.sin(d * 0.06) * 0.9);
      pos.setZ(i, h);
    }
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: '#22303f', roughness: 0.96, metalness: 0.02, flatShading: true }),
    );
    terrain.rotation.x = -Math.PI / 2;
    scene.add(terrain);

    const groundAt = (x: number, z: number) => {
      const d = Math.sqrt(x * x + z * z);
      return (
        Math.sin(x * 0.09) * Math.cos(z * 0.11) * 1.5 +
        Math.sin(x * 0.031 + z * 0.027) * 2.6 +
        (d < 12 ? 0 : Math.sin(d * 0.06) * 0.9)
      );
    };

    // hero
    const hero = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent.clone().multiplyScalar(0.25), roughness: 0.45 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 4, 12), bodyMat);
    body.position.y = 0.95;
    hero.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), new THREE.MeshStandardMaterial({ color: '#e8d3b4', roughness: 0.7 }));
    head.position.y = 1.82;
    hero.add(head);
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1.25, 10, 1, true), new THREE.MeshStandardMaterial({ color: '#1b2735', side: THREE.DoubleSide, roughness: 0.85 }));
    cloak.position.y = 1.0;
    hero.add(cloak);
    const lantern = new THREE.PointLight(accent2, 1.6, 14);
    lantern.position.set(0, 2.4, 0);
    hero.add(lantern);
    scene.add(hero);

    // yurts / monuments scattered
    const rnd = (seed: number) => {
      let s = seed;
      return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
    };
    const R = rnd(level.n * 7919);
    const scenery: THREE.Object3D[] = [];
    for (let i = 0; i < 16; i++) {
      const angle = R() * Math.PI * 2;
      const radius = 16 + R() * 34;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const structure = R() > 0.5
        ? new THREE.Mesh(
            new THREE.ConeGeometry(2.2, 2.4, 12),
            new THREE.MeshStandardMaterial({ color: '#d8cdb4', roughness: 0.9 }),
          )
        : new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 1.4, 5 + R() * 3, 6),
            new THREE.MeshStandardMaterial({ color: '#5f6b76', roughness: 0.95, flatShading: true }),
          );
      structure.position.set(x, groundAt(x, z) + 1.1, z);
      scene.add(structure);
      scenery.push(structure);
    }

    // collectibles
    const collectibles: Collectible[] = [];
    const artGeo = new THREE.OctahedronGeometry(0.55, 0);
    const artMat = new THREE.MeshStandardMaterial({ color: '#f0cd85', emissive: '#d9a94a', emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.6 });
    for (let i = 0; i < target + 3; i++) {
      const angle = (i / (target + 3)) * Math.PI * 2 + R();
      const radius = 8 + R() * 26;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const mesh = new THREE.Mesh(artGeo, artMat);
      mesh.position.set(x, groundAt(x, z) + 1.3, z);
      scene.add(mesh);
      const halo = new THREE.PointLight('#d9a94a', 0.5, 6);
      halo.position.copy(mesh.position);
      scene.add(halo);
      collectibles.push({ mesh, kind: 'artifact', taken: false, id: i });
    }

    // NPC storytellers
    const npcs: { obj: THREE.Group; used: boolean }[] = [];
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.8;
      const radius = 12 + R() * 12;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const g = new THREE.Group();
      const robe = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.0, 8), new THREE.MeshStandardMaterial({ color: '#2a3a4d', roughness: 0.9 }));
      robe.position.y = 1.0;
      g.add(robe);
      const headN = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), new THREE.MeshStandardMaterial({ color: '#e0c9a6' }));
      headN.position.y = 2.2;
      g.add(headN);
      const glow = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color: '#2fb3a8' }));
      glow.rotation.x = Math.PI / 2;
      glow.position.y = 2.9;
      g.add(glow);
      g.position.set(x, groundAt(x, z), z);
      scene.add(g);
      npcs.push({ obj: g, used: false });
    }

    // the gate
    const gate = new THREE.Group();
    const gateMat = new THREE.MeshStandardMaterial({ color: '#6f5a35', roughness: 0.8, metalness: 0.2 });
    for (const dx of [-1.7, 1.7]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 5.2, 0.9), gateMat);
      pillar.position.set(dx, 2.6, 0);
      gate.add(pillar);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.7, 1.0), gateMat);
    lintel.position.y = 5.3;
    gate.add(lintel);
    const seal = new THREE.Mesh(
      new THREE.PlaneGeometry(3.1, 4.4),
      new THREE.MeshBasicMaterial({ color: '#2fb3a8', transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
    );
    seal.position.y = 2.6;
    gate.add(seal);
    const gatePos = new THREE.Vector3(0, 0, -26);
    gate.position.copy(gatePos);
    gate.position.y = groundAt(gatePos.x, gatePos.z);
    scene.add(gate);

    // ── input ───────────────────────────────────────────────────────
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      keys.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // virtual joystick state (mobile)
    const joy = { active: false, dx: 0, dz: 0, id: -1 };
    const el = renderer.domElement;
    const joyOrigin = { x: 0, y: 0 };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      joy.active = true;
      joy.id = e.pointerId;
      joyOrigin.x = e.clientX;
      joyOrigin.y = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!joy.active || e.pointerId !== joy.id) return;
      const dx = e.clientX - joyOrigin.x;
      const dy = e.clientY - joyOrigin.y;
      const max = 55;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, len / max);
      joy.dx = (dx / len) * k;
      joy.dz = (dy / len) * k;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== joy.id) return;
      joy.active = false;
      joy.dx = 0;
      joy.dz = 0;
    };
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    // action button (E)
    let interactRequested = false;
    const onInteractKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'e' || e.key === ' ') interactRequested = true;
    };
    window.addEventListener('keydown', onInteractKey);

    const camOffset = new THREE.Vector3(0, 9.5, 13);
    const pos3 = new THREE.Vector3(0, 0, 6);
    let facing = 0;
    let running = true;
    let artifactsTaken = 0;
    let npcsUsed = 0;
    let gateOpen = false;
    let clock = 0;
    let nearTarget: { type: 'artifact' | 'npc' | 'gate'; index: number } | null = null;
    let busy = false;

    const resize = () => {
      const w = mount.clientWidth;
      const h = Math.max(320, Math.min(560, Math.round(w * 0.56)));
      renderer.setSize(w, h, true);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const updatePrompt = (text: string) => setHud((s) => (s.prompt === text ? s : { ...s, prompt: text }));

    function tick() {
      if (!running) return;
      requestAnimationFrame(tick);
      clock += 0.016;

      if (!pausedRef.current && !busy) {
        // movement vector in world XZ
        let ix = 0;
        let iz = 0;
        if (keys.has('w') || keys.has('arrowup') || keys.has('ц')) iz -= 1;
        if (keys.has('s') || keys.has('arrowdown') || keys.has('ы')) iz += 1;
        if (keys.has('a') || keys.has('arrowleft') || keys.has('ф')) ix -= 1;
        if (keys.has('d') || keys.has('arrowright') || keys.has('в')) ix += 1;
        ix += joy.dx;
        iz += joy.dz;
        const len = Math.hypot(ix, iz);
        if (len > 0.05) {
          const nx = ix / len;
          const nz = iz / len;
          const speed = 8.2;
          pos3.x += nx * speed * 0.016;
          pos3.z += nz * speed * 0.016;
          facing = Math.atan2(nx, nz);
          hero.rotation.y = facing;
        }
        const limit = 46;
        pos3.x = Math.max(-limit, Math.min(limit, pos3.x));
        pos3.z = Math.max(-limit, Math.min(limit, pos3.z));
      }

      hero.position.set(pos3.x, groundAt(pos3.x, pos3.z), pos3.z);
      hero.position.y += Math.sin(clock * 6) * (Math.hypot(joy.dx, joy.dz) > 0.1 || keys.size > 0 ? 0.05 : 0.015);

      // camera follow
      const camTarget = new THREE.Vector3(pos3.x, hero.position.y + 1.4, pos3.z);
      camera.position.lerp(new THREE.Vector3(pos3.x + camOffset.x, hero.position.y + 9.5, pos3.z + camOffset.z), 0.06);
      camera.lookAt(camTarget);

      // nearest interactable
      nearTarget = null;
      let bestDist = 3.1;
      collectibles.forEach((c, i) => {
        if (c.taken) return;
        c.mesh.rotation.y += 0.02;
        c.mesh.position.y += Math.sin(clock * 2 + i) * 0.004;
        const d = Math.hypot(c.mesh.position.x - pos3.x, c.mesh.position.z - pos3.z);
        if (d < bestDist) { bestDist = d; nearTarget = { type: 'artifact', index: i }; }
      });
      npcs.forEach((n, i) => {
        const d = Math.hypot(n.obj.position.x - pos3.x, n.obj.position.z - pos3.z);
        if (d < bestDist) { bestDist = d; nearTarget = { type: 'npc', index: i }; }
      });
      const gd = Math.hypot(gate.position.x - pos3.x, gate.position.z - pos3.z);
      if (gd < 3.4 && !gateOpen) nearTarget = { type: 'gate', index: 0 };

      if (nearTarget) {
        if (nearTarget.type === 'artifact') updatePrompt('E — жәдігерді алу');
        else if (nearTarget.type === 'npc') updatePrompt('E — шежірешімен сөйлесу (тарихи сынақ)');
        else updatePrompt('E — қақпа мөрін ашу (тарихи сынақ)');
      } else updatePrompt('');

      // interaction
      if (interactRequested && nearTarget && !pausedRef.current && !busy) {
        interactRequested = false;
        if (nearTarget.type === 'artifact') {
          const c = collectibles[nearTarget.index];
          if (!c.taken) {
            c.taken = true;
            scene.remove(c.mesh);
            artifactsTaken += 1;
            challenge.addScore(35);
            challenge.sound('collect');
            setHud((s) => ({ ...s, artifacts: artifactsTaken }));
          }
        } else if (nearTarget.type === 'npc') {
          const n = npcs[nearTarget.index];
          if (!n.used) {
            n.used = true;
            busy = true;
            challenge.sound('click');
            void challenge.ask().then((ok) => {
              if (ok) {
                npcsUsed += 1;
                challenge.addScore(80);
                setHud((s) => ({ ...s, npcs: npcsUsed }));
              }
              busy = false;
            });
          }
        } else if (nearTarget.type === 'gate' && !gateOpen) {
          busy = true;
          challenge.sound('click');
          void challenge.ask().then((ok) => {
            if (ok) {
              gateOpen = true;
              scene.remove(seal);
              challenge.addScore(150);
              challenge.sound('levelup');
              setHud((s) => ({ ...s, gateOpen: true }));
            }
            busy = false;
          });
        }
      } else if (interactRequested) {
        interactRequested = false;
      }

      renderer.render(scene, camera);
    }
    tick();

    return () => {
      running = false;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('keydown', onInteractKey);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      ro.disconnect();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.n, game.id]);

  return (
    <div className="relative">
      <div ref={mountRef} className="w-full rounded-xl overflow-hidden border border-white/10 min-h-[320px]" />

      {/* HUD overlay */}
      <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex flex-col gap-1.5 pointer-events-none">
        <Badge tone="gold">Жәдігер: {hud.artifacts} / {target}</Badge>
        <Badge tone="teal">Шежіреші: {hud.npcs} / 4</Badge>
        {hud.gateOpen && <Badge tone="teal">Қақпа ашылды ✓</Badge>}
      </div>

      <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 w-32 sm:w-40 pointer-events-none">
        <div className="text-[9px] text-white/45 mb-1 text-right">жәдігер прогресі</div>
        <ProgressBar value={(hud.artifacts / target) * 100} tone="gold" height={5} />
      </div>

      {hud.prompt && !paused && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-14 sm:bottom-4 animate-pop">
          <button
            className="btn btn-gold px-4 py-2 text-xs shadow-xl"
            onClick={() => {
              const ev = new KeyboardEvent('keydown', { key: 'e' });
              window.dispatchEvent(ev);
            }}
          >
            {hud.prompt}
          </button>
        </div>
      )}

      {/* mobile controls */}
      <div className="sm:hidden absolute bottom-2 left-2 grid grid-cols-3 gap-1 no-select">
        {[
          ['', '▲', ''],
          ['◀', '', '▶'],
          ['', '▼', ''],
        ].map((row, ri) =>
          row.map((label, ci) =>
            label ? (
              <button
                key={`${ri}-${ci}`}
                className="w-11 h-11 rounded-lg bg-black/55 border border-white/20 text-white/80 text-sm active:bg-gold/30"
                onPointerDown={() => {
                  const map: Record<string, string> = { '▲': 'w', '▼': 's', '◀': 'a', '▶': 'd' };
                  window.dispatchEvent(new KeyboardEvent('keydown', { key: map[label] }));
                }}
                onPointerUp={() => {
                  const map: Record<string, string> = { '▲': 'w', '▼': 's', '◀': 'a', '▶': 'd' };
                  window.dispatchEvent(new KeyboardEvent('keyup', { key: map[label] }));
                }}
                onPointerLeave={() => {
                  const map: Record<string, string> = { '▲': 'w', '▼': 's', '◀': 'a', '▶': 'd' };
                  window.dispatchEvent(new KeyboardEvent('keyup', { key: map[label] }));
                }}
              >
                {label}
              </button>
            ) : (
              <span key={`${ri}-${ci}`} />
            ),
          ),
        )}
      </div>

      <p className="text-[10px] text-white/35 mt-1.5">
        Басып тұрып жылжытыңыз (touch) немесе WASD / жебе пернелері. E — әрекеттесу. 3D көрініс Three.js/WebGL арқылы жасалған.
      </p>
    </div>
  );
}
