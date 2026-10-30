import { useEffect, useState } from 'react';
import {
  ShieldCheck, Users, Settings, FileQuestion, AlertTriangle, Plus, Save, Search, Power, Trash2, BookOpen, Check, X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Card, Spinner, Stat, ProgressBar, useToast, Modal } from '../components/UI';

type Tab = 'users' | 'questions' | 'content' | 'settings' | 'security';

export default function AdminPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<any>(null);
  const [questions, setQuestions] = useState<any>(null);
  const [contentStats, setContentStats] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [security, setSecurity] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState({ category: 'khanate', difficulty: 2, format: 'mcq', prompt: '', options: ['', '', '', ''], answerIndex: 0, explanation: '', sourceId: 'ehistory' });

  async function load() {
    try {
      if (tab === 'users') setUsers(await api(`/api/admin/users?search=${encodeURIComponent(search)}`));
      if (tab === 'questions') setQuestions(await api('/api/admin/questions'));
      if (tab === 'content') setContentStats(await api('/api/admin/content-stats'));
      if (tab === 'settings') setSettings(await api('/api/admin/settings'));
      if (tab === 'security') setSecurity(await api('/api/admin/security-log'));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Деректерді жүктеу мүмкін болмады');
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, search]);

  async function patchUser(id: string, body: any) {
    try {
      await api(`/api/admin/users/${id}`, { method: 'PATCH', json: body });
      toast({ kind: 'ok', title: 'Пайдаланушы жаңартылды' });
      void load();
    } catch (e) {
      toast({ kind: 'err', title: e instanceof ApiError ? e.message : 'Қате' });
    }
  }

  async function saveSettings(patch: any) {
    try {
      await api('/api/admin/settings', { method: 'PATCH', json: patch });
      toast({ kind: 'ok', title: 'Параметрлер сақталды' });
      void load();
    } catch (e) {
      toast({ kind: 'err', title: e instanceof ApiError ? e.message : 'Қате' });
    }
  }

  async function createQuestion() {
    try {
      const opts = form.options.filter((o) => o.trim().length > 0);
      if (opts.length < 2) throw new ApiError('Кемінде 2 нұсқа қажет', 400);
      await api('/api/admin/questions', {
        method: 'POST',
        json: { ...form, options: opts, answerIndex: Math.min(form.answerIndex, opts.length - 1) },
      });
      toast({ kind: 'ok', title: 'Сұрақ қосылды' });
      setEditorOpen(false);
      setForm({ ...form, prompt: '', explanation: '', options: ['', '', '', ''] });
      void load();
    } catch (e) {
      toast({ kind: 'err', title: e instanceof ApiError ? e.message : 'Қате' });
    }
  }

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'users', label: 'Пайдаланушылар', icon: Users },
    { id: 'questions', label: 'Сұрақтар', icon: FileQuestion },
    { id: 'content', label: 'Мазмұн', icon: BookOpen },
    { id: 'settings', label: 'Параметрлер', icon: Settings },
    { id: 'security', label: 'Қауіпсіздік журналы', icon: AlertTriangle },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-6">
        <Badge tone="gold"><ShieldCheck size={11} /> Әкімшілік панель</Badge>
        <h1 className="font-display text-3xl sm:text-4xl text-parchment mt-2">Жүйені басқару</h1>
        <p className="text-white/50 text-sm mt-2">Рөлдік бақылау белсенді · барлық әрекеттер журналға жазылады.</p>
      </header>

      <div className="flex flex-wrap gap-1.5 mb-5">
        {TABS.map((t) => (
          <button key={t.id} className={`btn px-3.5 py-2 text-xs ${tab === t.id ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setTab(t.id)}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {err && <p className="text-xs text-[#e08a6a] mb-3">{err}</p>}

      {/* USERS */}
      {tab === 'users' && (
        <>
          {!users ? <Spinner /> : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
                <Stat label="Барлығы" value={users.totals.all} accent="plain" />
                <Stat label="Оқушы" value={users.totals.students} accent="teal" />
                <Stat label="Оқытушы" value={users.totals.teachers} accent="gold" />
                <Stat label="Әкімші" value={users.totals.admins} accent="plain" />
              </div>
              <Card className="p-3 mb-3">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input className="field pl-8 py-1.5 text-xs" placeholder="Аты немесе e-mail бойынша іздеу…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </Card>
              <Card className="overflow-x-auto">
                <div className="min-w-[680px]">
                  <div className="grid grid-cols-[1.4fr_90px_80px_70px_140px] gap-2 px-3.5 py-2 border-b border-white/10 text-[10px] uppercase tracking-wider text-white/35">
                    <span>Пайдаланушы</span>
                    <span>Рөл</span>
                    <span className="text-right">XP</span>
                    <span className="text-right">Сессия</span>
                    <span className="text-right">Әрекеттер</span>
                  </div>
                  {users.users.map((u: any) => (
                    <div key={u.id} className="grid grid-cols-[1.4fr_90px_80px_70px_140px] gap-2 px-3.5 py-2.5 items-center border-b border-white/5 last:border-0">
                      <div className="min-w-0">
                        <p className="text-[12px] text-parchment truncate flex items-center gap-1.5">
                          {u.name}
                          {u.disabled && <span className="text-[8px] text-[#e08a6a]">бұғатталған</span>}
                        </p>
                        <p className="text-[9.5px] text-white/30 truncate">{u.email}</p>
                      </div>
                      <select
                        className="field py-1 text-[10px]"
                        value={u.role}
                        onChange={(e) => void patchUser(u.id, { role: e.target.value })}
                        disabled={u.id === user?.id}
                      >
                        <option value="student">Оқушы</option>
                        <option value="teacher">Оқытушы</option>
                        <option value="admin">Әкімші</option>
                      </select>
                      <span className="text-right text-[11px] text-teal font-mono">{u.xp}</span>
                      <span className="text-right text-[11px] text-white/45 font-mono">{u.sessions_count}</span>
                      <div className="flex justify-end">
                        <button
                          className={`btn px-2 py-1 text-[10px] ${u.disabled ? 'btn-teal' : 'btn-ghost'}`}
                          onClick={() => void patchUser(u.id, { disabled: !u.disabled })}
                          disabled={u.id === user?.id}
                        >
                          <Power size={11} /> {u.disabled ? 'Қалпына келтіру' : 'Бұғаттау'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {/* QUESTIONS */}
      {tab === 'questions' && (
        <>
          {!questions ? <Spinner /> : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge tone="teal">Банк: {questions.total} сұрақ</Badge>
                <Badge tone="gold">Әкімші қосқан: {questions.custom?.length ?? 0}</Badge>
                <button className="btn btn-gold px-3.5 py-2 text-xs ml-auto" onClick={() => setEditorOpen(true)}>
                  <Plus size={13} /> Жаңа сұрақ қосу
                </button>
              </div>

              {questions.custom?.length > 0 && (
                <Card className="p-3 mb-3">
                  <p className="text-[11px] uppercase tracking-wider text-gold mb-2">Әкімші қосқан сұрақтар</p>
                  <div className="space-y-1.5">
                    {questions.custom.map((q: any) => (
                      <div key={q.id} className="glass px-3 py-2 flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11.5px] text-white/70 leading-snug">{q.prompt}</p>
                          <p className="text-[9px] text-white/30 mt-0.5">{q.category} · {q.format} · {q.active ? 'белсенді' : 'өшірілген'}</p>
                        </div>
                        <button
                          className="btn btn-ghost px-2 py-1 text-[10px] shrink-0"
                          onClick={async () => {
                            await api(`/api/admin/questions/${q.id}`, { method: 'PATCH', json: { active: !q.active } });
                            void load();
                          }}
                        >
                          {q.active ? <X size={10} /> : <Check size={10} />}
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Банктегі сұрақтар (алғашқы 60)</p>
                <div className="space-y-1 max-h-[520px] overflow-y-auto">
                  {questions.questions.map((q: any) => (
                    <div key={q.id} className="px-2.5 py-1.5 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="text-[8.5px] font-mono text-white/30">{q.id}</span>
                        <span className="text-[8.5px] px-1 rounded bg-teal/15 text-teal">{q.format}</span>
                        <span className="text-[8.5px] text-white/30">{q.category}</span>
                        <span className="text-[8.5px] text-gold">L{q.difficulty}</span>
                      </div>
                      <p className="text-[11px] text-white/60 leading-snug line-clamp-2">{q.prompt}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {/* CONTENT */}
      {tab === 'content' && (
        !contentStats ? <Spinner /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
              <Stat label="Фактілер" value={contentStats.facts} accent="teal" />
              <Stat label="Сұрақтар" value={contentStats.questions} accent="gold" />
              <Stat label="Тұлғалар" value={contentStats.persons} accent="plain" />
              <Stat label="Оқиғалар" value={contentStats.events} accent="teal" />
              <Stat label="Дереккөздер" value={contentStats.sources} accent="gold" />
              <Stat label="Кезеңдер" value={contentStats.periods} accent="plain" />
              <Stat label="Мемлекеттер" value={contentStats.kingdoms} accent="teal" />
              <Stat label="Жәдігерлер" value={contentStats.artifacts} accent="gold" />
            </div>
            <Card className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-gold mb-3">Санаттар бойынша сұрақ саны</p>
              <div className="space-y-2">
                {contentStats.byCategory.map((c: any) => (
                  <div key={c.id}>
                    <div className="flex justify-between text-[11px] text-white/55 mb-1">
                      <span>{c.title}</span>
                      <span className="font-mono">{c.count}</span>
                    </div>
                    <ProgressBar value={(c.count / contentStats.questions) * 100} tone="teal" height={4} />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-white/30 mt-3">
                Мазмұн shared/ каталогындағы TypeScript файлдарында сақталады және нұсқа бақылауы арқылы өзгертіледі.
                Сұрақ банкі детерминді генерацияланады — қолмен өзгерту үшін «Сұрақтар» бөлімін қолданыңыз.
              </p>
            </Card>
          </>
        )
      )}

      {/* SETTINGS */}
      {tab === 'settings' && (
        !settings ? <Spinner /> : (
          <Card className="p-5 max-w-xl">
            <p className="text-[11px] uppercase tracking-wider text-gold mb-3">Платформа параметрлері</p>
            <div className="space-y-3">
              {[
                ['registration', 'Жаңа тіркелуге рұқсат', 'Тіркелу формасы ашық болсын'],
                ['dailyChallenge', 'Күнделікті сынақ', 'Күнделікті сынақ көрсетілсін'],
                ['weeklyChallenge', 'Апталық сынақ', 'Апталық сынақ көрсетілсін'],
                ['leaderboardPublic', 'Ашық рейтинг', 'Рейтинг барлық қонақтарға көрінсін'],
              ].map(([key, label, desc]) => (
                <label key={key} className="flex items-start gap-3 glass px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[#2fb9a8] w-4 h-4"
                    checked={settings.settings[key] === 'on'}
                    onChange={(e) => void saveSettings({ [key]: e.target.checked ? 'on' : 'off' })}
                  />
                  <span>
                    <span className="block text-[12.5px] text-parchment">{label}</span>
                    <span className="block text-[10px] text-white/35">{desc}</span>
                  </span>
                </label>
              ))}
              <label className="block">
                <span className="text-[11px] text-white/50 block mb-1">Әр деңгейдегі сұрақ саны</span>
                <select
                  className="field py-2 text-xs"
                  value={settings.settings.questionsPerLevel}
                  onChange={(e) => void saveSettings({ questionsPerLevel: e.target.value })}
                >
                  <option value="10">10 (стандарт)</option>
                  <option value="8">8</option>
                  <option value="12">12</option>
                </select>
              </label>
            </div>
            <p className="text-[10px] text-white/30 mt-4 flex gap-1.5">
              <Save size={11} className="shrink-0 mt-0.5" /> Өзгерістер бірден серверде сақталады және қауіпсіздік журналына жазылады.
            </p>
          </Card>
        )
      )}

      {/* SECURITY */}
      {tab === 'security' && (
        !security ? <Spinner /> : (
          <>
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              <Stat label="Сәтсіз кіру" value={security.stats.failedLogins} accent="plain" />
              <Stat label="Рұқсаттан бас тарту" value={security.stats.rbacDenied} accent="gold" />
              <Stat label="Лимиттен асу" value={security.stats.rateLimits} accent="teal" />
            </div>
            <Card className="overflow-x-auto">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-[150px_140px_1fr_110px] gap-2 px-3.5 py-2 border-b border-white/10 text-[10px] uppercase tracking-wider text-white/35">
                  <span>Уақыт</span>
                  <span>Оқиға</span>
                  <span>Мәлімет</span>
                  <span>IP</span>
                </div>
                {security.log.length === 0 ? (
                  <p className="text-center text-xs text-white/40 py-8">Журнал бос.</p>
                ) : (
                  security.log.map((l: any) => (
                    <div key={l.id} className="grid grid-cols-[150px_140px_1fr_110px] gap-2 px-3.5 py-2 border-b border-white/5 last:border-0 text-[10.5px]">
                      <span className="text-white/35 font-mono">{new Date(l.created_at).toLocaleString('kk-KZ')}</span>
                      <span className={
                        l.event.includes('fail') || l.event.includes('denied') || l.event.includes('limit')
                          ? 'text-[#e08a6a]'
                          : 'text-teal'
                      }>{l.event}</span>
                      <span className="text-white/55 truncate">{l.detail ?? '—'}</span>
                      <span className="text-white/30 font-mono truncate">{l.ip ?? '—'}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </>
        )
      )}

      {/* question editor */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title="Жаңа сұрақ қосу" wide>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-[10px] text-white/45 block mb-1">Санат</span>
              <select className="field py-2 text-xs" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {['stone-bronze', 'saka-hun', 'turkic', 'karakhanid-kipchak', 'mongol-horde', 'khanate', 'russian-alash', 'soviet-independent'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] text-white/45 block mb-1">Формат</span>
              <select className="field py-2 text-xs" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
                <option value="mcq">Бір дұрыс жауап</option>
                <option value="truefalse">Дұрыс / қате</option>
                <option value="fill-blank">Бос орын</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] text-white/45 block mb-1">Қиындық</span>
              <select className="field py-2 text-xs" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}>
                <option value={1}>Жеңіл</option>
                <option value={2}>Орташа</option>
                <option value={3}>Қиын</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] text-white/45 block mb-1">Сұрақ мәтіні</span>
            <textarea className="field text-xs" rows={2} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
          </label>
          <div>
            <span className="text-[10px] text-white/45 block mb-1">Нұсқалар (дұрысын радио батырмамен белгілеңіз)</span>
            {form.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <input type="radio" checked={form.answerIndex === i} onChange={() => setForm({ ...form, answerIndex: i })} className="accent-[#d9a94a]" />
                <input className="field py-1.5 text-xs" value={o} onChange={(e) => setForm({ ...form, options: form.options.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`${i + 1}-нұсқа`} />
              </div>
            ))}
          </div>
          <label className="block">
            <span className="text-[10px] text-white/45 block mb-1">Тарихи түсіндірме (міндетті, кемінде 10 таңба)</span>
            <textarea className="field text-xs" rows={2} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-[10px] text-white/45 block mb-1">Дереккөз</span>
            <input className="field py-1.5 text-xs" value={form.sourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })} placeholder="ehistory" />
          </label>
          <div className="flex gap-2">
            <button className="btn btn-gold px-4 py-2 text-xs" onClick={() => void createQuestion()}>
              <Plus size={13} /> Сақтау
            </button>
            <button className="btn btn-ghost px-4 py-2 text-xs" onClick={() => setEditorOpen(false)}>Болдырмау</button>
          </div>
          <p className="text-[10px] text-white/30">
            Ескерту: сұрақ мәтінінде тарихи дәлсіздік болмауы керек. Дереккөзсіз сұрақ қоспаңыз.
          </p>
        </div>
      </Modal>
    </div>
  );
}
