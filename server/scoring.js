/**
 * Server-side scoring & achievement evaluation.
 *
 * Lives in its own module so both the HTTP API and the multiplayer engine use
 * exactly the same rules without importing each other (that circular import
 * used to break module initialisation).
 *
 * The client NEVER decides a final score: `baseScore` is only a bounded input
 * (clamped to questions x 120 and halved), every answer is re-counted from the
 * rows the server itself wrote.
 */
import { db, now } from './db.js';
import { ACHIEVEMENTS, computeXp, rankFor } from '../shared/gamification.ts';

export const DIFF_MULT = { easy: 0.8, medium: 1, hard: 1.3 };

/**
 * Finalises a game session: recomputes the score from the answers the SERVER
 * recorded, awards XP, writes student_results and unlocks achievements.
 * Shared by the HTTP endpoint and the multiplayer engine so both paths use
 * exactly the same validation. Returns the response payload (or null).
 */
export function finalizeSession(s, userId, baseScoreInput, durationInput) {
  if (!s) return null;
  if (s.status === 'completed') {
    return { alreadyCompleted: true, result: db.prepare('SELECT * FROM student_results WHERE session_id = ?').get(s.id) };
  }
  const ids = JSON.parse(s.question_ids);
  const answered = JSON.parse(s.answers);
  const correct = answered.filter((a) => a.correct).length;
  const wrong = answered.length - correct;
  let streak = 0;
  let best = 0;
  for (const a of answered) {
    if (a.correct) { streak += 1; best = Math.max(best, streak); } else streak = 0;
  }

  // ── server-side score: the client's gameplay score is only a bounded input ──
  const mult = DIFF_MULT[s.difficulty] ?? 1;
  const answerScore = correct * 100 * mult + best * 15;
  const rawGameplay = Math.max(0, Math.min(Number(baseScoreInput) || 0, ids.length * 120));
  const gameplayScore = Math.round(rawGameplay * 0.5);
  const completionBonus = answered.length === ids.length ? 60 : 0;
  const score = Math.round(answerScore + gameplayScore + completionBonus);

  const duration = Math.max(0, Math.min(Number(durationInput) || 0, 7200));
  const xp = computeXp(score, correct, best);
  const finishedAt = now();

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE game_sessions SET status='completed', score=?, xp=?, correct_count=?, wrong_count=?, streak_best=?,
       base_score=?, duration_seconds=?, finished_at=? WHERE id=?`,
    ).run(score, xp, correct, wrong, best, gameplayScore, duration, finishedAt, s.id);

    db.prepare(
      `INSERT INTO student_results (session_id, user_id, game_id, level, score, xp, correct, wrong, accuracy, duration_seconds, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(s.id, userId, s.game_id, s.level, score, xp, correct, wrong,
      answered.length ? correct / answered.length : 0, duration, finishedAt);

    db.prepare(
      `UPDATE users SET xp = xp + ?, total_score = total_score + ?, correct = correct + ?, wrong = wrong + ?,
       streak_best = MAX(streak_best, ?), play_seconds = play_seconds + ?, sessions_count = sessions_count + 1,
       last_activity = ? WHERE id = ?`,
    ).run(xp, score, correct, wrong, best, duration, finishedAt, userId);
  });
  tx();

  const unlocked = evaluateAchievements(userId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return {
    score,
    xp,
    correct,
    wrong,
    accuracy: answered.length ? Math.round((correct / answered.length) * 100) : 0,
    bestStreak: best,
    breakdown: { answerScore: Math.round(answerScore), gameplayScore, completionBonus },
    rank: rankFor(user.xp),
    totalXp: user.xp,
    unlocked,
  };
}

export function evaluateAchievements(userId) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const sessions = db.prepare("SELECT * FROM game_sessions WHERE user_id = ? AND status = 'completed'").all(userId);
  const games = new Set(sessions.map((s) => s.game_id));
  const levels = new Set(sessions.map((s) => `${s.game_id}-${s.level}`));
  const perfect = sessions.filter((s) => s.wrong_count === 0 && s.correct_count > 0).length;
  const stats = {
    totalXp: u.xp,
    totalScore: u.total_score,
    correct: u.correct,
    wrong: u.wrong,
    sessions: u.sessions_count,
    perfectSessions: perfect,
    streakBest: u.streak_best,
    gamesPlayed: [...games],
    levelsCleared: levels.size,
    distinctGames: games.size,
  };
  const have = new Set(db.prepare('SELECT achievement_id FROM achievements_unlocked WHERE user_id = ?').all(userId).map((r) => r.achievement_id));
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (!have.has(a.id) && a.check(stats)) {
      db.prepare('INSERT OR IGNORE INTO achievements_unlocked (user_id, achievement_id, unlocked_at) VALUES (?,?,?)').run(userId, a.id, now());
      newly.push({ id: a.id, title: a.title, description: a.description, icon: a.icon, xp: a.xp });
    }
  }
  return newly;
}

