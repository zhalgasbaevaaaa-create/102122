/**
 * Authentication — e-mail + password only.
 *
 * scrypt (N=2^14) with a per-user 32-byte random salt. Passwords are never
 * stored or logged in plaintext. There is no third-party identity provider
 * (Google OAuth was removed at the product owner's request), so no external
 * credential has to be configured.
 *
 * Sessions: 32 random bytes, stored as a SHA-256 hash; the raw token lives only
 * in the browser (httpOnly cookie + Authorization header for the SPA).
 */
import crypto from 'node:crypto';
import { db, now, logSecurity } from './db.js';

const SCRYPT_N = 16384; // 2^14, keeps login < 100ms on mobile while remaining strong
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN = 64;

export function hashPassword(password, salt = crypto.randomBytes(32).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p }).toString('hex');
  return { hash, salt, algo: `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}` };
}

export function verifyPassword(password, stored) {
  const [algo, n, r, p] = stored.algo.split('$');
  if (algo !== 'scrypt') return false;
  const hash = crypto
    .scryptSync(password, stored.salt, KEYLEN, { N: Number(n), r: Number(r), p: Number(p) })
    .toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(stored.password_hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function createSession(userId, userAgent) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  db.prepare('INSERT INTO sessions_auth (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)').run(
    hashToken(token),
    userId,
    now(),
    expires,
    userAgent ?? null,
  );
  return { token, expires };
}

export function userFromToken(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.token_hash, s.expires_at, u.* FROM sessions_auth s
       JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .get(hashToken(token));
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions_auth WHERE token_hash = ?').run(row.token_hash);
    return null;
  }
  if (row.disabled) return null;
  return row;
}

export function destroySession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions_auth WHERE token_hash = ?').run(hashToken(token));
}

export const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  picture: u.picture,
  role: u.role,
  group: u.group_name,
  school: u.school,
  xp: u.xp,
  totalScore: u.total_score,
  correct: u.correct,
  wrong: u.wrong,
  streakBest: u.streak_best,
  playSeconds: u.play_seconds,
  sessions: u.sessions_count,
  createdAt: u.created_at,
  lastActivity: u.last_activity,
});

export function createUser({ email, name, picture = null, role = 'student', group = null, school = null }) {
  const id = crypto.randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO users (id, google_sub, email, name, picture, role, group_name, school, created_at, last_activity)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, null, email.toLowerCase().trim(), name.trim(), picture, role, group, school, ts, ts);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function userByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email.trim());
}

/** Simple in-memory rate limiter (per IP + route). */
const buckets = new Map();
export function rateLimit(key, max = 20, windowMs = 60_000) {
  const nowMs = Date.now();
  const b = buckets.get(key);
  if (!b || nowMs > b.reset) {
    buckets.set(key, { count: 1, reset: nowMs + windowMs });
    return true;
  }
  b.count += 1;
  if (b.count > max) {
    logSecurity(null, 'rate_limit', key, null);
    return false;
  }
  return true;
}

export function audit(req, event, detail, userId = null) {
  logSecurity(userId, event, detail, req.ip);
}
