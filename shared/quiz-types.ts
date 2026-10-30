/**
 * Question model shared by the client (rendering) and the server (validation).
 * The answer key NEVER leaves the server: /api/quiz/set omits `key`, and each
 * answer is checked through /api/session/answer which returns only a boolean
 * plus the explanation.
 */
export type QFormat =
  | 'mcq'
  | 'truefalse'
  | 'match-dates'
  | 'match-persons'
  | 'chronological'
  | 'map'
  | 'image-id'
  | 'fill-blank'
  | 'find-mistake'
  | 'multi-select';

export interface OptionItem {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  periodId: string;
  difficulty: 1 | 2 | 3;
  format: QFormat;
  prompt: string;
  /** For mcq / multi-select / truefalse / fill-blank / image-id / find-mistake / map */
  options?: OptionItem[];
  /** match-* : left column entries */
  left?: OptionItem[];
  /** match-* : right column entries */
  right?: OptionItem[];
  /** chronological ordering items (unsorted when sent to client) */
  items?: OptionItem[];
  /** map questions: [lng, lat] focus point and an optional marker radius */
  point?: [number, number];
  /** image-id: which locally drawn artifact to show */
  artifactId?: string;
  explanation: string;
  sourceIds: string[];
}

/** Answer key — server-side only. */
export type AnswerKey =
  | { type: 'index'; value: number[] } // mcq / image-id / map / find-mistake / fill-blank(option index) / truefalse(0=true,1=false) / multi-select
  | { type: 'pairs'; value: Record<string, string> }
  | { type: 'order'; value: string[] }
  | { type: 'text'; value: string[] }; // accepted free-text answers

export interface QuizQuestion extends Question {
  key: AnswerKey;
}

/** Full client payload — key stripped. */
export function publicQuestion(q: QuizQuestion): Question {
  const { key, ...rest } = q;
  return rest;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/[«»"'`.,;:!?()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Authoritative answer check, executed on the server. */
export function checkAnswer(q: QuizQuestion, answer: unknown): boolean {
  const k = q.key;
  if (k.type === 'pairs') {
    if (!answer || typeof answer !== 'object') return false;
    const a = answer as Record<string, string>;
    const keys = Object.keys(k.value);
    if (Object.keys(a).length !== keys.length) return false;
    return keys.every((k2) => a[k2] === k.value[k2]);
  }
  if (k.type === 'order') {
    if (!Array.isArray(answer)) return false;
    const a = answer as string[];
    return a.length === k.value.length && a.every((v, i) => v === k.value[i]);
  }
  if (k.type === 'text') {
    if (typeof answer !== 'string') return false;
    return k.value.some((v) => norm(v) === norm(answer));
  }
  // index-based
  if (typeof answer === 'number') {
    return k.value.length === 1 && k.value[0] === answer;
  }
  if (Array.isArray(answer)) {
    const a = [...new Set(answer as number[])].sort((x, y) => x - y);
    const want = [...new Set(k.value)].sort((x, y) => x - y);
    return a.length === want.length && a.every((v, i) => v === want[i]);
  }
  return false;
}
