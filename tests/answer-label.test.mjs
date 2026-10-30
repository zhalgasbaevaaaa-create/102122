/**
 * Exhaustive check of the "correct answer" text shown after each online round.
 *
 * Every one of the 1 616 bank questions is run through answerLabel(), and the
 * label is verified against the question's own option/pair/list data. This is
 * what stops the reveal screen from printing "undefined" or the wrong answer.
 */
export async function runAnswerLabelTests(rec) {
  const { answerLabel } = await import('../server/answer-label.js');
  const { getBank } = await import('../shared/question-gen.ts');

  const bank = getBank();
  const perFormat = {};
  let bad = 0;
  const examples = {};

  for (const q of bank) {
    const label = answerLabel(q);
    perFormat[q.format] = (perFormat[q.format] ?? 0) + 1;
    let ok = typeof label === 'string' && label.length > 0 && !/undefined|\[object|null/.test(label);

    if (ok) {
      const k = q.key;
      if (k.type === 'index') {
        // the label must be exactly the text of the keyed option(s)
        const want = (k.value ?? []).map(String);
        const texts = (q.options ?? []).filter((o) => want.includes(String(o.id))).map((o) => o.text);
        ok = texts.length > 0 && label === texts.join(' - ');
        if (q.format === 'truefalse') ok = ok && (label === 'Дұрыс' || label === 'Қате');
      } else if (k.type === 'pairs') {
        ok = label.split('; ').length === Object.keys(k.value).length && label.includes(' -> ');
      } else if (k.type === 'order') {
        ok = label.split(' -> ').length === (k.value ?? []).length;
      } else if (k.type === 'text') {
        ok = (k.value ?? []).includes(label);
      }
    }

    if (!ok) {
      bad += 1;
      if (Object.keys(examples).length < 5) examples[q.format] = `${q.id} => ${label.slice(0, 60)}`;
    }
  }

  rec('reveal: answer label built for all 1616 questions', bad === 0, `${bad} bad${bad ? ' e.g. ' + JSON.stringify(examples).slice(0, 200) : ''}`);

  const formats = Object.keys(perFormat);
  rec('reveal: all 10 question formats covered', formats.length === 10, `${formats.length} formats`);

  // spot-check each format with a hand-built question (independent of the bank)
  const tf = { options: [{ id: '0', text: 'Дұрыс' }, { id: '1', text: 'Қате' }], key: { type: 'index', value: [1] } };
  rec('reveal: truefalse label names the option', answerLabel(tf) === 'Қате', answerLabel(tf));

  const ms = {
    options: [{ id: '0', text: 'А' }, { id: '1', text: 'Б' }, { id: '2', text: 'В' }],
    key: { type: 'index', value: [0, 2] },
  };
  rec('reveal: multi-select label joins every correct option', answerLabel(ms) === 'А - В', answerLabel(ms));

  const pairs = {
    left: [{ id: 'l0', text: 'Отырар' }, { id: 'l1', text: 'Сығанақ' }],
    right: [{ id: 'r0', text: '1218' }, { id: 'r1', text: 'XIV ғ.' }],
    key: { type: 'pairs', value: { l0: 'r0', l1: 'r1' } },
  };
  const pl = answerLabel(pairs);
  rec('reveal: matching label pairs left with right', pl === 'Отырар -> 1218; Сығанақ -> XIV ғ.', pl);

  const order = {
    items: [{ id: 'a', text: 'Бірінші' }, { id: 'b', text: 'Екінші' }],
    key: { type: 'order', value: ['a', 'b'] },
  };
  rec('reveal: chronological label follows the order', answerLabel(order) === 'Бірінші -> Екінші', answerLabel(order));

  rec('reveal: empty/garbage key does not crash', answerLabel({}) === '' && answerLabel(null) === '');
}
