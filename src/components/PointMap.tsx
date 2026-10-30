import { useMemo } from 'react';
import { project, KZ_OUTLINE, polygonPath } from '../lib/geo';

/** Mini map used inside quiz questions: highlights a single location. */
export function PointMap({ point, width = 320, height = 190 }: { point: [number, number]; width?: number; height?: number }) {
  const d = useMemo(() => polygonPath(KZ_OUTLINE, width, height), [width, height]);
  const [x, y] = project(point, width, height);
  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-[#08101c]">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full block">
        <defs>
          <pattern id="mini-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0 L0 0 0 20" fill="none" stroke="#1a2637" strokeWidth="0.8" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#mini-grid)" />
        <path d={d} fill="#12202e" stroke="#2fb3a8" strokeOpacity="0.55" strokeWidth="1.4" />
        <circle cx={x} cy={y} r="16" fill="#d9a94a" opacity="0.16" />
        <circle cx={x} cy={y} r="9" fill="#d9a94a" opacity="0.32" />
        <circle cx={x} cy={y} r="4" fill="#f0cd85" stroke="#0a0f1c" strokeWidth="1.5" />
        <text x={width - 8} y={height - 8} textAnchor="end" fontSize="9" fill="#4d5f74">
          схемалық карта
        </text>
      </svg>
    </div>
  );
}
