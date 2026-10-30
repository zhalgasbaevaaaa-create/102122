import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User, Star, Zap, Target, Clock, Trophy, TrendingUp, Award, BookOpen, PlayCircle, Calendar, BarChart3,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useContent } from '../lib/useContent';
import { Badge, Card, Spinner, ProgressBar, Stat, EmptyState, Section } from '../components/UI';
import { rankFor } from '@shared/gamification';

export default function ProfilePage() {
  const { user } = useAuth();
  const { data } = useContent();
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<any>('/api/me/profile').then(setP).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-[#e08a6a]">{err}</div>;
  if (!p || !user) return <Spinner label="Профиль жүктелуде…" />;

  const rank = rankFor(p.user.xp);
  const maxGameScore = Math.max(1, ...p.perGame.map((g: any) => g.score));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* header */}
      <Card className="p-5 sm:p-6 mb-4">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal/30 to-gold/25 border border-white/15 grid place-items-center font-display text-xl text-parchment shrink-0">
            {p.user.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl text-parchment">{p.user.name}</h1>
              <Badge tone={p.user.role === 'admin' ? 'gold' : p.user.role === 'teacher' ? 'teal' : 'plain'}>
                {p.user.role === 'admin' ? 'Әкімші' : p.user.role === 'teacher' ? 'Оқытушы' : 'Оқушы'}
              </Badge>
            </div>
            <p className="text-xs text-white/45 mt-1">{p.user.email}</p>
            <p className="text-[11px] text-white/35 mt-0.5">
              {p.user.group && `${p.user.group} · `}{p.user.school ?? '—'} · тіркелген күні: {new Date(p.user.createdAt).toLocaleDateString('kk-KZ')}
            </p>
            <div className="mt-3">
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-gold">{rank.title}</span>
                <span className="text-white/40">{p.user.xp} XP {rank.nextXp ? `/ ${rank.nextXp}` : ''}</span>
              </div>
              <ProgressBar value={rank.progress} tone="gold" height={6} />
            </div>
          </div>
          <div className="flex gap-2">
            {(user.role === 'teacher' || user.role === 'admin') && (
              <Link to="/oqytushy" className="btn btn-ghost px-3 py-2 text-xs">Оқытушы кабинеті</Link>
            )}
            {user.role === 'admin' && <Link to="/admin" className="btn btn-ghost px-3 py-2 text-xs">Әкімші</Link>}
          </div>
        </div>
      </Card>

      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-6">
        <Stat label="Жалпы ұпай" value={p.user.totalScore} accent="gold" icon={<Star size={15} />} />
        <Stat label="Дәлдік" value={`${p.stats.accuracy}%`} sub={`${p.stats.answers} жауап`} accent="teal" icon={<Target size={15} />} />
        <Stat label="Ойын уақыты" value={`${p.stats.playMinutes} мин`} accent="plain" icon={<Clock size={15} />} />
        <Stat label="Сессия" value={p.stats.sessions} sub={`${p.stats.perfect} мүлтіксіз`} accent="teal" icon={<PlayCircle size={15} />} />
        <Stat label="Жетістік" value={p.achievements.length} sub={`${data?.achievements.length ?? 0} мүмкін`} accent="gold" icon={<Trophy size={15} />} />
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
        {/* per game progress */}
        <Section title="Ойындар бойынша прогресс" subtitle="Әр ойында ашылған деңгейлер мен жиналған ұпай.">
          <div className="space-y-2.5">
            {p.perGame.map((g: any) => {
              const game = data?.games.find((x) => x.id === g.gameId);
              return (
                <Card key={g.gameId} className="p-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <Link to={`/oyyn/${g.gameId}`} className="text-[13px] text-parchment hover:text-gold">{g.title}</Link>
                    <span className="text-[11px] text-white/40">{g.score} ұпай</span>
                  </div>
                  <ProgressBar value={(g.levelsCleared / (game?.levels.length ?? 10)) * 100} tone="teal" height={4} />
                  <div className="flex justify-between text-[10px] text-white/35 mt-1">
                    <span>{g.levelsCleared}/{game?.levels.length ?? 10} деңгей · ең үздік {g.bestLevel}</span>
                    <span>дәлдік {g.accuracy}%</span>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="p-4 mt-3">
            <p className="text-[11px] uppercase tracking-wider text-gold mb-2 flex items-center gap-1.5">
              <BarChart3 size={12} /> Ойындар бойынша ұпай салыстыруы
            </p>
            <div className="space-y-2">
              {p.perGame.map((g: any) => (
                <div key={g.gameId}>
                  <div className="flex justify-between text-[10px] text-white/45 mb-0.5">
                    <span className="truncate max-w-[60%]">{g.title}</span>
                    <span className="font-mono">{g.score}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-gold to-gold-soft" style={{ width: `${(g.score / maxGameScore) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        {/* achievements + recent */}
        <div>
          <Section title="Жетістіктер" action={<Link to="/zhetistikter" className="text-[11px] text-teal hover:underline">толық</Link>}>
            {p.achievements.length === 0 ? (
              <EmptyState title="Әзірге жетістік жоқ" body="Ойын ойнап, алғашқы жетістіктеріңізді ашыңыз." icon={<Award size={20} />} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {p.achievements.slice(0, 8).map((a: any) => (
                  <Card key={a.achievement_id} className="p-2.5 border-gold/30">
                    <div className="flex items-center gap-1.5">
                      <Award size={13} className="text-gold shrink-0" />
                      <p className="text-[11px] text-parchment leading-tight">{a.title}</p>
                    </div>
                    <p className="text-[9px] text-white/35 mt-1">{new Date(a.unlocked_at).toLocaleDateString('kk-KZ')}</p>
                  </Card>
                ))}
              </div>
            )}
          </Section>

          <Section title="Соңғы белсенділік">
            {p.recent.length === 0 ? (
              <EmptyState title="Белсенділік жоқ" body="Бірінші деңгейді бастаңыз." icon={<Clock size={20} />} />
            ) : (
              <div className="space-y-1.5">
                {p.recent.map((r: any) => (
                  <Card key={r.id} className="px-3 py-2.5 flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-teal/12 border border-teal/25 grid place-items-center text-teal text-[10px] font-mono shrink-0">
                      {r.level}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-parchment truncate">{r.gameTitle}</p>
                      <p className="text-[9.5px] text-white/35">
                        {new Date(r.finishedAt).toLocaleString('kk-KZ')} · {r.correct}✓ {r.wrong}✗
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-gold font-mono">{r.score}</p>
                      <p className="text-[9px] text-teal font-mono">+{r.xp} XP</p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Section>

          <Card className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1.5 flex items-center gap-1.5">
              <Calendar size={12} /> Күнделікті сынақ
            </p>
            <p className="text-[11px] text-white/50 mb-2.5">Күн сайын 5 жаңа сұрақ — барлық қатысушыға бірдей.</p>
            <Link to="/maidan/kundelik" className="btn btn-teal w-full py-2 text-xs">
              <Zap size={13} /> Бүгінгі сынақты бастау
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
