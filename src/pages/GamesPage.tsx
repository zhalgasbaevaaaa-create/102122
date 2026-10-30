import { Link } from 'react-router-dom';
import { Compass, Crown, Shield, Flag, Gem, Swords, ArrowRight, BookOpen, Star, Users } from 'lucide-react';
import { useContent } from '../lib/useContent';
import { useAuth } from '../lib/auth';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { GameBackdrop } from '../components/GameBackdrop';
import { Badge, Section, Spinner, ProgressBar, Card } from '../components/UI';

const ICONS: Record<string, typeof Compass> = { compass: Compass, crown: Crown, shield: Shield, flag: Flag, gem: Gem, swords: Swords };

export default function GamesPage() {
  const { data, loading } = useContent();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    api<any>('/api/me/profile').then(setProfile).catch(() => {});
  }, [user]);

  if (loading || !data) return <Spinner label="Ойындар жүктелуде…" />;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-8">
        <Badge tone="gold">Ойындар әлемі</Badge>
        <h1 className="font-display text-3xl sm:text-5xl text-parchment mt-3">Алты ойын — алты түрлі әлем</h1>
        <p className="text-white/55 text-sm mt-3 max-w-2xl leading-relaxed">
          Әр ойынның өз механикасы, өз әлемі, өз басқару жүйесі және өз тарихи мазмұны бар.
          Барлығында 10 деңгей; әр деңгейде кемінде 10 тарихи өзара әрекет және дереккөзге сілтеме бар.
        </p>
      </header>

      <div className="grid gap-4">
        {data.games.map((g) => {
          const Icon = ICONS[g.icon] ?? Compass;
          const prog = profile?.perGame?.find((p: any) => p.gameId === g.id);
          return (
            <Card key={g.id} className="overflow-hidden">
              <div className="grid md:grid-cols-[300px_1fr]">
                <div className="relative h-40 md:h-full min-h-[160px]">
                  <GameBackdrop game={g} />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0c121d] md:to-[#0e1521]/95" />
                  <div className="absolute top-3 left-3">
                    <span
                      className="w-10 h-10 rounded-xl grid place-items-center backdrop-blur"
                      style={{ background: `${g.accent}22`, border: `1px solid ${g.accent}55`, color: g.accent }}
                    >
                      <Icon size={18} />
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge tone="gold">{g.genre}</Badge>
                    <Badge tone="teal">{g.levels.length} деңгей</Badge>
                    <Badge><BookOpen size={11} /> {g.questionsPerLevel} сұрақ / деңгей</Badge>
                    <Badge>
                      {g.engine === 'three' ? 'Three.js / WebGL' : g.engine === 'canvas2d' ? 'Canvas 2D' : 'DOM / React'}
                    </Badge>
                  </div>
                  <h2 className="font-display text-2xl text-parchment">{g.title}</h2>
                  <p className="text-xs text-white/45 mt-1">{g.subtitle}</p>
                  <p className="text-sm text-white/60 mt-3 leading-relaxed">{g.description}</p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {g.mechanics.slice(0, 4).map((m, i) => (
                      <span key={i} className="text-[10px] px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/50">
                        {m}
                      </span>
                    ))}
                  </div>

                  {prog && prog.levelsCleared > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] text-white/40 mb-1">
                        <span>Прогресс</span>
                        <span>{prog.levelsCleared}/{g.levels.length} деңгей · {prog.score} ұпай</span>
                      </div>
                      <ProgressBar value={(prog.levelsCleared / g.levels.length) * 100} tone="gold" height={4} />
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link to={`/oyyn/${g.id}`} className="btn btn-gold px-5 py-2.5 text-xs">
                      Ойнау <ArrowRight size={14} />
                    </Link>
                    <span className="btn btn-ghost px-4 py-2.5 text-xs pointer-events-none">
                      <Star size={13} /> {g.levels.map((l) => l.n).length} деңгей
                    </span>
                    <span className="btn btn-ghost px-4 py-2.5 text-xs pointer-events-none">
                      <Users size={13} /> {g.categories.length} тарихи санат
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Section title="Ортақ ережелер" subtitle="Барлық ойындарға ортақ талаптар.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {[
            ['10 деңгей', 'Әр ойында қиындығы біртіндеп өсетін 10 деңгей'],
            ['10+ тарихи өзара әрекет', 'Әр деңгейде кемінде 10 верификацияланған сұрақ'],
            ['Ұпай және XP', 'Серверде есептеледі, браузерден бұрмалауға қарсы'],
            ['Жетістіктер', 'Ортақ жетістік жүйесі барлық ойындарда жұмыс істейді'],
            ['Дыбыс бақылауы', 'Дыбысты кез келген жерден өшіруге болады'],
            ['Кідірту және қайта бастау', 'Pause / resume / restart барлық ойындарда'],
            ['Мобильді басқару', 'Сенсорлық басқару элементтері қосылған'],
            ['Нұсқаулық', 'Қазақ тіліндегі толық нұсқаулық'],
            ['Тарихи түсіндірме', 'Әр жауаптан кейін түсіндірме мен дереккөз'],
          ].map(([t, d]) => (
            <div key={t} className="glass px-4 py-3">
              <p className="text-[13px] text-parchment">{t}</p>
              <p className="text-[11px] text-white/45 mt-1 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
