/**
 * GameShell — the shared frame every one of the six games runs inside.
 *
 * Responsibilities:
 *  - level selection + historical briefing (16:9 scene card)
 *  - starting a server session (questions are pulled and validated server-side)
 *  - pause / resume / restart / sound toggle / instructions
 *  - the interleaved Challenge API: a game calls `challenge.ask()` and receives a
 *    promise that resolves once the learner has answered a historical question
 *  - submitting the final result to /api/session/:id/complete and rendering the
 *    result breakdown with achievements
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Pause, RotateCcw, Volume2, VolumeX, HelpCircle, ChevronLeft, Trophy, Star, Zap,
  ArrowRight, Lock, CheckCircle2, BookOpen, Target, Radio, Heart,
} from 'lucide-react';
import type { GameDef, LevelDef } from '@shared/games';
import type { Question } from '@shared/quiz-types';
import { api, ApiError } from '../lib/api';
import { playSfx, soundPrefs, primeAudio } from '../lib/sound';
import { QuizEngine, LIVES_PER_LEVEL, type QuizOutcome } from './QuizEngine';
import { useAuth } from '../lib/auth';
import { Badge, Modal, ProgressBar, Spinner, Stat, useToast, SourceRefs } from '../components/UI';
import { GameBackdrop } from '../components/GameBackdrop';
import { ErrorBoundary } from '../components/ErrorBoundary';

export interface ChallengeApi {
  /** Ask one historical question; resolves after the learner answered it. */
  ask: () => Promise<boolean>;
  remaining: number;
  baseScore: number;
  addScore: (n: number) => void;
  sound: (name: Parameters<typeof playSfx>[0]) => void;
  paused: boolean;
  /** lives left in this level (starts at 5 every level) */
  lives: number;
  livesMax: number;
}

const ChallengeCtx = createContext<ChallengeApi | null>(null);
export const useChallenge = () => {
  const ctx = useContext(ChallengeCtx);
  if (!ctx) throw new Error('useChallenge must be used inside GameShell');
  return ctx;
};

export type StageComponent = (props: {
  game: GameDef;
  level: LevelDef;
  paused: boolean;
}) => React.ReactElement;

interface CompleteResult {
  score: number;
  xp: number;
  correct: number;
  wrong: number;
  accuracy: number;
  bestStreak: number;
  breakdown: { answerScore: number; gameplayScore: number; completionBonus: number };
  rank: { title: string; level: number; progress: number; nextXp: number | null };
  totalXp: number;
  unlocked: { id: string; title: string; description: string; icon: string; xp: number }[];
  alreadyCompleted?: boolean;
}

type Phase = 'select' | 'briefing' | 'loading' | 'playing' | 'result';

export function GameShell({ game, Stage, progress }: { game: GameDef; Stage: StageComponent; progress?: Record<string, number> }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [phase, setPhase] = useState<Phase>('select');
  const [level, setLevel] = useState<LevelDef>(game.levels[0]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState<{
    q: Question;
    resolve: (ok: boolean) => void;
    answered: boolean;
    correct: boolean;
  } | null>(null);
  const [baseScore, setBaseScore] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(soundPrefs.muted);
  const [helpOpen, setHelpOpen] = useState(false);
  const [result, setResult] = useState<CompleteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quizStats, setQuizStats] = useState({ correct: 0, wrong: 0, streakBest: 0 });
  const [lives, setLives] = useState(LIVES_PER_LEVEL);
  const [outOfLives, setOutOfLives] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const startedAt = useRef<number>(0);
  const runKey = useRef(0);
  const [runId, setRunId] = useState(0);

  const clearedLevels = progress ?? {};

  const isUnlocked = (n: number) => n === 1 || (clearedLevels[String(n - 1)] ?? 0) > 0;

  useEffect(() => {
    setMuted(soundPrefs.muted);
  }, []);

  const toggleSound = () => {
    const next = !muted;
    soundPrefs.muted = next;
    setMuted(next);
    if (!next) {
      primeAudio();
      playSfx('click');
    }
  };

  async function startLevel(lvl: LevelDef) {
    if (!user) {
      toast({ kind: 'err', title: 'Кіру қажет', body: 'Ойынды бастау үшін аккаунтқа кіріңіз.' });
      navigate('/kiru');
      return;
    }
    setError(null);
    setPhase('loading');
    try {
      const res = await api<{ sessionId: string; questions: Question[] }>('/api/session/start', {
        method: 'POST',
        json: { gameId: game.id, level: lvl.n, difficulty },
      });
      if (!res.questions?.length) throw new ApiError('Сұрақтар жүктелмеді', 500);
      setSessionId(res.sessionId);
      setQuestions(res.questions);
      setQuizIndex(0);
      setBaseScore(0);
      setQuizStats({ correct: 0, wrong: 0, streakBest: 0 });
      setLives(LIVES_PER_LEVEL);
      setOutOfLives(false);
      setLevel(lvl);
      setPaused(false);
      startedAt.current = Date.now();
      runKey.current += 1;
      setRunId(runKey.current);
      setResult(null);
      setPhase('playing');
      playSfx('whoosh');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Сессияны бастау мүмкін болмады');
      setPhase('briefing');
    }
  }

  /**
   * A game mechanic asks for one historical check. Resolves `true` only when the
   * player answered correctly — a mistake costs one life and the mechanic stays
   * closed, so it must be retried (that is what makes the answer matter).
   */
  const ask = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      setQuizIndex((idx) => {
        if (idx >= questions.length) {
          resolve(false);
          return idx;
        }
        setActiveQuestion({ q: questions[idx], resolve, answered: false, correct: false });
        setPaused(true);
        return idx + 1;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  const addScore = useCallback((n: number) => setBaseScore((s) => s + Math.max(0, Math.round(n))), []);

  const sound = useCallback((name: Parameters<typeof playSfx>[0]) => playSfx(name), []);

  async function finishLevel() {
    if (!sessionId || !user) return;
    setPhase('loading');
    try {
      const res = await api<CompleteResult>(`/api/session/${sessionId}/complete`, {
        method: 'POST',
        json: { baseScore, durationSeconds: Math.round((Date.now() - startedAt.current) / 1000) },
      });
      setResult(res);
      setPhase('result');
      playSfx(res.accuracy >= 60 ? 'win' : 'lose');
      if (res.unlocked?.length) {
        toast({ kind: 'ok', title: `Жаңа жетістік: ${res.unlocked[0].title}`, body: res.unlocked[0].description });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Нәтижені сақтау мүмкін болмады');
      setPhase('playing');
    }
  }

  function restart() {
    if (!sessionId) return;
    void api(`/api/session/${sessionId}/complete`, { method: 'POST', json: { baseScore: 0, durationSeconds: 0 } }).catch(() => {});
    setPhase('briefing');
    setSessionId(null);
    setQuestions([]);
    setResult(null);
  }

  const challenge: ChallengeApi = useMemo(
    () => ({ ask, remaining: Math.max(0, questions.length - quizIndex), baseScore, addScore, sound, paused, lives, livesMax: LIVES_PER_LEVEL }),
    [ask, questions.length, quizIndex, baseScore, addScore, sound, paused, lives],
  );

  // ── result screen ────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const passed = result.accuracy >= 50;
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="glass-strong p-6 sm:p-8 text-center animate-pop">
          <div
            className="mx-auto w-16 h-16 rounded-2xl grid place-items-center mb-4"
            style={{ background: passed ? 'rgba(47,179,168,0.15)' : 'rgba(201,106,74,0.15)', border: `1px solid ${passed ? 'rgba(47,179,168,0.4)' : 'rgba(201,106,74,0.4)'}` }}
          >
            {passed ? <Trophy size={28} className="text-teal" /> : <RotateCcw size={26} className="text-[#e08a6a]" />}
          </div>
          <h2 className="font-display text-2xl sm:text-3xl text-parchment">
            {lives === 0 ? 'Жан бітті — деңгей аяқталды' : passed ? 'Деңгей аяқталды!' : 'Деңгей аяқталды — қайталап көріңіз'}
          </h2>
          <p className="text-sm text-white/50 mt-1.5">
            {game.title} · {level.n}-деңгей · {level.title}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-6 text-left">
            <Stat label="Ұпай" value={result.score} accent="gold" icon={<Star size={15} />} />
            <Stat label="XP" value={`+${result.xp}`} accent="teal" icon={<Zap size={15} />} />
            <Stat label="Дәлдік" value={`${result.accuracy}%`} sub={`${result.correct} дұрыс / ${result.wrong} қате`} />
            <Stat label="Серия" value={`×${result.bestStreak}`} sub="ең ұзақ дұрыс серия" />
            <Stat
              label="Жан"
              value={`${lives}/${LIVES_PER_LEVEL}`}
              sub={lives === 0 ? 'жан бітті' : 'қалған жан'}
            />
          </div>

          <div className="mt-5 glass px-4 py-3 text-left">
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Ұпай құрылымы (серверде есептелді)</p>
            <div className="space-y-1.5 text-xs text-white/60">
              <div className="flex justify-between"><span>Білім сынағы</span><span className="text-teal">+{result.breakdown.answerScore}</span></div>
              <div className="flex justify-between"><span>Ойын механикасы</span><span className="text-gold">+{result.breakdown.gameplayScore}</span></div>
              <div className="flex justify-between"><span>Аяқтау бонусы</span><span>+{result.breakdown.completionBonus}</span></div>
            </div>
          </div>

          {result.unlocked.length > 0 && (
            <div className="mt-4 glass px-4 py-3 text-left border-gold/30">
              <p className="text-[11px] uppercase tracking-wider text-gold mb-2">Ашылған жетістіктер</p>
              {result.unlocked.map((a) => (
                <div key={a.id} className="flex items-center gap-2 py-1">
                  <Star size={14} className="text-gold" />
                  <span className="text-sm text-parchment">{a.title}</span>
                  <span className="text-xs text-white/40">+{a.xp} XP</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-white/50 mb-1.5">
              <span>Дәреже: {result.rank.title}</span>
              <span>{result.totalXp} XP</span>
            </div>
            <ProgressBar value={result.rank.progress} tone="gold" />
          </div>

          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            <button className="btn btn-gold px-5 py-2.5" onClick={() => { setPhase('select'); playSfx('click'); }}>
              Деңгей таңдау <ArrowRight size={16} />
            </button>
            <button className="btn btn-ghost px-5 py-2.5" onClick={() => void startLevel(level)}>
              <RotateCcw size={16} /> Қайта ойнау
            </button>
            <button className="btn btn-ghost px-5 py-2.5" onClick={() => navigate('/profil')}>
              Профиль
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── level select ─────────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="relative rounded-2xl overflow-hidden mb-6" style={{ aspectRatio: '16 / 7' }}>
          <GameBackdrop game={game} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070b14] via-[#070b14]/45 to-transparent" />
          <div className="absolute inset-0 p-5 sm:p-8 flex flex-col justify-end">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge tone="gold">{game.genre}</Badge>
              <Badge tone="teal">{game.levels.length} деңгей</Badge>
              <Badge>әр деңгейде {game.questionsPerLevel} тарихи сұрақ</Badge>
            </div>
            <h1 className="font-display text-3xl sm:text-5xl text-parchment leading-tight">{game.title}</h1>
            <p className="text-white/65 text-sm sm:text-base mt-2 max-w-2xl">{game.tagline}</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-xl text-parchment">Деңгейлер</h2>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-white/40">Қиындық</label>
                <select className="field py-1.5 text-xs w-auto" value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)}>
                  <option value="easy">Жеңіл (×0.8)</option>
                  <option value="medium">Орташа (×1.0)</option>
                  <option value="hard">Қиын (×1.3)</option>
                </select>
              </div>
            </div>
            {game.id === 'battle' && (
              <button
                onClick={() => navigate('/oyyn/battle?online=1')}
                className="w-full mb-2.5 rounded-xl px-4 py-3 text-left border border-teal/45 bg-teal/8 hover:bg-teal/14 transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Radio size={16} className="text-teal" />
                  <span className="font-display text-base text-parchment">Онлайн сайыс (2–8 ойыншы)</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal/25 text-teal-soft uppercase tracking-wider">
                    WebSocket
                  </span>
                </div>
                <p className="text-[11px] text-white/50 mt-1">
                  Бөлме кодын құрып, достарыңызды шақырыңыз. Нақты уақыттағы жарыс, командалық 2×2.
                </p>
              </button>
            )}
            <div className="grid sm:grid-cols-2 gap-2.5">
              {game.levels.map((l) => {
                const unlocked = isUnlocked(l.n);
                const done = (clearedLevels[String(l.n)] ?? 0) > 0;
                return (
                  <button
                    key={l.n}
                    disabled={!unlocked}
                    onClick={() => { setLevel(l); setPhase('briefing'); playSfx('click'); }}
                    className={`glass px-4 py-3 text-left transition-all ${
                      unlocked ? 'hover:border-gold/45 cursor-pointer' : 'opacity-45 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-9 h-9 rounded-lg grid place-items-center shrink-0 font-display text-sm"
                        style={{ background: `${game.accent}1f`, border: `1px solid ${game.accent}44`, color: game.accent }}
                      >
                        {done ? <CheckCircle2 size={16} /> : unlocked ? l.n : <Lock size={14} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-parchment leading-snug">{l.title}</p>
                        <p className="text-[11px] text-white/40 mt-0.5">{l.years}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="space-y-3">
            <div className="glass p-4">
              <p className="font-display text-base text-parchment mb-2">Ойын туралы</p>
              <p className="text-xs text-white/55 leading-relaxed">{game.description}</p>
            </div>
            <div className="glass p-4">
              <p className="font-display text-base text-parchment mb-2">Басқару</p>
              <ul className="space-y-1.5">
                {game.mechanics.map((m, i) => (
                  <li key={i} className="text-xs text-white/55 flex gap-2">
                    <span className="text-gold">•</span> {m}
                  </li>
                ))}
              </ul>
            </div>
            <button className="btn btn-teal w-full py-2.5" onClick={() => startLevel(level)} disabled={!isUnlocked(level.n)}>
              <Play size={16} /> Жалғастыру: {level.n}-деңгей
            </button>
            {!user && (
              <p className="text-[11px] text-[#e08a6a] text-center">
                Ойнау үшін аккаунтқа кіріңіз — нәтижелер серверде сақталады.
              </p>
            )}
          </aside>
        </div>
      </div>
    );
  }

  // ── briefing ─────────────────────────────────────────────────────
  if (phase === 'briefing') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <button className="text-xs text-white/45 hover:text-white mb-3 flex items-center gap-1" onClick={() => setPhase('select')}>
          <ChevronLeft size={14} /> Деңгейлерге оралу
        </button>
        <div className="glass-strong overflow-hidden">
          <div className="relative" style={{ aspectRatio: '16 / 9' }}>
            <GameBackdrop game={game} level={level} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1c] via-transparent to-[#0a0f1c]/30" />
            <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-8">
              <Badge tone="gold">{level.n}-деңгей · {level.years}</Badge>
              <h2 className="font-display text-2xl sm:text-4xl text-parchment mt-2">{level.title}</h2>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-sm text-white/70 leading-relaxed">{level.brief}</p>
            <p className="text-xs text-white/40 mt-3 leading-relaxed">{game.description}</p>

            <div className="mt-4 grid sm:grid-cols-3 gap-2">
              <div className="glass px-3 py-2.5">
                <p className="text-[10px] uppercase text-white/40">Мақсат</p>
                <p className="text-xs mt-1 text-parchment">
                  {game.id === 'battle' ? `${game.questionsPerLevel} сұрақ`
                    : game.id === 'race' ? `${level.goal.checkpoints ?? 10} бақылау пункті`
                    : game.id === 'puzzle' ? `${level.goal.target ?? 1000} ұпай`
                    : game.id === 'strategy' ? `${level.goal.rounds ?? 10} кезең`
                    : `${level.goal.artifacts ?? 8} жәдігер`}
                </p>
              </div>
              <div className="glass px-3 py-2.5">
                <p className="text-[10px] uppercase text-white/40">Білім сынағы</p>
                <p className="text-xs mt-1 text-parchment">{game.questionsPerLevel} сұрақ · 10 формат</p>
              </div>
              <div className="glass px-3 py-2.5">
                <p className="text-[10px] uppercase text-white/40">Қиындық</p>
                <p className="text-xs mt-1 text-parchment">
                  {difficulty === 'easy' ? 'Жеңіл ×0.8' : difficulty === 'hard' ? 'Қиын ×1.3' : 'Орташа ×1.0'}
                </p>
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-[#e08a6a]">{error}</p>}

            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn btn-gold px-6 py-2.5" onClick={() => void startLevel(level)}>
                <Play size={16} /> Бастау
              </button>
              <button className="btn btn-ghost px-4 py-2.5" onClick={() => setHelpOpen(true)}>
                <HelpCircle size={16} /> Нұсқаулық
              </button>
            </div>
          </div>
        </div>
        <HelpModal game={game} open={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
    );
  }

  if (phase === 'loading') {
    return <Spinner label="Деңгей дайындалуда · сұрақтар серверден жүктелуде…" />;
  }

  // ── playing ──────────────────────────────────────────────────────
  return (
    <ChallengeCtx.Provider value={challenge}>
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        {/* HUD */}
        <div className="glass px-3 py-2 mb-2 flex items-center gap-2 flex-wrap">
          <button className="btn btn-ghost px-2.5 py-1.5 text-xs" onClick={() => { setPaused(true); setPhase('select'); }}>
            <ChevronLeft size={14} /> Шығу
          </button>
          <span className="text-xs text-white/60 font-display">{level.n}. {level.title}</span>
          <div className="ml-auto flex items-center gap-2">
            <Badge tone="gold"><Star size={11} /> {baseScore}</Badge>
            <Badge tone="teal"><Target size={11} /> {quizIndex}/{questions.length}</Badge>
            <Badge tone={lives > 2 ? 'gold' : 'danger'}>
              <Heart size={11} /> {lives}/{LIVES_PER_LEVEL}
            </Badge>
            <button className="btn btn-ghost px-2 py-1.5" onClick={() => setPaused((p) => !p)} aria-label="Кідірту">
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button className="btn btn-ghost px-2 py-1.5" onClick={toggleSound} aria-label="Дыбыс">
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <button className="btn btn-ghost px-2 py-1.5" onClick={() => setHelpOpen(true)} aria-label="Нұсқаулық">
              <HelpCircle size={14} />
            </button>
          </div>
        </div>

        <ErrorBoundary key={`eb-${runId}`} label={`${game.title} · ${level.n}-деңгей`} onReset={() => setPhase('select')}>
          <Stage key={runId} game={game} level={level} paused={paused || Boolean(activeQuestion)} />
        </ErrorBoundary>

        {/* lives ended: the level stops here */}
        {outOfLives && phase === 'playing' && (
          <div className="glass-strong p-5 mt-2 text-center animate-pop">
            <Heart size={26} className="mx-auto text-[#e0607a] mb-2" />
            <p className="font-display text-lg text-parchment">Барлық жан бітті</p>
            <p className="text-xs text-white/50 mt-1">
              Деңгейде 5 жан беріледі. Қайта бастап, сұрақтарды мұқият оқып көріңіз.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <button className="btn btn-gold px-5 py-2.5 text-sm" onClick={() => void finishLevel()}>
                Нәтижені сақтау <ArrowRight size={15} />
              </button>
              <button className="btn btn-ghost px-5 py-2.5 text-sm" onClick={restart}>
                <RotateCcw size={15} /> Қайта бастау
              </button>
            </div>
          </div>
        )}

        {/* objective + finish control */}
        <div className="glass px-3 py-2 mt-2 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <div className="flex justify-between text-[10px] text-white/45 mb-1">
              <span>Білім сынағы</span>
              <span>{quizIndex}/{questions.length}</span>
            </div>
            <ProgressBar value={(quizIndex / Math.max(1, questions.length)) * 100} height={5} />
          </div>
          <button
            className="btn btn-gold px-4 py-2 text-xs"
            disabled={quizIndex < questions.length}
            onClick={() => void finishLevel()}
            title={quizIndex < questions.length ? 'Барлық тарихи сұраққа жауап беріңіз' : 'Деңгейді аяқтау'}
          >
            {quizIndex < questions.length ? `${questions.length - quizIndex} сұрақ қалды` : 'Деңгейді аяқтау'} <ArrowRight size={14} />
          </button>
        </div>

        {/* pause overlay */}
        {paused && !activeQuestion && (
          <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm grid place-items-center p-4">
            <div className="glass-strong p-7 text-center max-w-sm w-full animate-pop">
              <Pause size={30} className="mx-auto text-gold mb-3" />
              <h3 className="font-display text-xl text-parchment">Ойын кідіртілді</h3>
              <p className="text-xs text-white/45 mt-1">Жалғастыру немесе қайта бастау мүмкіндігі бар.</p>
              <div className="mt-5 flex flex-col gap-2">
                <button className="btn btn-gold py-2.5" onClick={() => setPaused(false)}><Play size={15} /> Жалғастыру</button>
                <button className="btn btn-ghost py-2.5" onClick={restart}><RotateCcw size={15} /> Қайта бастау</button>
                <button className="btn btn-ghost py-2.5" onClick={() => { setPaused(false); setPhase('select'); }}>Деңгей таңдау</button>
              </div>
            </div>
          </div>
        )}

        {/* challenge modal */}
        {activeQuestion && sessionId && (
          <div className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-sm overflow-y-auto p-3 sm:p-6">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-2 mb-2 text-xs text-gold">
                <BookOpen size={14} /> Тарихи сынақ — есік ашылу үшін дұрыс жауап беріңіз
              </div>
              <QuizEngine
                key={activeQuestion.q.id}
                sessionId={sessionId}
                questions={[activeQuestion.q]}
                perQuestionSeconds={0}
                lives={lives}
                onLivesChange={setLives}
                onFinish={() => {}}
                onAnswer={(ok) => {
                  setQuizStats((s) => ({
                    correct: s.correct + (ok ? 1 : 0),
                    wrong: s.wrong + (ok ? 0 : 1),
                    streakBest: ok ? Math.max(s.streakBest, s.correct + 1) : s.streakBest,
                  }));
                  if (ok) addScore(100);
                  setActiveQuestion((a) => (a ? { ...a, answered: true, correct: ok } : a));
                }}
              />
              {/* The mechanic opens only when the answer was correct; after a
                  mistake the player may retry while lives remain. */}
              {activeQuestion.answered && lives > 0 && (
                <button
                  className="btn btn-teal w-full mt-2 py-2.5"
                  onClick={() => {
                    const a = activeQuestion;
                    setActiveQuestion(null);
                    setPaused(false);
                    a.resolve(a.correct);
                  }}
                >
                  {activeQuestion.correct ? 'Жалғастыру' : 'Қайтадан көру'} <ArrowRight size={16} />
                </button>
              )}
              {lives === 0 && (
                <button
                  className="btn btn-gold w-full mt-2 py-2.5"
                  onClick={() => {
                    const a = activeQuestion;
                    setActiveQuestion(null);
                    setPaused(false);
                    setOutOfLives(true);
                    a.resolve(false);
                  }}
                >
                  Жан бітті — нәтижені көру <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        )}

        <HelpModal game={game} open={helpOpen} onClose={() => setHelpOpen(false)} />
        {error && <p className="text-xs text-[#e08a6a] mt-2">{error}</p>}
      </div>
    </ChallengeCtx.Provider>
  );
}

function HelpModal({ game, open, onClose }: { game: GameDef; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={`${game.title} — нұсқаулық`} wide>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-white/70 leading-relaxed">{game.description}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gold mb-2">Басқару және механика</p>
          <ul className="space-y-1.5">
            {game.mechanics.map((m, i) => (
              <li key={i} className="text-xs text-white/60 flex gap-2">
                <span className="text-teal">▸</span> {m}
              </li>
            ))}
          </ul>
        </div>
        <div className="glass px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Ұпай есептеу</p>
          <p className="text-xs text-white/60 leading-relaxed">
            Әр деңгейде <span className="text-gold">5 жан</span> беріледі. Дұрыс емес жауап (немесе уақыт біту)
            бір жанды алады, ал дұрыс жауап тек дұрыс тапқанда ғана көрсетіледі. Жан бітсе деңгей аяқталады.
            Әр дұрыс жауап 100 ұпай (қиындық коэффициентімен), серия үшін қосымша ұпай беріледі.
            Ойын механикасынан жиналған ұпай серверде шектеледі (әр сұраққа 120 ұпайдан аспайды) —
            осылайша нәтижені браузерден бұрмалау мүмкін емес.
          </p>
        </div>
        <div className="glass px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Тарихи дәлдік</p>
          <p className="text-xs text-white/60 leading-relaxed">
            Әр жауаптан кейін тарихи түсіндірме мен дереккөз сілтемесі көрсетіледі. Даулы мәселелер
            «Ескерту» белгісімен ажыратылады. Ойынның ойдан шығарылған сценарийлері нақты тарихи
            оқиға ретінде берілмейді.
          </p>
        </div>
      </div>
    </Modal>
  );
}
