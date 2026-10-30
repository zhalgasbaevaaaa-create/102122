/**
 * Multiplayer room reaper — regression test.
 *
 * Found during the final audit: a room whose players all vanished while a match
 * was in progress was never destroyed, because the only cleanup path relied on
 * each socket's `close` handler (which crashes and killed tabs skip) and the
 * "nobody connected" check was gated on `status !== 'finished'`.
 *
 * This suite boots its own server with a 3-second grace window and asserts that
 * both an abandoned lobby and an abandoned in-progress match are reclaimed.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

async function freePort(start) {
  for (let p = start; p < start + 40; p++) {
    const ok = await new Promise((resolve) => {
      const s = net.createServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error('no free port');
}

export async function runReaperTests(rec) {
  const port = await freePort(8850);
  const base = `http://127.0.0.1:${port}`;
  const dataDir = path.join(os.tmpdir(), `hga-reaper-${Date.now()}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const srv = spawn('node', ['--import', 'tsx', 'server/index.js'], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_ENV: 'production', MP_GRACE_MS: '2500', SEED_ON_BOOT: 'off' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d.toString(); });
  srv.stderr.on('data', (d) => { srvLog += d.toString(); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const J = async (p, o = {}) => {
    const r = await fetch(base + p, o);
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  try {
    let up = false;
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch(base + '/api/health')).ok) { up = true; break; } } catch { /* booting */ }
      await wait(500);
    }
    if (!up) {
      rec('reaper: dedicated server boots', false, srvLog.slice(0, 200) || 'no output');
      return;
    }
    rec('reaper: dedicated server boots', true, `port ${port}`);

    const mkUser = async (tag) => (await J('/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: tag, email: `${tag}-${Date.now()}${Math.floor(Math.random() * 1e4)}@test.arena.kz`, password: 'ReaperPass12345!' }),
    })).body.token;

    const conn = (token) => new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const frames = [];
      ws.on('error', (e) => reject(new Error('socket: ' + e.message)));
      ws.on('message', (raw) => frames.push(JSON.parse(raw.toString())));
      ws.on('open', () => { ws.send(JSON.stringify({ type: 'hello', token })); resolve({ ws, frames }); });
    });

    // ── case 1: abandoned lobby ────────────────────────────────────────────
    const t1 = await mkUser('lobby');
    const a1 = await conn(t1);
    await wait(250);
    a1.ws.send(JSON.stringify({ type: 'create', options: { timerSeconds: 10 } }));
    await wait(400);
    const code1 = a1.frames.find((m) => m.type === 'created')?.code;
    rec('reaper: lobby room is registered', Boolean(code1), code1);
    a1.ws.terminate();
    // the sweeper ticks every 15s, so poll rather than guess a single wait
    const roomsUntilZero = async (budgetMs = 40_000) => {
      const started = Date.now();
      let last = null;
      while (Date.now() - started < budgetMs) {
        last = (await J('/api/multiplayer/status')).body;
        if (last.rooms === 0) return { ok: true, waited: Date.now() - started, last };
        await wait(1000);
      }
      return { ok: false, waited: Date.now() - started, last };
    };
    const g1 = await roomsUntilZero();
    rec('reaper: abandoned lobby is reclaimed', g1.ok, `after ${Math.round(g1.waited / 1000)}s, rooms=${g1.last?.rooms}`);

    // ── case 2: abandoned match in progress ───────────────────────────────
    const [ta, tb] = await Promise.all([mkUser('playa'), mkUser('playb')]);
    const a = await conn(ta);
    const b = await conn(tb);
    await wait(250);
    a.ws.send(JSON.stringify({ type: 'create', options: { timerSeconds: 30 } }));
    await wait(400);
    const code2 = a.frames.find((m) => m.type === 'created')?.code;
    b.ws.send(JSON.stringify({ type: 'join', code: code2 }));
    await wait(400);
    a.ws.send(JSON.stringify({ type: 'start', count: 10 }));
    await wait(700);
    const running = await J('/api/multiplayer/status');
    rec('reaper: match starts before the players vanish', running.body.activeGames === 1, JSON.stringify(running.body));

    a.ws.terminate();
    b.ws.terminate();
    const g2 = await roomsUntilZero();
    rec('reaper: abandoned in-progress match is reclaimed', g2.ok,
      `after ${Math.round(g2.waited / 1000)}s, rooms=${g2.last?.rooms} activeGames=${g2.last?.activeGames}`);
    rec('reaper: server stays healthy throughout', (await J('/api/health')).body.ok === true);
  } catch (e) {
    const tail = srvLog.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 240);
    rec('reaper: suite completed without error', false, `${e.message?.slice(0, 120)} [server: ${tail || 'no output'}]`);
  } finally {
    srv.kill('SIGKILL');
    await wait(300);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
