import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Lock, Check, Star, Zap, Sparkles, Book, Compass, Scroll, Crown, Flame, Target, Timer, Medal, Info } from 'lucide-react';
import { useContent } from '../lib/useContent';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Badge, Card, Spinner, ProgressBar } from '../components/UI';
import { RANKS, rankFor } from '@shared/gamification';

const ICONS: Record<string, typeof Award> = {
  sparkles: Sparkles, book: Book, compass: Compass, scroll: Scroll, crown: Crown,
  flame: Flame, star: Star, target: Target, timer: Timer, medal: Medal, award: Award,
};

export default function AchievementsPage() {
  const { data, loading } = useContent();
  const { user } = useAuth();
  const [mine, setMine] = useState<{ achievements: any[]; user: any } | null>(null);

  useEffect(() => {
    if (!user) { setMine(null); return; }
    api<any>('/api/me/profile').then((p) => setMine({ achievements: p.achievements, user: p.user })).catch(() => {});
  }, [user]);

  if (loading || !data) return <Spinner label="Жетістіктер жүктелуде…" />;

  const unlocked = new Set((mine?.achievements ?? []).map((a: any) => a.achievement_id));
  const rank = mine ? rankFor(mine.user.xp) : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="mb-6">
        <Badge tone="gold"><Award size={11} /> Жетістіктер мен марапаттар</Badge>
        <h1 className="font-display text-3xl sm:text-5xl text-parchment mt-3">Дәрежеңді дәлелде</h1>
        <p className="text-white/55 text-sm mt-3 max-w-2xl leading-relaxed">
          {data.achievements.length} жетістік барлық алты ойында ортақ жұмыс істейді. Жетістіктер
          серверде автоматты түрде тексеріледі және XP береді.
        </p>
      </header>

      {user && rank ? (
        <Card className="p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">Ағымдағы дәреже</p>
              <p className="font-display text-2xl text-gradient-gold">{rank.title}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/45">{mine?.user.xp} XP</p>
              <p className="text-[10px] text-white/30">
                {rank.nextXp ? `келесі дәреже: ${rank.nextXp} XP` : 'ең жоғары дәреже'}
              </p>
            </div>
          </div>
          <ProgressBar value={rank.progress} tone="gold" />
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div><p className="text-lg font-display text-teal">{unlocked.size}</p><p className="text-[10px] text-white/35">ашылған жетістік</p></div>
            <div><p className="text-lg font-display text-gold">{mine?.user.correct ?? 0}</p><p className="text-[10px] text-white/35">дұрыс жауап</p></div>
            <div><p className="text-lg font-display text-parchment">{mine?.user.streakBest ?? 0}</p><p className="text-[10px] text-white/35">үздік серия</p></div>
            <div><p className="text-lg font-display text-parchment">{mine?.user.sessions ?? 0}</p><p className="text-[10px] text-white/35">сессия</p></div>
          </div>
        </Card>
      ) : (
        <Card className="p-4 mb-6 flex items-center gap-3">
          <Info size={16} className="text-gold shrink-0" />
          <p className="text-xs text-white/55">
            Жетістіктеріңізді бақылау үшін <Link to="/kiru" className="text-gold hover:underline">аккаунтқа кіріңіз</Link>.
          </p>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.achievements.map((a) => {
          const Icon = ICONS[a.icon] ?? Award;
          const have = unlocked.has(a.id);
          return (
            <Card key={a.id} className={`p-4 transition-colors ${have ? 'border-gold/40' : ''}`}>
              <div className="flex items-start gap-3">
                <div
                  className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${
                    have ? 'bg-gold/18 border border-gold/40 text-gold' : 'bg-white/5 border border-white/10 text-white/25'
                  }`}
                >
                  {have ? <Icon size={19} /> : <Lock size={16} />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className={`font-display text-[15px] ${have ? 'text-parchment' : 'text-white/50'}`}>{a.title}</p>
                    {have && <Check size={13} className="text-teal" />}
                  </div>
                  <p className="text-[11px] text-white/45 mt-1 leading-relaxed">{a.description}</p>
                  <p className="text-[10px] text-gold/80 mt-1.5 flex items-center gap-1">
                    <Zap size={10} /> +{a.xp} XP
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <section className="mt-8">
        <h2 className="font-display text-xl text-parchment mb-3">Дәрежелер жүйесі</h2>
        <Card className="overflow-hidden">
          {RANKS.map((r, i) => {
            const active = mine ? mine.user.xp >= r.xp : false;
            const current = rank ? rank.level === r.level : false;
            return (
              <div
                key={r.level}
                className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0 ${current ? 'bg-gold/8' : ''}`}
              >
                <span className={`w-7 h-7 rounded-lg grid place-items-center text-[11px] font-mono ${active ? 'bg-gold/20 text-gold border border-gold/35' : 'bg-white/5 text-white/30 border border-white/10'}`}>
                  {r.level}
                </span>
                <p className={`flex-1 text-[13px] ${active ? 'text-parchment' : 'text-white/40'}`}>{r.title}</p>
                <span className="text-[11px] text-white/35 font-mono">{r.xp} XP</span>
                {current && <Badge tone="gold">ағымдағы</Badge>}
              </div>
            );
          })}
        </Card>
      </section>
    </div>
  );
}
