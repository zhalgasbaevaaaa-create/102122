/**
 * Stylised SVG portraits for historical personalities.
 *
 * IMPORTANT: these are ORIGINAL stylised illustrations, NOT authentic portraits
 * and NOT photographs. The UI always renders the caption "стильденген бейне"
 * so a learner can never mistake them for documentary evidence.
 */
import type { Person } from '@shared/persons';

export function Portrait({ person, size = 120 }: { person: Person; size?: number }) {
  const c = person.portrait.palette;
  const kind = person.portrait.kind;
  const uid = `p-${person.id}`;

  return (
    <svg
      viewBox="0 0 160 160"
      width={size}
      height={size}
      role="img"
      aria-label={`${person.name} — стильденген бейне`}
      className="rounded-2xl shrink-0"
    >
      <defs>
        <radialGradient id={`${uid}-bg`} cx="50%" cy="30%" r="80%">
          <stop offset="0%" stopColor={c} stopOpacity="0.34" />
          <stop offset="100%" stopColor="#0a0f1c" stopOpacity="0.98" />
        </radialGradient>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.9" />
          <stop offset="100%" stopColor={c} stopOpacity="0.45" />
        </linearGradient>
      </defs>

      <rect width="160" height="160" rx="18" fill={`url(#${uid}-bg)`} />
      {/* ornamental frame */}
      <rect x="6" y="6" width="148" height="148" rx="14" fill="none" stroke={c} strokeOpacity="0.35" />
      <path d="M22 18 h12 M18 22 v12 M138 18 h-12 M142 22 v12" stroke={c} strokeOpacity="0.5" strokeWidth="1.5" fill="none" />

      {/* shoulders / robe */}
      <path d="M36 156 Q40 112 80 104 Q120 112 124 156 Z" fill={`url(#${uid}-body)`} />
      <path d="M80 104 L68 156 M80 104 L92 156" stroke="#0a0f1c" strokeOpacity="0.35" strokeWidth="2" />
      <path d="M56 122 Q80 136 104 122" stroke={c} strokeOpacity="0.6" strokeWidth="2" fill="none" />

      {kind === 'ruler' && (
        <>
          {/* crown / headdress */}
          <path d="M58 52 L66 34 L74 48 L80 28 L86 48 L94 34 L102 52 Z" fill={c} opacity="0.95" />
          <rect x="58" y="52" width="44" height="6" rx="3" fill={c} opacity="0.8" />
        </>
      )}
      {kind === 'rider' && (
        <>
          {/* pointed steppe cap */}
          <path d="M58 54 Q80 26 102 54 Z" fill={c} opacity="0.9" />
          <path d="M56 54 h48" stroke={c} strokeWidth="4" />
          <circle cx="80" cy="34" r="3" fill="#f4ead6" opacity="0.9" />
        </>
      )}
      {kind === 'scholar' && (
        <>
          {/* skullcap + quill */}
          <path d="M60 52 Q80 34 100 52 Z" fill={c} opacity="0.85" />
          <path d="M118 108 L128 74 L134 78 L124 112 Z" fill="#f4ead6" opacity="0.75" />
        </>
      )}
      {kind === 'woman' && (
        <>
          {/* headscarf */}
          <path d="M56 58 Q58 30 80 30 Q102 30 104 58 Q104 74 80 78 Q56 74 56 58 Z" fill={c} opacity="0.5" />
        </>
      )}

      {/* face */}
      <ellipse cx="80" cy="66" rx="21" ry="24" fill="#e8d3b4" opacity="0.95" />
      <path d="M59 62 Q80 44 101 62" fill="none" stroke="#0a0f1c" strokeOpacity="0.35" strokeWidth="3" />
      <circle cx="72" cy="66" r="2.2" fill="#1b2230" />
      <circle cx="88" cy="66" r="2.2" fill="#1b2230" />
      <path d="M74 78 Q80 82 86 78" stroke="#1b2230" strokeOpacity="0.65" strokeWidth="1.8" fill="none" />

      {(kind === 'ruler' || kind === 'rider') && (
        <path d="M66 86 Q80 110 94 86 Q90 98 80 98 Q70 98 66 86 Z" fill="#2b2118" opacity="0.75" />
      )}
    </svg>
  );
}

export function PortraitCaption() {
  return <span className="text-[9px] uppercase tracking-wider text-white/30">стильденген бейне</span>;
}
