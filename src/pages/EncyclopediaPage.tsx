import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Search, AlertTriangle, Landmark, Scroll, Library, Layers } from 'lucide-react';
import { useContent } from '../lib/useContent';
import { Badge, Card, Spinner, SourceRefs, EmptyState } from '../components/UI';
import { Artifact } from '../components/Artifact';

export default function EncyclopediaPage() {
  const { data, loading } = useContent();
  const [q, setQ] = useState('');
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!q) return data.periods;
    const s = q.toLowerCase();
    return data.periods.filter(
      (p) =>
        p.title.toLowerCase().includes(s) ||
        p.summary.toLowerCase().includes(s) ||
        p.keyFacts.some((k) => k.toLowerCase().includes(s)) ||
        p.years.includes(s),
    );
  }, [data, q]);

  if (loading || !data) return <Spinner label="Энциклопедия жүктелуде…" />;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-6">
        <Badge tone="teal"><BookOpen size={11} /> Тарихи энциклопедия</Badge>
        <h1 className="font-display text-3xl sm:text-5xl text-parchment mt-3">14 дәуір — бір шежіре</h1>
        <p className="text-white/55 text-sm mt-3 max-w-3xl leading-relaxed">
          Тас дәуірінен Тәуелсіз Қазақстанға дейінгі кезеңдер. Әр кезеңде негізгі фактілер,
          дереккөздер және ғылыми ескертулер көрсетіледі.
        </p>
      </header>

      <div className="glass p-3 mb-5 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input className="field pl-9 py-2 text-xs" placeholder="Кезең, факт немесе жыл бойынша іздеу…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Badge><Layers size={11} /> {filtered.length} / {data.periods.length} кезең</Badge>
        <Badge tone="gold"><Landmark size={11} /> {data.artifacts.length} жәдігер</Badge>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Нәтиже жоқ" body="Іздеу сөзін өзгертіп көріңіз." icon={<Search size={22} />} />
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const open = openPeriod === p.id || Boolean(q);
            const artifacts = data.artifacts.filter((a) => a.periodId === p.id);
            const persons = data.persons.filter((x) => x.periodId === p.id);
            return (
              <Card key={p.id} className="overflow-hidden">
                <button className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-white/3 transition-colors" onClick={() => setOpenPeriod(open ? null : p.id)}>
                  <span className="w-2.5 h-2.5 rounded-full mt-2 shrink-0" style={{ background: p.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-lg text-parchment">{p.title}</p>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/6 border border-white/10 text-white/45">{p.years}</span>
                      {p.note && <Badge tone="danger"><AlertTriangle size={9} /> ескерту</Badge>}
                    </div>
                    <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{p.summary}</p>
                  </div>
                  <span className="text-white/25 text-xs shrink-0">{open ? '−' : '+'}</span>
                </button>

                {open && (
                  <div className="px-4 pb-4 pt-0 border-t border-white/8 mt-0">
                    <div className="mt-3 grid sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-gold mb-2 flex items-center gap-1.5">
                          <Scroll size={12} /> Негізгі фактілер
                        </p>
                        <ul className="space-y-1.5">
                          {p.keyFacts.map((k, i) => (
                            <li key={i} className="text-xs text-white/60 flex gap-2 leading-relaxed">
                              <span className="text-teal shrink-0">▸</span> {k}
                            </li>
                          ))}
                        </ul>
                        {p.note && (
                          <div className="mt-2.5 flex gap-2 text-[11px] text-[#e08a6a] bg-[#c96a4a]/10 border border-[#c96a4a]/30 rounded-lg px-3 py-2">
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                            <span>{p.note}</span>
                          </div>
                        )}
                        <div className="mt-2.5"><SourceRefs ids={p.sourceIds} /></div>
                      </div>

                      <div>
                        {artifacts.length > 0 && (
                          <>
                            <p className="text-[11px] uppercase tracking-wider text-gold mb-2 flex items-center gap-1.5">
                              <Library size={12} /> Жәдігерлер
                            </p>
                            <div className="flex flex-wrap gap-2 mb-3">
                              {artifacts.map((a) => (
                                <div key={a.id} className="glass px-2 py-1.5 flex flex-col items-center gap-1 w-[104px]">
                                  <Artifact id={a.id} size={58} />
                                  <p className="text-[9px] text-white/45 text-center leading-tight">{a.name}</p>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        {persons.length > 0 && (
                          <>
                            <p className="text-[11px] uppercase tracking-wider text-gold mb-1.5">Тұлғалар</p>
                            <div className="flex flex-wrap gap-1.5">
                              {persons.map((x) => (
                                <Link key={x.id} to={`/tulgalar/${x.id}`} className="text-[10.5px] px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/60 hover:border-teal/40 hover:text-white transition-colors">
                                  {x.name}
                                </Link>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-4 mt-6">
        <p className="text-[11px] uppercase tracking-wider text-gold mb-2">Дереккөздер тізілімі</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {data.sources.map((s) => (
            <div key={s.id} className="glass px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/8 border border-white/10 text-white/45 font-mono">{s.id}</span>
                <span className="text-[9px] uppercase tracking-wider text-teal">{s.kind}</span>
              </div>
              <p className="text-[11.5px] text-white/70 mt-1 leading-snug">{s.title}</p>
              {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-[10px] text-teal hover:underline">{s.url}</a>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
