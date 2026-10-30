import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, Loader2, ChevronRight } from 'lucide-react';

/* ── Toasts ─────────────────────────────────────────────────────── */
type Toast = { id: number; kind: 'ok' | 'err' | 'info'; title: string; body?: string };
const ToastCtx = createContext<{ push: (t: Omit<Toast, 'id'>) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { ...t, id }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 5200);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed z-[90] bottom-4 right-4 flex flex-col gap-2 w-[min(92vw,360px)]">
        {items.map((t) => (
          <div
            key={t.id}
            className="animate-toast glass-strong px-4 py-3 flex gap-3 items-start shadow-2xl"
            role="status"
          >
            <span className="mt-0.5">
              {t.kind === 'ok' ? (
                <CheckCircle2 size={18} className="text-teal" />
              ) : t.kind === 'err' ? (
                <AlertTriangle size={18} className="text-[#e08a6a]" />
              ) : (
                <Info size={18} className="text-gold" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">{t.title}</p>
              {t.body && <p className="text-xs text-white/60 mt-1 leading-snug">{t.body}</p>}
            </div>
            <button
              onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}
              className="ml-auto text-white/40 hover:text-white/80"
              aria-label="Жабу"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast outside provider');
  return ctx.push;
}

/* ── Layout primitives ──────────────────────────────────────────── */
export function Section({
  title, subtitle, action, children, id,
}: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mb-10 sm:mb-14">
      {(title || action) && (
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            {title && <h2 className="text-2xl sm:text-3xl font-display text-parchment">{title}</h2>}
            {subtitle && <p className="text-white/50 text-sm mt-1.5 max-w-2xl">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ children, className = '', glow = false }: { children: ReactNode; className?: string; glow?: boolean }) {
  return (
    <div className={`glass ${glow ? 'shadow-[0_20px_60px_-30px_rgba(47,179,168,0.5)]' : ''} ${className}`}>{children}</div>
  );
}

export function Stat({
  label, value, sub, icon, accent = 'gold',
}: { label: string; value: ReactNode; sub?: string; icon?: ReactNode; accent?: 'gold' | 'teal' | 'plain' }) {
  const color = accent === 'gold' ? 'text-gold' : accent === 'teal' ? 'text-teal' : 'text-white';
  return (
    <div className="glass px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-white/45">{label}</p>
        {icon && <span className={color}>{icon}</span>}
      </div>
      <p className={`text-2xl font-display mt-1.5 ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-white/40 mt-0.5">{sub}</p>}
    </div>
  );
}

export function Badge({ children, tone = 'plain' }: { children: ReactNode; tone?: 'gold' | 'teal' | 'plain' | 'danger' }) {
  const map = {
    gold: 'bg-gold/15 text-gold border-gold/30',
    teal: 'bg-teal/15 text-teal border-teal/30',
    plain: 'bg-white/6 text-white/70 border-white/12',
    danger: 'bg-[#c96a4a]/15 text-[#e79075] border-[#c96a4a]/30',
  };
  return <span className={`chip border ${map[tone]}`}>{children}</span>;
}

export function ProgressBar({ value, tone = 'teal', height = 8 }: { value: number; tone?: 'teal' | 'gold' | 'danger'; height?: number }) {
  const color = tone === 'teal' ? 'from-teal to-teal-soft' : tone === 'gold' ? 'from-gold to-gold-soft' : 'from-[#c96a4a] to-[#e08a6a]';
  return (
    <div className="w-full rounded-full bg-white/8 overflow-hidden" style={{ height }}>
      <div
        className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-white/60">
      <Loader2 size={26} className="animate-spin text-teal" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function EmptyState({ title, body, icon, action }: { title: string; body?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="glass px-6 py-12 text-center">
      <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-white/5 border border-white/10 grid place-items-center text-gold">
        {icon ?? <Info size={22} />}
      </div>
      <p className="font-display text-lg text-parchment">{title}</p>
      {body && <p className="text-sm text-white/50 mt-2 max-w-md mx-auto">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Modal({
  open, onClose, title, children, wide = false,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative glass-strong w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto animate-pop`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-[#0d1421]/95 backdrop-blur z-10">
          <h3 className="font-display text-lg text-parchment pr-4">{title}</h3>
          <button onClick={onClose} className="text-white/50 hover:text-white rounded-lg p-1" aria-label="Жабу">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function LinkCard({
  title, description, icon, meta, accent = '#d9a94a', onClick, href,
}: { title: string; description: string; icon: ReactNode; meta?: ReactNode; accent?: string; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <div
        className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
        style={{ background: `${accent}1f`, border: `1px solid ${accent}44`, color: accent }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base text-parchment leading-snug">{title}</p>
        <p className="text-xs text-white/50 mt-1 leading-relaxed line-clamp-2">{description}</p>
        {meta && <div className="mt-2.5 flex flex-wrap gap-1.5">{meta}</div>}
      </div>
      <ChevronRight size={16} className="text-white/25 group-hover:text-gold transition-colors shrink-0" />
    </>
  );
  const cls = 'group glass px-4 py-3.5 flex items-center gap-3.5 hover:border-gold/40 transition-colors cursor-pointer w-full text-left';
  if (href) return <a href={href} className={cls}>{inner}</a>;
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/* ── Source reference ───────────────────────────────────────────── */
export function SourceRefs({ ids }: { ids: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-[10px] uppercase tracking-wide text-white/35">Дереккөз:</span>
      {ids.map((id) => (
        <span key={id} className="text-[10px] px-1.5 py-0.5 rounded bg-white/6 border border-white/10 text-white/55 font-mono">
          {id}
        </span>
      ))}
    </div>
  );
}
