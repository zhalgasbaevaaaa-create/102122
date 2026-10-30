import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, UserPlus, Info, ShieldCheck, Mail, Lock, User, Users, AlertTriangle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { useToast, Card } from '../components/UI';

export default function AuthPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', group: '', school: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate('/profil', { replace: true });
  }, [user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
        toast({ kind: 'ok', title: 'Қош келдіңіз!' });
      } else {
        await register(form);
        toast({ kind: 'ok', title: 'Аккаунт құрылды', body: 'Барлық алты ойында бір аккаунт қолданылады.' });
      }
      navigate('/profil');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Қате орын алды');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="grid md:grid-cols-[1fr_400px] gap-6 items-start">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-parchment">Бір аккаунт — алты ойын</h1>
          <p className="text-white/55 text-sm mt-3 leading-relaxed max-w-lg">
            Тіркелгеннен кейін ұпай, XP, деңгейлер, жетістіктер және ойын тарихы барлық ойындарда
            сақталады. Оқытушылар мен әкімшілер нәтижелерді бақылай алады.
          </p>

          <div className="glass mt-5 p-4">
            <p className="text-[11px] uppercase tracking-wider text-gold mb-2.5">Қауіпсіздік</p>
            <ul className="space-y-1.5 text-xs text-white/55">
              <li className="flex gap-2"><ShieldCheck size={13} className="text-teal shrink-0 mt-0.5" /> Құпия сөз scrypt (N=16384) арқылы хештеледі — ашық күйде сақталмайды.</li>
              <li className="flex gap-2"><ShieldCheck size={13} className="text-teal shrink-0 mt-0.5" /> Сессия токендері SHA-256 хеші түрінде сақталады, браузерде httpOnly cookie.</li>
              <li className="flex gap-2"><ShieldCheck size={13} className="text-teal shrink-0 mt-0.5" /> Ұпай серверде есептеледі; басқа оқушының нәтижесін өзгерту мүмкін емес.</li>
              <li className="flex gap-2"><ShieldCheck size={13} className="text-teal shrink-0 mt-0.5" /> Рөлдік бақылау: оқушы әкімшілік функцияларға кіре алмайды.</li>
            </ul>
          </div>

          <div className="glass mt-3 p-4">
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Демо аккаунттар (тексеру үшін)</p>
            <div className="grid sm:grid-cols-3 gap-2 text-[11px]">
              {[
                ['Оқушы', 'student@arena.kz', 'Student12345!'],
                ['Оқытушы', 'teacher@arena.kz', 'Teacher12345!'],
                ['Әкімші', 'admin@arena.kz', 'Admin12345!'],
              ].map(([role, email, pass]) => (
                <div key={role} className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-2">
                  <p className="text-white/70 font-semibold">{role}</p>
                  <p className="font-mono text-[10px] text-white/45 mt-0.5 break-all">{email}</p>
                  <p className="font-mono text-[10px] text-white/45">{pass}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[#e08a6a] mt-2">
              Бұл құпия сөздерді нақты орналастыру алдында міндетті түрде өзгертіңіз.
            </p>
          </div>
        </div>

        <Card className="p-5">
          <div className="flex gap-1 p-1 rounded-xl bg-white/5 mb-4">
            <button
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${mode === 'login' ? 'bg-gold text-[#131008]' : 'text-white/55'}`}
              onClick={() => setMode('login')}
            >
              <LogIn size={13} className="inline mr-1" /> Кіру
            </button>
            <button
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${mode === 'register' ? 'bg-gold text-[#131008]' : 'text-white/55'}`}
              onClick={() => setMode('register')}
            >
              <UserPlus size={13} className="inline mr-1" /> Тіркелу
            </button>
          </div>

          <form onSubmit={submit} className="space-y-2.5">
            {mode === 'register' && (
              <>
                <label className="block">
                  <span className="text-[11px] text-white/50 flex items-center gap-1 mb-1"><User size={11} /> Аты-жөні</span>
                  <input className="field" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Айсұлтан Нұрланұлы" />
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className="text-[11px] text-white/50 flex items-center gap-1 mb-1"><Users size={11} /> Топ</span>
                    <input className="field" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} placeholder="10-А" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-white/50 mb-1 block">Мектеп</span>
                    <input className="field" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} placeholder="№1 лицей" />
                  </label>
                </div>
              </>
            )}
            <label className="block">
              <span className="text-[11px] text-white/50 flex items-center gap-1 mb-1"><Mail size={11} /> E-mail</span>
              <input className="field" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="student@arena.kz" autoComplete="email" />
            </label>
            <label className="block">
              <span className="text-[11px] text-white/50 flex items-center gap-1 mb-1"><Lock size={11} /> Құпия сөз</span>
              <input
                className="field"
                type="password"
                required
                minLength={mode === 'register' ? 8 : 1}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={mode === 'register' ? 'кемінде 8 таңба' : '••••••••'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            </label>

            {error && (
              <p className="text-[11px] text-[#e08a6a] bg-[#c96a4a]/10 border border-[#c96a4a]/30 rounded-lg px-3 py-2 flex gap-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {error}
              </p>
            )}

            <button className="btn btn-gold w-full py-2.5 text-sm" disabled={busy}>
              {busy ? 'Орындалуда…' : mode === 'login' ? 'Кіру' : 'Аккаунт құру'}
            </button>
          </form>

          <p className="text-[10px] text-white/35 mt-3 leading-relaxed flex gap-1.5">
            <Info size={11} className="shrink-0 mt-0.5" />
            Тіркелу арқылы оқу мақсатындағы деректерді (аты, e-mail, ойын нәтижелері) өңдеуге келісесіз.
          </p>

          <Link to="/" className="block text-center text-[11px] text-white/40 hover:text-white mt-3">
            Басты бетке оралу
          </Link>
        </Card>
      </div>
    </div>
  );
}
