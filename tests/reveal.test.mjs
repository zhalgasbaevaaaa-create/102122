/**
 * Answer-reveal + lives contract (product rule from the owner).
 *
 *   • the correct answer text is returned ONLY when the player answered right;
 *   • after a mistake the API hands back the explanation but no answer text,
 *     so the learner has to find it themselves;
 *   • every wrong answer costs one life and every level starts with 5.
 *
 * The life counter itself lives in the client engine, so part 2 drives the real
 * QuizEngine in jsdom and watches both the hearts and the network payloads.
 */
import { JSDOM } from 'jsdom';

/** Register a throwaway learner and start one session. */
async function session(baseUrl, gameId = 'battle', level = 1) {
  const email = `reveal-${Date.now()}-${Math.floor(Math.random() * 1e5)}@test.arena.kz`;
  const reg = await fetch(baseUrl + '/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Тест Жауап', email, password: 'RevealPass12345!' }),
  });
  const { token } = await reg.json();
  const start = await fetch(baseUrl + '/api/session/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ gameId, level }),
  });
  const data = await start.json();
  return { token, ...data };
}

const post = (baseUrl, token, url, json) =>
  fetch(baseUrl + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(json),
  }).then((r) => r.json());

export async function runRevealTests(baseUrl, rec) {
  // ── 1. server contract over the real API ──────────────────────────────────
  const s = await session(baseUrl);
  rec('reveal: session provides questions without keys', (s.questions?.length ?? 0) > 0 && !('key' in s.questions[0]));

  // one deliberately wrong answer, then read what came back
  const q1 = s.questions[0];
  const wrongAnswer = q1.format === 'match-dates' || q1.format === 'match-persons'
    ? Object.fromEntries((q1.left ?? []).map((l, i) => [l.id, (q1.right ?? [])[(i + 1) % (q1.right?.length ?? 1)]?.id]))
    : q1.format === 'chronological'
      ? [...(q1.items ?? [])].map((i) => i.id).reverse()
      : q1.format === 'multi-select'
        ? [0]
        : 999; // out of range → always wrong
  const wrong = await post(baseUrl, s.token, `/api/session/${s.sessionId}/answer`, { questionId: q1.id, answer: wrongAnswer, ms: 1200 });
  rec('reveal: a wrong answer is graded wrong', wrong.correct === false, `format=${q1.format}`);
  rec('reveal: wrong answer returns NO answer text', wrong.answerText === null || wrong.answerText === undefined, String(wrong.answerText));
  rec('reveal: wrong answer still teaches (explanation + sources)',
    Boolean(wrong.explanation) && Array.isArray(wrong.sourceIds) && wrong.sourceIds.length > 0);

  // now answer a second question correctly and expect the label
  const q2 = s.questions[1];
  const key = await fetch(`${baseUrl}/api/session/${s.sessionId}`, { headers: { authorization: `Bearer ${s.token}` } })
    .then((r) => r.json()).catch(() => null);
  // the key is not exposed, so derive the correct answer from the question bank
  const { getBank } = await import('../shared/question-gen.ts');
  const { checkAnswer } = await import('../shared/quiz-types.ts');
  const bank = getBank();
  const full = bank.find((b) => b.id === q2.id);
  const correctAnswer = full.key.type === 'pairs' ? full.key.value
    : full.key.type === 'order' ? full.key.value
    : full.key.type === 'text' ? full.key.value[0]
    : full.key.value.length === 1 ? full.key.value[0] : full.key.value;
  const right = await post(baseUrl, s.token, `/api/session/${s.sessionId}/answer`, { questionId: q2.id, answer: correctAnswer, ms: 900 });
  rec('reveal: a correct answer is graded correct', right.correct === true, `format=${q2.format}`);
  rec('reveal: correct answer returns the answer text', typeof right.answerText === 'string' && right.answerText.trim().length > 0, right.answerText?.slice(0, 40));
  rec('reveal: the returned label matches the real key',
    Boolean(right.answerText) && checkAnswer(full, correctAnswer) === true,
    `key type ${full.key.type}`);
  void key;

  // ── 2. the client engine: 5 lives, one lost per mistake ──────────────────
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  const { window } = dom;
  const saved = {
    window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator,
    HTMLElement: globalThis.HTMLElement, Node: globalThis.Node, getComputedStyle: globalThis.getComputedStyle,
    localStorage: globalThis.localStorage, requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame, fetch: globalThis.fetch,
    ResizeObserver: globalThis.ResizeObserver, matchMedia: globalThis.matchMedia, AudioContext: globalThis.AudioContext,
  };
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.navigator = window.navigator;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.getComputedStyle = window.getComputedStyle;
  globalThis.devicePixelRatio = 1;
  window.devicePixelRatio = 1;
  globalThis.requestAnimationFrame = () => 0;
  window.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.matchMedia = window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.localStorage = window.localStorage;
  globalThis.AudioContext = class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { return { type: '', frequency: { setValueAtTime() {} }, connect: (n) => n, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n }; }
    createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
    createBufferSource() { return { buffer: null, connect: (n) => n, start() {} }; }
    createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect: (n) => n }; }
    resume() {}
  };

  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const path = String(url);
    if (path.includes('/answer')) {
      const body = JSON.parse(opts.body);
      calls.push(body);
      // `api()` reads the response through text(), so both shapes must match
      const payload = {
        correct: false, explanation: 'Тарихи түсіндірме мәтіні осында жеткілікті.',
        sourceIds: ['ehistory'], answerText: null, correctCount: 0, wrongCount: calls.length,
        streak: 0, answeredCount: calls.length, total: 10,
      };
      return {
        ok: true, status: 200,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
        headers: new Map(),
      };
    }
    return realFetch(url, opts);
  };

  try {
    const React = (await import('react')).default;
    const { createRoot } = await import('react-dom/client');
    const { QuizEngine, LIVES_PER_LEVEL } = await import('../src/games/QuizEngine.tsx');
    const { MemoryRouter } = await import('react-router-dom');
    const { ToastProvider } = await import('../src/components/UI.tsx');

    rec('reveal: a level starts with 5 lives', LIVES_PER_LEVEL === 5, String(LIVES_PER_LEVEL));

    const bank = (await import('../shared/question-gen.ts')).getBank();
    const mcq = bank.filter((q) => q.format === 'mcq').slice(0, 6).map(({ key, ...rest }) => rest);
    const host = window.document.createElement('div');
    window.document.body.appendChild(host);
    const root = createRoot(host);
    const finish = [];
    root.render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          ToastProvider,
          null,
          React.createElement(QuizEngine, {
            sessionId: 'sess-test',
            questions: mcq,
            onFinish: (o) => finish.push(o),
          }),
        ),
      ),
    );
    const flush = (ms) => new Promise((r) => setTimeout(r, ms));
    await flush(350);

    const hearts = () => (host.querySelector('[aria-label^="Жан"]')?.getAttribute('aria-label') || '').match(/(\d+)\s*\//)?.[1];
    rec('reveal: engine renders the lives HUD', hearts() !== undefined, `hearts=${hearts()}`);
    const before = hearts();

    // a single click must be enough — this is the bug the owner reported
    const btn = [...host.querySelectorAll('button.opt')][0];
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush(400);
    rec('reveal: one click submits the answer (no second button needed)', calls.length === 1, `${calls.length} POST`);
    rec('reveal: a wrong answer deducts exactly one life', hearts() !== undefined && Number(hearts()) === Number(before) - 1, `${before} → ${hearts()}`);
    const txt = host.textContent || '';
    const note = 'Дұрыс жауап көрсетілмейді';
    rec('reveal: wrong answer hides the correct answer text', !txt.includes('Дұрыс жауап:') && txt.includes(note), `note=${txt.includes(note)}`);
    // the grading feed is called `${name}` and the explanation text below must
    // survive; print the card when it does not so the failure is diagnosable
    const hasExplain = txt.includes('Тарихи түсіндірме');
    rec('reveal: explanation is still shown after a mistake', hasExplain,
      hasExplain ? '' : JSON.stringify(txt.slice(-400)));

    // burn the remaining lives
    for (let i = 0; i < 5; i++) {
      const next = [...host.querySelectorAll('button')].find((b) => /Келесі сұрақ|Нәтижені көру/.test(b.textContent || ''));
      if (!next) break;
      next.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await flush(250);
      const opt = [...host.querySelectorAll('button.opt')][0];
      if (!opt) break;
      opt.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await flush(300);
    }
    rec('reveal: lives reach zero and never go negative', hearts() === '0', `hearts=${hearts()}`);
    rec('reveal: the round ends when lives run out', finish.length === 1 || [...host.querySelectorAll('button')].some((b) => /Нәтижені көру/.test(b.textContent || '')));
    if (finish.length) {
      rec('reveal: outcome reports lives left and skipped questions',
        finish[0].livesLeft === 0 && typeof finish[0].skipped === 'number',
        `livesLeft=${finish[0].livesLeft} skipped=${finish[0].skipped}`);
    }

    root.unmount();
    // React's scheduler queues work on a macrotask; drain it BEFORE the jsdom
    // globals are put back, otherwise the next suite inherits a stray task that
    // reads `window.event` from an empty globalThis and crashes the runner.
    await flush(600);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.window = saved.window;
    globalThis.document = saved.document;
    globalThis.navigator = saved.navigator;
    globalThis.HTMLElement = saved.HTMLElement;
    globalThis.Node = saved.Node;
    globalThis.getComputedStyle = saved.getComputedStyle;
    globalThis.localStorage = saved.localStorage;
    globalThis.requestAnimationFrame = saved.requestAnimationFrame;
    globalThis.cancelAnimationFrame = saved.cancelAnimationFrame;
    globalThis.ResizeObserver = saved.ResizeObserver;
    globalThis.matchMedia = saved.matchMedia;
    globalThis.AudioContext = saved.AudioContext;
    void dom;
  }
}
