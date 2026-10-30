/**
 * «Тарих майданы» — ОНЛАЙН режим (WebSocket).
 *
 * Flow: connect → create/join a room by code → lobby (invite link, bots, ready)
 * → live rounds (server deadline, instant personal feedback + explanation)
 * → reveal (who scored) → final standings with server-validated XP.
 *
 * Everything competitive is decided on the server: question draw, correctness,
 * speed bonus and the final score. The UI never computes a score of its own.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Users, Radio, Copy, Check, Crown, Bot, LogOut, Play, Timer, Wifi, WifiOff,
  Trophy, CheckCircle2, XCircle, Zap, BookOpen, ArrowRight, Loader2, Link2,
} from 'lucide-react';
import type { Question } from '@shared/quiz-types';
import { useMultiplayer, type MpRoom, type MpQuestion, type MpResultRow } from '../../lib/multiplayer';
import { useAuth } from '../../lib/auth';
import { Badge, ProgressBar, SourceRefs, useToast } from '../../components/UI';
import { PointMap } from '../../components/PointMap';
import { Artifact } from '../../components/Artifact';
import { playSfx } from '../../lib/sound';

const KZ = {
  connect: 'Серверге қосылу',
  connecting: 'Қосылып жатыр…',
  create: 'Бөлме құру',
  join: 'Код бойынша қосылу',
  code: 'Бөлме коды',
  copy: 'Сілтемені көшіру',
  copied: 'Көшірілді',
  addBot: 'Бот қосу',
  start: 'Сайысты бастау',
  waiting: 'Ойыншылар күтілуде',
};

export function OnlineBattle({ level, inviteCode = '', onExit }: { level: number; inviteCode?: string; onExit: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const mp = useMultiplayer();
  const [room, setRoom] = useState<MpRoom | null>(null);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState(inviteCode);
  const [teamMode, setTeamMode] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(20);
  const [copied, setCopied] = useState(false);

  // live round state
  const [q, setQ] = useState<MpQuestion | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ correct: boolean; explanation: string; sourceIds: string[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [reveal, setReveal] = useState<null | {
    correctAnswerLabel: string;
    explanation: string;
    sourceIds: string[];
    perSeat: { seatId: string; correct: boolean; answered: boolean }[];
    nextAt: number;
  }>(null);
  const [finished, setFinished] = useState<null | {
    winner: string;
    teamTotals: { A: number; B: number } | null;
    results: MpResultRow[];
    me: { score: number; xp: number; accuracy: number; bestStreak: number; breakdown: any; rank: any; unlocked: any[] } | null;
  }>(null);
  const [now, setNow] = useState(() => Date.now());

  const mySeat = useMemo(() => room?.seats.find((s) => s.id === seatId) ?? null, [room, seatId]);
  const isHost = Boolean(user && room && room.hostId === user.id);

  // Arriving through an invite link (?room=CODE) connects and joins immediately.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (!inviteCode) return;
    if (mp.status === 'idle') mp.connect();
    if (mp.status === 'open' && mp.me && !autoJoined.current) {
      autoJoined.current = true;
      mp.send({ type: 'join', code: inviteCode });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteCode, mp.status, mp.me]);

  // ── ticking clock for countdowns (server deadline is authoritative) ──────
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // ── server events ────────────────────────────────────────────────────────
  const lastEvent = useRef<string>('');
  useEffect(() => {
    const ev = mp.event;
    if (!ev) return;
    const key = `${ev.type}:${(ev as any).index ?? ''}:${(ev as any).code ?? ''}`;
    if (key === lastEvent.current && ev.type !== 'answer_result' && ev.type !== 'reveal') return;
    lastEvent.current = key;

    switch (ev.type) {
      case 'created':
        setRoom(ev.room);
        setCode(ev.code);
        setSeatId(ev.seatId); // the server tells every socket which seat is theirs
        break;
      case 'joined':
        setRoom(ev.room);
        setSeatId(ev.seatId);
        break;
      case 'state':
        setRoom(ev.room);
        if (ev.you) setSeatId(ev.you);
        if (ev.question) {
          setQ(ev.question);
          if (!ev.question.revealed) resetAnswerState();
        }
        if (ev.room.status === 'lobby') {
          setQ(null);
          setReveal(null);
          setFinished(null);
        }
        break;
      case 'question':
        setRoom((r) => (r ? { ...r, status: 'playing', index: ev.index } : r));
        setQ(ev);
        setReveal(null);
        resetAnswerState();
        playSfx('whoosh');
        break;
      case 'seat_answered':
        setRoom((r) => (r ? { ...r, seats: ev.seats } : r));
        break;
      case 'answer_result':
        setFeedback({ correct: ev.correct, explanation: ev.explanation, sourceIds: ev.sourceIds });
        setPending(false);
        playSfx(ev.correct ? 'correct' : 'wrong');
        break;
      case 'reveal':
        setReveal(ev);
        setRoom((r) => (r ? { ...r, status: 'reveal', seats: ev.seats } : r));
        break;
      case 'finished':
        setFinished(ev);
        setRoom((r) => (r ? { ...r, status: 'finished' } : r));
        setQ(null);
        setReveal(null);
        playSfx('win');
        break;
      case 'closed':
        toast({ kind: 'err', title: 'Бөлме жабылды', body: ev.reason });
        setRoom(null);
        setSeatId(null);
        break;
      case 'error':
        toast({ kind: 'err', title: 'Қате', body: ev.error });
        setPending(false);
        break;
      default:
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mp.event]);

  function resetAnswerState() {
    setPicked([]);
    setPairs({});
    setOrder([]);
    setFeedback(null);
    setPending(false);
  }

  // ── actions ──────────────────────────────────────────────────────────────
  const doConnect = () => {
    mp.connect();
  };

  const create = () => {
    mp.send({ type: 'create', options: { teamMode, timerSeconds, level } });
  };

  const join = () => {
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) return toast({ kind: 'err', title: 'Кодты енгізіңіз', body: 'Бөлме коды 6 таңбадан тұрады.' });
    mp.send({ type: 'join', code: c });
  };

  const copyLink = async () => {
    const link = `${location.origin}/oyyn/battle?room=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ kind: 'info', title: 'Сілтеме', body: link });
    }
  };

  const question = q?.question as Question | undefined;
  const deadline = q?.deadline ?? 0;
  const remainMs = Math.max(0, deadline - now);
  const remainSec = Math.ceil(remainMs / 1000);
  const timerMs = room?.timerMs ?? 20000;

  const canSubmit = (() => {
    if (!question || feedback || pending) return false;
    if (question.format === 'match-dates' || question.format === 'match-persons') {
      return question.left ? Object.keys(pairs).length === question.left.length : false;
    }
    if (question.format === 'chronological') return order.length === (question.items?.length ?? 0);
    if (question.format === 'multi-select') return picked.length > 0;
    return picked.length === 1;
  })();

  function buildAnswer(): unknown {
    if (!question) return null;
    if (question.format === 'match-dates' || question.format === 'match-persons') return pairs;
    if (question.format === 'chronological') return order;
    if (question.format === 'multi-select') return picked;
    return picked[0];
  }

  const submit = useCallback(
    (timedOut = false) => {
      if (!question || feedback || pending) return;
      if (!timedOut && !canSubmit) return;
      setPending(true);
      mp.send({
        type: 'answer',
        answer: timedOut ? null : buildAnswer(),
        ms: Math.max(0, timerMs - remainMs),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question, feedback, pending, canSubmit, pairs, order, picked, remainMs, timerMs],
  );

  // auto-timeout: when the server deadline passes, send an empty answer
  useEffect(() => {
    if (!q || feedback || pending || !question) return;
    if (remainMs <= 0) submit(true);
  }, [remainMs, q, feedback, pending, question, submit]);

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <Header status={mp.status} room={room} onExit={onExit} />

      {mp.status !== 'open' && (
        <div className="glass-strong p-5 sm:p-7 text-center">
          <Radio size={30} className="mx-auto text-teal mb-3" />
          <h2 className="font-display text-xl text-parchment">Онлайн сайыс</h2>
          <p className="text-xs text-white/50 mt-2 max-w-lg mx-auto leading-relaxed">
            Нақты уақыттағы жарыс: сұрақтар серверде таңдалады, уақыт сервер сағатымен өлшенеді,
            ұпай серверде есептеледі. 2–8 ойыншы, командалық режим (2×2) қолдау көрсетіледі.
          </p>
          <button className="btn btn-gold mt-4 px-5 py-2.5" onClick={doConnect}>
            {mp.status === 'connecting' ? <><Loader2 size={14} className="animate-spin" /> {KZ.connecting}</> : <><Wifi size={14} /> {KZ.connect}</>}
          </button>
          {mp.error && <p className="text-[11px] text-[#e08a6a] mt-3">{mp.error}</p>}
        </div>
      )}

      {mp.status === 'open' && !room && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="glass-strong p-4 sm:p-5">
            <h3 className="font-display text-lg text-parchment flex items-center gap-2">
              <Crown size={16} className="text-gold" /> Бөлме құру
            </h3>
            <p className="text-[11px] text-white/45 mt-1 mb-3">Сіз қонақжай боласыз. Кодты достарыңызға жіберіңіз.</p>
            <label className="flex items-center justify-between gap-2 mb-2.5 text-xs text-white/70">
              <span>Командалық режим (2×2)</span>
              <input type="checkbox" checked={teamMode} onChange={(e) => setTeamMode(e.target.checked)} className="accent-gold" />
            </label>
            <label className="block mb-3 text-xs text-white/70">
              <span className="block mb-1">Бір сұраққа уақыт: {timerSeconds} сек</span>
              <input type="range" min={10} max={45} step={5} value={timerSeconds}
                onChange={(e) => setTimerSeconds(Number(e.target.value))} className="w-full accent-gold" />
            </label>
            <button className="btn btn-gold w-full py-2.5 text-sm" onClick={create}>
              <Play size={14} /> Бөлме құру
            </button>
          </div>

          <div className="glass-strong p-4 sm:p-5">
            <h3 className="font-display text-lg text-parchment flex items-center gap-2">
              <Link2 size={16} className="text-teal" /> Код бойынша қосылу
            </h3>
            <p className="text-[11px] text-white/45 mt-1 mb-3">Досыңыздың кодын енгізіңіз (6 таңба).</p>
            <input
              className="field w-full text-center text-lg tracking-[0.3em] uppercase mb-3"
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="ABC123"
            />
            <button className="btn btn-teal w-full py-2.5 text-sm" onClick={join} disabled={joinCode.length < 4}>
              <Users size={14} /> Қосылу
            </button>
          </div>
        </div>
      )}

      {room && room.status === 'lobby' && (
        <div className="glass-strong p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40">{KZ.code}</p>
              <p className="font-display text-2xl text-gradient-gold tracking-[0.25em]">{room.code}</p>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={copyLink}>
                {copied ? <><Check size={12} /> {KZ.copied}</> : <><Copy size={12} /> {KZ.copy}</>}
              </button>
              <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => { mp.send({ type: 'leave' }); setRoom(null); setSeatId(null); }}>
                <LogOut size={12} /> Шығу
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-2 mt-4">
            {room.seats.map((s, i) => (
              <div key={s.id} className="glass px-3 py-2.5 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-white/8 grid place-items-center text-[11px] text-gold font-semibold">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-parchment truncate flex items-center gap-1">
                    {s.name} {s.id === seatId && <span className="text-[9px] text-teal">(сіз)</span>}
                    {s.bot && <Bot size={11} className="text-white/40" />}
                  </p>
                  <p className="text-[10px] text-white/40">
                    {s.team ? `${s.team} командасы` : 'жеке'} · {s.connected ? 'қосылған' : 'ажыратылған'}
                  </p>
                </div>
                {room.hostId === s.id ? <Crown size={13} className="text-gold" /> : null}
              </div>
            ))}
            {room.seats.length < 2 && (
              <div className="glass px-3 py-2.5 border-dashed text-xs text-white/35 grid place-items-center">
                {KZ.waiting}…
              </div>
            )}
          </div>

          {isHost && (
            <div className="flex flex-wrap gap-2 mt-4">
              <button className="btn btn-ghost px-3 py-2 text-xs" onClick={() => mp.send({ type: 'bots', count: 1 })}>
                <Bot size={13} /> {KZ.addBot}
              </button>
              <button className="btn btn-ghost px-3 py-2 text-xs" onClick={() => mp.send({ type: 'bots', count: 3 })}>
                <Bot size={13} /> 3 бот қосу
              </button>
              <button
                className="btn btn-gold px-4 py-2 text-xs ml-auto"
                disabled={room.seats.length < 2}
                onClick={() => mp.send({ type: 'start', count: 10 })}
              >
                <Play size={13} /> {KZ.start} ({room.seats.length}/8)
              </button>
            </div>
          )}
          {!isHost && (
            <p className="text-[11px] text-white/45 mt-4 flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> Қонақжайдың бастауын күтудеміз…
            </p>
          )}
        </div>
      )}

      {room && q && question && (room.status === 'playing' || room.status === 'reveal') && (
        <QuestionView
          question={question}
          index={q.index}
          total={q.total}
          remainSec={remainSec}
          remainRatio={timerMs ? remainMs / timerMs : 0}
          picked={picked}
          setPicked={setPicked}
          pairs={pairs}
          setPairs={setPairs}
          order={order}
          setOrder={setOrder}
          feedback={feedback}
          pending={pending}
          reveal={reveal}
          mySeatId={seatId}
          seats={room.seats}
          deadline={`${room.timerMs / 1000} сек`}
          canSubmit={canSubmit}
          onSubmit={() => submit(false)}
        />
      )}

      {finished && <Results finished={finished} mySeatId={seatId} onAgain={() => {
        setFinished(null);
        mp.send({ type: 'leave' });
        setRoom(null);
        setSeatId(null);
      }} />}
    </div>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────
function Header({ status, room, onExit }: { status: string; room: MpRoom | null; onExit: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone="gold"><Radio size={11} /> Онлайн сайыс</Badge>
        {role(status)}
        {room && <Badge tone="teal">{room.code}</Badge>}
        {room && <Badge>Ойыншы: {room.seats.length}/8</Badge>}
      </div>
      <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={onExit}>Шығу</button>
    </div>
  );
}

function role(status: string) {
  if (status === 'open') return <Badge tone="teal"><Wifi size={11} /> Қосылған</Badge>;
  if (status === 'connecting') return <Badge><Loader2 size={11} className="animate-spin" /> Қосылуда</Badge>;
  return <Badge><WifiOff size={11} /> Ажыратылған</Badge>;
}

function QuestionView(props: {
  question: Question;
  index: number;
  total: number;
  remainSec: number;
  remainRatio: number;
  picked: number[];
  setPicked: (v: number[] | ((p: number[]) => number[])) => void;
  pairs: Record<string, string>;
  setPairs: (v: Record<string, string> | ((p: Record<string, string>) => Record<string, string>)) => void;
  order: string[];
  setOrder: (v: string[] | ((p: string[]) => string[])) => void;
  feedback: { correct: boolean; explanation: string; sourceIds: string[] } | null;
  pending: boolean;
  reveal: null | { perSeat: { seatId: string; correct: boolean; answered: boolean }[]; correctAnswerLabel: string; explanation: string; sourceIds: string[] };
  mySeatId: string | null;
  seats: MpRoom['seats'];
  deadline: string;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  const { question: q, feedback, reveal, pending, picked, setPicked, seats } = props;
  const locked = Boolean(feedback) || Boolean(reveal) || pending;
  const multi = q.format === 'multi-select';
  const isMatch = q.format === 'match-dates' || q.format === 'match-persons';

  return (
    <div className="glass-strong p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone="gold">Сұрақ {props.index + 1} / {props.total}</Badge>
          <Badge tone="teal">{formatLabel(q.format)}</Badge>
          <Badge><Timer size={11} /> {props.deadline}</Badge>
          {feedback && !reveal && (
            <Badge tone={feedback.correct ? 'teal' : 'gold'}>
              {feedback.correct ? <><CheckCircle2 size={11} /> Дұрыс</> : <><XCircle size={11} /> Қате</>}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-[130px]">
          <Timer size={13} className={props.remainSec <= 5 ? 'text-[#e08a6a]' : 'text-teal'} />
          <span className="text-sm tabular-nums text-parchment w-7">{props.remainSec}</span>
          <div className="flex-1">
            <ProgressBar value={Math.round(Math.max(0, props.remainRatio) * 100)} tone={props.remainRatio < 0.25 ? 'gold' : 'teal'} />
          </div>
        </div>
      </div>

      <p className="font-display text-base sm:text-lg text-parchment leading-relaxed mb-3">{q.prompt}</p>

      {q.format === 'image-id' && q.artifactId && (
        <div className="mb-3 grid place-items-center"><Artifact id={q.artifactId} size={150} label /></div>
      )}
      {q.format === 'map' && q.point && <div className="mb-3"><PointMap point={q.point} /></div>}

      {(q.format === 'mcq' || q.format === 'truefalse' || q.format === 'fill-blank' ||
        q.format === 'find-mistake' || q.format === 'multi-select' || q.format === 'image-id' || q.format === 'map') && (
        <div className="grid sm:grid-cols-2 gap-2">
          {(q.options ?? []).map((o, i) => {
            const sel = picked.includes(i);
            const state = locked
              ? reveal && reveal.correctAnswerLabel.includes(o.text)
                ? 'correct'
                : sel ? 'wrong' : undefined
              : sel ? 'selected' : undefined;
            return (
              <button
                key={o.id}
                data-state={state}
                className="opt text-left px-3 py-2.5 text-sm"
                disabled={locked}
                onClick={() => setPicked((p) => (multi ? (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]) : [i]))}
              >
                <span className="text-[10px] text-white/40 mr-2">{multi ? (sel ? '☑' : '☐') : String.fromCharCode(65 + i)}</span>
                {o.text}
              </button>
            );
          })}
        </div>
      )}

      {isMatch && (
        <MatchBoard q={q} pairs={props.pairs} setPairs={props.setPairs} locked={locked} />
      )}

      {q.format === 'chronological' && (
        <ol className="space-y-1.5">
          {props.order.map((id, pos) => {
            const item = (q.items ?? []).find((x) => x.id === id);
            return (
              <li key={id} className="glass px-3 py-2 flex items-center gap-2 text-sm">
                <span className="w-6 h-6 rounded-full bg-gold/15 text-gold text-[11px] grid place-items-center">{pos + 1}</span>
                <span className="flex-1 text-parchment/90">{item?.text}</span>
                <button className="btn btn-ghost px-1.5 py-0.5 text-[10px]" disabled={locked || pos === 0}
                  onClick={() => props.setOrder((o) => { const c = [...o]; [c[pos - 1], c[pos]] = [c[pos], c[pos - 1]]; return c; })}>↑</button>
                <button className="btn btn-ghost px-1.5 py-0.5 text-[10px]" disabled={locked || pos === props.order.length - 1}
                  onClick={() => props.setOrder((o) => { const c = [...o]; [c[pos + 1], c[pos]] = [c[pos], c[pos + 1]]; return c; })}>↓</button>
              </li>
            );
          })}
        </ol>
      )}

      {!feedback && !reveal && (
        <button className="btn btn-gold w-full mt-3 py-2.5 text-sm" disabled={!props.canSubmit} onClick={props.onSubmit}>
          {pending ? <><Loader2 size={14} className="animate-spin" /> Тексерілуде…</> : <>Жауапты жіберу <ArrowRight size={14} /></>}
        </button>
      )}

      {feedback && (
        <div className={`mt-3 rounded-xl border px-3 py-2.5 text-xs ${feedback.correct ? 'border-teal/40 bg-teal/8' : 'border-[#c96a4a]/40 bg-[#c96a4a]/8'}`}>
          <p className="flex items-start gap-1.5 text-white/80 leading-relaxed">
            <BookOpen size={13} className="mt-0.5 shrink-0 text-gold" /> {feedback.explanation}
          </p>
          <SourceRefs ids={feedback.sourceIds} />
        </div>
      )}

      {reveal && (
        <div className="mt-3 space-y-2">
          <div className="rounded-xl border border-white/12 bg-white/4 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Дұрыс жауап</p>
            <p className="text-sm text-teal">{reveal.correctAnswerLabel || '—'}</p>
            <p className="text-xs text-white/65 mt-2 leading-relaxed flex gap-1.5">
              <BookOpen size={12} className="mt-0.5 shrink-0 text-gold" /> {reveal.explanation}
            </p>
            <SourceRefs ids={reveal.sourceIds} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {seats.map((s) => {
              const r = reveal.perSeat.find((p) => p.seatId === s.id);
              return (
                <div key={s.id} className={`glass px-2 py-1.5 text-[11px] flex items-center gap-1.5 ${r?.correct ? 'border-teal/40' : ''}`}>
                  {r?.correct ? <CheckCircle2 size={11} className="text-teal" /> : <XCircle size={11} className="text-[#e08a6a]" />}
                  <span className="truncate text-white/70">{s.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchBoard({ q, pairs, setPairs, locked }: {
  q: Question;
  pairs: Record<string, string>;
  setPairs: (v: Record<string, string> | ((p: Record<string, string>) => Record<string, string>)) => void;
  locked: boolean;
}) {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1.5">
        {(q.left ?? []).map((l) => (
          <button key={l.id} className="opt w-full text-left px-2.5 py-2 text-xs" data-state={target === l.id ? 'selected' : pairs[l.id] ? 'correct' : undefined}
            disabled={locked} onClick={() => setTarget(l.id)}>
            {l.text}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        {(q.right ?? []).map((r) => {
          const used = Object.values(pairs).includes(r.id);
          return (
            <button key={r.id} className={`opt w-full text-left px-2.5 py-2 text-xs ${used ? 'opacity-40' : ''}`} disabled={locked || !target}
              onClick={() => {
                if (!target) return;
                setPairs((p) => {
                  const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== r.id));
                  return { ...clean, [target]: r.id };
                });
                setTarget(null);
              }}>
              {r.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Results({ finished, mySeatId, onAgain }: {
  finished: { winner: string; teamTotals: { A: number; B: number } | null; results: MpResultRow[]; me: any };
  mySeatId: string | null;
  onAgain: () => void;
}) {
  const mine = finished.results.find((r) => r.seatId === mySeatId);
  const place = finished.results.findIndex((r) => r.seatId === mySeatId) + 1;
  return (
    <div className="space-y-3">
      <div className="glass-strong p-5 text-center">
        <Trophy size={30} className="mx-auto text-gold mb-2" />
        <h2 className="font-display text-2xl text-parchment">Сайыс аяқталды</h2>
        <p className="text-sm text-white/60 mt-1">
          {finished.teamTotals
            ? finished.winner === 'draw'
              ? 'Тең ойын!'
              : `${finished.winner} командасы жеңді (${finished.teamTotals.A} : ${finished.teamTotals.B})`
            : `${mine?.name ?? 'Сіз'} — ${place}-орын`}
        </p>
        {finished.me && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            <Stat label="Серверлік ұпай" value={finished.me.score} />
            <Stat label="XP" value={`+${finished.me.xp}`} />
            <Stat label="Дәлдік" value={`${finished.me.accuracy}%`} />
            <Stat label="Серия" value={`×${finished.me.bestStreak}`} />
          </div>
        )}
        {finished.me?.rank && (
          <p className="text-[11px] text-white/45 mt-2">
            Дәреже: <span className="text-gold">{finished.me.rank.title}</span> · жалпы XP {finished.me.totalXp}
          </p>
        )}
      </div>

      <div className="glass-strong p-3 sm:p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-white/40">
              <th className="text-left py-1.5">#</th>
              <th className="text-left">Ойыншы</th>
              <th className="text-right">Ұпай</th>
              <th className="text-right">Дұрыс</th>
              <th className="text-right">XP</th>
            </tr>
          </thead>
          <tbody>
            {finished.results.map((r, i) => (
              <tr key={r.seatId} className={`border-t border-white/6 ${r.seatId === mySeatId ? 'bg-gold/6' : ''}`}>
                <td className="py-1.5 text-white/40">{i + 1}</td>
                <td className="text-parchment/90">
                  {r.name} {r.bot && <Bot size={10} className="inline text-white/35" />}
                </td>
                <td className="text-right tabular-nums text-gold">{r.score}</td>
                <td className="text-right tabular-nums text-white/60">{r.correct}/{r.correct + r.wrong}</td>
                <td className="text-right tabular-nums text-teal">{r.bot ? '—' : `+${r.xp ?? 0}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {finished.me?.unlocked?.length ? (
        <div className="glass-strong p-3">
          <p className="text-xs text-white/55 mb-2 flex items-center gap-1.5"><Zap size={12} className="text-gold" /> Жаңа жетістіктер</p>
          <div className="flex flex-wrap gap-1.5">
            {finished.me.unlocked.map((a: any) => <Badge key={a.id} tone="gold">{a.title}</Badge>)}
          </div>
        </div>
      ) : null}

      <button className="btn btn-gold w-full py-2.5 text-sm" onClick={onAgain}>Жаңа бөлме</button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass px-2 py-2">
      <p className="text-[9px] uppercase tracking-wider text-white/40">{label}</p>
      <p className="font-display text-lg text-parchment">{value}</p>
    </div>
  );
}

function formatLabel(f: string) {
  const map: Record<string, string> = {
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
  return map[f] ?? f;
}
