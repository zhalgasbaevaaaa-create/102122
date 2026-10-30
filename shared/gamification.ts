/** Achievements, XP curve and rank titles. */
export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  check: (s: PlayerStats) => boolean;
}

export interface PlayerStats {
  totalXp: number;
  totalScore: number;
  correct: number;
  wrong: number;
  sessions: number;
  perfectSessions: number;
  streakBest: number;
  gamesPlayed: string[];
  levelsCleared: number;
  distinctGames: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-step', title: 'Алғашқы қадам', description: 'Бірінші ойын сессиясын аяқтаңыз.', icon: 'sparkles', xp: 50, check: (s) => s.sessions >= 1 },
  { id: 'historian', title: 'Тарих білгірі', description: 'Барлығы 200 дұрыс жауап беріңіз.', icon: 'book', xp: 300, check: (s) => s.correct >= 200 },
  { id: 'steppe-explorer', title: 'Ұлы дала зерттеушісі', description: 'Алты ойынның барлығында кемінде бір деңгейден өтіңіз.', icon: 'compass', xp: 500, check: (s) => s.distinctGames >= 6 },
  { id: 'horde-chronicler', title: 'Алтын Орда шежірешісі', description: 'Тарих майданындағы 8-деңгейді тапсырыңыз.', icon: 'scroll', xp: 250, check: (s) => s.levelsCleared >= 8 },
  { id: 'khanate-expert', title: 'Хандық дәуір сарапшысы', description: 'Он деңгейден мүлтіксіз өтіңіз.', icon: 'crown', xp: 700, check: (s) => s.perfectSessions >= 10 },
  { id: 'sharp-mind', title: 'Тарих майталманы', description: '10 сұрақтан тұратын серияны дұрыс жауаптаңыз.', icon: 'flame', xp: 400, check: (s) => s.streakBest >= 10 },
  { id: 'legend', title: 'Ұлы дала аңызы', description: '20 000 XP жинаңыз.', icon: 'star', xp: 1000, check: (s) => s.totalXp >= 20000 },
  { id: 'accuracy-master', title: 'Дәлдік шебері', description: 'Жалпы дәлдік 85%-дан жоғары болсын (кемінде 100 жауап).', icon: 'target', xp: 450, check: (s) => s.correct + s.wrong >= 100 && s.correct / (s.correct + s.wrong) >= 0.85 },
  { id: 'marathon', title: 'Марафоншы', description: '30 ойын сессиясын аяқтаңыз.', icon: 'timer', xp: 350, check: (s) => s.sessions >= 30 },
  { id: 'scholar', title: 'Тарихшы-зерттеуші', description: '5 000 ұпай жинаңыз.', icon: 'medal', xp: 250, check: (s) => s.totalScore >= 5000 },
];

export const RANKS = [
  { level: 1, xp: 0, title: 'Жас зерттеуші' },
  { level: 2, xp: 500, title: 'Шежіре оқушысы' },
  { level: 3, xp: 1500, title: 'Тарих іздеушісі' },
  { level: 4, xp: 3000, title: 'Дала білгірі' },
  { level: 5, xp: 5000, title: 'Шежіре шебері' },
  { level: 6, xp: 8000, title: 'Тарих майталманы' },
  { level: 7, xp: 12000, title: 'Ұлы дала зерттеушісі' },
  { level: 8, xp: 17000, title: 'Хандық сарапшысы' },
  { level: 9, xp: 25000, title: 'Алтын Орда шежірешісі' },
  { level: 10, xp: 35000, title: 'Ұлы дала аңызы' },
];

export function rankFor(xp: number) {
  let cur = RANKS[0];
  for (const r of RANKS) if (xp >= r.xp) cur = r;
  const next = RANKS.find((r) => r.xp > xp);
  return {
    ...cur,
    nextXp: next?.xp ?? null,
    progress: next ? Math.round(((xp - cur.xp) / (next.xp - cur.xp)) * 100) : 100,
  };
}

/** XP formula: score/10 + 5 per correct + streak bonus; capped per session. */
export function computeXp(score: number, correct: number, bestStreak: number) {
  return Math.min(2000, Math.round(score / 10 + correct * 5 + bestStreak * 2));
}
