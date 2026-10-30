import { useEffect, useState } from 'react';
import { Trophy, Medal, Target, Users, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useContent } from '../lib/useContent';
import { Badge, Card, Spinner, ProgressBar } from '../components/UI';

interface GlobalRow { pos: number; id: string; name: string; xp: number; score: number; accuracy: number; rank: string; group: string | null; sessions: number }
interface GameRow { pos: number; id: string; name: string; score: number; levels: number; group: string | null }

export default function LeaderboardPage() {
  const { data } = useContent();
  const [scope, setScope] = useState<string>('global');
  const [rows, setRows] = useState<GlobalRow[] | GameRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = scope === 'global' ? '/api/leaderboard?limit=50' : `/api/leaderboard?game=${scope}&limit=50`;
    api<{ rows: any[] }>(url)
      .then((r) => setRows(r.rows))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [scope]);

  const isGlobal = scope === 'global';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="mb-6">
        <Badge tone="gold"><Trophy size={11} /> Ойыншылар рейтингі</Badge>
        <h1 className="font-display text-3xl sm:text-5xl text-parchment mt-3">Ұлы дала рейтингі</h1>
        <p className="text-white/55 text-sm mt-3 max-w-2xl leading-relaxed">
          Жаһандық рейтинг XP бойынша, ойын рейтингтері ең үздік нәтиже бойынша есептеледі.
          Барлық көрсеткіштер сервердегі нақты нәтижелерден алынады.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5 mb-5">
        <button
          className={`btn px-3.5 py-2 text-xs ${isGlobal ? 'btn-gold' : 'btn-ghost'}`}
          onClick={() => setScope('global')}
        >
          <Users size={13} /> Жаһандық
        </button>
        {(data?.games ?? []).map((g) => (
          <button
            key={g.id}
            className={`btn px-3.5 py-2 text-xs ${scope === g.id ? 'btn-gold' : 'btn-ghost'}`}
            onClick={() => setScope(g.id)}
          >
            {g.title}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Рейтинг жүктелуде…" />
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <Medal size={26} className="mx-auto text-white/25 mb-3" />
          <p className="text-sm text-white/50">Бұл бөлімде әзірге нәтиже жоқ. Бірінші нәтижені сіз қойыңыз!</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[44px_1fr_70px_70px_70px] sm:grid-cols-[52px_1fr_100px_90px_100px_90px] gap-2 px-4 py-2.5 border-b border-white/10 text-[10px] uppercase tracking-wider text-white/35">
            <span>#</span>
            <span>Ойыншы</span>
            <span className="text-right">XP</span>
            <span className="text-right hidden sm:block">Ұпай</span>
            <span className="text-right">Дәлдік</span>
            <span className="text-right hidden sm:block">Сессия</span>
          </div>
          {rows.map((r: any) => (
            <div
              key={`${r.pos}-${r.id}`}
              className={`grid grid-cols-[44px_1fr_70px_70px_70px] sm:grid-cols-[52px_1fr_100px_90px_100px_90px] gap-2 px-4 py-2.5 items-center border-b border-white/5 last:border-0 ${
                r.pos <= 3 ? 'bg-gold/4' : ''
              }`}
            >
              <span
                className={`w-7 h-7 rounded-lg grid place-items-center text-[11px] font-mono ${
                  r.pos === 1 ? 'bg-gold/25 text-gold border border-gold/40'
                  : r.pos === 2 ? 'bg-white/12 text-white/80 border border-white/25'
                  : r.pos === 3 ? 'bg-[#c98a1f]/18 text-[#e0b06a] border border-[#c98a1f]/35'
                  : 'bg-white/5 text-white/40 border border-white/10'
                }`}
              >
                {r.pos}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] text-parchment truncate">
                  {r.name}
                  {r.group && <span className="text-[10px] text-white/35 ml-1.5">{r.group}</span>}
                </p>
                <p className="text-[10px] text-white/30 truncate">{isGlobal ? r.rank : `${r.levels} деңгей`}</p>
              </div>
              <span className="text-right text-xs text-teal font-mono">{isGlobal ? r.xp : r.score}</span>
              <span className="text-right text-xs text-white/55 font-mono hidden sm:block">{isGlobal ? r.score : '—'}</span>
              <div className="text-right">
                <span className="text-xs text-white/60 font-mono">{isGlobal ? `${r.accuracy}%` : '—'}</span>
              </div>
              <span className="text-right text-xs text-white/40 font-mono hidden sm:block">{isGlobal ? r.sessions : r.levels}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
