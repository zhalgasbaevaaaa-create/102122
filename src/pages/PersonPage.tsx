import { useParams, Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Award, BookOpen, Gamepad2, AlertTriangle, ExternalLink } from 'lucide-react';
import { useContent } from '../lib/useContent';
import { Badge, Card, Spinner, SourceRefs } from '../components/UI';
import { Portrait, PortraitCaption } from '../components/Portrait';

export default function PersonPage() {
  const { personId } = useParams();
  const { data, loading } = useContent();
  if (loading || !data) return <Spinner label="Профиль жүктелуде…" />;

  const person = data.persons.find((p) => p.id === personId);
  if (!person) return <Navigate to="/tulgalar" replace />;
  const period = data.periods.find((p) => p.id === person.periodId);
  const sources = data.sources.filter((s) => person.sourceIds.includes(s.id));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link to="/tulgalar" className="text-xs text-white/45 hover:text-white inline-flex items-center gap-1 mb-4">
        <ArrowLeft size={13} /> Барлық тұлғалар
      </Link>

      <Card className="p-5 sm:p-7">
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="text-center shrink-0">
            <Portrait person={person} size={132} />
            <div className="mt-1.5"><PortraitCaption /></div>
            <p className="text-[9px] text-white/25 mt-1 max-w-[132px] mx-auto leading-tight">
              Тарихи фотосурет емес
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {period && (
                <span className="chip" style={{ background: `${period.color}22`, borderColor: `${period.color}55`, color: period.color }}>
                  {period.title}
                </span>
              )}
              <Badge>{person.life}</Badge>
            </div>
            <h1 className="font-display text-2xl sm:text-4xl text-parchment">{person.name}</h1>
            {person.fullName && <p className="text-xs text-white/40 mt-1">Толық аты: {person.fullName}</p>}
            <p className="text-sm text-teal mt-2">{person.role}</p>

            <p className="text-sm text-white/65 mt-4 leading-relaxed">{person.significance}</p>

            {person.disputed && (
              <div className="mt-3 flex gap-2 text-[11px] text-[#e08a6a] bg-[#c96a4a]/10 border border-[#c96a4a]/30 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>Ғылыми ескерту: {person.disputed}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gold mb-2 flex items-center gap-1.5">
              <Award size={12} /> Негізгі жетістіктер
            </p>
            <ul className="space-y-1.5">
              {person.achievements.map((a, i) => (
                <li key={i} className="text-xs text-white/60 flex gap-2 leading-relaxed">
                  <span className="text-teal shrink-0">▸</span> {a}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gold mb-2 flex items-center gap-1.5">
              <Gamepad2 size={12} /> Байланысты ойын миссиялары
            </p>
            <div className="space-y-1.5">
              {person.relatedLevels.map((rl) => {
                const [gameId, levelNum] = rl.split('-');
                const game = data.games.find((g) => g.id === gameId);
                if (!game) return null;
                return (
                  <Link
                    key={rl}
                    to={`/oyyn/${gameId}`}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-white/10 hover:border-teal/40 transition-colors"
                  >
                    <span className="w-6 h-6 rounded bg-teal/12 border border-teal/30 text-teal grid place-items-center text-[10px] font-mono">
                      {levelNum}
                    </span>
                    <span className="text-[11.5px] text-white/65">{game.title}</span>
                    <ExternalLink size={10} className="ml-auto text-white/20" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-wider text-gold mb-2 flex items-center gap-1.5">
            <BookOpen size={12} /> Дереккөздер
          </p>
          <div className="space-y-1.5">
            {sources.map((s) => (
              <div key={s.id} className="glass px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/8 border border-white/10 text-white/45 font-mono">{s.id}</span>
                  <span className="text-[9px] uppercase tracking-wider text-teal">{s.kind}</span>
                </div>
                <p className="text-[11.5px] text-white/70 mt-1">{s.title}</p>
                <p className="text-[10px] text-white/35">{s.publisher}</p>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-[10px] text-teal hover:underline">
                    {s.url}
                  </a>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2"><SourceRefs ids={person.sourceIds} /></div>
        </div>
      </Card>
    </div>
  );
}
