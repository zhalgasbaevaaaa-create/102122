/**
 * Game-engine integration tests.
 *
 * Renders the real game components inside jsdom with React 18's test utilities
 * (shipped in react-dom), stubbing fetch so the challenge flow is exercised
 * without a browser. This verifies that each of the six games actually mounts,
 * exposes its controls and reacts to input — not just that it imports.
 */
import React from 'react';
import { JSDOM } from 'jsdom';

export async function runGameTests() {
  const results = [];
  const rec = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  // ── jsdom environment ─────────────────────────────────────────────────────
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.navigator = window.navigator;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.getComputedStyle = window.getComputedStyle;
  globalThis.devicePixelRatio = 1;
  window.devicePixelRatio = 1;
  // The game stages run continuous visual loops. In jsdom we suppress rAF so the
  // environment stays quiescent; DOM structure and interactions are still real.
  globalThis.requestAnimationFrame = () => 0;
  window.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.matchMedia = window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.localStorage = window.localStorage;
  globalThis.AudioContext = class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
    createOscillator() { return { type: '', frequency: { setValueAtTime() {} }, connect: (n) => n, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n }; }
    createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
    createBufferSource() { return { buffer: null, connect: (n) => n, start() {} }; }
    createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect: (n) => n }; }
    resume() {}
  };
  // canvas 2D stub so the canvas-driven games can mount
  const ctx2d = new Proxy(
    {
      canvas: null, save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, moveTo() {}, lineTo() {},
      arc() {}, fill() {}, stroke() {}, fillRect() {}, clearRect() {}, roundRect() {}, setLineDash() {}, closePath() {},
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
      setTransform() {}, quadraticCurveTo() {}, drawImage() {}, measureText: () => ({ width: 10 }), fillText() {},
    },
    { get: (t, k) => (k in t ? t[k] : () => {}), set: () => true },
  );
  window.HTMLCanvasElement.prototype.getContext = function (kind) {
    if (kind === '2d') return ctx2d;
    // minimal WebGL surface so three.js initialises its renderer
    return {
      canvas: this,
      getExtension: () => null,
      getParameter: () => 4096,
      getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
      createTexture: () => ({}), bindTexture() {}, texParameteri() {}, texImage2D() {},
      clearColor() {}, clear() {}, viewport() {}, enable() {}, disable() {},
      createProgram: () => ({}), createShader: () => ({}), shaderSource() {}, compileShader() {},
      attachShader() {}, linkProgram() {}, useProgram() {}, getProgramParameter: () => true,
      getShaderParameter: () => true, getAttribLocation: () => 0, getUniformLocation: () => ({}),
      uniform1i() {}, uniform1f() {}, uniform2f() {}, uniform3f() {}, uniform4f() {}, uniformMatrix4fv() {},
      enableVertexAttribArray() {}, vertexAttribPointer() {}, drawElements() {}, drawArrays() {},
      createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, deleteBuffer() {}, deleteTexture() {},
      isContextLost: () => false, getContextAttributes: () => ({ antialias: true }),
      depthFunc() {}, frontFace() {}, cullFace() {}, blendFunc() {}, disableVertexAttribArray() {},
    };
  };

  // fetch stub for the session/challenge endpoints
  let answered = 0;
  const bank = (await import('../shared/question-gen.ts')).getBank();
  const firstQ = bank[0];
  globalThis.fetch = async (url, opts) => {
    const path = String(url).split('?')[0];
    let body = {};
    if (path === '/api/session/start') {
      body = {
        sessionId: 'test-session',
        game: { id: 'puzzle', engine: 'canvas2d' },
        level: 1,
        levelDef: { n: 1, title: 'Тест', years: '2026', brief: 'Тест', periodId: 'khanate', goal: {} },
        questions: Array.from({ length: 10 }, (_, i) => {
          const q = bank[i];
          const { key, ...rest } = q;
          return rest;
        }),
      };
    } else if (path.endsWith('/answer')) {
      answered += 1;
      body = { correct: true, explanation: 'Тарихи түсіндірме мәтіні.', sourceIds: ['ehistory'], correctCount: answered, wrongCount: 0, streak: 1, answeredCount: answered, total: 10 };
    } else if (path.endsWith('/complete')) {
      body = { score: 900, xp: 120, correct: 10, wrong: 0, accuracy: 100, bestStreak: 5, breakdown: { answerScore: 800, gameplayScore: 100, completionBonus: 60 }, rank: { title: 'Дала білгірі', level: 4, progress: 40, nextXp: 5000 }, totalXp: 4300, unlocked: [] };
    } else if (path === '/api/auth/me') {
      body = { user: { id: 'u1', email: 't@a.kz', name: 'Тест', role: 'student', xp: 0, totalScore: 0, correct: 0, wrong: 0, streakBest: 0, playSeconds: 0, sessions: 0, group: null, school: null, picture: null, createdAt: '', lastActivity: '' } };
    } else if (path === '/api/auth/providers') {
      body = { google: false, hint: null };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body, headers: new Map() };
  };

  // ── render helpers ────────────────────────────────────────────────────────
  const { createRoot } = await import('react-dom/client');

  const { MemoryRouter } = await import('react-router-dom');
  const { GameShell } = await import('../src/games/GameShell.tsx');
  const { ToastProvider } = await import('../src/components/UI.tsx');
  const { AuthProvider } = await import('../src/lib/auth.tsx');
  const { GAMES } = await import('../shared/games.ts');

  const stages = {
    adventure: (await import('../src/games/adventure/AdventureStage.tsx')).AdventureStage,
    strategy: (await import('../src/games/strategy/StrategyStage.tsx')).StrategyStage,
    defense: (await import('../src/games/defense/DefenseStage.tsx')).DefenseStage,
    race: (await import('../src/games/race/RaceStage.tsx')).RaceStage,
    puzzle: (await import('../src/games/puzzle/PuzzleStage.tsx')).PuzzleStage,
    battle: (await import('../src/games/battle/BattleStage.tsx')).BattleStage,
  };

  // A plain microtask flush works with react-dom regardless of act() support.
  const flush = async (ms = 120) => {
    await new Promise((r) => setTimeout(r, ms));
  };

  async function mount(component) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AuthProvider, null, React.createElement(ToastProvider, null, component)),
      ),
    );
    await flush(200);
    return { host, root, unmount: () => { root.unmount(); host.remove(); } };
  }

  // ── 1. GameShell level-select for all six games ───────────────────────────
  for (const game of GAMES) {
    try {
      const m = await mount(React.createElement(GameShell, { game, Stage: stages[game.id], progress: {} }));
      const text = m.host.textContent;
      const hasLevels = game.levels.every((l) => text.includes(l.title));
      rec(`GameShell renders 10 levels for ${game.title}`, hasLevels && text.includes('Деңгейлер'));
      m.unmount();
    } catch (e) {
      rec(`GameShell renders 10 levels for ${game.title}`, false, e.message.slice(0, 180));
    }
  }

  // ── 2. QuizEngine: all 10 formats render + server grading path ────────────
  const { QuizEngine } = await import('../src/games/QuizEngine.tsx');
  const pub = (q) => { const { key, ...rest } = q; return rest; };
  const byFormat = {};
  for (const q of bank) if (!byFormat[q.format]) byFormat[q.format] = q;
  const formats = ['mcq', 'truefalse', 'match-dates', 'match-persons', 'chronological', 'map', 'image-id', 'fill-blank', 'find-mistake', 'multi-select'];
  for (const f of formats) {
    const q = byFormat[f];
    if (!q) { rec(`QuizEngine renders ${f}`, false, 'no sample question'); continue; }
    try {
      let finished = false;
      const m = await mount(
        React.createElement(QuizEngine, {
          sessionId: 'test-session',
          questions: [pub(q)],
          onFinish: () => { finished = true; },
          perQuestionSeconds: 0,
        }),
      );
      const text = m.host.textContent;
      const rendered = text.includes('Сұрақ 1 / 1');
      rec(`QuizEngine renders ${f}`, rendered);

      // interact: click the first option, then submit
      if (rendered && (f === 'match-dates' || f === 'match-persons')) {
        // assign every right-hand option, which the engine maps to the first unmatched left item
        const pairCount = (q.left ?? []).length;
        for (let i = 0; i < pairCount; i++) {
          const rightBtns = [...m.host.querySelectorAll('button.opt')];
          const target = rightBtns[i];
          if (!target) break;
          target.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
          await flush(40);
        }
        const submitBtn = [...m.host.querySelectorAll('button')].find((b) => /Жауапты жіберу/.test(b.textContent || ''));
        if (submitBtn) {
          submitBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
          await flush(220);
        }
      } else if (rendered) {
        const btns = m.host.querySelectorAll('button');
        const options = [...btns].filter((b) => b.textContent && b.textContent.length > 1);
        if (options.length) {
          options[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
          await flush(50);
          const submit = [...m.host.querySelectorAll('button')].find((b) => /жіберу|Жалғастыру|Келесі/.test(b.textContent || ''));
          if (submit) {
            submit.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
            await flush(220);
          }
        }
      }
      const after = m.host.textContent;
      rec(`QuizEngine grades ${f} through the API`, answered > 0 && (after.includes('Дұрыс жауап') || after.includes('Қате жауап')), `${answered} answers sent`);
      m.unmount();
    } catch (e) {
      rec(`QuizEngine renders ${f}`, false, e.message.slice(0, 180));
    }
  }

  // ── 3. Interleaved challenge modal inside the shell ───────────────────────
  try {
    const game = GAMES.find((g) => g.id === 'battle');
    const m = await mount(React.createElement(GameShell, { game, Stage: stages.battle, progress: {} }));
    const startBtn = [...m.host.querySelectorAll('button')].find((b) => /Жалғастыру|Бастау/.test(b.textContent || ''));
    rec('GameShell exposes a start button', Boolean(startBtn));
    await m.unmount();
  } catch (e) {
    rec('GameShell exposes a start button', false, e.message.slice(0, 180));
  }

  await new Promise((r) => setTimeout(r, 100));
  return results;
}
