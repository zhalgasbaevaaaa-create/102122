import { useEffect, useMemo, useState } from 'react';
import {
  GraduationCap, Search, Download, Users, TrendingUp, Target, Clock, ChevronRight, AlertTriangle,
  BarChart3, Loader2, X, FileQuestion,
} from 'lucide-react';
import { api, ApiError, tokenStore } from '../lib/api';
import { Badge, Card, Spinner, Stat, ProgressBar, Modal, EmptyState } from '../components/UI';

interface Student {
  id: string; name: string; email: string; group: string | null; school: string | null;
  xp: number; score: number; accuracy: number; answers: number; sessions: number;
  playMinutes: number; lastActivity: string; disabled: boolean; rank: string;
}

export default function TeacherPage() {
  const [data, setData] = useState<{ students: Student[]; groups: string[] } | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [questions, setQuestions] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    Promise.all([
      api<any>(`/api/teacher/students?search=${encodeURIComponent(search)}&group=${encodeURIComponent(group)}`),
      api<any>('/api/teacher/overview'),
      api<any>('/api/teacher/questions?limit=20'),
    ])
      .then(([s, o, q]) => { setData(s); setOverview(o); setQuestions(q); })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Деректерді жүктеу мүмкін болмады'));
  }, [search, group]);

  async function openStudent(id: string) {
    setLoadingDetail(true);
    try {
      setDetail(await api(`/api/teacher/student/${id}`));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Қате');
    } finally {
      setLoadingDetail(false);
    }
  }

  function exportCsv() {
    const token = tokenStore.get();
    // the CSV endpoint requires the bearer token, so fetch it as a blob
    fetch('/api/teacher/export.csv', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (res) => {
        if (!res.ok) throw new Error('Экспорт сәтсіз');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `history-arena-results-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setErr('CSV экспорты орындалмады'));
  }

  if (err) return <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-[#e08a6a]">{err}</div>;
  if (!data || !overview) return <Spinner label="Оқытушы кабинеті жүктелуде…" />;

  const maxActivity = Math.max(1, ...overview.activity.map((a: any) => a.sessions));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Badge tone="teal"><GraduationCap size={11} /> Оқытушы кабинеті</Badge>
          <h1 className="font-display text-3xl sm:text-4xl text-parchment mt-2">Оқушылар мониторингі</h1>
          <p className="text-white/50 text-sm mt-2">
            {data.students.length} оқушы · {overview.results} ойын нәтижесі · орташа ұпай {overview.avgScore} · орташа дәлдік {overview.avgAccuracy}%
          </p>
        </div>
        <button className="btn btn-gold px-4 py-2.5 text-xs" onClick={exportCsv}>
          <Download size={14} /> Excel/CSV экспорты
        </button>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Stat label="Оқушы" value={overview.students} icon={<Users size={15} />} accent="teal" />
        <Stat label="Ойын нәтижесі" value={overview.results} icon={<Target size={15} />} accent="gold" />
        <Stat label="Орташа ұпай" value={overview.avgScore} icon={<TrendingUp size={15} />} accent="plain" />
        <Stat label="Орташа дәлдік" value={`${overview.avgAccuracy}%`} icon={<BarChart3 size={15} />} accent="teal" />
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
        <div>
          <Card className="p-3 mb-3 flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input className="field pl-8 py-1.5 text-xs" placeholder="Оқушы аты немесе e-mail…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="field py-1.5 text-xs w-auto" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">Барлық топ</option>
              {data.groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Card>

          <Card className="overflow-hidden">
            <div className="grid grid-cols-[1fr_60px_60px_60px_30px] gap-2 px-3.5 py-2 border-b border-white/10 text-[10px] uppercase tracking-wider text-white/35">
              <span>Оқушы</span>
              <span className="text-right">XP</span>
              <span className="text-right">Дәлдік</span>
              <span className="text-right">Сессия</span>
              <span />
            </div>
            {data.students.length === 0 ? (
              <p className="text-center text-xs text-white/40 py-10">Оқушы табылмады.</p>
            ) : (
              data.students.map((s) => (
                <button
                  key={s.id}
                  onClick={() => void openStudent(s.id)}
                  className="w-full grid grid-cols-[1fr_60px_60px_60px_30px] gap-2 px-3.5 py-2.5 items-center border-b border-white/5 last:border-0 hover:bg-white/4 text-left transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-parchment truncate flex items-center gap-1.5">
                      {s.name}
                      {s.disabled && <span className="text-[9px] text-[#e08a6a]">(бұғатталған)</span>}
                    </p>
                    <p className="text-[9.5px] text-white/30 truncate">{s.group ?? '—'} · {s.rank}</p>
                  </div>
                  <span className="text-right text-[11px] text-teal font-mono">{s.xp}</span>
                  <span className="text-right text-[11px] text-white/55 font-mono">{s.accuracy}%</span>
                  <span className="text-right text-[11px] text-white/40 font-mono">{s.sessions}</span>
                  <ChevronRight size={13} className="text-white/20" />
                </button>
              ))
            )}
          </Card>

          <Card className="p-4 mt-3">
            <p className="text-[11px] uppercase tracking-wider text-gold mb-2 flex items-center gap-1.5">
              <FileQuestion size={12} /> Ең қиын сұрақтар (дұрыс жауап үлесі төмен)
            </p>
            {!questions?.hardest?.length ? (
              <p className="text-xs text-white/40">Әзірге дерек жоқ — оқушылар ойнаған сайын толығады.</p>
            ) : (
              <div className="space-y-1.5">
                {questions.hardest.slice(0, 8).map((q: any) => (
                  <div key={q.questionId} className="glass px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[9px] text-white/35 font-mono">{q.questionId}</span>
                      <span className={`text-[10px] font-mono ${q.correctRate < 40 ? 'text-[#e08a6a]' : 'text-teal'}`}>{q.correctRate}%</span>
                    </div>
                    <p className="text-[11px] text-white/60 line-clamp-2 leading-snug">{q.prompt}</p>
                    <div className="flex gap-1.5 mt-1">
                      <span className="text-[9px] text-white/30">{q.format}</span>
                      <span className="text-[9px] text-white/30">·</span>
                      <span className="text-[9px] text-white/30">{q.attempts} әрекет</span>
                      <span className="text-[9px] text-white/30">·</span>
                      <span className="text-[9px] text-white/30">{q.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-white/30 mt-2">
              Банкте {questions?.bankSize ?? 0} сұрақ · бақыланатын {questions?.trackedQuestions ?? 0}
            </p>
          </Card>
        </div>

        <div className="space-y-3">
          <Card className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-gold mb-2">Ойындар бойынша</p>
            <div className="space-y-2">
              {overview.byGame.map((g: any) => (
                <div key={g.game_id}>
                  <div className="flex justify-between text-[10.5px] text-white/50 mb-1">
                    <span className="truncate max-w-[65%]">{g.title}</span>
                    <span className="font-mono">{g.attempts} әрекет</span>
                  </div>
                  <ProgressBar value={g.avg_acc} tone="teal" height={4} />
                  <p className="text-[9px] text-white/30 mt-0.5">орташа ұпай {g.avg_score} · дәлдік {g.avg_acc}%</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-gold mb-2 flex items-center gap-1.5">
              <Clock size={12} /> Белсенділік (соңғы 14 күн)
            </p>
            <div className="flex items-end gap-1 h-24">
              {overview.activity.map((a: any) => (
                <div key={a.day} className="flex-1 flex flex-col items-center justify-end h-full" title={`${a.day}: ${a.sessions}`}>
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-teal/40 to-teal"
                    style={{ height: `${(a.sessions / maxActivity) * 100}%`, minHeight: 3 }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[8px] text-white/25 mt-1">
              <span>{overview.activity[0]?.day?.slice(5)}</span>
              <span>{overview.activity[overview.activity.length - 1]?.day?.slice(5)}</span>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={Boolean(detail) || loadingDetail} onClose={() => setDetail(null)} title={detail?.student?.name ?? 'Оқушы профилі'} wide>
        {loadingDetail && !detail ? (
          <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto text-teal" /></div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="XP" value={detail.student.xp} accent="teal" />
              <Stat label="Ұпай" value={detail.student.totalScore} accent="gold" />
              <Stat label="Дәреже" value={<span className="text-sm">{detail.rank.title}</span>} />
              <Stat label="Соңғы белсенділік" value={<span className="text-sm">{new Date(detail.student.lastActivity).toLocaleDateString('kk-KZ')}</span>} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gold mb-2">Ойындар бойынша</p>
              <div className="space-y-1.5">
                {detail.perGame.map((g: any) => (
                  <div key={g.gameId} className="glass px-3 py-2 flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] text-parchment flex-1">{g.title}</span>
                    <span className="text-[10px] text-white/40">ең үздік {g.best}</span>
                    <span className="text-[10px] text-white/40">орташа {g.average}</span>
                    <span className="text-[10px] text-teal">{g.accuracy}%</span>
                    <span className="text-[10px] text-white/35">{g.levels.length} деңгей</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gold mb-2">Соңғы нәтижелер</p>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {detail.results.slice(0, 20).map((r: any) => (
                  <div key={r.id} className="flex items-center gap-2 text-[11px] px-2 py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-white/30 font-mono w-16 shrink-0">{new Date(r.created_at).toLocaleDateString('kk-KZ')}</span>
                    <span className="text-white/60 flex-1 truncate">{r.game_id} · {r.level}-деңгей</span>
                    <span className="text-gold font-mono">{r.score}</span>
                    <span className="text-white/40 font-mono">{r.correct}✓/{r.wrong}✗</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
