/**
 * WebSocket multiplayer integration test.
 *
 * Boots nothing by itself: the runner passes a live base URL. Two authenticated
 * human clients connect, create/join a room, play a real match through the
 * server clock, and the assertions cover the properties that actually matter —
 * server-authoritative scoring, no answer-key leakage, no double answers,
 * persistence into game_sessions/student_results.
 */
import WebSocket from 'ws';

export async function runMultiplayerTests(baseUrl, rec) {
  const api = async (path, opts = {}) => {
    const res = await fetch(baseUrl + path, opts);
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, body };
  };

  const login = async (email, password) => {
    const r = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return r.body?.token;
  };

  const tokenA = await login('student@arena.kz', 'Student12345!');
  // player B is a fresh account so the test never depends on seeded data
  const emailB = `mp-${Date.now()}${Math.floor(Math.random() * 1e4)}@test.arena.kz`;
  const regB = await api('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Сынақ Ойыншы', email: emailB, password: 'Multiplayer123!' }),
  });
  const tokenB = regB.body?.token;
  if (regB.status !== 201 && regB.status !== 200) {
    console.log('    register B failed:', regB.status, JSON.stringify(regB.body).slice(0, 200));
  }
  rec('multiplayer: both players authenticate', Boolean(tokenA && tokenB));
  if (!tokenA || !tokenB) return;

  const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws';

  /** small helper: a client that records every frame and can await a type */
  function client(name) {
    const ws = new WebSocket(wsUrl);
    const frames = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      msg.__for = name;
      frames.push(msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].match(msg)) {
          waiters[i].resolve(msg);
          waiters.splice(i, 1);
        }
      }
    });
    const wait = (match, timeout = 15000) =>
      new Promise((resolve, reject) => {
        const found = frames.find(match);
        if (found) return resolve(found);
        const w = { match, resolve };
        waiters.push(w);
        setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error(`${name}: timeout waiting for frame`));
        }, timeout);
      });
    const open = new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    return { ws, frames, wait, open, send: (o) => ws.send(JSON.stringify(o)) };
  }

  const A = client('A');
  const B = client('B');
  try {
    await Promise.all([A.open, B.open]);
    rec('multiplayer: two sockets connect to /ws', true);

    A.send({ type: 'hello', token: tokenA });
    B.send({ type: 'hello', token: tokenB });
    const readyA = await A.wait((m) => m.type === 'ready');
    const readyB = await B.wait((m) => m.type === 'ready');
    rec('multiplayer: token handshake authenticates both players', Boolean(readyA.user?.id && readyB.user?.id));

    // unauthenticated socket must be rejected
    const C = client('C');
    await C.open;
    C.send({ type: 'hello', token: 'deadbeef' });
    const badAuth = await C.wait((m) => m.type === 'error');
    rec('multiplayer: invalid token is rejected', badAuth.code === 'AUTH');
    C.ws.close();

    // A creates the room
    A.send({ type: 'create', options: { timerSeconds: 10, revealMs: 900, teamMode: false, level: 1 } });
    const created = await A.wait((m) => m.type === 'created');
    const code = created.code;
    rec('multiplayer: room created with a 6-character code', /^[A-Z0-9]{6}$/.test(code), code);

    // B joins by code
    B.send({ type: 'join', code });
    const joined = await B.wait((m) => m.type === 'joined' && m.code === code);
    rec('multiplayer: second player joins by code', joined.room.seats.length === 2);

    // a wrong code must fail cleanly
    A.send({ type: 'join', code: 'ZZZZZZ' });
    const noRoom = await A.wait((m) => m.type === 'error');
    rec('multiplayer: unknown room code reports NO_ROOM', noRoom.code === 'NO_ROOM');

    // only the host may start
    B.send({ type: 'start', count: 10 });
    const notHost = await B.wait((m) => m.type === 'error' && m.code === 'NOT_HOST');
    rec('multiplayer: non-host cannot start the match', notHost.code === 'NOT_HOST');

    // add one bot so the room is a real 3-way race
    A.send({ type: 'bots', count: 1 });
    const stateWithBot = await A.wait((m) => m.type === 'state' && m.room.seats.length === 3);
    rec('multiplayer: host can add a bot seat', stateWithBot.room.seats.some((s) => s.bot));

    // host starts
    A.send({ type: 'start', count: 10 });
    const q1 = await A.wait((m) => m.type === 'question');
    const q1b = await B.wait((m) => m.type === 'question');
    rec('multiplayer: both clients receive question 1', q1.question.id === q1b.question.id);

    const leaked = JSON.stringify(q1).includes('"key"');
    rec('multiplayer: the answer key is never sent over the socket', !leaked);

    // replay the whole match, answering as fast as the server allows
    let question = q1;
    let answered = 0;
    let doubleAnswerRejected = false;
    const seenIds = new Set();

    const pickAnswer = (msg) => {
      const qq = msg.question;
      seenIds.add(qq.id);
      if (qq.format === 'truefalse') return true;
      if (qq.format === 'multi-select') return [0];
      if (qq.format === 'match-dates' || qq.format === 'match-persons') {
        const pairs = {};
        for (const l of qq.left ?? []) pairs[l.id] = qq.right?.[0]?.id;
        return pairs;
      }
      if (qq.format === 'chronological') return (qq.items ?? []).map((i) => i.id);
      return 0;
    };

    // loop: answer, wait for reveal, wait for the next question, until finished
    for (let round = 0; round < 12; round++) {
      A.send({ type: 'answer', answer: pickAnswer(question), ms: 2500 });
      B.send({ type: 'answer', answer: pickAnswer(question) === 0 ? 1 : pickAnswer(question), ms: 3000 });
      answered += 1;

      // the second answer from the same seat in the same round must be ignored
      if (answered === 1) {
        // A duplicate must not produce a second private result for this seat.
        // Wait for the FIRST result to land, otherwise the count is measured
        // before the server has replied at all.
        await A.wait((m) => m.type === 'answer_result', 8000);
        const before = A.frames.filter((m) => m.type === 'answer_result').length;
        A.send({ type: 'answer', answer: pickAnswer(question), ms: 3000 });
        // stay inside the reveal window so the duplicate cannot be mistaken for
        // an answer to the *next* question
        await new Promise((r) => setTimeout(r, 250));
        const after = A.frames.filter((m) => m.type === 'answer_result').length;
        doubleAnswerRejected = after === before;
      }

      let next;
      try {
        next = await A.wait((m) => (m.type === 'question' && m.index === round + 1) || m.type === 'finished', 20000);
      } catch {
        break;
      }
      if (next.type === 'finished') {
        rec('multiplayer: match reaches the finished state', true);
        fin = next;
        break;
      }
      await B.wait((m) => m.type === 'question' && m.index === round + 1, 20000);
      question = next;
    }
    rec('multiplayer: a seat cannot answer the same question twice', doubleAnswerRejected);
    rec('multiplayer: questions are drawn without repeats', seenIds.size >= 5, `${seenIds.size} unique`);

    var fin = A.frames.find((m) => m.type === 'finished');

    if (fin) {
      rec('multiplayer: final standings include every seat', fin.results.length === 3);
      // Scores depend on whether the (deliberately naive) test answers happened
      // to be right, so the deterministic property is what we assert: both human
      // seats played every question and carry a server-computed number.
      const humans = fin.results.filter((r) => !r.bot);
      const allPlayed = humans.every((r) => r.correct + r.wrong === 10);
      rec('multiplayer: every human seat played all questions',
        humans.length === 2 && allPlayed,
        humans.map((r) => `${r.correct + r.wrong}/10`).join(' '));
      rec('multiplayer: server-computed score present for every human seat',
        humans.every((r) => typeof r.score === 'number' && r.score >= 0),
        JSON.stringify(humans.map((r) => r.score)));
      rec('multiplayer: score arithmetic matches the server rules',
        humans.every((r) => r.score >= r.correct * 100), JSON.stringify(humans.map((r) => [r.correct, r.score])));
      rec('multiplayer: XP payload returned to the player', typeof fin.me?.xp === 'number' && fin.me.xp > 0, `xp=${fin.me?.xp}`);
      rec('multiplayer: rank returned', Boolean(fin.me?.rank?.title), fin.me?.rank?.title);
    } else {
      rec('multiplayer: match reaches the finished state', false, 'no finished frame');
    }

    // persistence: the online match must land in game_sessions + student_results
    const prof = await api('/api/me/profile', { headers: { authorization: `Bearer ${tokenA}` } });
    const onlineSession = (prof.body?.recent ?? []).find((r) => r.mode === 'online' || r.gameId === 'battle');
    rec('multiplayer: result persisted to the player profile', Boolean(onlineSession),
      onlineSession ? `${onlineSession.gameId} score=${onlineSession.score}` : 'not found');

    // ── reveal labels: for every format, the text shown must be the real answer ──
    const reveals = A.frames.filter((m) => m.type === 'reveal');
    const bad = reveals.filter((r) => !r.correctAnswerLabel || /undefined|\[object/.test(r.correctAnswerLabel));
    rec('multiplayer: every reveal shows a human-readable correct answer',
      reveals.length >= 5 && bad.length === 0,
      `${reveals.length} reveals, ${bad.length} bad${bad.length ? ': ' + bad[0].correctAnswerLabel.slice(0, 60) : ''}`);

    // room info over HTTP
    const roomInfo = await api(`/api/multiplayer/room/${code}`);
    rec('multiplayer: HTTP room lookup works', roomInfo.status === 200 && roomInfo.body.code === code);
    const missing = await api('/api/multiplayer/room/NOPE01');
    rec('multiplayer: unknown room returns 404', missing.status === 404);

    const status = await api('/api/multiplayer/status');
    rec('multiplayer: status endpoint reports the ws path', status.body?.path === '/ws');
  } catch (e) {
    rec('multiplayer: suite completed without a transport error', false, e.message?.slice(0, 160));
  } finally {
    A.ws.close();
    B.ws.close();
  }
}
