/**
 * Locally drawn, stylised SVG illustrations for the artifact catalogue.
 * These are ORIGINAL schematic drawings, not photographs or replicas, and the UI
 * labels them as such (requirement: never claim an illustration is authentic).
 */
import { ARTIFACTS, artifactById } from '@shared/artifacts';

const TAL = '#d9a94a';
const TAL2 = '#f0cd85';
const TEAL = '#2fb3a8';
const BG = '#101827';

function Drawing({ id }: { id: string }) {
  switch (id) {
    case 'essik-man':
      return (
        <g>
          <path d="M100 34 L128 54 L118 78 L82 78 L72 54 Z" fill={TAL} opacity="0.95" />
          <path d="M100 20 L110 34 L100 44 L90 34 Z" fill={TAL2} />
          <circle cx="100" cy="92" r="20" fill="#e8d3a0" />
          <path d="M100 112 L128 132 L124 186 L76 186 L72 132 Z" fill={TAL} opacity="0.8" />
          <path d="M86 132 L100 150 L114 132" stroke="#5a3f12" strokeWidth="2" fill="none" />
          {[80, 92, 104, 116].map((x, i) => (
            <circle key={i} cx={x} cy={160 - (i % 2) * 8} r="3" fill={TAL2} />
          ))}
        </g>
      );
    case 'animal-style':
      return (
        <g stroke={TAL} strokeWidth="2.4" fill="none" strokeLinecap="round">
          <path d="M46 130 Q70 84 100 96 Q130 108 154 76" />
          <path d="M46 130 Q58 152 82 146" />
          <path d="M100 96 Q96 74 116 66 Q136 58 140 78" />
          <circle cx="128" cy="72" r="3" fill={TAL} />
          <path d="M62 118 Q76 104 92 112" />
          <path d="M108 60 Q120 48 130 58" />
          <path d="M154 76 Q170 92 156 108" />
          <circle cx="82" cy="120" r="2" fill={TEAL} stroke="none" />
          <circle cx="118" cy="122" r="2" fill={TEAL} stroke="none" />
        </g>
      );
    case 'saka-kazan':
      return (
        <g>
          <path d="M62 84 Q100 76 138 84 L130 140 Q100 156 70 140 Z" fill="#8d6b3a" />
          <ellipse cx="100" cy="84" rx="38" ry="9" fill="#a37f45" />
          <path d="M62 92 Q46 100 54 116" stroke="#8d6b3a" strokeWidth="5" fill="none" />
          <path d="M138 92 Q154 100 146 116" stroke="#8d6b3a" strokeWidth="5" fill="none" />
          <path d="M76 104 Q100 114 124 104" stroke={TAL} strokeWidth="2" fill="none" />
          <circle cx="100" cy="122" r="4" fill={TAL} />
        </g>
      );
    case 'hun-bow':
      return (
        <g>
          <path d="M52 60 Q140 100 52 140" stroke="#b98a4b" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M52 60 L52 140" stroke="#e8e2d0" strokeWidth="1.4" />
          <path d="M52 100 L150 100" stroke="#c9c2ae" strokeWidth="2" />
          <path d="M150 100 L136 94 M150 100 L136 106" stroke={TAL} strokeWidth="2.5" />
        </g>
      );
    case 'turik-stone':
    case 'alash-press':
      return id === 'turik-stone' ? (
        <g>
          <rect x="74" y="30" width="52" height="140" rx="6" fill="#6f7d8c" />
          <rect x="78" y="36" width="44" height="128" rx="4" fill="#7c8b9b" />
          {[0, 1, 2, 3, 4].map((r) =>
            [0, 1, 2].map((c) => (
              <path
                key={`${r}-${c}`}
                d={`M${86 + c * 13} ${52 + r * 22} l6 0 M${89 + c * 13} ${49 + r * 22} l0 7 M${86 + c * 13} ${52 + r * 22} l-3 5`}
                stroke="#28323d"
                strokeWidth="2"
                fill="none"
              />
            )),
          )}
        </g>
      ) : (
        <g>
          <rect x="46" y="46" width="108" height="108" rx="4" fill="#d9cdb4" />
          <rect x="54" y="54" width="92" height="30" fill="#3a3226" />
          <text x="100" y="76" textAnchor="middle" fontSize="17" fill="#e8dfc8" fontFamily="serif">
            Қазақ
          </text>
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1="58" x2="142" y1={96 + i * 14} y2={96 + i * 14} stroke="#6b5d47" strokeWidth="3" />
          ))}
        </g>
      );
    case 'karakhanid-coin':
      return (
        <g>
          <circle cx="100" cy="100" r="52" fill="#b9b3a2" />
          <circle cx="100" cy="100" r="44" fill="#d4cebd" />
          <circle cx="100" cy="100" r="32" fill="none" stroke="#8d8778" strokeWidth="1.5" />
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1={78} x2={122} y1={86 + i * 10} y2={86 + i * 10} stroke="#6f6a5d" strokeWidth="2.5" />
          ))}
          <path d="M100 60 l4 8 h-8 z" fill="#8d8778" />
        </g>
      );
    case 'kipchak-mask':
      return (
        <g>
          <path d="M70 48 Q100 34 130 48 L136 108 Q100 148 64 108 Z" fill="#8e9aa6" />
          <path d="M74 62 Q88 56 96 64" stroke="#39424c" strokeWidth="4" fill="none" />
          <path d="M126 62 Q112 56 104 64" stroke="#39424c" strokeWidth="4" fill="none" />
          <path d="M86 104 L100 96 L114 104" stroke="#39424c" strokeWidth="3" fill="none" />
          <path d="M100 34 L100 20" stroke={TAL} strokeWidth="3" />
          <circle cx="100" cy="18" r="4" fill={TAL} />
        </g>
      );
    case 'sarai':
    case 'otrar-wall':
      return (
        <g>
          <rect x="40" y="96" width="120" height="64" fill="#7a6a55" />
          <rect x="40" y="86" width="120" height="12" fill="#8d7c65" />
          {[48, 68, 88, 108, 128, 148].map((x) => (
            <rect key={x} x={x - 7} y="74" width="14" height="14" fill="#8d7c65" />
          ))}
          <path d="M88 160 L88 122 Q100 110 112 122 L112 160" fill="#3c3327" />
          <path d="M40 96 h120" stroke="#5b4d3c" strokeWidth="2" />
          {id === 'otrar-wall' && (
            <path d="M60 96 L60 60 L76 60 L76 96" stroke="#5b4d3c" strokeWidth="4" fill="none" />
          )}
        </g>
      );
    case 'khanate-tamga':
      return (
        <g stroke={TAL} strokeWidth="4" fill="none" strokeLinecap="round">
          <circle cx="100" cy="100" r="46" opacity="0.35" />
          <path d="M100 56 L100 144" />
          <path d="M70 84 Q100 66 130 84" />
          <path d="M78 120 Q100 138 122 120" />
          <path d="M64 100 L136 100" opacity="0.6" />
          <circle cx="100" cy="100" r="6" fill={TAL} stroke="none" />
        </g>
      );
    case 'zhambyl-dombra':
      return (
        <g>
          <path d="M92 32 L108 32 L112 96 Q132 112 128 138 Q124 162 100 162 Q76 162 72 138 Q68 112 88 96 Z" fill="#b98a4b" />
          <rect x="94" y="24" width="12" height="16" rx="3" fill="#6f4f28" />
          <line x1="88" x2="112" y1="60" y2="60" stroke="#4a3418" strokeWidth="2" />
          <line x1="97" x2="97" y1="32" y2="150" stroke="#efe6d2" strokeWidth="1.2" />
          <line x1="104" x2="104" y1="32" y2="150" stroke="#efe6d2" strokeWidth="1.2" />
          <circle cx="100" cy="130" r="7" fill="#6f4f28" />
        </g>
      );
    case 'turkestan':
      return (
        <g>
          <rect x="48" y="96" width="104" height="64" fill="#7e8a92" />
          <path d="M48 96 Q100 40 152 96 Z" fill={TEAL} opacity="0.85" />
          <path d="M100 40 L96 24 L104 24 Z" fill={TAL} />
          <path d="M88 160 L88 118 Q100 104 112 118 L112 160" fill="#2b3540" />
          <circle cx="100" cy="86" r="9" fill="none" stroke={TAL} strokeWidth="2" />
          <rect x="56" y="112" width="16" height="24" fill="#5d6870" />
          <rect x="128" y="112" width="16" height="24" fill="#5d6870" />
        </g>
      );
    case 'yurt':
      return (
        <g>
          <path d="M56 140 Q100 128 144 140 L138 148 Q100 140 62 148 Z" fill="#9b855f" />
          <path d="M56 140 Q60 84 100 66 Q140 84 144 140 Z" fill="#e5dbc4" />
          <path d="M100 66 Q84 84 80 140 M100 66 Q116 84 120 140" stroke="#b3a687" strokeWidth="1.5" fill="none" />
          <circle cx="100" cy="66" r="9" fill={TEAL} opacity="0.8" />
          <rect x="92" y="118" width="16" height="24" rx="3" fill="#7a6a4a" />
          <path d="M56 140 h88" stroke="#7a6a4a" strokeWidth="2" />
        </g>
      );
    case 'soviet-sputnik':
      return (
        <g>
          <circle cx="100" cy="100" r="26" fill="#b8c2cc" />
          <circle cx="100" cy="100" r="26" fill="none" stroke="#7f8b97" strokeWidth="2" />
          <path d="M100 74 L100 50 M100 126 L100 150 M74 100 L50 100 M126 100 L150 100" stroke="#8f9aa6" strokeWidth="3" />
          <path d="M96 74 Q100 60 104 74" fill="none" stroke={TAL} strokeWidth="2" />
          <circle cx="100" cy="100" r="9" fill={TEAL} opacity="0.7" />
        </g>
      );
    case 'astana-baiterek':
      return (
        <g>
          <path d="M100 26 L118 92 L82 92 Z" fill={TAL} opacity="0.9" />
          <circle cx="100" cy="42" r="12" fill={TAL2} />
          <path d="M86 92 L74 160 L126 160 L114 92 Z" fill="#7e8a92" />
          <path d="M74 160 h52" stroke="#5d6870" strokeWidth="4" />
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M${86 + i * 4} ${110 + i * 16} L${114 - i * 4} ${110 + i * 16}`} stroke="#a9b4bd" strokeWidth="2" />
          ))}
        </g>
      );
    case 'kazakh-flag':
      return (
        <g>
          <rect x="46" y="44" width="108" height="112" rx="4" fill="#2fa8b8" />
          <circle cx="100" cy="86" r="18" fill={TAL} />
          <path d="M100 56 Q112 68 104 78 Q116 86 104 96 Q112 104 100 116 Q88 104 96 96 Q84 86 96 78 Q88 68 100 56 Z" fill="#2fa8b8" />
          <path d="M62 60 l0 80 M70 60 l0 80" stroke={TAL} strokeWidth="2" opacity="0.7" />
          <path d="M56 148 Q100 138 144 148" stroke={TAL} strokeWidth="3" fill="none" />
        </g>
      );
    default:
      return <circle cx="100" cy="100" r="40" fill={TEAL} opacity="0.4" />;
  }
}

export function Artifact({ id, size = 140, label = false }: { id: string; size?: number; label?: boolean }) {
  const a = artifactById(id);
  return (
    <figure className="inline-flex flex-col items-center gap-2">
      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        role="img"
        aria-label={a ? `${a.name} — стильденген сурет` : 'Тарихи нысан'}
        className="rounded-xl"
        style={{ background: `radial-gradient(circle at 50% 40%, ${BG}, #070b14 78%)` }}
      >
        <Drawing id={id} />
      </svg>
      {label && a && (
        <figcaption className="text-[11px] text-white/50 text-center max-w-[180px]">
          {a.name}
          <span className="block text-[9px] text-white/30 mt-0.5">стильденген сурет</span>
        </figcaption>
      )}
    </figure>
  );
}

/** Small symbol used as a match-3 tile; returns a 40x40 glyph. */
export function SymbolGlyph({ id, size = 34 }: { id: string; size?: number }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true">
      <Drawing id={id} />
    </svg>
  );
}

export const SYMBOL_IDS = ARTIFACTS.map((a) => a.id);
