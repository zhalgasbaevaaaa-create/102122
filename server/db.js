/**
 * SQLite persistence layer.
 *
 * Schema mirrors the collection design requested for Firestore (users, games,
 * questions, game_sessions, student_results, achievements, leaderboards,
 * historical_events, historical_personalities, historical_sources) so the data
 * can be migrated 1:1 to a managed backend later (see docs/DATABASE.md).
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'arena.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE, -- legacy, unused: Google sign-in was removed
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  picture TEXT,
  role TEXT NOT NULL DEFAULT 'student',            -- student | teacher | admin
  group_name TEXT,
  school TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  wrong INTEGER NOT NULL DEFAULT 0,
  streak_best INTEGER NOT NULL DEFAULT 0,
  play_seconds INTEGER NOT NULL DEFAULT 0,
  sessions_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_activity TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  algo TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions_auth (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);

-- one row per in-progress or finished game level attempt
CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  mode TEXT NOT NULL DEFAULT 'solo',
  question_ids TEXT NOT NULL,           -- JSON array, order matters
  answers TEXT NOT NULL DEFAULT '[]',   -- JSON array of {qid, correct, ms}
  current_index INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  streak_best INTEGER NOT NULL DEFAULT 0,
  base_score INTEGER NOT NULL DEFAULT 0,   -- gameplay score reported by the engine (capped)
  score INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',  -- active | completed | abandoned
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS student_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  score INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  wrong INTEGER NOT NULL,
  accuracy REAL NOT NULL,
  duration_seconds INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS achievements_unlocked (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS question_stats (
  question_id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS answer_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS security_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  event TEXT NOT NULL,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- questions authored through the administrator dashboard
CREATE TABLE IF NOT EXISTS custom_questions (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 2,
  format TEXT NOT NULL DEFAULT 'mcq',
  prompt TEXT NOT NULL,
  options TEXT NOT NULL,
  answer_key TEXT NOT NULL,
  explanation TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT 'ehistory',
  created_by TEXT,
  created_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON game_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_results_game ON student_results(game_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_users_score ON users(total_score DESC);
`);

export const now = () => new Date().toISOString();

export function logSecurity(userId, event, detail, ip) {
  db.prepare('INSERT INTO security_log (user_id, event, detail, ip, created_at) VALUES (?,?,?,?,?)').run(
    userId ?? null,
    event,
    detail ?? null,
    ip ?? null,
    now(),
  );
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    String(value),
  );
}
