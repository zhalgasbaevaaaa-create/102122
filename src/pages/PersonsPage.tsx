import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users, Filter, ArrowRight } from 'lucide-react';
import { useContent } from '../lib/useContent';
import { Badge, Card, Spinner, EmptyState } from '../components/UI';
import { Portrait, PortraitCaption } from '../components/Portrait';

export default function PersonsPage() {
  const { data, loading } = useContent();
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState('all');

  const persons = useMemo(() => {
    if (!data) return [];
    return data.persons
      .filter((p) => (period === 'all' ? true : p.periodId === period))
      .filter((p) =>
        q
          ? p.name.toLowerCase().includes(q.toLowerCase()) ||
            (p.fullName ?? '').toLowerCase().includes(q.toLowerCase()) ||
            p.role.toLowerCase().includes(q.toLowerCase()) ||
            p.significance.toLowerCase().includes(q.toLowerCase())
          : true,
      );
  }, [data, q, period]);

  if (loading || !data) return <Spinner label="Тарихи тұлғалар жүктелуде…" />;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-6">
        <Badge tone="gold"><Users size={11} /> Тарихи тұлғалар</Badge>
        <h1 className="font-display text-3xl sm:text-5xl text-parchment mt-3">Батырлар мен тарихи тұлғалар</h1>
        <p className="text-white/55 text-sm mt-3 max-w-3xl leading-relaxed">
          {data.persons.length} тұлға: ғұн билеушілерінен бастап қазіргі заман қайраткерлеріне дейін.
          Әр профильде өмір сүрген жылдары, тарихи рөлі, жетістіктері, дереккөздер және байланысты
          ойын миссиялары көрсетіледі.
        </p>
        <p className="text-[11px] text-white/35 mt-2">
          Ескерту: барлық портреттер — стильденген иллюстрациялар, тарихи фотосурет немесе дәл көшірме емес.
        </p>
      </header>

      <div className="glass p-3 mb-5 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input className="field pl-9 text-xs py-2" placeholder="Аты, рөлі немесе маңызы бойынша іздеу…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Filter size={14} className="text-white/30" />
        <select className="field py-2 text-xs w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="all">Барлық кезең</option>
          {data.periods.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        <span className="text-[11px] text-white/40">{persons.length} тұлға</span>
      </div>

      {persons.length === 0 ? (
        <EmptyState title="Ештеңе табылмады" body="Іздеу сөзін немесе кезең сүзгісін өзгертіп көріңіз." icon={<Users size={22} />} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {persons.map((p) => {
            const per = data.periods.find((x) => x.id === p.periodId);
            return (
              <Link key={p.id} to={`/tulgalar/${p.id}`} className="group">
                <Card className="p-4 h-full hover:border-gold/40 transition-colors">
                  <div className="flex gap-3">
                    <div className="text-center shrink-0">
                      <Portrait person={p} size={74} />
                      <div className="mt-1"><PortraitCaption /></div>
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-[15px] text-parchment leading-snug group-hover:text-gold transition-colors">{p.name}</p>
                      <p className="text-[10px] text-white/40 mt-0.5">{p.life}</p>
                      <p className="text-[11px] text-teal mt-1 leading-snug">{p.role}</p>
                      {per && (
                        <span className="inline-block mt-1.5 text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${per.color}22`, color: per.color }}>
                          {per.title}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-white/50 mt-2.5 leading-relaxed line-clamp-3">{p.significance}</p>
                  <span className="text-[10px] text-teal mt-2 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Толық профиль <ArrowRight size={10} />
                  </span>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
