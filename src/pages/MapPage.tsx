import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Info, Route, MapPin, Swords, AlertTriangle, Clock, Layers } from 'lucide-react';
import { useContent } from '../lib/useContent';
import { Badge, Card, Spinner, SourceRefs } from '../components/UI';
import { project, polygonPath, linePath, KZ_OUTLINE, MAP_BBOX } from '../lib/geo';
import type { Kingdom } from '@shared/kingdoms';

const W = 1000;
const H = 700;

/** Cities, battle sites and monuments plotted on the map. */
const CITIES: { name: string; pt: [number, number]; kind: 'city' | 'battle' | 'monument'; note: string; year?: string }[] = [
  { name: 'Отырар', pt: [68.3, 42.9], kind: 'battle', note: '1219–1221 жж. моңғол қоршауының орны.', year: '1221' },
  { name: 'Тараз', pt: [71.4, 42.9], kind: 'city', note: 'Ұлы Жібек жолындағы ежелгі қала.' },
  { name: 'Түркістан', pt: [68.3, 43.3], kind: 'monument', note: 'Қожа Ахмет Ясауи кесенесі (14 ғ. соңы).' },
  { name: 'Сығанақ', pt: [67.5, 44.1], kind: 'city', note: 'Ақ Орда мен Әбілхайыр хандығының орталығы.' },
  { name: 'Сарайшық', pt: [51.9, 47.5], kind: 'city', note: 'Алтын Орда дәуіріндегі сауда орталығы.' },
  { name: 'Созақ', pt: [69.6, 43.6], kind: 'city', note: 'Қазақ хандығының ежелгі орталығы ретінде аталады.' },
  { name: 'Сайрам', pt: [69.6, 42.3], kind: 'city', note: 'Оңтүстік Қазақстандағы ежелгі қала.' },
  { name: 'Суяб', pt: [75.3, 42.8], kind: 'city', note: 'Батыс Түрік қағанаты мен Қарлұқ мемлекетінің орталығы.' },
  { name: 'Баласағұн', pt: [75.2, 42.7], kind: 'city', note: 'Қараханид мемлекетінің орталықтарының бірі.' },
  { name: 'Алматы', pt: [76.9, 43.2], kind: 'city', note: '1991–1997 жж. астана; 1986 ж. желтоқсан оқиғасының орны.' },
  { name: 'Астана', pt: [71.4, 51.2], kind: 'city', note: '1997 жылдан бастап Қазақстанның астанасы.' },
  { name: 'Байқоңыр', pt: [63.3, 45.6], kind: 'monument', note: '1955 ж. құрылған ғарыш айлағы.' },
  { name: 'Тамғалы', pt: [75.4, 43.8], kind: 'monument', note: 'ЮНЕСКО тізіміндегі петроглифтер.' },
  { name: 'Есік', pt: [77.3, 43.4], kind: 'monument', note: '«Алтын адам» табылған қорған.' },
  { name: 'Ботай', pt: [68.5, 53.2], kind: 'monument', note: 'Энеолиттік тұрақ (б.з.д. 4–3 мыңж.).' },
];

export default function MapPage() {
  const { data, loading } = useContent();
  const [year, setYear] = useState(1500);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<Kingdom | null>(null);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showCities, setShowCities] = useState(true);
  const [hoverCity, setHoverCity] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const active = useMemo(() => {
    if (!data) return [];
    return data.kingdoms.filter((k) => year >= k.from && year <= k.to);
  }, [data, year]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.75, Math.min(6, z - e.deltaY * 0.0016)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).tagName === 'path' && (e.target as Element).getAttribute('data-kingdom')) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const scale = W / (svgRef.current?.clientWidth || W);
    setPan({ x: d.px + (e.clientX - d.x) * scale, y: d.py + (e.clientY - d.y) * scale });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  useEffect(() => {
    if (selected && !active.find((k) => k.id === selected.id)) setSelected(null);
  }, [active, selected]);

  if (loading || !data) return <Spinner label="Тарихи карта жүктелуде…" />;

  const yearLabel = year < 0 ? `б.з.д. ${Math.abs(year)} ж.` : `${year} ж.`;
  const outline = polygonPath(KZ_OUTLINE, W, H);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-6">
        <Badge tone="teal"><Layers size={11} /> Интерактивті карта</Badge>
        <h1 className="font-display text-3xl sm:text-5xl text-parchment mt-3">Қазақстан тарихының картасы</h1>
        <p className="text-white/55 text-sm mt-3 max-w-3xl leading-relaxed">
          Уақыт жүгірткісін жылжытып, белгілі бір дәуірдегі саяси құрылымдарды көріңіз. Аумақтарды,
          қалаларды және сауда жолдарын басып, тарихи түсіндірмені оқыңыз.
        </p>
        <div className="mt-3 flex flex-wrap items-start gap-2 glass px-3.5 py-2.5 border-gold/30">
          <AlertTriangle size={14} className="text-gold shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-white/60 leading-relaxed max-w-4xl">
            <span className="text-gold font-semibold">Маңызды ескерту:</span> көшпелі мемлекеттердің шекарасы
            нақты сызылған болмаған — ықпал аймақтары қозғалмалы және бір-бірімен қабаттасқан. Төмендегі
            контурлар — <span className="text-parchment">стильденген схема</span>, геодезиялық шекара емес.
            Барлық мерзімдер академиялық әдебиеттегі дәстүрлі хронологияға сүйенеді.
          </p>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4">
        <Card className="p-3 relative overflow-hidden">
          {/* controls */}
          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            <div className="flex items-center gap-1">
              <button className="btn btn-ghost p-2" onClick={() => setZoom((z) => Math.min(6, z + 0.4))} aria-label="Үлкейту">
                <ZoomIn size={15} />
              </button>
              <button className="btn btn-ghost p-2" onClick={() => setZoom((z) => Math.max(0.75, z - 0.4))} aria-label="Кішірейту">
                <ZoomOut size={15} />
              </button>
              <button className="btn btn-ghost p-2" onClick={reset} aria-label="Қалпына келтіру">
                <Maximize2 size={15} />
              </button>
            </div>
            <button
              className={`btn px-3 py-1.5 text-[11px] ${showRoutes ? 'btn-teal' : 'btn-ghost'}`}
              onClick={() => setShowRoutes((v) => !v)}
            >
              <Route size={12} /> Жібек жолы
            </button>
            <button
              className={`btn px-3 py-1.5 text-[11px] ${showCities ? 'btn-teal' : 'btn-ghost'}`}
              onClick={() => setShowCities((v) => !v)}
            >
              <MapPin size={12} /> Нысандар
            </button>
            <span className="ml-auto text-[11px] text-white/45">масштаб ×{zoom.toFixed(1)}</span>
          </div>

          <div className="rounded-xl overflow-hidden border border-white/10 bg-[#060c15]" style={{ aspectRatio: `${W} / ${H}` }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-full map-surface"
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              role="img"
              aria-label="Қазақстан мен Орталық Азияның тарихи картасы"
            >
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M40 0 L0 0 0 40" fill="none" stroke="#16222f" strokeWidth="1" />
                </pattern>
                <radialGradient id="glow" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="#2fb3a8" stopOpacity="0.07" />
                  <stop offset="100%" stopColor="#2fb3a8" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect width={W} height={H} fill="url(#grid)" />
              <rect width={W} height={H} fill="url(#glow)" />

              <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`} style={{ transformOrigin: '0 0' }}>
                {/* base outline */}
                <path d={outline} fill="#0e1a26" stroke="#24384a" strokeWidth="1.4" />

                {/* kingdoms */}
                {active.map((k) => (
                  <g key={k.id}>
                    <path
                      data-kingdom={k.id}
                      d={polygonPath(k.polygon, W, H)}
                      fill={k.color}
                      fillOpacity={selected?.id === k.id ? 0.42 : 0.3}
                      stroke={k.color}
                      strokeWidth={selected?.id === k.id ? 2.4 : 1.4}
                      strokeDasharray={k.accuracy === 'stylised' ? '7 5' : undefined}
                      style={{ cursor: 'pointer', transition: 'fill-opacity .2s' }}
                      onClick={() => setSelected(k)}
                      onPointerEnter={() => setSelected(k)}
                    />
                    <text
                      x={project(k.center, W, H)[0]}
                      y={project(k.center, W, H)[1]}
                      textAnchor="middle"
                      fontSize={13 / Math.sqrt(zoom)}
                      fill="#e8edf6"
                      opacity="0.85"
                      style={{ pointerEvents: 'none', fontWeight: 600 }}
                    >
                      {k.name}
                    </text>
                  </g>
                ))}

                {/* routes */}
                {showRoutes &&
                  data.routes.map((r) => (
                    <path
                      key={r.id}
                      d={linePath(r.points, W, H)}
                      fill="none"
                      stroke="#f0cd85"
                      strokeWidth={2 / Math.sqrt(zoom)}
                      strokeDasharray="8 6"
                      opacity="0.75"
                      style={{ pointerEvents: 'none' }}
                    />
                  ))}

                {/* cities */}
                {showCities &&
                  CITIES.map((c) => {
                    const [x, y] = project(c.pt, W, H);
                    const color = c.kind === 'battle' ? '#c96a4a' : c.kind === 'monument' ? '#d9a94a' : '#2fb3a8';
                    return (
                      <g
                        key={c.name}
                        onPointerEnter={() => setHoverCity(c.name)}
                        onPointerLeave={() => setHoverCity(null)}
                        onClick={() => setHoverCity(c.name)}
                        style={{ cursor: 'pointer' }}
                      >
                        <circle cx={x} cy={y} r={7 / Math.sqrt(zoom)} fill={color} opacity="0.25" />
                        <circle cx={x} cy={y} r={3.4 / Math.sqrt(zoom)} fill={color} />
                        <text
                          x={x + 7 / Math.sqrt(zoom)}
                          y={y + 3 / Math.sqrt(zoom)}
                          fontSize={11 / Math.sqrt(zoom)}
                          fill="#c9d4e2"
                          opacity="0.9"
                        >
                          {c.name}
                        </text>
                      </g>
                    );
                  })}
              </g>

              <text x={W - 12} y={H - 12} textAnchor="end" fontSize="10" fill="#3d4d5e">
                схемалық карта · {yearLabel}
              </text>
            </svg>
          </div>

          {/* time slider */}
          <div className="mt-3 px-1">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-white/50 flex items-center gap-1"><Clock size={11} /> Уақыт жүгірткісі</span>
              <span className="text-gold font-mono">{yearLabel}</span>
            </div>
            <input
              type="range"
              min={-800}
              max={2026}
              step={1}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full accent-[#2fb3a8]"
              aria-label="Уақыт жүгірткісі"
            />
            <div className="flex justify-between text-[9px] text-white/30 mt-0.5">
              <span>б.з.д. 800</span>
              <span>б.з. 500</span>
              <span>1200</span>
              <span>1800</span>
              <span>2026</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {data.periods.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setYear(Math.max(-800, Math.min(2026, p.start)))}
                  className={`text-[9.5px] px-2 py-1 rounded border transition-colors ${
                    year >= Math.max(-800, p.start) && year <= Math.min(2026, p.end)
                      ? 'border-teal/50 bg-teal/12 text-teal'
                      : 'border-white/10 bg-white/4 text-white/45 hover:text-white/70'
                  }`}
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* side panel */}
        <div className="space-y-3">
          <Card className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-gold mb-2">
              {yearLabel} кезеңіндегі құрылымдар
            </p>
            {active.length === 0 ? (
              <p className="text-xs text-white/40">Бұл жылы белгіленген саяси құрылым жоқ. Жүгірткіні жылжытыңыз.</p>
            ) : (
              <ul className="space-y-1.5">
                {active.map((k) => (
                  <li key={k.id}>
                    <button
                      className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
                        selected?.id === k.id ? 'border-gold/50 bg-gold/10' : 'border-white/10 bg-white/4 hover:border-white/25'
                      }`}
                      onClick={() => setSelected(k)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: k.color }} />
                        <span className="text-[12.5px] text-parchment">{k.name}</span>
                      </div>
                      <p className="text-[10px] text-white/35 mt-0.5">
                        {k.from < 0 ? `б.з.д. ${Math.abs(k.from)}` : k.from} – {k.to > 2020 ? 'бүгін' : k.to} · {k.accuracy === 'stylised' ? 'стильденген' : 'шамамен'}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {selected && (
            <Card className="p-4 animate-pop">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 rounded" style={{ background: selected.color }} />
                <p className="font-display text-base text-parchment">{selected.name}</p>
              </div>
              <p className="text-[11px] text-white/40 mb-2">
                {selected.from < 0 ? `б.з.д. ${Math.abs(selected.from)}` : selected.from} – {selected.to > 2020 ? 'бүгін' : selected.to}
              </p>
              <p className="text-xs text-white/65 leading-relaxed">{selected.description}</p>
              {selected.capitals && (
                <p className="text-[11px] text-teal mt-2">Орталықтар: {selected.capitals.join(', ')}</p>
              )}
              <div className="mt-2.5">
                <SourceRefs ids={selected.sourceIds} />
              </div>
              <p className="text-[9.5px] text-white/30 mt-2 flex gap-1">
                <Info size={10} className="shrink-0 mt-0.5" />
                Ауматқ контуры стильденген — нақты шекара емес.
              </p>
            </Card>
          )}

          {hoverCity && (() => {
            const c = CITIES.find((x) => x.name === hoverCity)!;
            return (
              <Card className="p-4 animate-pop">
                <div className="flex items-center gap-2 mb-1.5">
                  {c.kind === 'battle' ? <Swords size={13} className="text-[#e08a6a]" /> : <MapPin size={13} className="text-teal" />}
                  <p className="font-display text-base text-parchment">{c.name}</p>
                  {c.year && <Badge tone="danger">{c.year}</Badge>}
                </div>
                <p className="text-xs text-white/65 leading-relaxed">{c.note}</p>
              </Card>
            );
          })()}

          <Card className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Шартты белгілер</p>
            <ul className="space-y-1.5 text-[11px] text-white/55">
              <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-teal" /> Қала</li>
              <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#c96a4a]" /> Шайқас / қоршау орны</li>
              <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-gold" /> Ескерткіш / тұрақ</li>
              <li className="flex items-center gap-2"><span className="w-6 h-px bg-gold-soft" style={{ borderTop: '2px dashed #f0cd85' }} /> Ұлы Жібек жолы</li>
              <li className="flex items-center gap-2"><span className="w-4 h-3 border border-dashed border-white/40" /> Стильденген аумақ</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
