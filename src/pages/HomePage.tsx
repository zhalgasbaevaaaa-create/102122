import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Compass, Crown, Shield, Flag, Gem, Swords, Trophy, Star, Zap, ArrowRight, Clock,
  PlayCircle, Flame, Users, Target, BookOpen, Sparkles, TrendingUp, Calendar,
} from 'lucide-react';
import { useContent } from '../lib/useContent';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Badge, Card, ProgressBar, Section, Spinner, Stat, EmptyState } from '../components/UI';
import { GameBackdrop } from '../components/GameBackdrop';
import { Portrait, PortraitCaption } from '../components/Portrait';
import { rankFor } from '@shared/gamification';
import type { GameDef } from '@shared/games';

const ICONS: Record<string, typeof Compass> = { compass: Compass, crown: Crown, shield: Shield, flag: Flag, gem: Gem, swords: Swords };

interface LeaderRow { pos: number; name: string; xp: number; score: number; accuracy: number; rank: string; group: string | null }
interface ProfileData {
  user: any;
  rank: any;
  stats: any;
  perGame: { gameId: string; title: string; played: number; score: number; bestLevel: number; levelsCleared: number; accuracy: number }[];
  recent: { id: string; gameId: string; gameTitle: string; level: number; score: number; finishedAt: string }[];
}

export default function HomePage() {
  const { data, loading } = useContent();
  const { user } = useAuth();
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [daily, setDaily] = useState<{ questions: any[]; day: string } | null>(null);

  useEffect(() => {
    api<{ rows: LeaderRow[] }>('/api/leaderboard?limit=6').then((r) => setBoard(r.rows)).catch(() => setBoard([]));
    api<{ questions: any[]; day: string }>('/api/challenges/daily').then(setDaily).catch(() => setDaily(null));
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    api<ProfileData>('/api/me/profile').then(setProfile).catch(() => setProfile(null));
  }, [user]);

  if (loading || !data) return <Spinner label="Тарихи платформа жүктелуде…" />;

  const featured = data.persons.find((p) => p.id === 'abylai') ?? data.persons[0];
  const totalLevels = data.games.reduce((a, g) => a + g.levels.length, 0);
  const timelinePreview = data.events.filter((e) => [16, 19, 17, 22, 25, 27, 29].includes(data.events.indexOf(e))).slice(0, 7);
  const shownTimeline = timelinePreview.length ? timelinePreview : data.events.slice(0, 7);
  const rank = profile ? rankFor(profile.user.xp) : null;

  return (
    <div>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <GameBackdrop game={data.games[0]} />
          <div className="absolute inset-0 bg-gradient-to-b from-[#070b14]/55 via-[#070b14]/75 to-[#070b14]" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 pt-14 pb-16 sm:pt-20 sm:pb-24">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 mb-5 animate-fade-up">
              <Badge tone="gold"><Sparkles size={11} /> {data.games.length} ойын · {totalLevels} деңгей</Badge>
              <Badge tone="teal"><BookOpen size={11} /> {data.stats.questions.toLocaleString('kk-KZ')} верификацияланған сұрақ</Badge>
              <Badge><Clock size={11} /> 14 тарихи дәуір</Badge>
            </div>
            <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl leading-[1.05] animate-fade-up">
              <span className="text-gradient-gold">Ұлы дала</span>
              <br />
              <span className="text-parchment">шежіресін ойна.</span>
            </h1>
            <p className="text-white/65 text-sm sm:text-lg mt-5 max-w-2xl leading-relaxed animate-fade-up">
              Тас дәуірінен Тәуелсіздікке дейін — алты түрлі жанрдағы ойын, интерактивті тарихи карта,
              уақыт шкаласы және 30-дан астам тарихи тұлға. Әр жауаптан кейін дереккөзге сілтеме мен
              тарихи түсіндірме беріледі.
            </p>
            <div className="flex flex-wrap gap-2.5 mt-7 animate-fade-up">
              <Link to="/oyyndar" className="btn btn-gold px-6 py-3 text-sm">
                <PlayCircle size={17} /> Ойнауды бастау
              </Link>
              <Link to="/map" className="btn btn-teal px-6 py-3 text-sm">
                <Compass size={16} /> Тарихи картаны ашу
              </Link>
              {!user && (
                <Link to="/kiru" className="btn btn-ghost px-6 py-3 text-sm">
                  Тіркелу / Кіру
                </Link>
              )}
            </div>

            {user && profile && (
              <div className="glass mt-7 px-4 py-3 max-w-lg animate-fade-up">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-parchment">
                    Қайта келдіңіз, <span className="text-gold">{user.name}</span>
                  </span>
                  <span className="text-white/45">{rank?.title}</span>
                </div>
                <ProgressBar value={rank?.progress ?? 0} tone="gold" height={6} />
                <div className="flex justify-between text-[10px] text-white/40 mt-1">
                  <span>{user.xp} XP</span>
                  <span>{rank?.nextXp ? `${rank.nextXp} XP-ке дейін` : 'Ең жоғары дәреже'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4">
        {/* ── STATS ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 -mt-6 relative z-10">
          <Stat label="Ойын сессиясы" value={profile?.stats.sessions ?? 0} sub="жеке есепте" icon={<PlayCircle size={15} />} accent="teal" />
          <Stat label="Жалпы ұпай" value={user?.totalScore ?? 0} sub={profile ? `дәлдік ${profile.stats.accuracy}%` : 'кіріңіз'} icon={<Star size={15} />} accent="gold" />
          <Stat label="Ашылған жетістік" value={profile?.perGame ? profile.perGame.filter((g) => g.levelsCleared).length : 0} sub={`${data.achievements.length} жетістіктен`} icon={<Trophy size={15} />} accent="teal" />
          <Stat label="Ойын уақыты" value={`${profile?.stats.playMinutes ?? 0} мин`} sub="барлық ойындар" icon={<Clock size={15} />} accent="plain" />
        </div>

        {/* ── SIX GAMES ─────────────────────────────────────── */}
        <Section
          id="games"
          title="Ойындар әлемі"
          subtitle="Әр ойын — бөлек механика, бөлек әлем және бөлек тарихи кезең. Барлығында 10 деңгей және әр деңгейде 10 тарихи өзара әрекет."
          action={<Link to="/oyyndar" className="btn btn-ghost px-4 py-2 text-xs">Барлық ойындар <ArrowRight size={14} /></Link>}
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {data.games.map((g, i) => (
              <GameCard key={g.id} game={g} delay={i * 60} progress={profile?.perGame.find((p) => p.gameId === g.id)} />
            ))}
          </div>
        </Section>

        {/* ── DAILY + LEADERBOARD ───────────────────────────── */}
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 mb-10">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Flame size={16} className="text-gold" />
                  <h3 className="font-display text-lg text-parchment">Күнделікті тарихи сынақ</h3>
                </div>
                <p className="text-xs text-white/45">
                  {daily ? `${daily.day} күніне арналған 5 сұрақ · барлық қатысушыға бірдей` : 'Жүктелуде…'}
                </p>
              </div>
              <Badge tone="gold"><Calendar size={11} /> бүгін</Badge>
            </div>
            {daily ? (
              <>
                <div className="grid grid-cols-5 gap-1.5 mb-3">
                  {daily.questions.slice(0, 5).map((q, i) => (
                    <div key={q.id} className="rounded-lg bg-white/5 border border-white/10 px-1.5 py-2 text-center">
                      <p className="text-[9px] text-white/35">№{i + 1}</p>
                      <p className="text-[9px] text-teal mt-0.5 truncate">{q.format}</p>
                    </div>
                  ))}
                </div>
                <Link to="/maidan/kundelik" className="btn btn-gold w-full py-2.5 text-xs">
                  <Target size={14} /> Күнделікті сынақты бастау
                </Link>
              </>
            ) : (
              <p className="text-xs text-white/40">Күнделікті сынақ жүктелмеді.</p>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg text-parchment flex items-center gap-2">
                <Trophy size={16} className="text-gold" /> Жаһандық рейтинг
              </h3>
              <Link to="/reiting" className="text-[11px] text-teal hover:underline">толық</Link>
            </div>
            {board.length === 0 ? (
              <p className="text-xs text-white/40 py-6 text-center">Әзірге нәтиже жоқ — бірінші болыңыз!</p>
            ) : (
              <ul className="space-y-1.5">
                {board.map((r) => (
                  <li key={r.pos} className="flex items-center gap-2.5 py-1.5">
                    <span className={`w-6 h-6 rounded-md grid place-items-center text-[10px] font-mono ${r.pos <= 3 ? 'bg-gold/20 text-gold border border-gold/30' : 'bg-white/5 text-white/45 border border-white/10'}`}>
                      {r.pos}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-parchment truncate">{r.name}</p>
                      <p className="text-[10px] text-white/35">{r.rank} · {r.accuracy}%</p>
                    </div>
                    <span className="text-xs text-teal font-mono">{r.xp}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ── RECENT + FEATURED PERSON ──────────────────────── */}
        <div className="grid lg:grid-cols-[1fr_1fr] gap-4 mb-10">
          <Card className="p-5">
            <h3 className="font-display text-lg text-parchment mb-3 flex items-center gap-2">
              <Clock size={16} className="text-teal" /> Жуырда ойналған ойындар
            </h3>
            {!user ? (
              <EmptyState
                title="Аккаунтқа кіріңіз"
                body="Ойын тарихы, ұпайлар және жетістіктер профиліңізде сақталады."
                action={<Link to="/kiru" className="btn btn-gold px-4 py-2 text-xs">Кіру</Link>}
              />
            ) : !profile?.recent.length ? (
              <EmptyState
                title="Әзірге ойын жоқ"
                body="Алғашқы деңгейді бастап, нәтижені осы жерден көресіз."
                action={<Link to="/oyyndar" className="btn btn-teal px-4 py-2 text-xs">Ойынды таңдау</Link>}
              />
            ) : (
              <ul className="space-y-1.5">
                {profile.recent.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex items-center gap-2.5 py-1.5 border-b border-white/5 last:border-0">
                    <span className="w-7 h-7 rounded-lg bg-teal/12 border border-teal/25 grid place-items-center text-teal text-[10px] font-mono">
                      {r.level}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-parchment truncate">{r.gameTitle}</p>
                      <p className="text-[10px] text-white/35">{new Date(r.finishedAt).toLocaleDateString('kk-KZ')}</p>
                    </div>
                    <span className="text-xs text-gold font-mono">{r.score}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg text-parchment flex items-center gap-2">
                <Users size={16} className="text-gold" /> Тарихи тұлға
              </h3>
              <Link to="/tulgalar" className="text-[11px] text-teal hover:underline">барлығы</Link>
            </div>
            {featured && (
              <div className="flex gap-4">
                <div className="text-center shrink-0">
                  <Portrait person={featured} size={96} />
                  <div className="mt-1"><PortraitCaption /></div>
                </div>
                <div className="min-w-0">
                  <p className="font-display text-base text-parchment">{featured.name}</p>
                  <p className="text-[11px] text-white/40">{featured.life}</p>
                  <p className="text-xs text-white/60 mt-2 leading-relaxed line-clamp-3">{featured.significance}</p>
                  <Link to={`/tulgalar/${featured.id}`} className="text-[11px] text-teal hover:underline mt-2 inline-flex items-center gap-1">
                    Толық профиль <ArrowRight size={11} />
                  </Link>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ── TIMELINE PREVIEW ──────────────────────────────── */}
        <Section
          title="Уақыт шкаласы"
          subtitle="Оқиғалардың қысқаша көрінісі. Толық интерактивті шкалада әр кезеңге сүзгі салып, оқиғаларды тарихи картамен салыстыруға болады."
          action={<Link to="/timeline" className="btn btn-ghost px-4 py-2 text-xs">Толық шкала <ArrowRight size={14} /></Link>}
        >
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-2.5 min-w-max">
              {shownTimeline.map((e) => {
                const period = data.periods.find((p) => p.id === e.periodId);
                return (
                  <div key={e.id} className="glass px-3.5 py-3 w-[210px] shrink-0">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: period?.color ?? '#d9a94a' }} />
                      <span className="text-[10px] text-white/40">{e.yearLabel}</span>
                    </div>
                    <p className="text-[12.5px] text-parchment leading-snug">{e.title}</p>
                    <p className="text-[10px] text-white/35 mt-1 line-clamp-2">{e.summary}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </Section>

        {/* ── PLATFORM FACTS ────────────────────────────────── */}
        <Section title="Платформа туралы" subtitle="Білім беру мазмұны мен техникалық негіз.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Stat label="Верификацияланған факт" value={data.stats.facts} sub="атомдық факт базасы" icon={<BookOpen size={15} />} accent="teal" />
            <Stat label="Сұрақ банкі" value={data.stats.questions.toLocaleString('kk-KZ')} sub="10 форматта" icon={<Target size={15} />} accent="gold" />
            <Stat label="Тарихи тұлға" value={data.stats.persons} sub="дереккөздермен" icon={<Users size={15} />} accent="teal" />
            <Stat label="Тарихи оқиға" value={data.stats.events} sub="мерзімдерімен" icon={<TrendingUp size={15} />} accent="gold" />
          </div>
        </Section>
      </div>
    </div>
  );
}

function GameCard({ game, delay, progress }: { game: GameDef; delay: number; progress?: { played: number; bestLevel: number; levelsCleared: number } }) {
  const Icon = ICONS[game.icon] ?? Compass;
  return (
    <Link
      to={`/oyyn/${game.id}`}
      className="group relative glass overflow-hidden hover:border-gold/45 transition-all duration-300 hover:-translate-y-0.5"
      style={{ animation: `fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}ms both` }}
    >
      <div className="relative h-28 sm:h-32 overflow-hidden">
        <GameBackdrop game={game} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c121d] via-[#0c121d]/25 to-transparent" />
        <div className="absolute top-2.5 left-2.5">
          <span
            className="w-9 h-9 rounded-xl grid place-items-center backdrop-blur-sm"
            style={{ background: `${game.accent}22`, border: `1px solid ${game.accent}55`, color: game.accent }}
          >
            <Icon size={17} />
          </span>
        </div>
        <div className="absolute top-2.5 right-2.5">
          <span className="chip bg-black/45 border-white/15 text-white/70">{game.levels.length} деңгей</span>
        </div>
      </div>
      <div className="px-4 pb-4 pt-2">
        <p className="font-display text-base text-parchment leading-snug group-hover:text-gold transition-colors">{game.title}</p>
        <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: game.accent }}>{game.genre}</p>
        <p className="text-[11.5px] text-white/50 mt-1.5 leading-relaxed line-clamp-2">{game.tagline}</p>
        {progress && progress.levelsCleared > 0 ? (
          <div className="mt-2.5">
            <ProgressBar value={(progress.levelsCleared / game.levels.length) * 100} tone="gold" height={4} />
            <p className="text-[10px] text-white/40 mt-1">
              {progress.levelsCleared}/{game.levels.length} деңгей · ең үздік: {progress.bestLevel}
            </p>
          </div>
        ) : (
          <p className="text-[10px] text-teal mt-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Бастау <ArrowRight size={11} />
          </p>
        )}
      </div>
    </Link>
  );
}
