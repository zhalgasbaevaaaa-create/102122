/**
 * GAME 2 — «Ұлы дала билеушілері» (turn-based strategy)
 *
 * Resource management over 10 turns. Each turn the player answers one historical
 * challenge (unlocks the "chronicle" bonus) and then resolves a decision card that
 * is explicitly framed as a GAME decision with a documented historical note.
 */
import { useMemo, useRef, useState } from 'react';
import { Wheat, Swords, Sparkles, Coins, Landmark, Map, TrendingUp } from 'lucide-react';
import type { GameDef, LevelDef } from '@shared/games';
import { DECISIONS, type Decision } from '@shared/decisions';
import { useChallenge } from '../GameShell';
import { Badge, ProgressBar } from '../../components/UI';
import { SourceRefs } from '../../components/UI';

const PERIOD_MAP: Record<string, string[]> = {
  'saka-hun': ['saka-hun'],
  turkic: ['turkic'],
  'karakhanid-kipchak': ['karakhanid-kipchak'],
  'mongol-horde': ['mongol-horde'],
  khanate: ['khanate'],
  'russian-alash': ['russian-alash'],
  'stone-bronze': ['saka-hun'],
  'soviet-independent': ['soviet-independent'],
};

interface Res { food: number; army: number; prestige: number; gold: number }

export function StrategyStage({ game, level, paused }: { game: GameDef; level: LevelDef; paused: boolean }) {
  const challenge = useChallenge();
  const rounds = level.goal.rounds ?? 10;
  const targetScore = level.goal.target ?? 60;

  const deck = useMemo<Decision[]>(() => {
    const periods = PERIOD_MAP[level.periodId] ?? [level.periodId];
    const pool = DECISIONS.filter((d) => periods.includes(d.periodId));
    const filled = pool.length ? pool : DECISIONS;
    const out: Decision[] = [];
    for (let i = 0; i < rounds; i++) out.push(filled[i % filled.length]);
    return out;
  }, [level.periodId, rounds]);

  const [turn, setTurn] = useState(0);
  const [res, setRes] = useState<Res>({ food: 45, army: 40, prestige: 30, gold: 40 });
  const [log, setLog] = useState<{ turn: number; text: string; effects: Res }[]>([]);
  const [busy, setBusy] = useState(false);
  const [chronicle, setChronicle] = useState(0);
  const answeredRef = useRef(0);

  const card = deck[Math.min(turn, deck.length - 1)];
  const done = turn >= rounds;

  async function askChronicle() {
    if (busy || paused) return;
    setBusy(true);
    const ok = await challenge.ask();
    answeredRef.current += 1;
    if (ok) {
      setChronicle((c) => c + 1);
      setRes((r) => ({ ...r, prestige: r.prestige + 6, gold: r.gold + 5 }));
      challenge.addScore(80);
    }
    setBusy(false);
  }

  function choose(optIndex: number) {
    if (done || busy) return;
    const opt = card.options[optIndex];
    const next: Res = {
      food: Math.max(0, res.food + opt.effects.food),
      army: Math.max(0, res.army + opt.effects.army),
      prestige: Math.max(0, res.prestige + opt.effects.prestige),
      gold: Math.max(0, res.gold + opt.effects.gold),
    };
    setRes(next);
    const gain = Math.max(0, opt.effects.food + opt.effects.army / 2 + opt.effects.prestige + opt.effects.gold / 2);
    challenge.addScore(Math.round(20 + gain));
    challenge.sound('click');
    setLog((l) => [{ turn: turn + 1, text: opt.text, effects: opt.effects }, ...l]);
    setTurn((t) => t + 1);
  }

  const power = Math.round((res.food + res.army + res.prestige + res.gold) / 4);

  return (
    <div className="glass-strong p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone="gold"><Landmark size={11} /> {card.state}</Badge>
          <Badge tone="teal">Кезең {Math.min(turn + 1, rounds)} / {rounds}</Badge>
          <Badge>Шежіре бонусы: {chronicle}</Badge>
        </div>
        <Badge tone={power >= targetScore ? 'teal' : 'plain'}>
          <TrendingUp size={11} /> Мемлекет қуаты: {power} / {targetScore}
        </Badge>
      </div>

      {/* resources */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          { key: 'food', label: 'Азық', icon: <Wheat size={14} />, color: '#8fbf5f' },
          { key: 'army', label: 'Әскер', icon: <Swords size={14} />, color: '#c96a4a' },
          { key: 'prestige', label: 'Бедел', icon: <Sparkles size={14} />, color: '#d9a94a' },
          { key: 'gold', label: 'Қазына', icon: <Coins size={14} />, color: '#2fb3a8' },
        ].map((r) => (
          <div key={r.key} className="glass px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/45">
              <span style={{ color: r.color }}>{r.icon}</span> {r.label}
            </div>
            <p className="font-display text-xl mt-0.5" style={{ color: r.color }}>
              {res[r.key as keyof Res]}
            </p>
            <ProgressBar value={res[r.key as keyof Res]} tone={r.key === 'gold' ? 'gold' : 'teal'} height={3} />
          </div>
        ))}
      </div>

      {done ? (
        <div className="text-center py-6">
          <p className="font-display text-2xl text-parchment">Он кезең аяқталды</p>
          <p className="text-sm text-white/55 mt-2">
            Мемлекет қуаты: <span className="text-gold">{power}</span> · мақсат {targetScore}
          </p>
          <p className="text-xs text-white/40 mt-1">
            {power >= targetScore ? 'Мақсат орындалды — деңгейді аяқтауға болады.' : 'Мақсатқа жету үшін тарихи сұрақтарға көбірек жауап беріңіз.'}
          </p>
          <div className="mt-4 text-left glass px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-gold mb-1.5">Түйіндеме</p>
            <ul className="text-xs text-white/55 space-y-1">
              {log.slice(0, 10).map((l, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-white/30 font-mono">{l.turn}</span> {l.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <>
          <div className="glass px-4 py-3.5 mb-3 border-gold/25">
            <p className="text-[10px] uppercase tracking-wider text-gold mb-1.5">Жағдай</p>
            <p className="text-sm text-parchment leading-relaxed">{card.situation}</p>
            <p className="text-[10px] text-white/35 mt-2">Бұл — ойын шешімі. Тарихи мәлімет төменде берілген.</p>
          </div>

          <div className="grid gap-2">
            {card.options.map((o, i) => (
              <button
                key={i}
                className="opt"
                disabled={busy || paused}
                onClick={() => choose(i)}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm leading-snug">{o.text}</span>
                  <span className="flex gap-1.5 shrink-0 text-[10px] font-mono">
                    {(['food', 'army', 'prestige', 'gold'] as const).map((k) => (
                      <span key={k} className={o.effects[k] > 0 ? 'text-teal' : o.effects[k] < 0 ? 'text-[#e08a6a]' : 'text-white/25'}>
                        {o.effects[k] > 0 ? '+' : ''}{o.effects[k]}
                      </span>
                    ))}
                  </span>
                </div>
                <p className="text-[10px] text-white/35 mt-1">{o.note}</p>
              </button>
            ))}
          </div>

          <div className="mt-3 glass px-4 py-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-teal mb-1">Тарихи контекст</p>
                <p className="text-xs text-white/60 leading-relaxed">{card.history}</p>
                <div className="mt-1.5"><SourceRefs ids={card.sourceIds} /></div>
              </div>
              <button className="btn btn-teal px-3 py-2 text-xs shrink-0" onClick={() => void askChronicle()} disabled={busy || paused}>
                <Map size={13} /> Шежіреге сұраныс (+бедел)
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
