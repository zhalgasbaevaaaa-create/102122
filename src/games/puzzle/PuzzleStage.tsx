/**
 * GAME 5 — «Тарих қазынасы» (match-3)
 *
 * Original match-3 engine: swap-adjacent, detect runs of 3+, cascade with gravity,
 * refill, score & goal tracking. Symbols are the platform's historical artifact
 * glyphs. Every 10 cleared groups triggers a historical challenge question.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gem, Move, Target } from 'lucide-react';
import type { GameDef, LevelDef } from '@shared/games';
import { ARTIFACTS } from '@shared/artifacts';
import { useChallenge } from '../GameShell';
import { Badge, ProgressBar } from '../../components/UI';
import { SymbolGlyph } from '../../components/Artifact';
import { playSfx } from '../../lib/sound';

const COLS = 7;
const ROWS = 8;
const TYPES = 6;

type Cell = number; // 0..TYPES-1
type Grid = Cell[][];

function randType(): Cell {
  return Math.floor(Math.random() * TYPES);
}

function makeGrid(): Grid {
  let g: Grid;
  let guard = 0;
  do {
    g = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, randType));
    guard += 1;
  } while (guard < 50 && findMatches(g).length > 0);
  return g;
}

function findMatches(g: Grid): { cells: [number, number][]; len: number }[] {
  const out: { cells: [number, number][]; len: number }[] = [];
  // rows
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      const same = c < COLS && g[r][c] === g[r][c - 1];
      if (same) run += 1;
      else {
        if (run >= 3) {
          const cells: [number, number][] = [];
          for (let k = c - run; k < c; k++) cells.push([r, k]);
          out.push({ cells, len: run });
        }
        run = 1;
      }
    }
  }
  // cols
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      const same = r < ROWS && g[r][c] === g[r - 1][c];
      if (same) run += 1;
      else {
        if (run >= 3) {
          const cells: [number, number][] = [];
          for (let k = r - run; k < r; k++) cells.push([k, c]);
          out.push({ cells, len: run });
        }
        run = 1;
      }
    }
  }
  return out;
}

function applyGravity(g: Grid): Grid {
  const next = g.map((row) => [...row]);
  for (let c = 0; c < COLS; c++) {
    const col: Cell[] = [];
    for (let r = ROWS - 1; r >= 0; r--) if (next[r][c] >= 0) col.push(next[r][c]);
    for (let r = ROWS - 1; r >= 0; r--) {
      const idx = ROWS - 1 - r;
      next[r][c] = idx < col.length ? col[idx] : randType();
    }
  }
  return next;
}

export function PuzzleStage({ game, level, paused }: { game: GameDef; level: LevelDef; paused?: boolean }) {
  const challenge = useChallenge();
  const targetScore = level.goal.target ?? 1000;
  const maxMoves = level.goal.moves ?? 20;

  const [grid, setGrid] = useState<Grid>(() => makeGrid());
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [combo, setCombo] = useState(0);
  const [groupsCleared, setGroupsCleared] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const busyRef = useRef(false);
  const askingRef = useRef(false);

  const symbols = useMemo(() => ARTIFACTS.slice(0, TYPES).map((a) => a.id), []);

  const finished = score >= targetScore || moves >= maxMoves;

  const resolveBoard = useCallback(
    async (startGrid: Grid, gainedScore: number) => {
      let g = startGrid;
      let chain = 0;
      let gained = gainedScore;
      let groups = 0;
      while (true) {
        const matches = findMatches(g);
        if (!matches.length) break;
        chain += 1;
        const cleared = new Set<string>();
        for (const m of matches) {
          groups += 1;
          for (const [r, c] of m.cells) cleared.add(`${r},${c}`);
          gained += m.len * 20 * chain;
        }
        const next = g.map((row) => [...row]);
        cleared.forEach((k) => {
          const [r, c] = k.split(',').map(Number);
          next[r][c] = -1;
        });
        g = applyGravity(next);
        setGrid(g.map((row) => [...row]));
        await new Promise((res) => setTimeout(res, 130));
      }
      setScore((s) => s + gained);
      setGroupsCleared((n) => {
        const total = n + groups;
        // every 9 cleared groups unlocks a historical challenge
        if (groups > 0 && Math.floor(total / 9) > Math.floor(n / 9) && !askingRef.current) {
          askingRef.current = true;
          void challenge.ask().then((ok) => {
            setScore((s) => s + (ok ? 180 : 0));
            setMessage(ok ? 'Тарихи бонус: +180 ұпай' : 'Тарихи бонус алынбады');
            askingRef.current = false;
          });
        }
        return total;
      });
      setCombo(chain > 1 ? chain : 0);
      if (gained > gainedScore) {
        challenge.addScore(Math.round((gained - gainedScore) / 8));
        if (chain > 1) playSfx('collect');
      }
    },
    [challenge],
  );

  const trySwap = useCallback(
    async (a: [number, number], b: [number, number]) => {
      if (busyRef.current || paused || finished) return;
      const adjacent = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
      if (!adjacent) {
        setSel(b);
        return;
      }
      busyRef.current = true;
      const g = grid.map((row) => [...row]);
      [g[a[0]][a[1]], g[b[0]][b[1]]] = [g[b[0]][b[1]], g[a[0]][a[1]]];
      setGrid(g);
      if (!findMatches(g).length) {
        playSfx('wrong');
        setMessage('Бұл жүріс топ құрмайды — басқа жұп таңдаңыз.');
        setGrid(g.map((row) => [...row]));
        [g[a[0]][a[1]], g[b[0]][b[1]]] = [g[b[0]][b[1]], g[a[0]][a[1]]];
        setTimeout(() => setGrid(g), 160);
        setMoves((m) => m + 1);
        busyRef.current = false;
        return;
      }
      playSfx('click');
      setMoves((m) => m + 1);
      setMessage(null);
      await new Promise((res) => setTimeout(res, 110));
      await resolveBoard(g, 0);
      setSel(null);
      busyRef.current = false;
    },
    [grid, paused, finished, resolveBoard],
  );

  // auto-resolve on mount if the initial board has matches (shouldn't happen)
  useEffect(() => {
    if (findMatches(grid).length) void resolveBoard(grid, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onCell(r: number, c: number) {
    if (busyRef.current || paused || finished) return;
    if (!sel) {
      setSel([r, c]);
      playSfx('tick');
      return;
    }
    if (sel[0] === r && sel[1] === c) {
      setSel(null);
      return;
    }
    void trySwap(sel, [r, c]);
  }

  return (
    <div className="glass-strong p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <Badge tone="gold"><Gem size={11} /> {score} / {targetScore}</Badge>
        <Badge tone="teal"><Move size={11} /> Жүріс {moves} / {maxMoves}</Badge>
        <Badge><Target size={11} /> Топ {groupsCleared}</Badge>
        {combo > 1 && <Badge tone="gold">Комбо ×{combo}</Badge>}
      </div>

      <div className="mb-2"><ProgressBar value={(score / targetScore) * 100} tone="gold" height={5} /></div>

      <div className="relative mx-auto" style={{ maxWidth: 420 }}>
        <div
          className="grid gap-1 p-2 rounded-xl bg-[#0a1220]/80 border border-white/10 no-select"
          style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
        >
          {grid.map((row, r) =>
            row.map((cell, c) => {
              const isSel = sel && sel[0] === r && sel[1] === c;
              return (
                <button
                  key={`${r}-${c}`}
                  onClick={() => onCell(r, c)}
                  disabled={paused || finished}
                  aria-label={`Ұяшық ${r + 1}-${c + 1}`}
                  className={`aspect-square rounded-lg grid place-items-center transition-all ${
                    isSel ? 'bg-gold/25 border-2 border-gold scale-95' : 'bg-white/5 border border-white/8 hover:bg-white/10'
                  }`}
                >
                  <SymbolGlyph id={symbols[Math.max(0, cell) % symbols.length]} size={30} />
                </button>
              );
            }),
          )}
        </div>

        {finished && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 rounded-xl">
            <div className="text-center px-4 animate-pop">
              <p className="font-display text-xl text-parchment">
                {score >= targetScore ? 'Мақсат орындалды!' : 'Жүрістер бітті'}
              </p>
              <p className="text-xs text-white/55 mt-1">
                {score >= targetScore ? `${score} ұпай жиналды. Деңгейді аяқтауға болады.` : `Мақсат: ${targetScore} ұпай. Қайта байқап көріңіз.`}
              </p>
            </div>
          </div>
        )}
      </div>

      {message && <p className="text-[11px] text-gold mt-2 text-center">{message}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
        {symbols.map((id) => (
          <span key={id} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
            <SymbolGlyph id={id} size={18} />
            <span className="text-[9px] text-white/45">{ARTIFACTS.find((a) => a.id === id)?.name}</span>
          </span>
        ))}
      </div>
      <p className="text-[10px] text-white/35 mt-1.5 text-center">
        Екі көршілес символды ауыстырыңыз. 3 және одан көп бірдей символ жойылады. Әр 9 топтан кейін тарихи сұрақ қойылады.
      </p>
    </div>
  );
}
