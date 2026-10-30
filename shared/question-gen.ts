/**
 * DETERMINISTIC QUESTION GENERATOR
 * --------------------------------
 * Builds a large, stable, verifiable bank of questions out of the atomic fact
 * base. Properties guaranteed by construction:
 *
 *  - exactly one correct answer — distractors are always OTHER REAL values of
 *    the same attribute, never invented text;
 *  - the answer key is computed at generation time and only ever lives on the
 *    server side (see shared/quiz-types.ts → publicQuestion);
 *  - the same id always yields the same question (seeded shuffle), so results
 *    can be re-validated later and questions cannot be farmed by reloading;
 *  - no fact is ever used to build a statement that mixes two different claims,
 *    except deliberately in the "find the mistake" / "select all correct" items,
 *    where the mixed statement is the false one by construction.
 */
import { FACTS, type Fact, type FactAttr, CATEGORIES, CATEGORY_IDS, type CategoryId } from './facts';
import { HISTORICAL_EVENTS } from './events';
import { ARTIFACTS } from './artifacts';
import type { QuizQuestion, AnswerKey, OptionItem, QFormat } from './quiz-types';

// ── deterministic randomness ────────────────────────────────────────────────
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = <T>(arr: T[], n: number, seed: number): T[] => shuffle(arr, seed).slice(0, n);

// ── prompt templates per attribute ──────────────────────────────────────────
const FORWARD_PROMPT: Record<FactAttr, (s: string) => string> = {
  date: (s) => `«${s}» қашан болды / қай кезеңге жатады?`,
  role: (s) => `«${s}» туралы дұрыс сипаттаманы таңдаңыз.`,
  deed: (s) => `«${s}» қандай тарихи іспен байланысты?`,
  place: (s) => `«${s}» қай өңірмен байланысты?`,
  term: (s) => `«${s}» дегеніміз не?`,
  artifact: (s) => `«${s}» — бұл не немесе қандай зат?`,
  capital: (s) => `«${s}» мемлекетінің астанасы / саяси орталығы қай қала болды?`,
  state: (s) => `«${s}» туралы дұрыс тұжырымды таңдаңыз.`,
};

const INVERSE_PROMPT: Record<FactAttr, string> = {
  date: 'Бұл мерзім қай оқиғаға / құбылысқа қатысты?',
  role: 'Бұл сипаттама қай тарихи тұлғаға қатысты?',
  deed: 'Бұл тарихи іс қай тұлғаға қатысты?',
  place: 'Бұл өңір қай тарихи нысанмен байланысты?',
  term: 'Бұл анықтама қай терминге қатысты?',
  artifact: 'Бұл сипаттама қай затқа / нысанға қатысты?',
  capital: 'Бұл қала қай мемлекеттің орталығы болды?',
  state: 'Бұл сипаттама қай мемлекетке / құрылымға қатысты?',
};

const EXPLANATION_PREFIX: Record<FactAttr, string> = {
  date: 'Дұрыс мерзім',
  role: 'Дұрыс сипаттама',
  deed: 'Дұрыс жауап',
  place: 'Дұрыс өңір',
  term: 'Дұрыс мағына',
  artifact: 'Дұрыс сипаттама',
  capital: 'Дұрыс орталық',
  state: 'Дұрыс тұжырым',
};

function explanationFor(f: Fact, prefixAttr: FactAttr = f.attr): string {
  const base = `${EXPLANATION_PREFIX[prefixAttr]}: «${f.s}» — ${f.v}.`;
  return f.note ? `${base} Ескерту: ${f.note}` : base;
}

// ── pools ───────────────────────────────────────────────────────────────────
const byAttr = (attr: FactAttr, exclude: Fact) =>
  FACTS.filter((f) => f.attr === attr && f.id !== exclude.id && f.v !== exclude.v);

function optionsFrom(correct: string, others: string[], seed: number): { options: OptionItem[]; index: number } {
  const uniq = [...new Set(others.filter((o) => o !== correct))];
  const chosen = pick(uniq, 3, seed);
  const list = shuffle([correct, ...chosen], seed + 7);
  return {
    options: list.map((text, i) => ({ id: String(i), text })),
    index: list.indexOf(correct),
  };
}

// ── individual question builders ────────────────────────────────────────────
function buildForward(f: Fact, cat: CategoryId, difficulty: 1 | 2 | 3): QuizQuestion {
  const seed = hash(f.id + 'fwd');
  const { options, index } = optionsFrom(f.v, byAttr(f.attr, f).map((x) => x.v), seed);
  return {
    id: `${f.id}-fwd`,
    periodId: cat,
    difficulty,
    format: 'mcq',
    prompt: FORWARD_PROMPT[f.attr](f.s),
    options,
    explanation: explanationFor(f),
    sourceIds: f.src,
    key: { type: 'index', value: [index] } as AnswerKey,
  };
}

function buildInverse(f: Fact, cat: CategoryId, difficulty: 1 | 2 | 3): QuizQuestion {
  const seed = hash(f.id + 'inv');
  const { options, index } = optionsFrom(f.s, byAttr(f.attr, f).map((x) => x.s), seed);
  return {
    id: `${f.id}-inv`,
    periodId: cat,
    difficulty,
    format: 'mcq',
    prompt: `${INVERSE_PROMPT[f.attr]}\n\n«${f.v}»`,
    options,
    explanation: explanationFor(f),
    sourceIds: f.src,
    key: { type: 'index', value: [index] } as AnswerKey,
  };
}

function buildTrueFalse(f: Fact, cat: CategoryId, difficulty: 1 | 2 | 3, makeFalse: boolean): QuizQuestion {
  const seed = hash(f.id + (makeFalse ? 'tf-f' : 'tf-t'));
  let statement = `${f.s} — ${f.v}.`;
  let answer = 0; // 0 = true, 1 = false
  let explanation = explanationFor(f);
  if (makeFalse) {
    const pool = byAttr(f.attr, f);
    if (!pool.length) return buildTrueFalse(f, cat, difficulty, false);
    const wrong = pick(pool, 1, seed)[0];
    statement = `${f.s} — ${wrong.v}.`;
    answer = 1;
    explanation = `Тұжырым қате. Дұрысы: «${f.s}» — ${f.v}.`;
  }
  return {
    id: `${f.id}-${makeFalse ? 'tff' : 'tft'}`,
    periodId: cat,
    difficulty,
    format: 'truefalse',
    prompt: `Тұжырым дұрыс па, әлде қате ме?\n\n«${statement}»`,
    options: [
      { id: '0', text: 'Дұрыс' },
      { id: '1', text: 'Қате' },
    ],
    explanation,
    sourceIds: f.src,
    key: { type: 'index', value: [answer] },
  };
}

/** Fill-in-the-blank where the missing word is chosen from chips (robust grading). */
function buildFillBlank(f: Fact, cat: CategoryId, difficulty: 1 | 2 | 3): QuizQuestion {
  const seed = hash(f.id + 'fill');
  const { options, index } = optionsFrom(f.v, byAttr(f.attr, f).map((x) => x.v), seed);
  return {
    id: `${f.id}-fill`,
    periodId: cat,
    difficulty,
    format: 'fill-blank',
    prompt: `Бос орынды толықтырыңыз:\n\n«${f.s} — ______»`,
    options,
    explanation: explanationFor(f),
    sourceIds: f.src,
    key: { type: 'index', value: [index] },
  };
}

/** Map question from a `place` fact that carries coordinates. */
function buildMap(f: Fact, cat: CategoryId): QuizQuestion | null {
  if (f.attr !== 'place' || !f.pt) return null;
  const seed = hash(f.id + 'map');
  const pool = FACTS.filter((x) => x.attr === 'place' && x.pt && x.id !== f.id && x.s !== f.s);
  const { options, index } = optionsFrom(f.s, pool.map((x) => x.s), seed);
  return {
    id: `${f.id}-map`,
    periodId: cat,
    difficulty: 2,
    format: 'map',
    prompt: 'Картадағы белгіленген нүкте қай тарихи нысанды көрсетеді?',
    options,
    point: f.pt,
    explanation: explanationFor(f),
    sourceIds: f.src,
    key: { type: 'index', value: [index] },
  };
}

/** Image identification from the artifact catalogue. */
function buildImageId(artifactId: string, periodId: CategoryId, difficulty: 1 | 2 | 3): QuizQuestion {
  const a = ARTIFACTS.find((x) => x.id === artifactId)!;
  const seed = hash(a.id + 'img');
  const others = ARTIFACTS.filter((x) => x.id !== a.id).map((x) => x.name);
  const { options, index } = optionsFrom(a.name, others, seed);
  return {
    id: `img-${a.id}`,
    periodId,
    difficulty,
    format: 'image-id',
    prompt: 'Бейнеленген тарихи нысанды / затты анықтаңыз.',
    options,
    artifactId: a.id,
    explanation: `${a.name}: ${a.description}`,
    sourceIds: a.sourceIds,
    key: { type: 'index', value: [index] },
  };
}

/** Matching: events ↔ dates. */
function buildMatchDates(cat: CategoryId, seedN: number): QuizQuestion | null {
  const pool = FACTS.filter((f) => f.cat === cat && f.attr === 'date');
  if (pool.length < 4) return null;
  const chosen = pick(pool, 4, hash(cat + 'md' + seedN));
  const left = chosen.map((f, i) => ({ id: `l${i}`, text: f.s }));
  const right = shuffle(chosen.map((f, i) => ({ id: `r${i}`, text: f.v })), hash(cat + 'mdr' + seedN));
  const key: Record<string, string> = {};
  chosen.forEach((f, i) => {
    const r = right.find((x) => x.text === f.v)!;
    key[`l${i}`] = r.id;
  });
  return {
    id: `match-dates-${cat}-${seedN}`,
    periodId: cat,
    difficulty: 3,
    format: 'match-dates',
    prompt: 'Оқиғалар мен мерзімдерді сәйкестендіріңіз.',
    left,
    right,
    explanation: chosen.map((f) => `${f.s} — ${f.v}`).join('; ') + '.',
    sourceIds: [...new Set(chosen.flatMap((f) => f.src))],
    key: { type: 'pairs', value: key },
  };
}

/** Matching: personalities ↔ achievements/roles. */
function buildMatchPersons(cat: CategoryId, seedN: number): QuizQuestion | null {
  const pool = FACTS.filter((f) => f.cat === cat && f.attr === 'role');
  if (pool.length < 4) return null;
  const chosen = pick(pool, 4, hash(cat + 'mp' + seedN));
  const left = chosen.map((f, i) => ({ id: `l${i}`, text: f.s }));
  const right = shuffle(chosen.map((f, i) => ({ id: `r${i}`, text: f.v })), hash(cat + 'mpr' + seedN));
  const key: Record<string, string> = {};
  chosen.forEach((f, i) => {
    key[`l${i}`] = right.find((x) => x.text === f.v)!.id;
  });
  return {
    id: `match-persons-${cat}-${seedN}`,
    periodId: cat,
    difficulty: 3,
    format: 'match-persons',
    prompt: 'Тұлғалар мен олардың тарихи рөлін сәйкестендіріңіз.',
    left,
    right,
    explanation: chosen.map((f) => `${f.s} — ${f.v}`).join('; ') + '.',
    sourceIds: [...new Set(chosen.flatMap((f) => f.src))],
    key: { type: 'pairs', value: key },
  };
}

/** Chronological ordering of real dated events. */
function buildChronological(cat: CategoryId, seedN: number): QuizQuestion | null {
  const map: Record<CategoryId, string[]> = {
    'stone-bronze': ['stone', 'bronze'],
    'saka-hun': ['saka', 'hun'],
    turkic: ['turkic'],
    'karakhanid-kipchak': ['karakhanid', 'kipchak'],
    'mongol-horde': ['mongol', 'goldenhorde'],
    khanate: ['khanate'],
    'russian-alash': ['russian', 'alash'],
    'soviet-independent': ['soviet', 'independent'],
  };
  const pool = HISTORICAL_EVENTS.filter((e) => map[cat].includes(e.periodId));
  if (pool.length < 4) return null;
  const chosen = pick(pool, 4, hash(cat + 'chrono' + seedN)).sort((a, b) => a.year - b.year);
  const items = shuffle(chosen.map((e) => ({ id: e.id, text: e.title })), hash(cat + 'chronor' + seedN));
  return {
    id: `chrono-${cat}-${seedN}`,
    periodId: cat,
    difficulty: 3,
    format: 'chronological',
    prompt: 'Оқиғаларды хронологиялық ретпен (ежелгіден жаңаға қарай) орналастырыңыз.',
    items,
    explanation: chosen.map((e, i) => `${i + 1}. ${e.title} — ${e.yearLabel}`).join('; ') + '.',
    sourceIds: [...new Set(chosen.flatMap((e) => e.sourceIds))],
    key: { type: 'order', value: chosen.map((e) => e.id) },
  };
}

/** "Select all correct statements" / "find the mistake" share the same builder. */
function buildMulti(cat: CategoryId, seedN: number, mistake: boolean): QuizQuestion | null {
  const pool = FACTS.filter((f) => f.cat === cat);
  if (pool.length < 12) return null;
  const seed = hash(cat + (mistake ? 'ms' : 'multi') + seedN);
  const r = rng(seed);
  const shuffled = shuffle(pool, seed);

  if (mistake) {
    // 3 true statements + 1 deliberately mismatched statement
    const trues = shuffled.slice(0, 3);
    const subj = shuffled[3];
    const wrongVals = pool.filter((f) => f.attr === subj.attr && f.id !== subj.id && f.v !== subj.v);
    const wrong = wrongVals[Math.floor(r() * wrongVals.length)] ?? shuffled[4];
    const statements = shuffle(
      [
        ...trues.map((f) => ({ text: `${f.s} — ${f.v}.`, ok: true })),
        { text: `${subj.s} — ${wrong.v}.`, ok: false },
      ],
      seed + 3,
    );
    const idx = statements.findIndex((s) => !s.ok);
    return {
      id: `mistake-${cat}-${seedN}`,
      periodId: cat,
      difficulty: 3,
      format: 'find-mistake',
      prompt: 'Төмендегі тұжырымдардың ішінен тарихи қатені табыңыз.',
      options: statements.map((s, i) => ({ id: String(i), text: s.text })),
      explanation: `Қате тұжырым: «${subj.s} — ${wrong.v}». Дұрысы: «${subj.s} — ${subj.v}».`,
      sourceIds: [...new Set([...trues.flatMap((f) => f.src), ...subj.src])],
      key: { type: 'index', value: [idx] },
    };
  }

  // select all correct: 3 true + 2 false
  const trues = shuffled.slice(0, 3);
  const f1 = shuffled[3];
  const f2 = shuffled[4];
  const mk = (f: Fact, offset: number) => {
    const cands = pool.filter((x) => x.attr === f.attr && x.id !== f.id && x.v !== f.v);
    const w = cands[Math.floor(r() * cands.length)] ?? shuffled[offset];
    return `${f.s} — ${w.v}.`;
  };
  const statements = shuffle(
    [
      ...trues.map((f) => ({ text: `${f.s} — ${f.v}.`, ok: true })),
      { text: mk(f1, 5), ok: false },
      { text: mk(f2, 6), ok: false },
    ],
    seed + 11,
  );
  const correctIdx = statements.map((s, i) => (s.ok ? i : -1)).filter((i) => i >= 0);
  return {
    id: `multiselect-${cat}-${seedN}`,
    periodId: cat,
    difficulty: 3,
    format: 'multi-select',
    prompt: 'Барлық дұрыс тұжырымдарды таңдаңыз.',
    options: statements.map((s, i) => ({ id: String(i), text: s.text })),
    explanation: `Дұрыс тұжырымдар: ${trues.map((f) => `«${f.s} — ${f.v}»`).join(', ')}.`,
    sourceIds: [...new Set(trues.flatMap((f) => f.src))],
    key: { type: 'index', value: correctIdx },
  };
}

// ── public bank API ─────────────────────────────────────────────────────────
function difficultyFor(f: Fact, format: QFormat): 1 | 2 | 3 {
  if (format === 'mcq') return f.attr === 'date' ? 2 : 1;
  if (format === 'fill-blank' || format === 'truefalse') return 2;
  return 3;
}

let BANK: QuizQuestion[] | null = null;

export function getBank(): QuizQuestion[] {
  if (BANK) return BANK;
  const out: QuizQuestion[] = [];
  for (const f of FACTS) {
    const cat = f.cat;
    out.push(buildForward(f, cat, difficultyFor(f, 'mcq')));
    out.push(buildTrueFalse(f, cat, 2, false));
    if (f.attr === 'role' || f.attr === 'term' || f.attr === 'artifact' || f.attr === 'state' || f.attr === 'place' || f.attr === 'capital') {
      out.push(buildInverse(f, cat, difficultyFor(f, 'mcq')));
    }
    out.push(buildFillBlank(f, cat, 2));
    if (f.attr === 'date' && hash(f.id) % 3 === 0) {
      out.push(buildTrueFalse(f, cat, 2, true));
    }
    const m = buildMap(f, cat);
    if (m) out.push(m);
  }
  // image identification, attached to its own category
  for (const a of ARTIFACTS) {
    const catOf: Record<string, CategoryId> = {
      stone: 'stone-bronze', bronze: 'stone-bronze', saka: 'saka-hun', hun: 'saka-hun', turkic: 'turkic',
      karakhanid: 'karakhanid-kipchak', kipchak: 'karakhanid-kipchak', mongol: 'mongol-horde',
      goldenhorde: 'mongol-horde', khanate: 'khanate', russian: 'russian-alash', alash: 'russian-alash',
      soviet: 'soviet-independent', independent: 'soviet-independent',
    };
    const cat = catOf[a.periodId];
    if (cat) out.push(buildImageId(a.id, cat, 2));
  }
  // category-level composite formats
  for (const cat of CATEGORY_IDS) {
    for (let i = 0; i < 10; i++) {
      const md = buildMatchDates(cat, i);
      if (md) out.push(md);
      const mp = buildMatchPersons(cat, i);
      if (mp) out.push(mp);
      const ch = buildChronological(cat, i);
      if (ch) out.push(ch);
      const ms = buildMulti(cat, i, true);
      if (ms) out.push(ms);
      const mu = buildMulti(cat, i, false);
      if (mu) out.push(mu);
    }
  }
  BANK = out;
  return out;
}

/** Integrity check used by the test suite. */
export function validateBank(): { total: number; byFormat: Record<string, number>; byCategory: Record<string, number>; errors: string[] } {
  const bank = getBank();
  const errors: string[] = [];
  const byFormat: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const ids = new Set<string>();
  for (const q of bank) {
    if (ids.has(q.id)) errors.push(`duplicate id: ${q.id}`);
    ids.add(q.id);
    byFormat[q.format] = (byFormat[q.format] ?? 0) + 1;
    byCategory[q.periodId] = (byCategory[q.periodId] ?? 0) + 1;
    if (!q.explanation || q.explanation.length < 5) errors.push(`missing explanation: ${q.id}`);
    if (!q.sourceIds.length) errors.push(`missing source: ${q.id}`);
    if (q.key.type === 'index') {
      if (!q.options) errors.push(`no options: ${q.id}`);
      else for (const i of q.key.value) {
        if (i < 0 || i >= q.options.length) errors.push(`key out of range: ${q.id}`);
      }
      if (q.key.value.length === 0) errors.push(`empty key: ${q.id}`);
    }
    if (q.key.type === 'pairs') {
      if (!q.left || !q.right) errors.push(`pairs without columns: ${q.id}`);
      else {
        const rIds = new Set(q.right.map((r) => r.id));
        for (const v of Object.values(q.key.value)) if (!rIds.has(v)) errors.push(`bad pair target: ${q.id}`);
        if (Object.keys(q.key.value).length !== q.left.length) errors.push(`pair count mismatch: ${q.id}`);
      }
    }
    if (q.key.type === 'order') {
      const itemIds = new Set((q.items ?? []).map((i) => i.id));
      if (!itemIds.size) errors.push(`order without items: ${q.id}`);
      for (const id of q.key.value) if (!itemIds.has(id)) errors.push(`bad order item: ${q.id}`);
    }
  }
  return { total: bank.length, byFormat, byCategory, errors };
}

/** Session builder: draw questions across categories without repeats. */
export function drawQuestions(opts: {
  count: number;
  categories?: CategoryId[];
  formats?: QFormat[];
  difficulty?: 1 | 2 | 3 | null;
  seed: number;
}): QuizQuestion[] {
  const bank = getBank();
  let pool = bank;
  if (opts.categories?.length) pool = pool.filter((q) => opts.categories!.includes(q.periodId as CategoryId));
  if (opts.formats?.length) pool = pool.filter((q) => opts.formats!.includes(q.format));
  if (opts.difficulty) pool = pool.filter((q) => q.difficulty === opts.difficulty);
  if (pool.length < opts.count) pool = bank;
  return pick(pool, opts.count, opts.seed);
}

export const ALL_FORMATS: QFormat[] = [
  'mcq', 'truefalse', 'match-dates', 'match-persons', 'chronological',
  'map', 'image-id', 'fill-blank', 'find-mistake', 'multi-select',
];

export const categoryTitle = (id: string) => CATEGORIES.find((c) => c.id === id)?.title ?? id;
