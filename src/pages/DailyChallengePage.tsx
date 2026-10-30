import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, CheckCircle2, ArrowLeft, Play } from 'lucide-react';
import { api } from '../lib/api';
import { QuizEngine, type QuizOutcome } from '../games/QuizEngine';
import { Badge, Card, Spinner, Stat } from '../components/UI';

export default function DailyChallengePage() {
  const navigate = useNavigate();
  const [daily, setDaily] = useState<{ day: string; questions: any[]; answered: boolean } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<QuizOutcome | null>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<any>('/api/challenges/daily').then(setDaily).catch(() => {});
  }, []);

  async function start() {
    setBusy(true);
    try {
      // reuse the battle game session so results persist like any other game
      const res = await api<any>('/api/session/start', {
        method: 'POST',
        json: { gameId: 'battle', level: 10, difficulty: 'hard', count: 5 },
      });
      setSessionId(res.sessionId);
    } catch {
      setBusy(false);
    }
  }

  async function finish(o: QuizOutcome) {
    setOutcome(o);
    if (!sessionId) return;
    try {
      const r = await api<any>(`/api/session/${sessionId}/complete`, {
        method: 'POST',
        json: { baseScore: 0, durationSeconds: Math.round(o.timeMs / 1000) },
      });
      setResult(r);
    } catch {
      setResult(null);
    }
  }

  if (!daily) return <Spinner label="Күнделікті сынақ жүктелуде…" />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <button onClick={() => navigate(-1)} className="text-xs text-white/45 hover:text-white inline-flex items-center gap-1 mb-4">
        <ArrowLeft size={13} /> Артқа
      </button>

      <header className="mb-5">
        <Badge tone="gold"><Flame size={11} /> {daily.day}</Badge>
        <h1 className="font-display text-2xl sm:text-3xl text-parchment mt-2">Күнделікті тарихи сынақ</h1>
        <p className="text-xs text-white/50 mt-1.5">
          5 сұрақ · қиындық жоғары · барлық қатысушыға бірдей сұрақтар (күн бойынша детерминді таңдау).
        </p>
      </header>

      {outcome && result ? (
        <Card className="p-6 text-center">
          <CheckCircle2 size={30} className="mx-auto text-teal mb-3" />
          <p className="font-display text-xl text-parchment">Сынақ аяқталды</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-left">
            <Stat label="Ұпай" value={result.score} accent="gold" />
            <Stat label="XP" value={`+${result.xp}`} accent="teal" />
            <Stat label="Дұрыс" value={outcome.correct} />
            <Stat label="Қате" value={outcome.wrong} />
          </div>
          <button className="btn btn-gold px-5 py-2.5 text-sm mt-5" onClick={() => navigate('/profil')}>
            Профильге өту
          </button>
        </Card>
      ) : sessionId ? (
        <QuizEngine
          sessionId={sessionId}
          questions={daily.questions}
          perQuestionSeconds={30}
          title="Күнделікті сынақ"
          onFinish={finish}
        />
      ) : (
        <Card className="p-6 text-center">
          <p className="text-sm text-white/60 mb-4">
            Бүгінгі 5 сұрақ дайын. Әр сұраққа 30 секунд беріледі. Жауаптар серверде тексеріледі.
          </p>
          <button className="btn btn-gold px-6 py-3" onClick={() => void start()} disabled={busy}>
            <Play size={16} /> {busy ? 'Дайындалуда…' : 'Сынақты бастау'}
          </button>
        </Card>
      )}
    </div>
  );
}
