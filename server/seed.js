/**
 * Demo seed. Creates one account per role plus a small class of students with
 * plausible (synthetic) results so the leaderboard, teacher dashboard and
 * analytics can be inspected immediately.
 *
 * Demo credentials (CHANGE THEM BEFORE ANY REAL DEPLOYMENT):
 *   admin@arena.kz     / Admin12345!
 *   teacher@arena.kz   / Teacher12345!
 *   student@arena.kz   / Student12345!
 */
import crypto from 'node:crypto';
import { db, now } from './db.js';
import { hashPassword } from './auth.js';
import { GAMES } from '../shared/games.ts';
import { getBank } from '../shared/question-gen.ts';
import { computeXp } from '../shared/gamification.ts';
import { ACHIEVEMENTS } from '../shared/gamification.ts';

function makeUser({ name, email, password, role, group = null, school = null }) {
  const existing = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
  if (existing) return existing;
  const id = crypto.randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO users (id, email, name, role, group_name, school, created_at, last_activity)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(id, email.toLowerCase(), name, role, group, school, ts, ts);
  if (password) {
    const { hash, salt, algo } = hashPassword(password);
    db.prepare('INSERT INTO credentials (user_id, password_hash, salt, algo) VALUES (?,?,?,?)').run(id, hash, salt, algo);
  }
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function seed({ force = false } = {}) {
  const already = db.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get().c;
  const admin = makeUser({ name: 'Әкімші', email: 'admin@arena.kz', password: 'Admin12345!', role: 'admin', school: 'History Game Arena' });
  const teacher = makeUser({ name: 'Айгүл Мұғалім', email: 'teacher@arena.kz', password: 'Teacher12345!', role: 'teacher', group: '10-А', school: '№1 мектеп-лицей' });
  makeUser({ name: 'Демо Оқушы', email: 'student@arena.kz', password: 'Student12345!', role: 'student', group: '10-А', school: '№1 мектеп-лицей' });

  if (already > 0 && !force) return { seeded: false, admin, teacher };

  const names = [
    ['Айсұлтан Нұрланұлы', '10-А'], ['Мадина Сәрсенова', '10-А'], ['Ерасыл Қуаныш', '10-А'],
    ['Аружан Бекболат', '10-Б'], ['Данияр Оспанов', '10-Б'], ['Інжу Тәжібай', '10-Б'],
    ['Нұрәли Ахмет', '11-А'], ['Аяулым Жақсылық', '11-А'], ['Санжар Төлеген', '11-А'],
    ['Мерей Балғабай', '11-Б'], ['Абылай Серік', '11-Б'], ['Томирис Әлімова', '11-Б'],
  ];

  const bank = getBank();
  const results = [];

  for (const [name, group] of names) {
    const email = `${name.split(' ')[0].toLowerCase().replace(/[әӘ]/g, 'a').replace(/[ұҰүҮ]/g, 'u').replace(/[қҚ]/g, 'q')}${crypto.randomInt(100, 999)}@student.arena.kz`;
    const u = makeUser({ name, email, password: 'Student12345!', role: 'student', group, school: '№1 мектеп-лицей' });
    const sessionCount = crypto.randomInt(3, 22);
    let xp = 0, totalScore = 0, correct = 0, wrong = 0, playSec = 0;
    for (let i = 0; i < sessionCount; i++) {
      const game = GAMES[crypto.randomInt(0, GAMES.length)];
      const level = crypto.randomInt(1, Math.min(10, game.levels.length) + 1);
      const n = game.questionsPerLevel;
      const acc = 0.45 + Math.random() * 0.5;
      const c = Math.round(n * acc);
      const w = n - c;
      const score = Math.round(c * 100 + c * 15 + 60);
      const sx = computeXp(score, c, Math.min(c, 4));
      const dur = 180 + crypto.randomInt(0, 900);
      const sid = crypto.randomUUID();
      const started = new Date(Date.now() - crypto.randomInt(1, 40) * 86400000).toISOString();
      const finished = new Date(new Date(started).getTime() + dur * 1000).toISOString();
      db.prepare(
        `INSERT INTO game_sessions (id, user_id, game_id, level, question_ids, answers, current_index, correct_count, wrong_count,
         streak_best, score, xp, status, started_at, finished_at, duration_seconds)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(sid, u.id, game.id, level,
        JSON.stringify(bank.slice(0, n).map((q) => q.id)),
        JSON.stringify(bank.slice(0, n).map((q, idx) => ({ qid: q.id, correct: idx < c, ms: 4000 }))),
        n, c, w, Math.min(c, 5), score, sx, 'completed', started, finished, dur);
      db.prepare(
        `INSERT INTO student_results (session_id, user_id, game_id, level, score, xp, correct, wrong, accuracy, duration_seconds, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(sid, u.id, game.id, level, score, sx, c, w, c / n, dur, finished);
      xp += sx; totalScore += score; correct += c; wrong += w; playSec += dur;
      results.push({ sid, gameId: game.id });
    }
    db.prepare(
      `UPDATE users SET xp=?, total_score=?, correct=?, wrong=?, play_seconds=?, sessions_count=?, streak_best=?,
       last_activity=? WHERE id=?`,
    ).run(xp, totalScore, correct, wrong, playSec, sessionCount, crypto.randomInt(3, 12), now(), u.id);

    // achievements for demo students
    const stats = {
      totalXp: xp, totalScore, correct, wrong, sessions: sessionCount, perfectSessions: Math.round(sessionCount / 6),
      streakBest: crypto.randomInt(3, 12), gamesPlayed: [], levelsCleared: sessionCount, distinctGames: 6,
    };
    for (const a of ACHIEVEMENTS) {
      if (a.check(stats)) {
        db.prepare('INSERT OR IGNORE INTO achievements_unlocked (user_id, achievement_id, unlocked_at) VALUES (?,?,?)').run(u.id, a.id, now());
      }
    }
  }

  // a few question statistics so the "hard questions" report has content
  for (const q of bank.slice(0, 60)) {
    const attempts = crypto.randomInt(4, 40);
    const correctN = Math.round(attempts * (0.25 + Math.random() * 0.65));
    db.prepare('INSERT OR IGNORE INTO question_stats (question_id, attempts, correct) VALUES (?,?,?)').run(q.id, attempts, correctN);
  }

  return { seeded: true, admin: admin.email, teacher: teacher.email, students: names.length };
}
