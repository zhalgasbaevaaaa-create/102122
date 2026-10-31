/**
 * GAME 6 — «Тарих майданы» (competitive knowledge battle)
 *
 * Modes: solo / 2 players / 4 players / team battle (2v2). Every round draws a
 * fresh question from the server session (never repeated in a session). Players
 * answer on the same device in turn order; scores accumulate with a streak bonus
 * and a countdown timer per question.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, Swords, Timer, Trophy, RotateCcw, User, Radio } from 'lucide-react';
import { OnlineBattle } from './OnlineBattle';
import type { GameDef as _GameDef } from '@shared/games';
import type { GameDef, LevelDef } from '@shared/games';
import { useChallenge } from '../GameShell';
import { QuizEngine } from '../QuizEngine';
import { Badge, ProgressBar } from '../../components/UI';
import { playSfx } from '../../lib/sound';

type Mode = 'solo' | 'duo' | 'quad' | 'team';

const MODES: { id: Mode; label: string; seats: number; desc: string; icon: typeof User }[] = [
  { id: 'solo', label: 'Жеке', seats: 1, desc: 'Бір ойыншы, таймермен.', icon: User },
  { id: 'duo', label: '2 ойыншы', seats: 2, desc: 'Бір құрылғыда кезектесіп.', icon: Users },
  { id: 'quad', label: '4 ойыншы', seats: 4, desc: 'Төрт ойыншы, кезекпен.', icon: Users },
  { id: 'team', label: 'Команда 2×2', seats: 4, desc: 'Екі команда, жалпы ұпай.', icon: Swords },
];

export function BattleStage({ game, level }: { game: GameDef; level: LevelDef }) {
  const challenge = useChallenge();
  const [params, setParams] = useSearchParams();
  // `?online=1` opens the lobby; `?room=CODE` is an invite link and joins directly.
  const roomParam = (params.get('room') || '').toUpperCase();
  const online = params.get('online') === '1' || Boolean(roomParam);
  // the questions already pre-loaded for this session; QuizEngine consumes them
  // through the shell, so here we drive the competitive wrapper.
  const [mode, setMode] = useState<Mode | null>(null);
  const [round, setRound] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [streaks, setStreaks] = useState<number[]>([]);
  const [active, setActive] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [turnDone, setTurnDone] = useState(false);

  if (online) {
    return (
      <OnlineBattle
        level={level.n}
        inviteCode={roomParam}
        onExit={() => { params.delete('online'); params.delete('room'); setParams(params, { replace: true }); }}
      />
    );
  }

  const seats = MODES.find((m) => m.id === mode)?.seats ?? 1;
  const rounds = level.goal.rounds ?? 10;

  const teamScore = useMemo(() => {
    if (mode !== 'team') return null;
    return [scores[0] + scores[1] || 0, scores[2] + scores[3] || 0];
  }, [mode, scores]);

  function start(m: Mode) {
    const n = MODES.find((x) => x.id === m)!.seats;
    setMode(m);
    setScores(Array(n).fill(0));
    setStreaks(Array(n).fill(0));
    setActive(0);
    setRound(0);
    setShowQuiz(false);
    setTurnDone(false);
    playSfx('whoosh');
  }

  async function beginTurn() {
    setShowQuiz(true);
    setTurnDone(false);
    challenge.sound('click');
    const ok = await challenge.ask();
    setShowQuiz(false);
    setScores((s) => {
      const next = [...s];
      const bonus = streaks[active] && streaks[active] >= 2 ? 40 : 0;
      next[active] = (next[active] ?? 0) + (ok ? 100 + bonus : 0);
      return next;
    });
    setStreaks((s) => {
      const next = [...s];
      next[active] = ok ? (next[active] ?? 0) + 1 : 0;
      return next;
    });
    if (ok) playSfx('correct');
    const nextActive = (active + 1) % seats;
    const nextRound = nextActive === 0 ? round + 1 : round;
    setActive(nextActive);
    setRound(nextRound);
    setTurnDone(true);
  }

  const finished = round >= rounds || challenge.lives === 0;

  if (!mode) {
    return (
      <div className="glass-strong p-4 sm:p-6">
        <h2 className="font-display text-xl text-parchment mb-1">Сайыс режимін таңдаңыз</h2>
        <p className="text-xs text-white/45 mb-4">
          Сұрақтар серверде кездейсоқ таңдалады және бір сессияда қайталанбайды. Барлық 10 формат қолданылады.
        </p>

        {/* ONLINE — real-time multiplayer over WebSocket */}
        <button
          className="glass px-4 py-3.5 text-left w-full mb-2.5 border-teal/40 hover:border-teal/70 transition-colors bg-teal/5"
          onClick={() => { params.set('online', '1'); setParams(params); }}
        >
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-teal" />
            <span className="font-display text-base text-parchment">Онлайн сайыс</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal/20 text-teal-soft uppercase tracking-wider">WebSocket</span>
          </div>
          <p className="text-xs text-white/45 mt-1">
            2–8 ойыншы, бөлме коды арқылы қосылу, нақты уақыттағы жарыс және командалық 2×2 режимі.
            Әр ойыншының нәтижесі серверде сақталады.
          </p>
        </button>

        <div className="grid sm:grid-cols-2 gap-2.5">
          {MODES.map((m) => (
            <button key={m.id} className="glass px-4 py-3.5 text-left hover:border-gold/40 transition-colors" onClick={() => start(m.id)}>
              <div className="flex items-center gap-2">
                <m.icon size={16} className="text-gold" />
                <span className="font-display text-base text-parchment">{m.label}</span>
              </div>
              <p className="text-xs text-white/45 mt-1">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-strong p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone="gold"><Swords size={11} /> {MODES.find((m) => m.id === mode)?.label}</Badge>
          <Badge tone="teal">Айналым {Math.min(round + 1, rounds)} / {rounds}</Badge>
          <Badge><Timer size={11} /> кезек: {mode === 'team' ? `${active < 2 ? 'А' : 'Б'} командасы` : `${active + 1}-ойыншы`}</Badge>
        </div>
        <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => setMode(null)}>
          <RotateCcw size={12} /> Режимді ауыстыру
        </button>
      </div>

      {/* scoreboard */}
      <div className={`grid gap-2 mb-3 ${seats === 1 ? '' : seats === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {scores.map((s, i) => {
          const isActive = i === active && !finished;
          return (
            <div
              key={i}
              className={`glass px-3 py-2.5 transition-all ${isActive ? 'border-gold/60 shadow-[0_0_0_1px_rgba(217,169,74,0.4)]' : ''}`}
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/40">
                <span>
                  {mode === 'team' ? `${i < 2 ? 'А' : 'Б'} команда · ${i % 2 + 1}` : `${i + 1}-ойыншы`}
                </span>
                {streaks[i] > 1 && <span className="text-gold">×{streaks[i]}</span>}
              </div>
              <p className="font-display text-xl text-parchment mt-0.5">{s}</p>
            </div>
          );
        })}
      </div>

      {teamScore && (
        <div className="mb-3">
          <div className="flex justify-between text-[11px] text-white/50 mb-1">
            <span>А командасы: <span className="text-teal">{teamScore[0]}</span></span>
            <span>Б командасы: <span className="text-gold">{teamScore[1]}</span></span>
          </div>
          <ProgressBar value={(teamScore[0] / Math.max(1, teamScore[0] + teamScore[1])) * 100} tone="teal" height={6} />
        </div>
      )}

      {finished ? (
        <div className="text-center py-6">
          <Trophy size={30} className="mx-auto text-gold mb-2" />
          <p className="font-display text-2xl text-parchment">
            {challenge.lives === 0 ? 'Жан бітті — сайыс аяқталды' : 'Сайыс аяқталды'}
          </p>
          <p className="text-sm text-white/60 mt-1.5">
            {mode === 'team'
              ? (teamScore && teamScore[0] === teamScore[1]
                  ? 'Тең нәтиже!'
                  : `Жеңімпаз: ${(teamScore && teamScore[0] > teamScore[1]) ? 'А' : 'Б'} командасы`)
              : (() => {
                  const max = Math.max(...scores);
                  const winners = scores.map((s, i) => (s === max ? i + 1 : 0)).filter(Boolean);
                  return winners.length > 1 ? `Тең нәтиже: ${winners.join(', ')}-ойыншылар` : `Жеңімпаз: ${winners[0]}-ойыншы`;
                })()}
          </p>
          <p className="text-xs text-white/40 mt-1">Деңгейді аяқтауға болады.</p>
          <button className="btn btn-ghost px-4 py-2 text-xs mt-4" onClick={() => start(mode)}>
            <RotateCcw size={13} /> Қайта бастау
          </button>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-sm text-white/60 mb-1">
            Кезек: <span className="text-gold font-semibold">
              {mode === 'team' ? `${active < 2 ? 'А' : 'Б'} командасының ойыншысы` : `${active + 1}-ойыншы`}
            </span>
          </p>
          <p className="text-xs text-white/35 mb-1">Сұрақ 25 секунд ішінде жауапталуы керек.</p>
          <p className="text-xs text-[#e0607a] mb-5">Жан: {challenge.lives}/{challenge.livesMax} · қате жауап −1 жан</p>
          <button className="btn btn-gold px-6 py-3" onClick={() => void beginTurn()} disabled={showQuiz}>
            <Swords size={16} /> Кезекті бастау
          </button>
          {turnDone && <p className="text-[11px] text-teal mt-3">Кезек аяқталды — келесі ойыншыға өтіңіз.</p>}
        </div>
      )}

      <p className="text-[10px] text-white/35 mt-2">
        Бұл — бір құрылғыда ойналатын жергілікті сайыс. Желідегі нақты жарыс үшін жоғарыдағы
        «Онлайн сайыс (WebSocket)» режимін қолданыңыз.
      </p>
    </div>
  );
}

/** Timed single question used by the battle wrapper. */
export function BattleQuestion({ sessionId, question }: { sessionId: string; question: any }) {
  return (
    <QuizEngine
      sessionId={sessionId}
      questions={[question]}
      perQuestionSeconds={25}
      onFinish={() => {}}
    />
  );
}
