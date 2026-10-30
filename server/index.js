/**
 * HISTORY GAME ARENA — API server
 * -------------------------------
 * Express + SQLite (better-sqlite3). Serves the compiled React client and the
 * JSON API. All scoring, question selection and answer validation happen here;
 * the browser never receives an answer key.
 */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { db, now, getSetting, setSetting, logSecurity } from './db.js';
import {
  hashPassword, verifyPassword, createSession, userFromToken, destroySession, publicUser,
  createUser, userByEmail, rateLimit, audit,
} from './auth.js';

import { GAMES, gameById } from '../shared/games.ts';
import { PERIODS } from '../shared/periods.ts';
import { HISTORICAL_EVENTS } from '../shared/events.ts';
import { PERSONS } from '../shared/persons.ts';
import { SOURCES } from '../shared/sources.ts';
import { ARTIFACTS } from '../shared/artifacts.ts';
import { KINGDOMS, HISTORICAL_ROUTES } from '../shared/kingdoms.ts';
import { CATEGORIES, FACTS } from '../shared/facts.ts';
import { drawQuestions, getBank, categoryTitle } from '../shared/question-gen.ts';
import { publicQuestion, checkAnswer } from '../shared/quiz-types.ts';
import { ACHIEVEMENTS, computeXp, rankFor } from '../shared/gamification.ts';
import { attachMultiplayer, multiplayerStats, roomByCode, WS_PATH } from './multiplayer.js';
import { finalizeSession, DIFF_MULT, evaluateAchievements } from './scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 8787);
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));

// A malformed or oversized body is a client error, not a server crash.
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Сұраныс денесі дұрыс JSON емес', code: 'BAD_JSON' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Сұраныс тым үлкен', code: 'PAYLOAD_TOO_LARGE' });
  }
  return next(err);
});

// Security headers. NOTE: no X-Frame-Options / restrictive frame-ancestors —
// the app is intentionally embeddable (sandbox preview panes).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self' ws: wss:; frame-ancestors *; base-uri 'self'; form-action 'self'",
  );
  next();
});

// ── helpers ─────────────────────────────────────────────────────────────────
const COOKIE = 'hga_session';

function readToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  const cookie = req.headers.cookie || '';
  const m = cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(res, req, token, maxAgeSec) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`,
  );
}

function attachUser(req, _res, next) {
  const token = readToken(req);
  req.user = token ? userFromToken(token) : null;
  req.token = token;
  next();
}
app.use(attachUser);

const requireAuth = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Кіру қажет', code: 'AUTH_REQUIRED' });
  next();
};
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Кіру қажет', code: 'AUTH_REQUIRED' });
  if (!roles.includes(req.user.role)) {
    audit(req, 'rbac_denied', `${req.method} ${req.originalUrl}`, req.user.id);
    return res.status(403).json({ error: 'Бұл әрекетке рұқсат жоқ', code: 'FORBIDDEN' });
  }
  next();
};

/**
 * Strip HTML/control characters from user-supplied copy and cap its length.
 * React escapes output anyway; this keeps stored data and exports clean.
 */
function sanitizeText(value, max) {
  return [...String(value ?? '')]
    .filter((ch) => ch.charCodeAt(0) >= 32 || ch === '\n')
    .join('')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const touch = (userId) => db.prepare('UPDATE users SET last_activity = ? WHERE id = ?').run(now(), userId);

function sessionRow(id, userId) {
  const s = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(id);
  if (!s) return null;
  if (userId && s.user_id !== userId) return null;
  return s;
}

function bankQuestion(id) {
  return getBank().find((q) => q.id === id) ?? null;
}

/** Questions created by an administrator, merged into the draw pool. */
function customQuestions(categories, formats) {
  const rows = db.prepare('SELECT * FROM custom_questions WHERE active = 1').all();
  return rows
    .filter((r) => (!categories?.length || categories.includes(r.category)))
    .filter((r) => (!formats?.length || formats.includes(r.format)))
    .map((r) => ({
      id: r.id,
      periodId: r.category,
      difficulty: r.difficulty,
      format: r.format,
      prompt: r.prompt,
      options: JSON.parse(r.options),
      explanation: r.explanation,
      sourceIds: [r.source_id],
      key: JSON.parse(r.answer_key),
    }));
}

function questionById(id) {
  return bankQuestion(id) ?? customQuestions().find((q) => q.id === id) ?? null;
}

// ── AUTH ────────────────────────────────────────────────────────────────────
app.get('/api/auth/providers', (_req, res) => {
  // Authentication is e-mail + password only. Google OAuth was removed at the
  // product owner's request: one account per learner, no third-party login.
  res.json({ password: true, passwordMinLength: 8 });
});

app.post('/api/auth/register', (req, res) => {
  if (getSetting('registration', 'on') === 'off') {
    return res.status(403).json({ error: 'Жаңа тіркелу әзірге жабық. Әкімшіге хабарласыңыз.', code: 'REGISTRATION_CLOSED' });
  }
  const ip = req.ip;
  if (!rateLimit(`reg:${ip}`, 10, 60_000)) return res.status(429).json({ error: 'Тым көп әрекет. Кейінірек қайталаңыз.' });
  const { name, email, password, group, school } = req.body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'Аты-жөні дұрыс емес' });
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) return res.status(400).json({ error: 'E-mail дұрыс емес' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'Құпия сөз кемінде 8 таңбадан тұрсын' });
  if (userByEmail(email)) return res.status(409).json({ error: 'Бұл e-mail тіркелген' });

  const user = createUser({ email, name, group: group || null, school: school || null });
  const { hash, salt, algo } = hashPassword(String(password));
  db.prepare('INSERT INTO credentials (user_id, password_hash, salt, algo) VALUES (?,?,?,?)').run(user.id, hash, salt, algo);
  const { token } = createSession(user.id, req.headers['user-agent']);
  setCookie(res, req, token, 14 * 86400);
  audit(req, 'register', user.email, user.id);
  res.status(201).json({ token, user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const ip = req.ip;
  if (!rateLimit(`login:${ip}`, 20, 60_000)) return res.status(429).json({ error: 'Тым көп әрекет. Кейінірек қайталаңыз.' });
  const { email, password } = req.body || {};
  const user = email ? userByEmail(String(email)) : null;
  const cred = user ? db.prepare('SELECT * FROM credentials WHERE user_id = ?').get(user.id) : null;
  const ok = Boolean(user && cred && verifyPassword(String(password || ''), cred));
  if (!ok) {
    logSecurity(user?.id ?? null, 'failed_login', String(email || ''), ip);
    return res.status(401).json({ error: 'E-mail немесе құпия сөз қате' });
  }
  if (user.disabled) return res.status(403).json({ error: 'Аккаунт бұғатталған' });
  const { token } = createSession(user.id, req.headers['user-agent']);
  setCookie(res, req, token, 14 * 86400);
  touch(user.id);
  audit(req, 'login', user.email, user.id);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  destroySession(req.token);
  setCookie(res, req, '', 0);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user) });
});


app.get('/api/content/bundle', (_req, res) => {
  res.json({
    periods: PERIODS,
    events: HISTORICAL_EVENTS,
    persons: PERSONS,
    sources: SOURCES,
    artifacts: ARTIFACTS,
    kingdoms: KINGDOMS,
    routes: HISTORICAL_ROUTES,
    categories: CATEGORIES,
    achievements: ACHIEVEMENTS.map(({ check, ...a }) => a),
    games: GAMES,
    stats: { questions: getBank().length, facts: FACTS.length, persons: PERSONS.length, events: HISTORICAL_EVENTS.length },
  });
});

// ── SESSION / GAMEPLAY ──────────────────────────────────────────────────────
app.post('/api/session/start', requireAuth, (req, res) => {
  if (!rateLimit(`start:${req.user.id}`, 120, 60_000)) return res.status(429).json({ error: 'Тым көп сұраныс' });
  const { gameId, level = 1, difficulty = 'medium', mode = 'solo', categories, count } = req.body || {};
  const game = gameById(gameId);
  if (!game) return res.status(400).json({ error: 'Ойын табылмады' });
  const lvl = Number(level);
  if (!Number.isInteger(lvl) || lvl < 1 || lvl > game.levels.length) return res.status(400).json({ error: 'Деңгей дұрыс емес' });
  const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
  const adminPerLevel = Number(getSetting('questions_per_level', '10')) || 10;
  const baseCount = count ? Number(count) : Math.max(game.questionsPerLevel, adminPerLevel);
  const n = Math.min(20, Math.max(5, baseCount));

  const levelDef = game.levels[lvl - 1];
  const cats = Array.isArray(categories) && categories.length ? categories : [levelDef.periodId];
  const seed = crypto.randomBytes(4).readUInt32BE(0);

  const drawn = drawQuestions({ count: n, categories: cats, seed });
  const customs = customQuestions(cats);
  const pool = [...drawn];
  // mix in admin-authored questions when available (never more than 20% of a set)
  const extra = customs.slice(0, Math.max(0, Math.min(3, Math.floor(n / 5))));
  for (let i = 0; i < extra.length; i++) pool[pool.length - 1 - i] = extra[i];

  const ids = [...new Set(pool.map((q) => q.id))];
  const sessionId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO game_sessions (id, user_id, game_id, level, difficulty, mode, question_ids, started_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(sessionId, req.user.id, game.id, lvl, diff, String(mode), JSON.stringify(ids), now());

  const ordered = ids.map((id) => questionById(id)).filter(Boolean);
  res.json({
    sessionId,
    game: { id: game.id, title: game.title, engine: game.engine },
    level: lvl,
    levelDef,
    difficulty: diff,
    mode,
    questions: ordered.map(publicQuestion),
    startedAt: now(),
  });
});

app.get('/api/session/:id', requireAuth, (req, res) => {
  const s = sessionRow(req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: 'Сессия табылмады' });
  const ids = JSON.parse(s.question_ids);
  const answered = JSON.parse(s.answers);
  res.json({
    id: s.id,
    gameId: s.game_id,
    level: s.level,
    status: s.status,
    currentIndex: s.current_index,
    correct: s.correct_count,
    wrong: s.wrong_count,
    answeredCount: answered.length,
    total: ids.length,
  });
});

app.post('/api/session/:id/answer', requireAuth, (req, res) => {
  // 900/min per USER: a 20-question session answered in bursts stays well under
  // this, while still stopping scripted flooding.
  if (!rateLimit(`ans:${req.user.id}`, 900, 60_000)) return res.status(429).json({ error: 'Тым көп сұраныс' });
  const s = sessionRow(req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: 'Сессия табылмады' });
  if (s.status !== 'active') return res.status(409).json({ error: 'Сессия аяқталған' });
  const { questionId, answer, ms } = req.body || {};
  const ids = JSON.parse(s.question_ids);
  const answered = JSON.parse(s.answers);
  if (!ids.includes(questionId)) return res.status(400).json({ error: 'Сұрақ бұл сессияға жатпайды' });
  if (answered.some((a) => a.qid === questionId)) return res.status(409).json({ error: 'Бұл сұраққа жауап берілді' });

  const q = questionById(questionId);
  if (!q) return res.status(404).json({ error: 'Сұрақ табылмады' });
  const correct = checkAnswer(q, answer);
  answered.push({ qid: questionId, correct, ms: Math.min(Number(ms) || 0, 600_000) });

  const correctCount = answered.filter((a) => a.correct).length;
  const wrongCount = answered.length - correctCount;
  let streak = 0;
  let best = 0;
  for (const a of answered) {
    if (a.correct) { streak += 1; best = Math.max(best, streak); } else streak = 0;
  }

  db.prepare('UPDATE game_sessions SET answers = ?, current_index = ?, correct_count = ?, wrong_count = ?, streak_best = ? WHERE id = ?')
    .run(JSON.stringify(answered), answered.length, correctCount, wrongCount, best, s.id);
  db.prepare(`INSERT INTO question_stats (question_id, attempts, correct) VALUES (?,1,?)
              ON CONFLICT(question_id) DO UPDATE SET attempts = attempts + 1, correct = correct + excluded.correct`)
    .run(questionId, correct ? 1 : 0);
  db.prepare('INSERT INTO answer_log (session_id, user_id, question_id, correct, answer, created_at) VALUES (?,?,?,?,?,?)')
    .run(s.id, req.user.id, questionId, correct ? 1 : 0, JSON.stringify(answer ?? null).slice(0, 500), now());

  res.json({
    correct,
    explanation: q.explanation,
    sourceIds: q.sourceIds,
    correctCount,
    wrongCount,
    streak,
    answeredCount: answered.length,
    total: ids.length,
  });
});

// finalizeSession / evaluateAchievements live in ./scoring.js (shared with the
// multiplayer engine). The HTTP wrapper keeps the same external contract.
app.post('/api/session/:id/complete', requireAuth, (req, res) => {
  const s = sessionRow(req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: 'Сессия табылмады' });
  const payload = finalizeSession(s, req.user.id, req.body?.baseScore, req.body?.durationSeconds);
  res.json(payload);
});

// ── PROFILE / LEADERBOARD ───────────────────────────────────────────────────
app.get('/api/me/profile', requireAuth, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const sessions = db.prepare(
    "SELECT * FROM game_sessions WHERE user_id = ? AND status = 'completed' ORDER BY finished_at DESC LIMIT 1000",
  ).all(u.id);
  const perGame = GAMES.map((g) => {
    const gs = sessions.filter((s) => s.game_id === g.id);
    const cleared = [...new Set(gs.map((s) => s.level))];
    return {
      gameId: g.id,
      title: g.title,
      played: gs.length,
      score: gs.reduce((a, s) => a + s.score, 0),
      bestLevel: cleared.length ? Math.max(...cleared) : 0,
      levelsCleared: cleared.length,
      levels: cleared.sort((a, b) => a - b),
      accuracy: gs.length
        ? Math.round((gs.reduce((a, s) => a + s.correct_count, 0) /
            Math.max(1, gs.reduce((a, s) => a + s.correct_count + s.wrong_count, 0))) * 100)
        : 0,
    };
  });
  const recent = sessions.slice(0, 8).map((s) => ({
    id: s.id,
    gameId: s.game_id,
    gameTitle: gameById(s.game_id)?.title ?? s.game_id,
    mode: s.mode,
    level: s.level,
    score: s.score,
    xp: s.xp,
    correct: s.correct_count,
    wrong: s.wrong_count,
    finishedAt: s.finished_at,
    duration: s.duration_seconds,
  }));
  const unlocked = db.prepare('SELECT achievement_id, unlocked_at FROM achievements_unlocked WHERE user_id = ?').all(u.id);
  const overall = u.correct + u.wrong;
  res.json({
    user: publicUser(u),
    rank: rankFor(u.xp),
    stats: {
      accuracy: overall ? Math.round((u.correct / overall) * 100) : 0,
      answers: overall,
      playMinutes: Math.round(u.play_seconds / 60),
      sessions: u.sessions_count,
      perfect: sessions.filter((s) => s.wrong_count === 0 && s.correct_count > 0).length,
    },
    perGame,
    recent,
    achievements: unlocked.map((a) => ({ ...a, ...ACHIEVEMENTS.find((x) => x.id === a.achievement_id) })),
  });
});

app.get('/api/leaderboard', (req, res) => {
  if (!req.user && getSetting('leaderboard_public', 'on') === 'off') {
    return res.status(403).json({ error: 'Рейтинг тек кірген пайдаланушыларға көрінеді' });
  }
  const gameId = req.query.game;
  const limit = Math.min(100, Number(req.query.limit) || 25);
  if (gameId) {
    const rows = db.prepare(
      `SELECT u.id, u.name, u.picture, u.group_name, MAX(r.score) AS best, COUNT(DISTINCT r.level) AS levels,
              SUM(r.score) AS total
       FROM student_results r JOIN users u ON u.id = r.user_id
       WHERE r.game_id = ? AND u.disabled = 0
       GROUP BY u.id ORDER BY best DESC, total DESC LIMIT ?`,
    ).all(gameId, limit);
    return res.json({
      scope: 'game',
      gameId,
      rows: rows.map((r, i) => ({ pos: i + 1, id: r.id, name: r.name, picture: r.picture, group: r.group_name, score: r.best, levels: r.levels })),
    });
  }
  const rows = db.prepare(
    `SELECT id, name, picture, group_name, xp, total_score, correct, wrong, sessions_count
     FROM users WHERE disabled = 0 AND sessions_count > 0 ORDER BY xp DESC, total_score DESC LIMIT ?`,
  ).all(limit);
  res.json({
    scope: 'global',
    rows: rows.map((r, i) => ({
      pos: i + 1, id: r.id, name: r.name, picture: r.picture, group: r.group_name,
      xp: r.xp, score: r.total_score,
      accuracy: r.correct + r.wrong ? Math.round((r.correct / (r.correct + r.wrong)) * 100) : 0,
      rank: rankFor(r.xp).title,
      sessions: r.sessions_count,
    })),
  });
});

/** Daily challenge: deterministic set per calendar day, same for everybody. */
app.get('/api/challenges/daily', (req, res) => {
  const day = new Date().toISOString().slice(0, 10);
  const seed = Number(day.replace(/-/g, '')) % 100000;
  const qs = drawQuestions({ count: 5, seed });
  const mine = req.user
    ? db.prepare("SELECT * FROM game_sessions WHERE user_id = ? AND game_id = 'daily' AND started_at LIKE ?").get(req.user.id, `${day}%`)
    : null;
  res.json({
    day,
    title: 'Күнделікті тарихи сынақ',
    description: 'Бүгінгі 5 сұраққа жауап беріңіз. Барлық қатысушыға бірдей сұрақтар беріледі.',
    questions: qs.map(publicQuestion),
    answered: Boolean(mine),
  });
});

app.get('/api/challenges/weekly', (_req, res) => {
  const nowD = new Date();
  const week = Math.ceil(((nowD - new Date(nowD.getFullYear(), 0, 1)) / 86400000 + 1) / 7);
  const seed = nowD.getFullYear() * 100 + week;
  const qs = drawQuestions({ count: 10, seed });
  res.json({
    week: `${nowD.getFullYear()}-W${week}`,
    title: 'Апталық шежіре сынағы',
    description: 'Апта бойына 10 сұрақ. Барлық сегіз кезеңді қамтиды.',
    questionCount: qs.length,
    categories: [...new Set(qs.map((q) => categoryTitle(q.periodId)))],
  });
});

// ── TEACHER ─────────────────────────────────────────────────────────────────
app.get('/api/teacher/students', requireRole('teacher', 'admin'), (req, res) => {
  const search = String(req.query.search || '').trim();
  const group = String(req.query.group || '').trim();
  let sql = `SELECT u.id, u.name, u.email, u.group_name, u.school, u.xp, u.total_score, u.correct, u.wrong,
                    u.sessions_count, u.play_seconds, u.last_activity, u.created_at, u.disabled
             FROM users u WHERE u.role = 'student'`;
  const params = [];
  if (search) { sql += ' AND (lower(u.name) LIKE ? OR lower(u.email) LIKE ?)'; params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`); }
  if (group) { sql += ' AND u.group_name = ?'; params.push(group); }
  sql += ' ORDER BY u.xp DESC';
  const rows = db.prepare(sql).all(...params);
  const groups = db.prepare("SELECT DISTINCT group_name FROM users WHERE group_name IS NOT NULL AND group_name != ''").all().map((r) => r.group_name);
  res.json({
    groups,
    students: rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, group: r.group_name, school: r.school,
      xp: r.xp, score: r.total_score,
      accuracy: r.correct + r.wrong ? Math.round((r.correct / (r.correct + r.wrong)) * 100) : 0,
      answers: r.correct + r.wrong,
      sessions: r.sessions_count,
      playMinutes: Math.round(r.play_seconds / 60),
      lastActivity: r.last_activity,
      disabled: Boolean(r.disabled),
      rank: rankFor(r.xp).title,
    })),
  });
});

app.get('/api/teacher/student/:id', requireRole('teacher', 'admin'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Оқушы табылмады' });
  const results = db.prepare('SELECT * FROM student_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 200').all(u.id);
  const perGame = {};
  for (const r of results) {
    perGame[r.game_id] ??= { scores: [], correct: 0, wrong: 0, levels: new Set() };
    perGame[r.game_id].scores.push(r.score);
    perGame[r.game_id].correct += r.correct;
    perGame[r.game_id].wrong += r.wrong;
    perGame[r.game_id].levels.add(r.level);
  }
  res.json({
    student: publicUser(u),
    rank: rankFor(u.xp),
    results,
    perGame: Object.entries(perGame).map(([gid, v]) => ({
      gameId: gid,
      title: gameById(gid)?.title ?? gid,
      best: Math.max(...v.scores),
      average: Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length),
      attempts: v.scores.length,
      levels: [...v.levels].sort((a, b) => a - b),
      accuracy: Math.round((v.correct / Math.max(1, v.correct + v.wrong)) * 100),
    })),
  });
});

app.get('/api/teacher/overview', requireRole('teacher', 'admin'), (_req, res) => {
  const students = db.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get().c;
  const results = db.prepare('SELECT COUNT(*) c FROM student_results').get().c;
  const avg = db.prepare('SELECT AVG(score) a, AVG(accuracy) acc FROM student_results').get();
  const byGame = db.prepare(
    `SELECT game_id, COUNT(*) attempts, AVG(score) avg_score, AVG(accuracy) avg_acc
     FROM student_results GROUP BY game_id ORDER BY attempts DESC`,
  ).all();
  const byLevel = db.prepare(
    `SELECT game_id, level, COUNT(*) attempts, AVG(score) avg_score FROM student_results
     GROUP BY game_id, level ORDER BY game_id, level`,
  ).all();
  const activity = db.prepare(
    `SELECT substr(created_at,1,10) day, COUNT(*) sessions FROM student_results
     GROUP BY day ORDER BY day DESC LIMIT 14`,
  ).all().reverse();
  res.json({
    students,
    results,
    avgScore: Math.round(avg.a ?? 0),
    avgAccuracy: Math.round((avg.acc ?? 0) * 100),
    byGame: byGame.map((r) => ({ ...r, title: gameById(r.game_id)?.title ?? r.game_id, avg_score: Math.round(r.avg_score), avg_acc: Math.round(r.avg_acc * 100) })),
    byLevel,
    activity,
  });
});

app.get('/api/teacher/questions', requireRole('teacher', 'admin'), (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 40);
  const hardest = db.prepare(
    `SELECT q.question_id, q.attempts, q.correct FROM question_stats q
     WHERE q.attempts >= 1 ORDER BY (CAST(q.correct AS REAL)/q.attempts) ASC, q.attempts DESC LIMIT ?`,
  ).all(limit);
  const rows = hardest.map((r) => {
    const q = questionById(r.question_id);
    return {
      questionId: r.question_id,
      attempts: r.attempts,
      correctRate: Math.round((r.correct / r.attempts) * 100),
      format: q?.format ?? null,
      category: q ? categoryTitle(q.periodId) : null,
      prompt: q?.prompt ?? '—',
    };
  });
  const byFormat = db.prepare('SELECT COUNT(*) c FROM question_stats').get().c;
  res.json({ hardest: rows, trackedQuestions: byFormat, bankSize: getBank().length });
});

app.get('/api/teacher/export.csv', requireRole('teacher', 'admin'), (_req, res) => {
  const rows = db.prepare(
    `SELECT u.name, u.email, u.group_name, u.xp, u.total_score, u.correct, u.wrong, u.sessions_count,
            u.play_seconds, u.last_activity FROM users u WHERE u.role='student' ORDER BY u.xp DESC`,
  ).all();
  const results = db.prepare('SELECT * FROM student_results ORDER BY created_at DESC').all();
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [];
  lines.push('=== ОҚУШЫЛАР ЖИЫНТЫҒЫ ===');
  lines.push(['Аты-жөні', 'E-mail', 'Топ', 'XP', 'Жалпы ұпай', 'Дұрыс', 'Қате', 'Сессия', 'Ойын уақыты (мин)', 'Соңғы белсенділік'].map(esc).join(','));
  for (const r of rows) {
    lines.push([r.name, r.email, r.group_name, r.xp, r.total_score, r.correct, r.wrong, r.sessions_count,
      Math.round(r.play_seconds / 60), r.last_activity].map(esc).join(','));
  }
  lines.push('');
  lines.push('=== ОЙЫН НӘТИЖЕЛЕРІ ===');
  lines.push(['Күні', 'Оқушы ID', 'Ойын', 'Деңгей', 'Ұпай', 'XP', 'Дұрыс', 'Қате', 'Дәлдік', 'Ұзақтық (сек)'].map(esc).join(','));
  for (const r of results) {
    lines.push([r.created_at, r.user_id, r.game_id, r.level, r.score, r.xp, r.correct, r.wrong,
      Math.round(r.accuracy * 100) + '%', r.duration_seconds].map(esc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="history-arena-results-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('\uFEFF' + lines.join('\r\n'));
});

// ── ADMIN ───────────────────────────────────────────────────────────────────
app.get('/api/admin/users', requireRole('admin'), (req, res) => {
  const search = String(req.query.search || '').trim();
  let sql = `SELECT id, name, email, role, group_name, school, xp, total_score, sessions_count, created_at, last_activity, disabled
             FROM users`;
  const params = [];
  if (search) { sql += ' WHERE lower(name) LIKE ? OR lower(email) LIKE ?'; params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`); }
  sql += ' ORDER BY created_at DESC';
  const users = db.prepare(sql).all(...params);
  res.json({
    users: users.map((u) => ({ ...u, disabled: Boolean(u.disabled) })),
    totals: {
      all: db.prepare('SELECT COUNT(*) c FROM users').get().c,
      students: db.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get().c,
      teachers: db.prepare("SELECT COUNT(*) c FROM users WHERE role='teacher'").get().c,
      admins: db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c,
    },
  });
});

app.patch('/api/admin/users/:id', requireRole('admin'), (req, res) => {
  const { role, disabled, group } = req.body || {};
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Пайдаланушы табылмады' });
  if (target.id === req.user.id && role && role !== 'admin') {
    return res.status(400).json({ error: 'Өз рөліңізді төмендете алмайсыз' });
  }
  if (role !== undefined) {
    if (!['student', 'teacher', 'admin'].includes(role)) return res.status(400).json({ error: 'Рөл дұрыс емес' });
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, target.id);
    audit(req, 'role_change', `${target.email} → ${role}`, req.user.id);
  }
  if (disabled !== undefined) {
    db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, target.id);
    if (disabled) db.prepare('DELETE FROM sessions_auth WHERE user_id = ?').run(target.id);
    audit(req, disabled ? 'user_disabled' : 'user_enabled', target.email, req.user.id);
  }
  if (group !== undefined) db.prepare('UPDATE users SET group_name = ? WHERE id = ?').run(group || null, target.id);
  res.json({ ok: true, user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)) });
});

app.get('/api/admin/security-log', requireRole('admin'), (_req, res) => {
  res.json({
    log: db.prepare('SELECT * FROM security_log ORDER BY id DESC LIMIT 200').all(),
    stats: {
      failedLogins: db.prepare("SELECT COUNT(*) c FROM security_log WHERE event='failed_login'").get().c,
      rbacDenied: db.prepare("SELECT COUNT(*) c FROM security_log WHERE event='rbac_denied'").get().c,
      rateLimits: db.prepare("SELECT COUNT(*) c FROM security_log WHERE event='rate_limit'").get().c,
    },
  });
});

app.get('/api/admin/questions', requireRole('admin'), (req, res) => {
  const search = String(req.query.search || '').toLowerCase();
  const bank = getBank();
  const filtered = search
    ? bank.filter((q) => q.prompt.toLowerCase().includes(search) || q.id.includes(search))
    : bank;
  res.json({
    total: bank.length,
    shown: Math.min(60, filtered.length),
    questions: filtered.slice(0, 60).map((q) => ({
      id: q.id, format: q.format, difficulty: q.difficulty, category: categoryTitle(q.periodId),
      prompt: q.prompt, options: q.options?.map((o) => o.text) ?? null,
      answerIndexes: q.key.type === 'index' ? q.key.value : null, explanation: q.explanation,
    })),
    custom: db.prepare('SELECT * FROM custom_questions ORDER BY created_at DESC').all(),
  });
});

app.post('/api/admin/questions', requireRole('admin'), (req, res) => {
  const { category, difficulty = 2, format = 'mcq', prompt, options, answerIndex, explanation, sourceId = 'ehistory' } = req.body || {};
  if (!category || !prompt || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Санат, сұрақ мәтіні және кемінде 2 нұсқа қажет' });
  }
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
    return res.status(400).json({ error: 'Дұрыс жауап индексі дұрыс емес' });
  }
  if (!explanation || explanation.length < 10) return res.status(400).json({ error: 'Түсіндірме міндетті' });
  // Admin text is stored, displayed and exported, so strip markup and cap length
  // here rather than trusting any downstream consumer to escape it.
  const cleanPrompt = sanitizeText(prompt, 400);
  const cleanExplanation = sanitizeText(explanation, 800);
  const cleanOptions = options.map((o) => sanitizeText(o, 200));
  if (!cleanPrompt || cleanExplanation.length < 10 || cleanOptions.some((o) => !o)) {
    return res.status(400).json({ error: 'Мәтінде рұқсат етілмеген таңбалар бар' });
  }
  if (!['mcq', 'truefalse', 'fill-blank', 'multi-select'].includes(format)) {
    return res.status(400).json({ error: 'Бұл формат қолдау көрсетілмейді' });
  }
  const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
  db.prepare(
    `INSERT INTO custom_questions (id, category, difficulty, format, prompt, options, answer_key, explanation, source_id, created_by, created_at, active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
  ).run(id, category, Number(difficulty), format, cleanPrompt, JSON.stringify(cleanOptions.map((t, i) => ({ id: String(i), text: t }))),
    JSON.stringify({ type: 'index', value: [answerIndex] }), cleanExplanation, sourceId, req.user.id, now());
  audit(req, 'question_created', id, req.user.id);
  res.status(201).json({ ok: true, id });
});

app.patch('/api/admin/questions/:id', requireRole('admin'), (req, res) => {
  const q = db.prepare('SELECT * FROM custom_questions WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Сұрақ табылмады' });
  const { active, prompt, explanation } = req.body || {};
  if (active !== undefined) db.prepare('UPDATE custom_questions SET active = ? WHERE id = ?').run(active ? 1 : 0, q.id);
  if (prompt) db.prepare('UPDATE custom_questions SET prompt = ? WHERE id = ?').run(prompt, q.id);
  if (explanation) db.prepare('UPDATE custom_questions SET explanation = ? WHERE id = ?').run(explanation, q.id);
  audit(req, 'question_updated', q.id, req.user.id);
  res.json({ ok: true });
});

app.get('/api/admin/settings', requireRole('admin'), (_req, res) => {
  res.json({
    settings: {
      dailyChallenge: getSetting('daily_challenge', 'on'),
      weeklyChallenge: getSetting('weekly_challenge', 'on'),
      registration: getSetting('registration', 'on'),
      leaderboardPublic: getSetting('leaderboard_public', 'on'),
      questionsPerLevel: getSetting('questions_per_level', '10'),
    },
  });
});

app.patch('/api/admin/settings', requireRole('admin'), (req, res) => {
  const allowed = ['dailyChallenge', 'weeklyChallenge', 'registration', 'leaderboardPublic', 'questionsPerLevel'];
  const map = {
    dailyChallenge: 'daily_challenge', weeklyChallenge: 'weekly_challenge', registration: 'registration',
    leaderboardPublic: 'leaderboard_public', questionsPerLevel: 'questions_per_level',
  };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) setSetting(map[k], v);
  }
  audit(req, 'settings_updated', JSON.stringify(req.body), req.user.id);
  res.json({ ok: true });
});

app.get('/api/admin/content-stats', requireRole('admin'), (_req, res) => {
  const bank = getBank();
  const byCat = {};
  for (const q of bank) byCat[q.periodId] = (byCat[q.periodId] ?? 0) + 1;
  res.json({
    facts: FACTS.length, questions: bank.length, persons: PERSONS.length, events: HISTORICAL_EVENTS.length,
    sources: SOURCES.length, periods: PERIODS.length, kingdoms: KINGDOMS.length, artifacts: ARTIFACTS.length,
    byCategory: Object.entries(byCat).map(([id, count]) => ({ id, title: categoryTitle(id), count })),
  });
});

// ── MULTIPLAYER INFO ────────────────────────────────────────────────────────
app.get('/api/multiplayer/status', (_req, res) => {
  res.json({ ok: true, path: WS_PATH, ...multiplayerStats() });
});

app.get('/api/multiplayer/room/:code', (req, res) => {
  const room = roomByCode(req.params.code);
  if (!room) return res.status(404).json({ error: 'Бөлме табылмады', code: 'NO_ROOM' });
  res.json({
    code: room.code,
    status: room.status,
    players: room.seats.length,
    maxPlayers: 8,
    teamMode: room.teamMode,
  });
});

// ── HEALTH ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: '1.0.0',
    time: now(),
    multiplayer: multiplayerStats(),
    bank: getBank().length,
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    sessions: db.prepare('SELECT COUNT(*) c FROM game_sessions').get().c,
  });
});

// ── STATIC CLIENT ───────────────────────────────────────────────────────────
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: isProd ? '1h' : 0 }));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res
      .status(200)
      .type('html')
      .send('<h1>HISTORY GAME ARENA</h1><p>Клиент жиналмаған. <code>npm run build</code> орындаңыз немесе <code>npm run dev</code> үшін Vite қосыңыз.</p>'),
  );
}

// error handler
app.use((err, _req, res, _next) => {
  console.error('[api error]', err.message);
  res.status(500).json({ error: 'Серверде қате орын алды', code: 'INTERNAL' });
});

// First boot convenience: create the demo accounts so the platform is usable
// immediately. Set SEED_ON_BOOT=off to disable.
if (process.env.SEED_ON_BOOT !== 'off' && db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
  const { seed } = await import('./seed.js');
  const info = seed();
  console.log('first boot seed:', info);
}

const httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`HISTORY GAME ARENA API → http://0.0.0.0:${PORT}  (env: ${isProd ? 'production' : 'development'})`);
  console.log(`question bank: ${getBank().length} • multiplayer: ws ${WS_PATH} • auth: e-mail + password`);
});

// Real-time multiplayer («Тарих майданы» онлайн режимі) rides on the same server.
attachMultiplayer(httpServer);

export { httpServer, app };
