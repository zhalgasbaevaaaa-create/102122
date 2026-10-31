/**
 * Shared educational challenge engine.
 *
 * Renders all ten question formats, validates answers on the SERVER
 * (POST /api/session/:id/answer), shows the historical explanation with source
 * references, and reports a normalised result to the host game.
 */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Clock, ChevronRight, BookOpen, Link2, GripVertical, Heart, Eye } from 'lucide-react';
import type { Question } from '@shared/quiz-types';
import { api, ApiError } from '../lib/api';
import { playSfx } from '../lib/sound';
import { SourceRefs, ProgressBar, Badge } from '../components/UI';
import { PointMap } from '../components/PointMap';
import { Artifact } from '../components/Artifact';

export interface QuizOutcome {
  correct: number;
  wrong: number;
  answered: number;
  total: number;
  streakBest: number;
  timeMs: number;
  /** lives left when the round ended (0 = out of lives) */
  livesLeft: number;
  /** questions never reached because the player ran out of lives */
  skipped: number;
}

/** Lives granted at the start of every level. */
export const LIVES_PER_LEVEL = 5;

interface Props {
  sessionId: string;
  questions: Question[];
  /** seconds per question; 0 = untimed */
  perQuestionSeconds?: number;
  title?: string;
  /** lives for this round; defaults to LIVES_PER_LEVEL (5) */
  lives?: number;
  /** called once when the last life is lost */
  onGameOver?: () => void;
  onFinish: (outcome: QuizOutcome) => void;
  /** second argument is the number of lives still left */
  onAnswer?: (correct: boolean, livesLeft: number) => void;
  /** fires on every answer so a host can mirror the HUD */
  onLivesChange?: (livesLeft: number) => void;
}

const FORMAT_LABEL: Record<string, string> = {
  mcq: 'Бір дұрыс жауап',
  truefalse: 'Дұрыс / қате',
  'match-dates': 'Сәйкестендіру',
  'match-persons': 'Сәйкестендіру',
  chronological: 'Хронология',
  map: 'Карта',
  'image-id': 'Нысанды анықтау',
  'fill-blank': 'Бос орын',
  'find-mistake': 'Қатені табу',
  'multi-select': 'Барлық дұрыс жауап',
};

type AnswerState = Record<string, string>; // leftId -> rightId for matching

export function QuizEngine({
  sessionId, questions, perQuestionSeconds = 0, title,
  lives: startLives = LIVES_PER_LEVEL, onFinish, onAnswer, onLivesChange, onGameOver,
}: Props) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [pairs, setPairs] = useState<AnswerState>({});
  const [order, setOrder] = useState<string[]>([]);
  const [result, setResult] = useState<{ correct: boolean; explanation: string; sourceIds: string[]; answerText?: string | null } | null>(null);
  const [lives, setLives] = useState(startLives);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [streak, setStreak] = useState(0);
  const [streakBest, setStreakBest] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [qStart, setQStart] = useState(() => Date.now());
  const [remaining, setRemaining] = useState(perQuestionSeconds);

  const q = questions[index];
  const total = questions.length;
  const totalTimeMs = useMemo(() => questions.reduce((a, _q) => a, 0), [questions]);

  // question progression
  useEffect(() => {
    setSelected([]);
    setPairs({});
    setOrder(q?.format === 'chronological' ? (q.items ?? []).map((i) => i.id) : []);
    setResult(null);
    setError(null);
    setQStart(Date.now());
    setRemaining(perQuestionSeconds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // timer
  useEffect(() => {
    if (!perQuestionSeconds || result) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          if (!busy) void submit(true);
          return 0;
        }
        if (r <= 4) playSfx('tick');
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, result, perQuestionSeconds]);

  const canSubmit = (() => {
    if (!q || result) return false;
    if (q.format === 'match-dates' || q.format === 'match-persons') {
      return q.left ? Object.keys(pairs).length === q.left.length : false;
    }
    if (q.format === 'chronological') return order.length === (q.items?.length ?? 0);
    if (q.format === 'multi-select') return selected.length > 0;
    return selected.length === 1;
  })();

  function buildAnswer(): unknown {
    if (!q) return null;
    if (q.format === 'match-dates' || q.format === 'match-persons') return pairs;
    if (q.format === 'chronological') return order;
    if (q.format === 'multi-select') return selected;
    return selected[0];
  }

  async function submit(timedOut = false) {
    if (!q || busy || result) return;
    if (!timedOut && !canSubmit) return;
    await send(timedOut ? null : buildAnswer());
  }

  /** Immediate submit for one-touch formats; avoids waiting for a state flush. */
  async function submitWith(indexes: number[]) {
    await send(indexes[0]);
  }

  async function send(answerPayload: unknown) {
    if (!q || busy || result) return;
    setBusy(true);
    setError(null);
    const ms = Date.now() - qStart;
    try {
      const res = await api<{ correct: boolean; explanation: string; sourceIds: string[]; answerText?: string | null }>(
        `/api/session/${sessionId}/answer`,
        { method: 'POST', json: { questionId: q.id, answer: answerPayload, ms } },
      );
      setResult(res);
      setAnswered((a) => a + 1);
      let nextLives = lives;
      if (res.correct) {
        setCorrect((c) => c + 1);
        const s = streak + 1;
        setStreak(s);
        setStreakBest((b) => Math.max(b, s));
        playSfx('correct');
      } else {
        // One life is lost per wrong answer — a timeout counts as wrong too.
        nextLives = Math.max(0, lives - 1);
        setWrong((w) => w + 1);
        setLives(nextLives);
        setStreak(0);
        playSfx('wrong');
        onLivesChange?.(nextLives);
        if (nextLives === 0) onGameOver?.();
      }
      onAnswer?.(res.correct, nextLives);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Жауапты тексеру мүмкін болмады';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function finishNow() {
    onFinish({
      correct, wrong, answered,
      total,
      streakBest,
      timeMs: Date.now() - startedAt,
      livesLeft: lives,
      skipped: Math.max(0, total - answered),
    });
  }

  /**
   * One tap = one answer for every single-choice format (mcq, true/false,
   * fill-blank, find-mistake, image-id, map). The old flow required a second
   * click on «Жауапты жіберу», which read as "the answer does nothing".
   * Matching, ordering and multi-select still confirm explicitly because they
   * are composed of several choices.
   */
  function pick(indexes: number[]) {
    if (result || busy) return;
    setSelected(indexes);
    const auto = q && ['mcq', 'truefalse', 'fill-blank', 'find-mistake', 'image-id', 'map'].includes(q.format);
    if (auto) void submitWith(indexes);
  }

  function next() {
    if (lives === 0 || index + 1 >= total) {
      finishNow();
      return;
    }
    setIndex((i) => i + 1);
  }

  if (!q) return null;

  const isMatch = q.format === 'match-dates' || q.format === 'match-persons';

  return (
    <div className="glass-strong p-4 sm:p-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone="gold">
            Сұрақ {index + 1} / {total}
          </Badge>
          <Badge tone="teal">{FORMAT_LABEL[q.format] ?? q.format}</Badge>
          <Badge>{['', 'Жеңіл', 'Орташа', 'Қиын'][q.difficulty]}</Badge>
          {title && <span className="text-xs text-white/40">{title}</span>}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span
            className="flex items-center gap-0.5"
            title={`Жан: ${lives} / ${startLives}`}
            aria-label={`Жан: ${lives} / ${startLives}`}
          >
            {Array.from({ length: startLives }, (_, i) => (
              <Heart
                key={i}
                size={14}
                className={i < lives ? 'text-[#e0607a]' : 'text-white/15'}
                fill={i < lives ? 'currentColor' : 'none'}
              />
            ))}
          </span>
          <span className="flex items-center gap-1 text-teal">
            <CheckCircle2 size={14} /> {correct}
          </span>
          <span className="flex items-center gap-1 text-[#e08a6a]">
            <XCircle size={14} /> {wrong}
          </span>
          {streak > 1 && <Badge tone="gold">Серия ×{streak}</Badge>}
          {perQuestionSeconds > 0 && (
            <span className={`flex items-center gap-1 font-mono ${remaining <= 5 ? 'text-[#e08a6a]' : 'text-white/60'}`}>
              <Clock size={14} /> {remaining}s
            </span>
          )}
        </div>
      </div>

      <ProgressBar value={((index + (result ? 1 : 0)) / total) * 100} tone="teal" height={5} />

      {/* rules, shown before the first attempt */}
      {index === 0 && !result && (
        <p className="mt-3 text-[11px] text-white/40">
          Нұсқаны басу — жауапты бірден жібереді. Қате жауап бір жанды алады; деңгейде 5 жан бар.
        </p>
      )}

      {/* prompt */}
      <div className="mt-5">
        <p className="text-base sm:text-lg text-parchment whitespace-pre-line leading-relaxed">{q.prompt}</p>
      </div>

      {/* body per format */}
      <div className="mt-4 space-y-3">
        {(q.format === 'mcq' || q.format === 'truefalse' || q.format === 'fill-blank' ||
          q.format === 'find-mistake' || q.format === 'image-id') && (
          <>
            {q.format === 'fill-blank' && (
              <p className="text-xs text-white/40">Төмендегі нұсқалардың ішінен бос орынға сай келетінін таңдаңыз.</p>
            )}
            {q.format === 'image-id' && q.artifactId && (
              <div className="flex justify-center py-1">
                <Artifact id={q.artifactId} size={150} />
              </div>
            )}
            <div className="grid gap-2">
              {(q.options ?? []).map((o, i) => {
                // Correct answers are highlighted only after the player got it
                // right; after a mistake nothing is marked as correct.
                const isRightPick = result?.correct && selected.includes(i);
                const wrongPick = result && !result.correct && selected.includes(i);
                const state = result ? (isRightPick ? 'correct' : undefined) : selected.includes(i) ? 'selected' : undefined;
                return (
                  <button
                    key={o.id}
                    className="opt"
                    data-state={wrongPick ? 'wrong' : state}
                    disabled={Boolean(result) || busy}
                    onClick={() => pick([i])}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-md bg-white/8 border border-white/10 grid place-items-center text-[11px] font-mono shrink-0">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-sm leading-snug">{o.text}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {q.format === 'multi-select' && (
          <>
            <p className="text-xs text-white/40">Бірнеше нұсқаны таңдауға болады.</p>
            <div className="grid gap-2">
              {(q.options ?? []).map((o, i) => (
                <button
                  key={o.id}
                  className="opt"
                  data-state={result ? (selected.includes(i) ? 'correct' : undefined) : selected.includes(i) ? 'selected' : undefined}
                  disabled={Boolean(result) || busy}
                  onClick={() =>
                    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))
                  }
                >
                  <span className="inline-flex items-center gap-2.5">
                    <span
                      className={`w-5 h-5 rounded border shrink-0 grid place-items-center ${
                        selected.includes(i) ? 'bg-gold border-gold' : 'border-white/25'
                      }`}
                    >
                      {selected.includes(i) && <CheckCircle2 size={13} className="text-[#131008]" />}
                    </span>
                    <span className="text-sm leading-snug">{o.text}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {isMatch && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-white/40">Сол жақ</p>
              {(q.left ?? []).map((l) => (
                <div
                  key={l.id}
                  className={`px-3 py-2.5 rounded-lg border text-sm ${
                    pairs[l.id] ? 'border-teal/50 bg-teal/10' : 'border-white/12 bg-white/4'
                  }`}
                >
                  <p className="text-[13px] leading-snug">{l.text}</p>
                  {pairs[l.id] && (
                    <p className="text-[11px] text-teal mt-1 truncate">
                      → {(q.right ?? []).find((r) => r.id === pairs[l.id])?.text}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-white/40">Оң жақ (таңдау)</p>
              {(q.right ?? []).map((r) => {
                const usedBy = Object.entries(pairs).find(([, v]) => v === r.id)?.[0];
                return (
                  <button
                    key={r.id}
                    className="opt"
                    data-state={usedBy ? 'selected' : undefined}
                    disabled={Boolean(result) || busy}
                    onClick={() => {
                      // assign to the first unmatched left item, or cycle
                      const lefts = q.left ?? [];
                      const unmatched = lefts.find((l) => !pairs[l.id]);
                      const target = unmatched ?? lefts[0];
                      if (!target) return;
                      setPairs((p) => {
                        const clean = Object.fromEntries(Object.entries(p).filter(([k, v]) => v !== r.id && k !== target.id));
                        return { ...clean, [target.id]: r.id };
                      });
                      playSfx('click');
                    }}
                  >
                    <span className="text-[13px] leading-snug">{r.text}</span>
                  </button>
                );
              })}
              <p className="text-[10px] text-white/30">Нұсқаны басып, таңдау тағайындалады. Қайта басу үшін сол жақтағы элементті таңдаңыз.</p>
              <div className="flex flex-wrap gap-1.5">
                {(q.left ?? []).map((l) => (
                  <button
                    key={l.id}
                    className={`chip ${pairs[l.id] ? 'border-teal/40 text-teal' : 'border-white/12'}`}
                    disabled={Boolean(result) || busy}
                    onClick={() => setPairs((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== l.id)))}
                    title="Байланыстыруды тазалау"
                  >
                    {l.text.length > 18 ? l.text.slice(0, 18) + '…' : l.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {q.format === 'chronological' && (
          <div className="space-y-2">
            <p className="text-xs text-white/40">Элементтерді дұрыс ретпен орналастырыңыз (жоғарыдан төменге).</p>
            {order.map((id, pos) => {
              const item = (q.items ?? []).find((i) => i.id === id);
              return (
                <div key={id} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/12 bg-white/4">
                  <span className="w-6 h-6 rounded-md bg-gold/15 border border-gold/30 text-gold grid place-items-center text-[11px] font-mono">
                    {pos + 1}
                  </span>
                  <GripVertical size={14} className="text-white/25" />
                  <span className="text-sm flex-1">{item?.text}</span>
                  <div className="flex gap-1">
                    <button
                      className="px-2 py-1 rounded border border-white/12 text-xs disabled:opacity-30"
                      disabled={pos === 0 || Boolean(result) || busy}
                      onClick={() => setOrder((o) => { const c = [...o]; [c[pos - 1], c[pos]] = [c[pos], c[pos - 1]]; return c; })}
                    >
                      ↑
                    </button>
                    <button
                      className="px-2 py-1 rounded border border-white/12 text-xs disabled:opacity-30"
                      disabled={pos === order.length - 1 || Boolean(result) || busy}
                      onClick={() => setOrder((o) => { const c = [...o]; [c[pos + 1], c[pos]] = [c[pos], c[pos + 1]]; return c; })}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {q.format === 'map' && q.point && (
          <div className="space-y-3">
            <PointMap point={q.point} />
            <div className="grid sm:grid-cols-2 gap-2">
              {(q.options ?? []).map((o, i) => (
                <button
                  key={o.id}
                  className="opt"
                  data-state={
                    result
                      ? result.correct && selected.includes(i) ? 'correct' : undefined
                      : selected.includes(i) ? 'selected' : undefined
                  }
                  disabled={Boolean(result) || busy}
                  onClick={() => pick([i])}
                >
                  <span className="text-sm">{o.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* feedback */}
      {result && (
        <div
          className={`mt-4 rounded-xl border p-3.5 animate-pop ${
            result.correct ? 'border-teal/40 bg-teal/10' : 'border-[#c96a4a]/40 bg-[#c96a4a]/10'
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            {result.correct ? (
              <>
                <CheckCircle2 size={17} className="text-teal" />
                <p className="font-semibold text-teal text-sm">Дұрыс жауап!</p>
              </>
            ) : (
              <>
                <XCircle size={17} className="text-[#e08a6a]" />
                <p className="font-semibold text-[#e08a6a] text-sm">Қате жауап</p>
              </>
            )}
          </div>
          {result.correct && result.answerText && (
            <p className="text-[13px] text-teal leading-relaxed flex gap-2 mb-1.5">
              <Eye size={14} className="shrink-0 mt-0.5" />
              <span>
                <span className="text-white/45">Дұрыс жауап: </span>
                {result.answerText}
              </span>
            </p>
          )}
          {!result.correct && (
            <p className="text-[12px] text-white/40 mb-1.5">
              Дұрыс жауап көрсетілмейді — қайта ойнап, өзіңіз табыңыз. −1 жан.
            </p>
          )}
          <p className="text-[13px] text-white/75 leading-relaxed flex gap-2">
            <BookOpen size={14} className="shrink-0 mt-0.5 text-gold" />
            <span>{result.explanation}</span>
          </p>
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <Link2 size={12} className="text-white/30" />
            <SourceRefs ids={result.sourceIds} />
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-[#e08a6a] bg-[#c96a4a]/10 border border-[#c96a4a]/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* actions */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[11px] text-white/35">
          Бір басу = жауап · қате жауап −1 жан · {lives}/{startLives} жан қалды
        </p>
        {result ? (
          <button className="btn btn-gold px-5 py-2.5 text-sm" onClick={next}>
            {lives === 0 || index + 1 >= total ? 'Нәтижені көру' : 'Келесі сұрақ'} <ChevronRight size={16} />
          </button>
        ) : (
          <button
            className="btn btn-teal px-5 py-2.5 text-sm"
            disabled={!canSubmit || busy}
            onClick={() => void submit(false)}
          >
            {busy ? 'Тексерілуде…' : 'Жауапты жіберу'}
          </button>
        )}
      </div>
    </div>
  );
}
