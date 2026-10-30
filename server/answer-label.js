/**
 * Human-readable rendering of a question's correct answer.
 *
 * Only the LABEL is ever sent to clients: after a round closes the room may know
 * the answer, but the raw key structure stays server-side.
 *
 * Key shapes (see shared/quiz-types.ts):
 *   index  -> option ids (String(i)): mcq / truefalse / fill-blank / map /
 *             image-id / find-mistake / multi-select
 *   pairs  -> { leftId: rightId } for match-dates / match-persons
 *   order  -> array of item ids for chronological
 *   text   -> accepted free-text spellings
 */
export function answerLabel(q) {
  const key = q && q.key;
  if (!key) return '';

  if (key.type === 'index') {
    const wanted = (key.value || []).map(String);
    return (q.options || [])
      .filter((o) => wanted.includes(String(o.id)))
      .map((o) => o.text)
      .join(' - ');
  }

  if (key.type === 'pairs') {
    const left = q.left || [];
    const right = q.right || [];
    return Object.entries(key.value || {})
      .map(([lid, rid]) => {
        const l = (left.find((x) => x.id === lid) || {}).text || lid;
        const r = (right.find((x) => x.id === rid) || {}).text || rid;
        return l + ' -> ' + r;
      })
      .join('; ');
  }

  if (key.type === 'order') {
    const items = q.items || [];
    return (key.value || []).map((id) => (items.find((x) => x.id === id) || {}).text || id).join(' -> ');
  }

  if (key.type === 'text') return (key.value || [])[0] || '';
  return '';
}
