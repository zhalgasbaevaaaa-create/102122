/**
 * Deep UI sweep: every route rendered inside a real DOM, with runtime console
 * errors treated as failures. This catches the class of bugs the SSR smoke test
 * cannot see (effects, socket code, canvas bootstrap).
 */
import { JSDOM } from 'jsdom';

const ROUTES = [
  '/', '/oyyndar', '/map', '/timeline', '/tulgalar', '/tulgalar/kultegin',
  '/entsiklopediya', '/reiting', '/zhetistikter', '/profil', '/oqytushy', '/admin',
  '/kiru', '/maidan/kundelik',
  '/oyyn/adventure', '/oyyn/strategy', '/oyyn/defense', '/oyyn/race', '/oyyn/puzzle',
  '/oyyn/battle', '/oyyn/battle?online=1', '/nope-404',
];

export async function runRoutesUiTests(baseUrl, rec, tokenIn = null) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: baseUrl + '/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const names = ['window', 'document', 'navigator', 'location', 'HTMLElement', 'Element', 'Node',
    'MouseEvent', 'Event', 'KeyboardEvent', 'SVGElement', 'customElements', 'history'];
  const saved = {};
  for (const n of names) {
    saved[n] = globalThis[n];
    globalThis[n] = window[n] ?? window;
  }
  globalThis.localStorage = window.localStorage;
  globalThis.getComputedStyle = window.getComputedStyle;
  globalThis.requestAnimationFrame = () => 0;
  window.requestAnimationFrame = () => 0;
  globalThis.devicePixelRatio = 1;
  window.devicePixelRatio = 1;
  window.HTMLCanvasElement.prototype.getContext = () =>
    new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });

  const WS = (await import('ws')).default;
  class Bridge extends WS {
    constructor(u) {
      super(String(u).replace(/\/\/[^/]+/, '//' + new URL(baseUrl).host.replace('localhost', '127.0.0.1')));
    }
  }
  globalThis.WebSocket = Bridge;
  window.WebSocket = Bridge;

  const nodeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) =>
    nodeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, baseUrl).toString() : input, init);

  const errors = [];
  const origError = console.error;
  console.error = (...a) => {
    const s = a.join(' ');
    if (!/Not implemented|jsdom|ReactDOM.render is no longer/.test(s)) errors.push(s.slice(0, 160));
  };
  window.addEventListener('error', (e) => errors.push('window: ' + (e.message || '').slice(0, 140)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    // The runner hands us a token so this suite never competes for the
    // login rate-limit bucket that the API tests intentionally exhaust.
    let token = tokenIn;
    if (!token) {
      const lr = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'student@arena.kz', password: 'Student12345!' }),
      });
      token = (await lr.json()).token;
    }
    window.localStorage.setItem('hga_token', token);

    const React = (await import('react')).default;
    const { createRoot } = await import('react-dom/client');
    const { MemoryRouter } = await import('react-router-dom');
    const { AuthProvider } = await import('../src/lib/auth.tsx');
    const { ToastProvider } = await import('../src/components/UI.tsx');
    const App = (await import('../src/App.tsx')).default;

    let ok = 0;
    const failures = [];
    for (const route of ROUTES) {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);
      const before = errors.length;
      try {
        root.render(
          React.createElement(
            MemoryRouter,
            { initialEntries: [route] },
            React.createElement(AuthProvider, null, React.createElement(ToastProvider, null, React.createElement(App))),
          ),
        );
        await wait(route.includes('online') ? 1400 : 600);
        const text = (host.textContent || '').replace(/\s+/g, ' ').trim();
        const errs = errors.slice(before);
        if (text.length > 80 && errs.length === 0) ok += 1;
        else failures.push(`${route} (${text.length} chars${errs.length ? ', ' + errs[0].slice(0, 60) : ''})`);
      } catch (e) {
        failures.push(`${route} threw ${e.message.slice(0, 60)}`);
      }
      root.unmount();
      await wait(100);
      host.remove();
    }
    rec(`routes: all ${ROUTES.length} routes render in a real DOM without runtime errors`,
      ok === ROUTES.length, failures.slice(0, 3).join(' | '));

    // spot-check that key screens show real, Kazakh-language content
    const probe = async (route, pattern, label) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);
      root.render(
        React.createElement(MemoryRouter, { initialEntries: [route] },
          React.createElement(AuthProvider, null, React.createElement(ToastProvider, null, React.createElement(App)))),
      );
      await wait(700);
      const text = host.textContent || '';
      root.unmount();
      await wait(80);
      host.remove();
      rec(`routes: ${label}`, pattern.test(text));
    };
    await probe('/', /Ұлы дала|шежіре|Ойындар/i, 'home page shows the platform content');
    await probe('/map', /карта|Карта/, 'map page renders the interactive map');
    await probe('/timeline', /\d{3,4}/, 'timeline page lists dated events');
    await probe('/oyyn/battle', /Онлайн сайыс/, 'battle level screen advertises the online mode');
    await probe('/tulgalar/kultegin', /Күлтегін/, 'person detail page shows the historical figure');
    await probe('/profil', /Демо Оқушы|Профиль|XP/i, 'profile page shows the signed-in learner');
  } catch (e) {
    rec('routes: sweep completed without error', false, e.message?.slice(0, 160));
  } finally {
    console.error = origError;
    globalThis.fetch = nodeFetch;
    for (const n of names) {
      if (saved[n] === undefined) delete globalThis[n];
      else globalThis[n] = saved[n];
    }
  }
}
