import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, AlertTriangle, Filter, MapPin, ExternalLink } from 'lucide-react';
import { useContent } from '../lib/useContent';
import { Badge, Card, Spinner, SourceRefs } from '../components/UI';

export default function TimelinePage() {
  const { data, loading } = useContent();
  const [period, setPeriod] = useState<string>('all');
  const [query, setQuery] = useState('');

  const events = useMemo(() => {
    if (!data) return [];
    return [...data.events]
      .filter((e) => (period === 'all' ? true : e.periodId === period))
      .filter((e) => (query ? e.title.toLowerCase().includes(query.toLowerCase()) || e.summary.toLowerCase().includes(query.toLowerCase()) : true))
      .sort((a, b) => a.year - b.year);
  }, [data, period, query]);

  if (loading || !data) return <Spinner label="Уақыт шкаласы жүктелуде…" />;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-6">
        <Badge tone="gold"><Clock size={11} /> Уақыт шкаласы</Badge>
        <h1 className="font-display text-3xl sm:text-5xl text-parchment mt-3">Ежелгі дәуірден бүгінге дейін</h1>
        <p className="text-white/55 text-sm mt-3 max-w-3xl leading-relaxed">
          {data.events.length} верификацияланған оқиға, 14 тарихи кезең. Әр оқиғада мерзім, қысқаша
          сипаттама және дереккөз көрсетілген. Даулы мерзімдер ерекше белгіленеді.
        </p>
      </header>

      <div className="glass p-3 mb-5 flex flex-wrap gap-2 items-center">
        <Filter size={14} className="text-white/40" />
        <button
          className={`text-[11px] px-2.5 py-1.5 rounded-lg border ${period === 'all' ? 'border-gold/50 bg-gold/12 text-gold' : 'border-white/10 text-white/50'}`}
          onClick={() => setPeriod('all')}
        >
          Барлық кезең
        </button>
        {data.periods.map((p) => (
          <button
            key={p.id}
            className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors ${
              period === p.id ? 'text-white' : 'text-white/50 hover:text-white/80'
            }`}
            style={{
              borderColor: period === p.id ? p.color : 'rgba(255,255,255,0.1)',
              background: period === p.id ? `${p.color}22` : 'transparent',
            }}
            onClick={() => setPeriod(p.id)}
          >
            {p.title}
          </button>
        ))}
        <input
          className="field py-1.5 text-xs ml-auto w-full sm:w-52"
          placeholder="Іздеу…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="relative">
        <div className="absolute left-3 sm:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-gold/40 via-teal/30 to-transparent sm:-translate-x-px" />
        <div className="space-y-3">
          {events.map((e, i) => {
            const p = data.periods.find((x) => x.id === e.periodId);
            const left = i % 2 === 0;
            return (
              <div key={e.id} className={`relative pl-9 sm:pl-0 sm:grid sm:grid-cols-2 sm:gap-6 ${left ? '' : 'sm:[&>*:first-child]:col-start-2'}`}>
                <span
                  className="absolute left-3 sm:left-1/2 top-4 w-2.5 h-2.5 rounded-full -translate-x-1/2 ring-4 ring-[#070b14]"
                  style={{ background: p?.color ?? '#d9a94a' }}
                />
                <div className={`${left ? 'sm:pr-6 sm:text-right' : 'sm:pl-6'} sm:col-span-1`}>
                  <Card className="p-4 hover:border-gold/30 transition-colors">
                    <div className={`flex items-center gap-2 flex-wrap mb-1.5 ${left ? 'sm:justify-end' : ''}`}>
                      <Badge tone="gold">{e.yearLabel}</Badge>
                      {e.disputed && (
                        <Badge tone="danger"><AlertTriangle size={9} /> даулы</Badge>
                      )}
                      {p && (
                        <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: `${p.color}22`, color: p.color }}>
                          {p.title}
                        </span>
                      )}
                    </div>
                    <p className="font-display text-base text-parchment leading-snug">{e.title}</p>
                    <p className="text-xs text-white/55 mt-1.5 leading-relaxed">{e.summary}</p>
                    {e.place && (
                      <p className="text-[11px] text-teal mt-1.5 flex items-center gap-1">
                        <MapPin size={10} /> {e.place}
                      </p>
                    )}
                    <div className={`mt-2 flex flex-wrap gap-1.5 ${left ? 'sm:justify-end' : ''}`}>
                      <SourceRefs ids={e.sourceIds} />
                    </div>
                    {e.disputed && (
                      <p className="text-[10px] text-[#e08a6a]/80 mt-1.5">
                        Ескерту: бұл мерзім/мәлімет ғылыми ортада талқыланады.
                      </p>
                    )}
                  </Card>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {events.length === 0 && (
        <p className="text-center text-sm text-white/40 py-12">Сүзгіге сай оқиға табылмады.</p>
      )}

      <Card className="p-4 mt-8">
        <p className="text-[11px] uppercase tracking-wider text-gold mb-2">Кезеңдерге шолу</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {data.periods.map((p) => (
            <Link
              key={p.id}
              to="/entsiklopediya"
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-white/10 hover:border-gold/35 transition-colors"
            >
              <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: p.color }} />
              <div>
                <p className="text-[12.5px] text-parchment">{p.title}</p>
                <p className="text-[10px] text-white/35">{p.years}</p>
              </div>
              <ExternalLink size={11} className="ml-auto text-white/20 mt-1" />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
