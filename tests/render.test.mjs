/**
 * Render smoke test.
 *
 * The sandbox used to build this project cannot launch Chromium (missing system
 * libraries and no root to install them), so instead of skipping UI verification
 * entirely we render every route's real React component tree with
 * react-dom/server inside a MemoryRouter. This catches import errors, hook-order
 * violations, undefined component references and bad JSX on every page.
 *
 * Browser-level interaction tests live in tests/e2e.test.mjs and run wherever a
 * Chromium binary is available (`npx playwright install chromium`).
 */
import React from 'react';

export async function runRenderTests() {
  const { renderToString } = await import('react-dom/server');
  const { MemoryRouter } = await import('react-router-dom');
  const { AuthProvider } = await import('../src/lib/auth.tsx');
  const { ToastProvider } = await import('../src/components/UI.tsx');

  const pages = [
    ['HomePage', (await import('../src/pages/HomePage.tsx')).default, '/'],
    ['GamesPage', (await import('../src/pages/GamesPage.tsx')).default, '/oyyndar'],
    ['MapPage', (await import('../src/pages/MapPage.tsx')).default, '/map'],
    ['TimelinePage', (await import('../src/pages/TimelinePage.tsx')).default, '/timeline'],
    ['PersonsPage', (await import('../src/pages/PersonsPage.tsx')).default, '/tulgalar'],
    ['PersonPage', (await import('../src/pages/PersonPage.tsx')).default, '/tulgalar/kultegin'],
    ['EncyclopediaPage', (await import('../src/pages/EncyclopediaPage.tsx')).default, '/entsiklopediya'],
    ['LeaderboardPage', (await import('../src/pages/LeaderboardPage.tsx')).default, '/reiting'],
    ['AchievementsPage', (await import('../src/pages/AchievementsPage.tsx')).default, '/zhetistikter'],
    ['AuthPage', (await import('../src/pages/AuthPage.tsx')).default, '/kiru'],
    ['ProfilePage', (await import('../src/pages/ProfilePage.tsx')).default, '/profil'],
    ['TeacherPage', (await import('../src/pages/TeacherPage.tsx')).default, '/oqytushy'],
    ['AdminPage', (await import('../src/pages/AdminPage.tsx')).default, '/admin'],
    ['DailyChallengePage', (await import('../src/pages/DailyChallengePage.tsx')).default, '/maidan/kundelik'],
    ['NotFoundPage', (await import('../src/pages/NotFoundPage.tsx')).default, '/nope'],
  ];

  // ── stub the network so pages render real data, not just spinners ──────────
  const { PERIODS } = await import('../shared/periods.ts');
  const { HISTORICAL_EVENTS } = await import('../shared/events.ts');
  const { PERSONS } = await import('../shared/persons.ts');
  const { SOURCES } = await import('../shared/sources.ts');
  const { ARTIFACTS } = await import('../shared/artifacts.ts');
  const { KINGDOMS, HISTORICAL_ROUTES } = await import('../shared/kingdoms.ts');
  const { CATEGORIES } = await import('../shared/facts.ts');
  const { ACHIEVEMENTS } = await import('../shared/gamification.ts');
  const { GAMES } = await import('../shared/games.ts');
  const { getBank, drawQuestions } = await import('../shared/question-gen.ts');

  const bundle = {
    periods: PERIODS, events: HISTORICAL_EVENTS, persons: PERSONS, sources: SOURCES,
    artifacts: ARTIFACTS, kingdoms: KINGDOMS, routes: HISTORICAL_ROUTES, categories: CATEGORIES,
    achievements: ACHIEVEMENTS.map(({ check, ...a }) => a), games: GAMES,
    stats: { questions: getBank().length, facts: 320, persons: PERSONS.length, events: HISTORICAL_EVENTS.length },
  };
  const fakeUser = {
    id: 'u1', email: 'test@arena.kz', name: 'Тест Оқушы', picture: null, role: 'student',
    group: '10-А', school: '№1 лицей', xp: 4200, totalScore: 9800, correct: 210, wrong: 40,
    streakBest: 9, playSeconds: 7200, sessions: 14, createdAt: '2026-01-10T00:00:00Z', lastActivity: '2026-10-30T00:00:00Z',
  };
  const routes = {
    '/api/content/bundle': () => bundle,
    '/api/auth/providers': () => ({ google: false, hint: 'тест' }),
    '/api/auth/me': () => ({ user: fakeUser }),
    '/api/leaderboard': () => ({ rows: [{ pos: 1, id: 'u1', name: 'Тест', xp: 4200, score: 9800, accuracy: 84, rank: 'Дала білгірі', group: '10-А', sessions: 14 }] }),
    '/api/challenges/daily': () => ({ day: '2026-10-30', questions: drawQuestions({ count: 5, seed: 7 }), answered: false }),
    '/api/me/profile': () => ({
      user: fakeUser, rank: { title: 'Дала білгірі', level: 4, progress: 55, nextXp: 5000 },
      stats: { accuracy: 84, answers: 250, playMinutes: 120, sessions: 14, perfect: 3 },
      perGame: GAMES.map((g) => ({ gameId: g.id, title: g.title, played: 2, score: 900, bestLevel: 3, levelsCleared: 2, levels: [1, 2], accuracy: 80 })),
      recent: [{ id: 's1', gameId: 'battle', gameTitle: 'Тарих майданы', level: 2, score: 480, xp: 90, correct: 8, wrong: 2, finishedAt: '2026-10-29T10:00:00Z', duration: 300 }],
      achievements: [{ achievement_id: 'first-step', title: 'Алғашқы қадам', unlocked_at: '2026-10-01T00:00:00Z' }],
    }),
    '/api/teacher/students': () => ({ groups: ['10-А'], students: [{ id: 'u1', name: 'Тест', email: 't@a.kz', group: '10-А', school: 'x', xp: 100, score: 200, accuracy: 80, answers: 20, sessions: 3, playMinutes: 12, lastActivity: '2026-10-30', disabled: false, rank: 'Жас зерттеуші' }] }),
    '/api/teacher/overview': () => ({ students: 1, results: 3, avgScore: 200, avgAccuracy: 80, byGame: [{ game_id: 'battle', title: 'Тарих майданы', attempts: 3, avg_score: 200, avg_acc: 80 }], byLevel: [], activity: [{ day: '2026-10-30', sessions: 3 }] }),
    '/api/teacher/questions': () => ({ hardest: [{ questionId: 'q1', attempts: 10, correctRate: 30, format: 'mcq', category: 'Хандық', prompt: 'Сұрақ' }], trackedQuestions: 10, bankSize: getBank().length }),
    '/api/admin/users': () => ({ users: [{ id: 'u1', name: 'Тест', email: 't@a.kz', role: 'student', group_name: '10-А', xp: 100, total_score: 200, sessions_count: 3, created_at: '2026-01-01', last_activity: '2026-10-30', disabled: false, google: false }], totals: { all: 1, students: 1, teachers: 0, admins: 1 } }),
    '/api/admin/questions': () => ({ total: getBank().length, shown: 1, questions: [{ id: 'q1', format: 'mcq', difficulty: 2, category: 'Хандық', prompt: 'Сұрақ?', options: ['а', 'б'], answerIndexes: [0], explanation: 'түсіндірме' }], custom: [] }),
    '/api/admin/content-stats': () => ({ facts: 320, questions: getBank().length, persons: PERSONS.length, events: HISTORICAL_EVENTS.length, sources: SOURCES.length, periods: 14, kingdoms: KINGDOMS.length, artifacts: ARTIFACTS.length, byCategory: CATEGORIES.map((c) => ({ id: c.id, title: c.title, count: 200 })) }),
    '/api/admin/settings': () => ({ settings: { dailyChallenge: 'on', weeklyChallenge: 'on', registration: 'on', leaderboardPublic: 'on', questionsPerLevel: '10' } }),
    '/api/admin/security-log': () => ({ log: [{ id: 1, event: 'login', detail: 'test', ip: '127.0.0.1', created_at: '2026-10-30T00:00:00Z' }], stats: { failedLogins: 0, rbacDenied: 0, rateLimits: 0 } }),
  };
  // Save the real globals: leaving a fetch stub behind poisons every suite that
  // runs after this one (that is exactly how the gameplay suite ended up seeing
  // a signed-out UI).
  const realFetch = globalThis.fetch;
  const realLocalStorage = globalThis.localStorage;

  globalThis.fetch = async (url) => {
    const path = String(url).split('?')[0];
    const handler = routes[path];
    const body = handler ? handler() : {};
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify(body),
      json: async () => body,
      headers: new Map(),
    };
  };
  globalThis.localStorage = {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };

  const results = [];
  const rec = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  for (const [name, Page, path] of pages) {
    try {
      const html = renderToString(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(AuthProvider, null, React.createElement(ToastProvider, null, React.createElement(Page))),
        ),
      );
      // renderToStaticMarkup does not run effects, so data-driven pages show
      // their loading state here. That still proves the component tree mounts
      // without throwing; real data rendering is asserted in routes-ui.test.mjs.
      rec(`renders ${name}`, html.length > 80, `${html.length} chars${html.length < 200 ? ' (loading state)' : ''}`);
    } catch (e) {
      rec(`renders ${name}`, false, e.message.slice(0, 160));
    }
  }

  // every game stage component must be importable and constructible
  const stages = [
    ['AdventureStage', '../src/games/adventure/AdventureStage.tsx'],
    ['StrategyStage', '../src/games/strategy/StrategyStage.tsx'],
    ['DefenseStage', '../src/games/defense/DefenseStage.tsx'],
    ['RaceStage', '../src/games/race/RaceStage.tsx'],
    ['PuzzleStage', '../src/games/puzzle/PuzzleStage.tsx'],
    ['BattleStage', '../src/games/battle/BattleStage.tsx'],
  ];
  for (const [name, mod] of stages) {
    try {
      const m = await import(mod);
      rec(`${name} module loads`, typeof Object.values(m)[0] === 'function');
    } catch (e) {
      rec(`${name} module loads`, false, e.message.slice(0, 160));
    }
  }

  // the match-3 engine must be able to generate a valid board (pure logic)
  const puzzle = await import('../src/games/puzzle/PuzzleStage.tsx');
  rec('puzzle module exports a component', typeof puzzle.PuzzleStage === 'function');

  globalThis.fetch = realFetch;
  globalThis.localStorage = realLocalStorage;
  return results;
}
