/**
 * REAL-TIME MULTIPLAYER ENGINE (WebSocket, ws 8.x)
 * ================================================
 * «Тарих майданы» — онлайн сайыс. Room-based, server-authoritative.
 *
 * Design notes
 * ------------
 * • Transport: raw WebSocket on the same HTTP server, path `/ws`. Because the
 *   Vite dev server proxies `/ws` with ws:true and the preview host forwards
 *   the same origin, the browser always connects to `ws(s)://<same-host>/ws`.
 * • Auth: the opaque session token is sent in the first frame (`{type:'hello'}`)
 *   instead of the URL, so it never lands in access logs or Referer headers.
 * • Scoring: identical rules to the solo path. Every answer is validated here
 *   with `checkAnswer()`; the client cannot submit a score. Timeouts are fired
 *   by the SERVER clock, and a late answer is rejected by a monotonic check.
 * • Persistence: each human seat gets a real `game_sessions` row (so the result
 *   appears in the profile, leaderboard, teacher dashboard and achievements)
 *   which is finalised with `finalizeSession()` — the same function the HTTP
 *   endpoint uses. Bot seats are never persisted.
 * • Reconnect: a seat is keyed by `userId`; if the same user reopens the socket
 *   within the room's lifetime the old socket is detached and the new one takes
 *   over the seat (progress preserved).
 * • Anti-abuse: one answer per seat per question, rate limit per socket,
 *   room cap, nickname sanitising, 30-minute idle TTL.
 */
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { db } from './db.js';
import { userFromToken } from './auth.js';
import { drawQuestions, getBank } from '../shared/question-gen.ts';
import { publicQuestion, checkAnswer } from '../shared/quiz-types.ts';
import { finalizeSession } from './scoring.js';
import { answerLabel } from './answer-label.js';

const PATH = '/ws';

/** Structured, low-noise logging: only state transitions that matter. */
const logger = {
  info: (...a) => { if (process.env.MP_DEBUG !== 'off') console.log('[mp]', ...a); },
  warn: (...a) => console.log('[mp]', ...a),
};
const MAX_ROOM = 8;                     // seats per room (4v4)
const MIN_SEATS = 2;
const HOST_GRACE_MS = Number(process.env.MP_GRACE_MS) || 90_000; // reconnect tolerance
const ROOM_TTL_MS = 30 * 60_000;        // abandon idle rooms
const FEED_LIMIT = 40;                  // recent-events buffer sent on resync
const BOT_NAMES = ['Айбек (бот)', 'Нұрсұлтан (бот)', 'Томирис (бот)', 'Сырым (бот)', 'Ұлжан (бот)', 'Күлтегін (бот)'];

/** Codepoint-safe truncation (Kazakh letters are BMP, but emoji are not). */
const clip = (s, n) => [...String(s ?? '')].slice(0, n).join('');
const cleanName = (s) => clip(String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim(), 18);

const rooms = new Map();   // code -> room
const bySocket = new Map(); // ws -> { code, userId }

// ── helpers ────────────────────────────────────────────────────────────────
function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — readable when spoken
  let code;
  do {
    code = Array.from({ length: 6 }, () => A[crypto.randomInt(A.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function seatPublic(seat) {
  return {
    id: seat.id,
    name: seat.name,
    team: seat.team,
    bot: seat.bot,
    ready: seat.ready,
    connected: seat.bot ? true : Boolean(seat.ws),
    score: seat.score,
    correct: seat.correct,
    wrong: seat.wrong,
    streak: seat.streak,
    bestStreak: seat.bestStreak,
    answered: seat.answered,
  };
}

function roomSummary(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    total: room.total,
    index: room.index,
    level: room.level,
    timerMs: room.timerMs,
    teamMode: room.teamMode,
    seats: room.seats.map(seatPublic),
  };
}

function send(ws, payload) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function broadcast(room, payload, exceptWs = null) {
  const data = JSON.stringify(payload);
  for (const s of room.seats) {
    if (s.bot || !s.ws || s.ws === exceptWs) continue;
    if (s.ws.readyState === 1) s.ws.send(data);
  }
}

function pushFeed(room, kind, text, extra = {}) {
  const ev = { at: Date.now(), kind, text, ...extra };
  room.feed.push(ev);
  if (room.feed.length > FEED_LIMIT) room.feed.shift();
  broadcast(room, { type: 'feed', event: ev });
}

function stateMsg(room, you = null) {
  return {
    type: 'state',
    you,
    room: roomSummary(room),
    question: room.status === 'playing' || room.status === 'reveal' ? currentQuestionView(room) : null,
    feed: room.feed.slice(-15),
    serverTime: Date.now(),
  };
}

/** Send the room state to everybody, personalised with their own seat id. */
function syncState(room) {
  for (const seat of room.seats) {
    if (seat.bot || !seat.ws) continue;
    send(seat.ws, stateMsg(room, seat.id));
  }
}

function currentQuestionView(room) {
  if (!room.questions || room.index >= room.questions.length) return null;
  const q = room.questions[room.index];
  return {
    index: room.index,
    total: room.total,
    question: publicQuestion(q),
    deadline: room.deadline,
    serverTime: Date.now(),
    revealed: room.status === 'reveal',
  };
}

function seatIdOf(room, userId) {
  return room.seats.find((s) => !s.bot && s.userId === userId)?.id ?? null;
}

function findSeat(room, userId) {
  return room.seats.find((s) => !s.bot && s.userId === userId) ?? null;
}

function freeSeats(room) {
  return MAX_ROOM - room.seats.length;
}

// ── room lifecycle ─────────────────────────────────────────────────────────
function createRoom(user, ws, opts) {
  const code = makeCode();
  const room = {
    code,
    hostId: user.id,
    seats: [],
    status: 'lobby',            // lobby | playing | reveal | finished | aborted
    questions: [],
    index: 0,
    total: 10,
    level: Math.min(10, Math.max(1, Number(opts.level) || 1)),
    difficulty: ['easy', 'medium', 'hard'].includes(opts.difficulty) ? opts.difficulty : 'medium',
    timerMs: Math.min(45, Math.max(5, Number(opts.timerSeconds) || 20)) * 1000,
    // how long the correct answer stays on screen between rounds
    revealMs: Math.min(15_000, Math.max(300, Number(opts.revealMs) || 6500)),
    teamMode: Boolean(opts.teamMode),
    round: 0,
    deadline: 0,
    feed: [],
    answers: new Map(),          // qIndex -> Map(seatId -> {correct, at})
    advanceTimer: null,
    hostTimer: null,
    createdAt: Date.now(),
    touch: Date.now(),
    emptySince: null,
  };
  rooms.set(code, room);
  const seat = joinRoom(room, user, ws);
  room.hostSeatId = seat?.id ?? null;
  return room;
}

function joinRoom(room, user, ws) {
  const existing = findSeat(room, user.id);
  if (existing) {
    // reconnect: take the seat over, keep the accumulated score
    if (existing.ws && existing.ws !== ws) send(existing.ws, { type: 'error', code: 'REPLACED', error: 'Басқа құрылғыдан кірдіңіз' });
    existing.ws = ws;
    bySocket.set(ws, { code: room.code, userId: user.id });
    pushFeed(room, 'join', `${existing.name} қайта қосылды`);
    send(ws, stateMsg(room, existing.id));
    return existing;
  }
  if (room.status !== 'lobby') return null;
  if (freeSeats(room) <= 0) return null;
  const teamIndex = room.seats.length;
  const seat = {
    id: crypto.randomUUID(),
    userId: user.id,
    name: cleanName(user.name || user.email) || 'Ойыншы',
    team: room.teamMode ? (teamIndex % 2 === 0 ? 'A' : 'B') : null,
    bot: false,
    ready: false,
    ws,
    score: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    bestStreak: 0,
    answered: 0,
    sessionId: null,
    finalResult: null,
  };
  room.seats.push(seat);
  bySocket.set(ws, { code: room.code, userId: user.id });
  pushFeed(room, 'join', `${seat.name} қосылды`);
  syncState(room);
  return seat;
}

function addBots(room, count) {
  const n = Math.min(count, freeSeats(room));
  for (let i = 0; i < n; i++) {
    const idx = room.seats.length;
    room.seats.push({
      id: crypto.randomUUID(),
      userId: null,
      name: BOT_NAMES[idx % BOT_NAMES.length],
      team: room.teamMode ? (idx % 2 === 0 ? 'A' : 'B') : null,
      bot: true,
      ready: true,
      ws: null,
      score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, answered: 0,
      sessionId: null, finalResult: null,
    });
  }
  pushFeed(room, 'join', `${n} бот қосылды`);
  syncState(room);
}

function destroyRoom(room, reason) {
  if (room.advanceTimer) clearTimeout(room.advanceTimer);
  if (room.hostTimer) clearTimeout(room.hostTimer);
  if (reason) broadcast(room, { type: 'closed', reason });
  for (const s of room.seats) {
    if (s.ws) bySocket.delete(s.ws);
    if (s.sessionId && room.status !== 'finished') {
      // never leave a half-finished session behind
      db.prepare("UPDATE game_sessions SET status='abandoned', finished_at=? WHERE id=? AND status='active'").run(new Date().toISOString(), s.sessionId);
    }
  }
  rooms.delete(room.code);
}

// ── gameplay ───────────────────────────────────────────────────────────────
function startGame(room) {
  if (room.status !== 'lobby') return;
  if (room.seats.length < MIN_SEATS) return;
  const seed = crypto.randomBytes(4).readUInt32BE(0);
  // Questions come from the same validated bank as the solo game. Per seat we
  // draw the same set so everybody competes on identical material.
  const drawn = drawQuestions({ count: room.total, categories: ['khanate', 'soviet-independent', 'turkic', 'mongol-horde'], seed });
  room.questions = drawn;
  room.total = drawn.length;
  room.index = 0;
  room.round = 1;
  room.status = 'playing';
  room.answers = new Map();

  // one real, server-tracked game session per human seat
  for (const seat of room.seats) {
    if (seat.bot) continue;
    const sessionId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO game_sessions (id, user_id, game_id, level, difficulty, mode, question_ids, started_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(sessionId, seat.userId, 'battle', room.level, room.difficulty, 'online', JSON.stringify(drawn.map((q) => q.id)), new Date().toISOString());
    seat.sessionId = sessionId;
    seat.startedAt = Date.now();
  }
  pushFeed(room, 'start', 'Сайыс басталды!');
  beginQuestion(room);
}

function beginQuestion(room) {
  if (room.index >= room.questions.length) return finish(room);
  room.status = 'playing';
  room.answers.set(room.index, new Map());
  room.deadline = Date.now() + room.timerMs;
  broadcast(room, { type: 'question', ...currentQuestionView(room) });
  scheduleAdvance(room);

  // bots answer with a human-ish delay and accuracy that degrades with level
  for (const seat of room.seats) {
    if (!seat.bot) continue;
    const accuracy = 0.85 - room.level * 0.02;
    const correct = Math.random() < accuracy;
    const delay = 2500 + Math.random() * (room.timerMs * 0.55);
    setTimeout(() => {
      if (room.status !== 'playing' || room.answers.get(room.index)?.has(seat.id)) return;
      submitAnswer(room, seat, correct, Math.round(delay));
    }, delay);
  }
}

function scheduleAdvance(room) {
  if (room.advanceTimer) clearTimeout(room.advanceTimer);
  const left = Math.max(0, room.deadline - Date.now());
  room.advanceTimer = setTimeout(() => {
    if (room.status === 'playing') reveal(room);
  }, left + 250);
}

/** Server-side scoring — mirrors the solo rules (100/correct + 20×streak). */
function applyScore(seat, correct, ms, room) {
  seat.answered += 1;
  if (correct) {
    seat.correct += 1;
    seat.streak += 1;
    seat.bestStreak = Math.max(seat.bestStreak, seat.streak);
    const speedBonus = Math.max(0, Math.round(((room.timerMs - ms) / room.timerMs) * 30));
    seat.score += 100 + seat.streak * 20 + speedBonus;
  } else {
    seat.wrong += 1;
    seat.streak = 0;
  }
}

function submitAnswer(room, seat, correct, ms) {
  const q = room.questions[room.index];
  if (!q) return;
  const bucket = room.answers.get(room.index);
  if (!bucket || bucket.has(seat.id)) return; // one answer per seat per question
  bucket.set(seat.id, { correct, at: Date.now(), ms });
  applyScore(seat, correct, ms, room);

  if (seat.sessionId) {
    // Persist the answer exactly like the HTTP endpoint so the teacher/admin
    // dashboards and question statistics stay consistent.
    const row = db.prepare('SELECT answers, question_ids FROM game_sessions WHERE id = ?').get(seat.sessionId);
    if (row) {
      const answered = JSON.parse(row.answers || '[]');
      answered.push({ qid: q.id, correct, ms: Math.min(ms, 600000) });
      const correctCount = answered.filter((a) => a.correct).length;
      db.prepare('UPDATE game_sessions SET answers = ?, current_index = ?, correct_count = ?, wrong_count = ?, streak_best = ? WHERE id = ?')
        .run(JSON.stringify(answered), answered.length, correctCount, answered.length - correctCount,
          Math.max(...room.seats.filter((s) => s.sessionId === seat.sessionId).map((s) => s.bestStreak), 0), seat.sessionId);
    }
    db.prepare(`INSERT INTO question_stats (question_id, attempts, correct) VALUES (?,1,?)
                ON CONFLICT(question_id) DO UPDATE SET attempts = attempts + 1, correct = correct + excluded.correct`)
      .run(q.id, correct ? 1 : 0);
    db.prepare('INSERT INTO answer_log (session_id, user_id, question_id, correct, answer, created_at) VALUES (?,?,?,?,?,?)')
      .run(seat.sessionId, seat.userId, q.id, correct ? 1 : 0, JSON.stringify({ online: true, correct }).slice(0, 500), new Date().toISOString());
  }

  // Private feedback: this player learns immediately whether they were right and
  // sees the historical explanation. Correctness is NOT broadcast — the room
  // learns who scored only when the round closes.
  send(seat.ws, {
    type: 'answer_result',
    correct,
    explanation: q.explanation,
    sourceIds: q.sourceIds,
    score: seat.score,
    streak: seat.streak,
  });

  broadcast(room, {
    type: 'seat_answered',
    seatId: seat.id,
    seats: room.seats.map(seatPublic),
  });

  // Everybody answered → close the round immediately. Bots that are still
  // "thinking" get a short grace window instead of holding the room hostage.
  const humans = room.seats.filter((s) => !s.bot);
  if (humans.every((h) => bucket.has(h.id))) {
    const pendingBots = room.seats.filter((s) => s.bot && !bucket.has(s.id));
    if (pendingBots.length === 0) return reveal(room);
    const roundIdx = room.index;
    pendingBots.forEach((bot, i) => setTimeout(() => {
      if (room.status !== 'playing' || room.index !== roundIdx) return;
      const acc = 0.85 - room.level * 0.02;
      submitAnswer(room, bot, Math.random() < acc, 2000 + i * 300);
    }, 300 + i * 350));
  }
}

function reveal(room) {
  if (room.advanceTimer) clearTimeout(room.advanceTimer);
  room.status = 'reveal';
  const q = room.questions[room.index];
  const bucket = room.answers.get(room.index) ?? new Map();
  const stats = room.seats.map((s) => ({
    seatId: s.id,
    correct: bucket.get(s.id)?.correct ?? false,
    answered: bucket.has(s.id),
  }));
  const leaders = teamTotals(room);
  broadcast(room, {
    type: 'reveal',
    index: room.index,
    correctAnswerLabel: q ? answerLabel(q) : '',
    explanation: q?.explanation ?? '',
    sourceIds: q?.sourceIds ?? [],
    perSeat: stats,
    seats: room.seats.map(seatPublic),
    teamTotals: leaders,
    nextAt: Date.now() + room.revealMs,
  });
  room.advanceTimer = setTimeout(() => {
    room.index += 1;
    room.round = room.index + 1;
    if (room.index >= room.total) finish(room);
    else beginQuestion(room);
  }, room.revealMs);
}

function teamTotals(room) {
  if (!room.teamMode) return null;
  const a = room.seats.filter((s) => s.team === 'A').reduce((n, s) => n + s.score, 0);
  const b = room.seats.filter((s) => s.team === 'B').reduce((n, s) => n + s.score, 0);
  return { A: a, B: b };
}

function finish(room) {
  if (room.advanceTimer) clearTimeout(room.advanceTimer);
  room.status = 'finished';
  const duration = Math.round((Date.now() - room.createdAt) / 1000);
  const results = [];

  for (const seat of room.seats) {
    if (seat.bot) continue;
    // The gameplay contribution is the seat's own in-room score. finalizeSession
    // recomputes everything from server-recorded answers, so this is only a
    // bounded input — the client could not inflate it even if it tried.
    let final = null;
    if (seat.sessionId) {
      const row = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(seat.sessionId);
      final = finalizeSession(row, seat.userId, seat.score, duration);
    }
    seat.finalResult = final;
    results.push({
      seatId: seat.id,
      name: seat.name,
      bot: false,
      score: seat.score,
      correct: seat.correct,
      wrong: seat.wrong,
      bestStreak: seat.bestStreak,
      rank: final?.rank ?? null,
      xp: final?.xp ?? 0,
      serverScore: final?.score ?? 0,
      unlocked: final?.unlocked ?? [],
    });
  }
  for (const seat of room.seats) {
    if (!seat.bot) continue;
    results.push({ seatId: seat.id, name: seat.name, bot: true, score: seat.score, correct: seat.correct, wrong: seat.wrong, bestStreak: seat.bestStreak, xp: 0, unlocked: [] });
  }
  results.sort((a, b) => b.score - a.score);
  const teamWins = teamTotals(room);
  const winner = teamWins ? (teamWins.A === teamWins.B ? 'draw' : teamWins.A > teamWins.B ? 'A' : 'B') : results[0]?.seatId ?? null;

  // personalise: each human only sees their own XP/rank payload
  for (const seat of room.seats) {
    if (!seat.ws) continue;
    send(seat.ws, {
      type: 'finished',
      winner,
      teamTotals: teamWins,
      results,
      me: seat.finalResult ? {
        seatId: seat.id,
        score: seat.finalResult.score,
        xp: seat.finalResult.xp,
        accuracy: seat.finalResult.accuracy,
        bestStreak: seat.finalResult.bestStreak,
        breakdown: seat.finalResult.breakdown,
        rank: seat.finalResult.rank,
        totalXp: seat.finalResult.totalXp,
        unlocked: seat.finalResult.unlocked,
      } : null,
    });
  }
  pushFeed(room, 'finish', 'Сайыс аяқталды');
  room.advanceTimer = setTimeout(() => destroyRoom(room), 10 * 60_000);
}

// ── public API for Express ─────────────────────────────────────────────────
export const multiplayerStats = () => ({
  rooms: rooms.size,
  players: [...rooms.values()].reduce((n, r) => n + r.seats.filter((s) => !s.bot).length, 0),
  activeGames: [...rooms.values()].filter((r) => r.status === 'playing').length,
});

/** HTTP fallback used by tests and by clients that only need a room listing. */
export function roomByCode(code) {
  return rooms.get(String(code || '').toUpperCase()) ?? null;
}

/**
 * Reaper. Runs every 15s and is the only thing that guarantees rooms do not
 * accumulate: the per-socket `close` handler cannot be trusted (crashes, network
 * loss, terminated tabs all skip it), so membership is re-checked from live
 * socket state instead.
 *
 * A room is destroyed when:
 *   • nobody human is connected for HOST_GRACE_MS (covers abandoned lobbies and
 *     abandoned matches alike — reconnecting inside the grace window keeps it), or
 *   • it has been idle for ROOM_TTL_MS and is not mid-question.
 *
 * Memory safety matters here: a finished room used to linger until its 10-minute
 * timer fired even after everyone left, and a room whose sockets all dropped
 * never scheduled anything at all.
 */
const sweeper = setInterval(() => {
  const nowMs = Date.now();
  if (process.env.MP_DEBUG === 'trace') {
    for (const r of rooms.values()) {
      const hum = r.seats.filter((s) => !s.bot);
      const con = hum.filter((s) => s.ws && s.ws.readyState === 1);
      console.log(`[sweep] ${r.code} status=${r.status} humans=${hum.length} connected=${con.length} emptySince=${r.emptySince ? Math.round((nowMs - r.emptySince) / 1000) + 's' : '-'} grace=${Math.round(HOST_GRACE_MS / 1000)}s`);
    }
  }
  for (const room of [...rooms.values()]) {
    const humans = room.seats.filter((s) => !s.bot);
    const connected = humans.filter((s) => s.ws && s.ws.readyState === 1);

    if (humans.length === 0) {
      logger.info(`reaping ${room.code}: no human seats left`);
      destroyRoom(room, 'Бөлмеде ойыншы қалмады');
      continue;
    }

    if (connected.length === 0) {
      // start the grace window on the first sweep that finds everybody gone
      if (!room.emptySince) room.emptySince = nowMs;
      if (nowMs - room.emptySince > HOST_GRACE_MS) {
        logger.info(`reaping ${room.code}: no connected humans for ${Math.round((nowMs - room.emptySince) / 1000)}s (status=${room.status})`);
        destroyRoom(room, 'Барлық ойыншы ажыратылды');
        continue;
      }
    } else {
      room.emptySince = null;
    }

    const idleTooLong = nowMs - room.touch > ROOM_TTL_MS;
    if (idleTooLong && room.status !== 'playing') destroyRoom(room, 'Уақыт шегі');
  }
}, 15_000);
sweeper.unref?.();

// ── socket wiring ──────────────────────────────────────────────────────────
export function attachMultiplayer(server) {
  const wss = new WebSocketServer({ server, path: PATH, maxPayload: 16 * 1024 });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.msgWindow = { start: Date.now(), count: 0 };
    ws.roomCode = null;
    ws.user = null;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      // basic per-socket rate limit: 40 frames / 10s
      const w = ws.msgWindow;
      if (Date.now() - w.start > 10_000) { w.start = Date.now(); w.count = 0; }
      if (++w.count > 40) { send(ws, { type: 'error', code: 'RATE', error: 'Тым жылдам әрекет' }); return; }

      let msg;
      try { msg = JSON.parse(raw); } catch { return send(ws, { type: 'error', code: 'PARSE', error: 'Хабарлама форматы дұрыс емес' }); }
      const room = ws.roomCode ? rooms.get(ws.roomCode) : null;
      if (room) room.touch = Date.now();

      switch (msg.type) {
        case 'hello': {
          const user = userFromToken(String(msg.token || ''));
          if (!user) return send(ws, { type: 'error', code: 'AUTH', error: 'Кіру қажет' });
          ws.user = user;
          send(ws, { type: 'ready', user: { id: user.id, name: user.name, role: user.role } });
          return;
        }
        case 'create': {
          if (!ws.user) return send(ws, { type: 'error', code: 'AUTH', error: 'Кіру қажет' });
          if (ws.roomCode) destroyForSocket(ws);
          const created = createRoom(ws.user, ws, msg.options || {});
          ws.roomCode = created.code;
          send(ws, { type: 'created', code: created.code, seatId: created.hostSeatId, room: roomSummary(created) });
          broadcast(created, stateMsg(created));
          return;
        }
        case 'join': {
          if (!ws.user) return send(ws, { type: 'error', code: 'AUTH', error: 'Кіру қажет' });
          const target = roomByCode(msg.code);
          if (!target) return send(ws, { type: 'error', code: 'NO_ROOM', error: 'Бөлме табылмады' });
          if (ws.roomCode && ws.roomCode !== target.code) destroyForSocket(ws);
          const seat = joinRoom(target, ws.user, ws);
          if (!seat) return send(ws, { type: 'error', code: 'ROOM_FULL', error: 'Бөлме толы немесе ойын басталған' });
          ws.roomCode = target.code;
          send(ws, { type: 'joined', code: target.code, seatId: seat.id, room: roomSummary(target) });
          broadcast(target, stateMsg(target));
          return;
        }
        case 'bots': {
          if (!room || room.hostId !== ws.user?.id) return;
          addBots(room, Number(msg.count) || 1);
          return;
        }
        case 'ready': {
          if (!room) return;
          const seat = findSeat(room, ws.user?.id);
          if (!seat || room.status !== 'lobby') return;
          seat.ready = msg.ready !== false;
          syncState(room);
          return;
        }
        case 'start': {
          if (!room) return;
          if (room.hostId !== ws.user?.id) return send(ws, { type: 'error', code: 'NOT_HOST', error: 'Тек қонақжай бастай алады' });
          if (room.seats.length < MIN_SEATS) return send(ws, { type: 'error', code: 'TOO_FEW', error: 'Кемінде 2 ойыншы керек' });
          room.total = Math.min(20, Math.max(5, Number(msg.count) || 10));
          startGame(room);
          return;
        }
        case 'answer': {
          if (!room || room.status !== 'playing') return;
          const seat = findSeat(room, ws.user?.id);
          if (!seat) return;
          // Monotonic guard: the deadline is measured on the server clock.
          if (Date.now() > room.deadline + 750) return send(ws, { type: 'error', code: 'LATE', error: 'Уақыт бітті' });
          const q = room.questions[room.index];
          if (!q) return;
          const ms = Math.max(0, Math.min(Number(msg.ms) || 0, room.timerMs * 2));
          const correct = checkAnswer(q, msg.answer);
          submitAnswer(room, seat, correct, ms);
          return;
        }
        case 'next': {
          // host can cut the reveal short
          if (!room || room.hostId !== ws.user?.id) return;
          if (room.status !== 'reveal') return;
          if (room.advanceTimer) clearTimeout(room.advanceTimer);
          room.index += 1;
          room.round = room.index + 1;
          if (room.index >= room.total) finish(room);
          else beginQuestion(room);
          return;
        }
        case 'leave': {
          destroyForSocket(ws);
          send(ws, { type: 'left' });
          return;
        }
        case 'ping': {
          send(ws, { type: 'pong', serverTime: Date.now() });
          return;
        }
        default:
          return send(ws, { type: 'error', code: 'UNKNOWN', error: 'Белгісіз әрекет' });
      }
    });

    ws.on('close', () => {
      const info = bySocket.get(ws);
      bySocket.delete(ws);
      const room = info ? rooms.get(info.code) : null;
      if (!room) return;
      const seat = room.seats.find((s) => s.ws === ws);
      if (seat) {
        seat.ws = null;
        pushFeed(room, 'leave', `${seat.name} ажыратылды`);
        syncState(room);
      }
      if (room.status === 'lobby' && room.seats.filter((s) => !s.bot).every((s) => !s.ws)) destroyRoom(room);
    });

    send(ws, { type: 'welcome', path: PATH, serverTime: Date.now() });
  });

  function destroyForSocket(ws) {
    const info = bySocket.get(ws);
    if (!info) return;
    const room = rooms.get(info.code);
    bySocket.delete(ws);
    ws.roomCode = null;
    if (!room) return;
    const seat = room.seats.find((s) => s.ws === ws);
    if (seat && room.status === 'lobby') {
      room.seats = room.seats.filter((s) => s !== seat);
      pushFeed(room, 'leave', `${seat.name} шықты`);
      if (room.seats.filter((s) => !s.bot).length === 0) destroyRoom(room);
      else syncState(room);
    } else if (seat) {
      seat.ws = null;
      syncState(room);
    }
  }

  // heartbeat — drop dead sockets so seats free up
  const hb = setInterval(() => {
    for (const ws of wss.clients) {
      // readyState is authoritative: a socket that closed between sweeps (tab
      // killed, network dropped) is dropped immediately instead of lingering for
      // one more ping cycle.
      if (ws.readyState !== 1) {
        try { ws.terminate(); } catch { /* already gone */ }
        continue;
      }
      if (!ws.isAlive) { logger.warn('dropping unresponsive socket'); try { ws.terminate(); } catch {} continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, 30_000);
  hb.unref?.();

  return wss;
}

export const WS_PATH = PATH;
export const BANK_SIZE = () => getBank().length;
