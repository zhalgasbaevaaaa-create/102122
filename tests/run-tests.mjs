/**
 * Test runner: content validation → API/security → browser E2E, then a summary.
 *
 *   node tests/run-tests.mjs            full suite (needs Chromium from Playwright)
 *   node tests/run-tests.mjs --no-e2e   skip the browser tests
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

/**
 * Pick a free port for this run. A fixed port breaks when a previous run's
 * server is still shutting down: the new server fails with EADDRINUSE and the
 * suite silently talks to the OLD (stale, already-deleted) database.
 */
async function freePort(start = 8799) {
  for (let port = start; port < start + 60; port++) {
    const ok = await new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => srv.close(() => resolve(true)));
      srv.listen(port, '127.0.0.1');
    });
    if (ok) return port;
  }
  throw new Error('no free port found');
}

const PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;
console.log(`(test server port: ${PORT})`);
process.env.TEST_BASE = BASE;
const DATA_DIR = path.join(os.tmpdir(), `hga-test-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });

const all = [];
const add = (rows) => all.push(...rows);
const rec = (name, ok, detail = '') => {
  all.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

console.log('\n═══ 1. CONTENT VALIDATION ═══════════════════════════════');
const { validateBank, ALL_FORMATS } = await import('../shared/question-gen.ts');
const { FACTS, CATEGORIES } = await import('../shared/facts.ts');
const { PERSONS } = await import('../shared/persons.ts');
const { HISTORICAL_EVENTS } = await import('../shared/events.ts');
const { PERIODS } = await import('../shared/periods.ts');
const { GAMES } = await import('../shared/games.ts');
const { DECISIONS } = await import('../shared/decisions.ts');
const { SOURCES } = await import('../shared/sources.ts');
const { KINGDOMS } = await import('../shared/kingdoms.ts');

const v = validateBank();
rec('question bank has no structural errors', v.errors.length === 0, v.errors.slice(0, 3).join('; '));
rec('question bank size > 1000', v.total > 1000, `${v.total} questions`);
for (const f of ALL_FORMATS) {
  rec(`format "${f}" present`, (v.byFormat[f] ?? 0) > 0, `${v.byFormat[f] ?? 0} questions`);
}
const perCat = CATEGORIES.map((c) => ({ id: c.id, n: v.byCategory[c.id] ?? 0 }));
rec('every category has 100+ questions', perCat.every((c) => c.n >= 100), perCat.map((c) => `${c.id}:${c.n}`).join(' '));
rec('every category has 40+ facts', CATEGORIES.every((c) => FACTS.filter((f) => f.cat === c.id).length >= 40));
rec('all facts reference known sources', FACTS.every((f) => f.src.every((s) => SOURCES.some((x) => x.id === s))));
rec('all persons reference known sources', PERSONS.every((p) => p.sourceIds.every((s) => SOURCES.some((x) => x.id === s))));
rec('all events reference known sources', HISTORICAL_EVENTS.every((e) => e.sourceIds.every((s) => SOURCES.some((x) => x.id === s))));
rec('six games defined', GAMES.length === 6);
rec('every game has exactly 10 levels', GAMES.every((g) => g.levels.length === 10), GAMES.map((g) => `${g.id}:${g.levels.length}`).join(' '));
rec('every level declares 10+ educational interactions', GAMES.every((g) => g.questionsPerLevel >= 10));
rec('all game levels have Kazakh briefings', GAMES.every((g) => g.levels.every((l) => l.brief.length > 20 && /[әғқңөұүһі]/.test(l.brief))));
rec('all levels map to a real period or question category', GAMES.every((g) => g.levels.every((l) => PERIODS.some((p) => p.id === l.periodId) || CATEGORIES.some((c) => c.id === l.periodId))));
rec('strategy decisions all carry a documented history note', DECISIONS.every((d) => d.history.length > 40 && d.sourceIds.length > 0), `${DECISIONS.length} decisions`);
rec('map kingdoms all carry stylised/approximate accuracy flags', KINGDOMS.every((k) => k.accuracy === 'stylised' || k.accuracy === 'approximate'));
rec('14 historical periods covered', PERIODS.length === 14);

const server = spawn('node', ['--import', 'tsx', 'server/index.js'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d.toString(); });
server.stderr.on('data', (d) => { serverLog += d.toString(); });

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const up = await waitForServer();
if (serverLog.includes('EADDRINUSE')) {
  console.error('FATAL: test port was already in use\n' + serverLog.slice(0, 600));
  process.exit(1);
}
rec('server boots', up, up ? '' : serverLog.slice(0, 400));

if (up) {
  // seed demo accounts into the throwaway DB
  const seedProc = spawn('node', ['--import', 'tsx', 'server/seed-run.js'], {
    env: { ...process.env, DATA_DIR },
    stdio: 'ignore',
  });
  await new Promise((r) => seedProc.on('exit', r));

  // Mint a DEDICATED account for the UI suites. Two reasons:
  //  • the API suite logs its own student out, which would invalidate a shared token;
  //  • the API suite deliberately exhausts the per-IP login rate limiter.
  // A fresh account keeps the UI stages independent of both.
  let STUDENT_TOKEN = null;
  try {
    const email = `ui-${Date.now()}${Math.floor(Math.random() * 1e4)}@test.arena.kz`;
    const r = await fetch(BASE + '/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'UI Сынақ', email, password: 'UiTesting12345!' }),
    });
    const body = await r.json().catch(() => ({}));
    STUDENT_TOKEN = body.token ?? null;
    if (!STUDENT_TOKEN) console.log('    (ui token mint failed:', r.status, JSON.stringify(body).slice(0, 120) + ')');
  } catch (e) { console.log('    (ui token mint threw:', e.message, ')'); }

  console.log('\n═══ 2. KAZAKH TYPOGRAPHY (self-hosted Lora) ════════════');
try {
  const { runFontTests } = await import('./fonts.test.mjs');
  await runFontTests(BASE, rec);
} catch (e) {
  rec('font suite executed', false, e.message.slice(0, 200));
}

console.log('\n═══ 3. WEBSOCKET MULTIPLAYER (2 live clients) ═══════════');
  try {
    const { runMultiplayerTests } = await import('./multiplayer.test.mjs');
    await runMultiplayerTests(BASE, rec);
  } catch (e) {
    rec('multiplayer suite executed', false, e.message.slice(0, 200));
  }

  try {
    const { runOnlineUiTests } = await import('./online-ui.test.mjs');
    await runOnlineUiTests(BASE, rec, STUDENT_TOKEN);
  } catch (e) {
    rec('online UI suite executed', false, e.message.slice(0, 200));
  }

  try {
    const { runAnswerLabelTests } = await import('./answer-label.test.mjs');
    await runAnswerLabelTests(rec);
  } catch (e) {
    rec('answer label suite executed', false, e.message.slice(0, 200));
  }

  console.log('\n═══ 4. API + SECURITY ═══════════════════════════════════');
  const { runApiTests } = await import('./api.test.mjs');
  add(await runApiTests());

  try {
    const { runRoutesUiTests } = await import('./routes-ui.test.mjs');
    await runRoutesUiTests(BASE, rec, STUDENT_TOKEN);
  } catch (e) {
    rec('routes UI suite executed', false, e.message.slice(0, 200));
  }

  console.log('\n═══ 5. REACT RENDER SMOKE (every route) ════════════════');
  try {
    const { runRenderTests } = await import('./render.test.mjs');
    add(await runRenderTests());
  } catch (e) {
    rec('render smoke suite executed', false, e.message.slice(0, 200));
  }

  console.log('\n═══ 6. GAMEPLAY INTERACTION (all six games) ════════════');
  try {
    const { runGameplayTests } = await import('./gameplay.test.mjs');
    await runGameplayTests(BASE, rec, STUDENT_TOKEN);
  } catch (e) {
    rec('gameplay suite executed', false, e.message.slice(0, 200));
  }

  console.log('\n═══ 6. GAME ENGINE (jsdom) ══════════════════════════════');
  try {
    const { runGameTests } = await import('./games.test.mjs');
    add(await runGameTests());
  } catch (e) {
    rec('game engine suite executed', false, e.message.slice(0, 200));
  }

  const skipE2E = process.argv.includes('--no-e2e');
  if (!skipE2E) {
    console.log('\n═══ 7. BROWSER E2E (Playwright/Chromium) ════════════════');
    try {
      const { runE2E } = await import('./e2e.test.mjs');
      add(await runE2E());
    } catch (e) {
      rec('browser E2E suite executed', false, e.message.slice(0, 120) + ' — Chromium cannot launch in this sandbox; run `npx playwright install chromium` locally.');
    }
  } else {
    console.log('\n(browser E2E skipped)');
  }
}

await new Promise((resolve) => {
  const done = () => resolve();
  server.once('exit', done);
  server.kill('SIGTERM');
  setTimeout(() => {
    try { server.kill('SIGKILL'); } catch { /* already gone */ }
    resolve();
  }, 3000);
});
fs.rmSync(DATA_DIR, { recursive: true, force: true });

// ── summary ─────────────────────────────────────────────────────────────────
const passed = all.filter((r) => r.ok).length;
const failed = all.filter((r) => !r.ok);
console.log('\n════════════════════════════════════════════════════════');
console.log(`RESULT: ${passed}/${all.length} checks passed`);
if (failed.length) {
  console.log('\nFAILED CHECKS:');
  for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ' — ' + f.detail : ''}`);
}
console.log('════════════════════════════════════════════════════════\n');

// machine-readable report for docs/TESTING.md
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync(
  'docs/test-report.json',
  JSON.stringify({ ranAt: new Date().toISOString(), passed, total: all.length, results: all }, null, 2),
);

process.exit(failed.length ? 1 : 0);
