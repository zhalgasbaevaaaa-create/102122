/**
 * Robustness / security audit — hostile input against a live server.
 *
 * These are the probes that found real defects during the final review:
 *  • malformed JSON used to surface as a 500 instead of a 400;
 *  • admin-authored copy was stored verbatim (markup included).
 * Both are now regression-tested here.
 */
export async function runAuditTests(baseUrl, rec, adminToken) {
  const J = async (path, opts = {}) => {
    const res = await fetch(baseUrl + path, opts);
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  };
  const H = (tok) => ({ 'content-type': 'application/json', authorization: `Bearer ${tok}` });

  // dedicated accounts so nothing depends on the seeded demo users
  const reg = async (tag) => (await J('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `Аудит ${tag}`,
      email: `audit-${tag}-${Date.now()}${Math.floor(Math.random() * 1e4)}@test.arena.kz`,
      password: 'AuditPass12345!',
    }),
  })).body.token;

  const student = await reg('s');
  const admin = adminToken ?? (await J('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@arena.kz', password: 'Admin12345!' }),
  })).body.token;

  rec('audit: test accounts ready', Boolean(student && admin));

  // ── injection ────────────────────────────────────────────────────────────
  // the leaderboard is public by default, so no token is needed here
  const sqli = await J("/api/leaderboard?game=' OR 1=1--");
  rec('audit: SQL injection in a query param is inert', sqli.status === 200 && Array.isArray(sqli.body.rows));
  const sqli2 = await J('/api/session/start', {
    method: 'POST', headers: H(student),
    body: JSON.stringify({ gameId: "battle'; DROP TABLE users;--", level: 1 }),
  });
  rec('audit: SQL injection in gameId is rejected', sqli2.status === 400);
  const health = await J('/api/health');
  rec('audit: database intact after injection attempts', health.body.users > 0 && health.body.bank === 1616);

  // ── malformed / oversized bodies (regression: was 500) ───────────────────
  const bad = await J('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
  rec('audit: malformed JSON returns 400, not 500', bad.status === 400 && bad.body.code === 'BAD_JSON', `status=${bad.status}`);
  const huge = await J('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'a'.repeat(400_000), password: 'x' }),
  });
  rec('audit: oversized payload is refused cleanly', [400, 413, 401, 429].includes(huge.status), `status=${huge.status}`);
  const alive = await J('/api/health');
  rec('audit: server still healthy after malformed traffic', alive.body.ok === true);

  // ── stored markup is sanitised (regression) ─────────────────────────────
  const created = await J('/api/admin/questions', {
    method: 'POST', headers: H(admin),
    body: JSON.stringify({
      category: 'khanate', difficulty: 2, format: 'mcq',
      prompt: '<img src=x onerror="alert(1)">Сұрақ мәтіні осында',
      options: ['<script>alert(2)</script>', 'Дұрыс жауап', 'Үшінші нұсқа', 'Төртінші нұсқа'],
      answerIndex: 1,
      explanation: '<b>Түсіндірме</b> мәтіні осында жеткілікті',
      sourceId: 'ehistory',
    }),
  });
  rec('audit: admin can create a question', created.status === 201, `status=${created.status}`);
  if (created.status === 201) {
    // admin-authored questions live in their own `custom` list
    const list = await J('/api/admin/questions', { headers: H(admin) });
    const item = (list.body.custom ?? []).find((c) => c.id === created.body.id);
    const text = JSON.stringify(item ?? {});
    rec('audit: stored markup is stripped from admin copy',
      Boolean(item) && !/<img|<script|onerror=/i.test(text),
      item ? `prompt="${JSON.parse(item.options)[0].text.slice(0, 30)}"` : 'not found');
    // clean up so the shared bank stays tidy
    await J(`/api/admin/questions/${created.body.id}`, {
      method: 'PATCH', headers: H(admin), body: JSON.stringify({ active: false }),
    });
  }

  // ── auth boundaries ─────────────────────────────────────────────────────
  rec('audit: profile without a token is 401', (await J('/api/me/profile')).status === 401);
  rec('audit: forged token is 401',
    (await J('/api/me/profile', { headers: { authorization: 'Bearer deadbeef' } })).status === 401);
  rec('audit: unknown session id is 404 (no IDOR)',
    (await J('/api/session/00000000-0000-0000-0000-000000000000', { headers: H(student) })).status === 404);
  rec('audit: student cannot reach the admin API',
    (await J('/api/admin/users', { headers: H(student) })).status === 403);

  // ── score integrity ─────────────────────────────────────────────────────
  const st = await J('/api/session/start', {
    method: 'POST', headers: H(student), body: JSON.stringify({ gameId: 'battle', level: 1 }),
  });
  const inflate = await J(`/api/session/${st.body.sessionId}/complete`, {
    method: 'POST', headers: H(student),
    body: JSON.stringify({ baseScore: 1e9, durationSeconds: 1e9 }),
  });
  rec('audit: inflated baseScore is clamped', inflate.status === 200 && inflate.body.score < 2000, `score=${inflate.body.score}`);
  const again = await J(`/api/session/${st.body.sessionId}/complete`, {
    method: 'POST', headers: H(student), body: JSON.stringify({ baseScore: 500 }),
  });
  rec('audit: re-completing a session adds no score',
    Boolean(again.body.alreadyCompleted) || again.body.score === inflate.body.score);
  rec('audit: negative level is rejected',
    (await J('/api/session/start', { method: 'POST', headers: H(student), body: JSON.stringify({ gameId: 'battle', level: -5 }) })).status === 400);
  rec('audit: out-of-range level is rejected',
    (await J('/api/session/start', { method: 'POST', headers: H(student), body: JSON.stringify({ gameId: 'battle', level: 9999 }) })).status === 400);

  // ── answer keys never leave the server ──────────────────────────────────
  let leaks = 0;
  for (const gameId of ['adventure', 'strategy', 'defense', 'race', 'puzzle', 'battle']) {
    const r = await J('/api/session/start', { method: 'POST', headers: H(student), body: JSON.stringify({ gameId, level: 1 }) });
    for (const q of r.body.questions ?? []) if ('key' in q) leaks += 1;
  }
  rec('audit: zero answer keys leaked across all six games', leaks === 0, `${leaks} leaked`);
}
