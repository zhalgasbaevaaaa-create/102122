/**
 * Online battle UI test (jsdom + real WebSocket + real server).
 *
 * Proves the multiplayer screen is a working interface, not a mock: it mounts,
 * opens a socket, creates a room, and renders the host lobby with a real room
 * code served by the engine.
 */
import { JSDOM } from 'jsdom';

export async function runOnlineUiTests(baseUrl, rec, tokenIn = null) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: baseUrl + '/oyyn/battle?online=1',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const saved = {};
  const globals = ['window', 'document', 'navigator', 'location', 'HTMLElement', 'Element', 'Node', 'MouseEvent', 'Event'];
  for (const g of globals) {
    saved[g] = globalThis[g];
    globalThis[g] = window[g] ?? window;
  }
  globalThis.localStorage = window.localStorage;
  globalThis.getComputedStyle = window.getComputedStyle;
  globalThis.requestAnimationFrame = () => 0;
  window.requestAnimationFrame = () => 0;
  globalThis.devicePixelRatio = 1;
  window.devicePixelRatio = 1;
  window.HTMLCanvasElement.prototype.getContext = () =>
    new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });

  // jsdom has no WebSocket: bridge to the `ws` package, rewriting the host.
  const WS = (await import('ws')).default;
  class Bridge extends WS {
    constructor(url) {
      super(String(url).replace(/\/\/[^/]+/, '//' + new URL(baseUrl).host.replace('localhost', '127.0.0.1')));
    }
  }
  globalThis.WebSocket = Bridge;
  window.WebSocket = Bridge;

  // Node's fetch has no document base URL — resolve relative paths like a browser.
  const nodeFetch = globalThis.fetch;
  const patchedFetch = (input, init) =>
    nodeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, baseUrl).toString() : input, init);
  globalThis.fetch = patchedFetch;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let root = null;

  try {
    let token = tokenIn;
    if (!token) {
      const login = await patchedFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'student@arena.kz', password: 'Student12345!' }),
      });
      token = (await login.json()).token;
    }
    window.localStorage.setItem('hga_token', token);

    const React = (await import('react')).default;
    const { createRoot } = await import('react-dom/client');
    const { MemoryRouter } = await import('react-router-dom');
    const { AuthProvider } = await import('../src/lib/auth.tsx');
    const { ToastProvider } = await import('../src/components/UI.tsx');
    const { OnlineBattle } = await import('../src/games/battle/OnlineBattle.tsx');

    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    root.render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          AuthProvider,
          null,
          React.createElement(ToastProvider, null, React.createElement(OnlineBattle, { level: 1, onExit: () => {} })),
        ),
      ),
    );
    await wait(800);

    const txt = () => host.textContent || '';
    rec('online UI: multiplayer screen mounts', /Онлайн сайыс/.test(txt()));
    rec('online UI: offers to connect to the server', /Серверге қосылу/.test(txt()));

    const connect = [...host.querySelectorAll('button')].find((b) => /Серверге қосылу/.test(b.textContent || ''));
    connect?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await wait(1200);
    rec('online UI: socket connects and lobby options appear', /Бөлме құру/.test(txt()) && /Код бойынша қосылу/.test(txt()));

    const create = [...host.querySelectorAll('button')].find((b) => /^Бөлме құру$/.test((b.textContent || '').trim()));
    create?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await wait(1300);
    const code = (txt().match(/\b[A-Z0-9]{6}\b/) || [])[0];
    rec('online UI: a real room code is displayed', Boolean(code), code);
    rec('online UI: host controls rendered (bots + start)', /Бот қосу/.test(txt()) && /Сайысты бастау/.test(txt()));
    // the seat must show whichever account we authenticated as, not a hardcoded name
    const meRes = await patchedFetch('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    const meName = (await meRes.json())?.user?.name ?? '';
    rec('online UI: seat list shows the signed-in player', Boolean(meName) && txt().includes(meName), meName);

    // the room must really exist on the server
    const info = await patchedFetch(`/api/multiplayer/room/${code}`);
    const body = await info.json().catch(() => ({}));
    rec('online UI: room is live on the server', info.status === 200 && body.code === code, `players=${body.players}`);
  } catch (e) {
    rec('online UI: suite completed without error', false, e.message?.slice(0, 160));
  } finally {
    try { root?.unmount(); } catch { /* ignore */ }
    // let React's scheduler finish the unmount work while `window` still exists,
    // otherwise its next task reads window.event and throws
    await wait(300);
    globalThis.fetch = nodeFetch;
    for (const g of globals) {
      if (saved[g] === undefined) delete globalThis[g];
      else globalThis[g] = saved[g];
    }
  }
}
