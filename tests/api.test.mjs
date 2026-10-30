/**
 * API + security test suite. Run with: node tests/run-tests.mjs
 * Boots the server on a test port with a throwaway database.
 */
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:8799';

export const results = [];
function rec(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  let body = null;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

export async function runApiTests() {
  console.log('\n── API tests ─────────────────────────────');

  const health = await req('/api/health');
  rec('health endpoint', health.status === 200 && health.body.ok === true, `bank=${health.body.bank}`);

  const providers = await req('/api/auth/providers');
  rec(
    'auth providers endpoint offers password login only',
    providers.status === 200 && providers.body.password === true && !('google' in providers.body),
    JSON.stringify(providers.body),
  );

  // Google OAuth was removed by product decision — the routes must be gone, not
  // stubbed, so no client can start a dead OAuth flow.
  const googleStart = await req('/api/auth/google/start', { redirect: 'manual' });
  const googleCb = await req('/api/auth/google/callback', { redirect: 'manual' });
  rec(
    'google OAuth endpoints no longer exist',
    googleStart.status === 404 && googleCb.status === 404,
    `start=${googleStart.status} callback=${googleCb.status}`,
  );

  // registration + login
  const email = `test-${Date.now()}@exam.kz`;
  const reg = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Тест Оқушы', email, password: 'TestPass123!', group: '11-Т' }),
  });
  rec('student registration', reg.status === 201 && Boolean(reg.body.token));
  const token = reg.body.token;
  const auth = { Authorization: `Bearer ${token}` };

  const weak = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Әлсіз', email: `weak-${Date.now()}@exam.kz`, password: '123' }),
  });
  rec('weak password rejected', weak.status === 400);

  const dupe = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Қайталау', email, password: 'TestPass123!' }),
  });
  rec('duplicate e-mail rejected', dupe.status === 409);

  const login = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'TestPass123!' }) });
  rec('login works', login.status === 200 && Boolean(login.body.token));

  const badLogin = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'wrong' }) });
  rec('wrong password rejected', badLogin.status === 401);

  const me = await req('/api/auth/me', { headers: auth });
  rec('session token resolves user', me.status === 200 && me.body.user?.email === email);

  const anon = await req('/api/me/profile');
  rec('profile requires auth', anon.status === 401);

  // content
  const bundle = await req('/api/content/bundle');
  rec(
    'content bundle complete',
    bundle.status === 200 && bundle.body.games.length === 6 && bundle.body.periods.length === 14 && bundle.body.persons.length >= 25,
    `games=${bundle.body.games?.length} persons=${bundle.body.persons?.length} events=${bundle.body.events?.length}`,
  );
  rec('every game has 10 levels', bundle.body.games.every((g) => g.levels.length === 10));

  // session lifecycle
  const start = await req('/api/session/start', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ gameId: 'battle', level: 1, difficulty: 'hard' }),
  });
  rec('session start returns questions without answer keys', start.status === 200 && start.body.questions.length >= 5 && start.body.questions.every((q) => q.key === undefined), `n=${start.body.questions?.length}`);

  const sId = start.body.sessionId;
  const qids = start.body.questions.map((q) => q.id);
  rec('questions are unique within a session', new Set(qids).size === qids.length);

  // answer every question using the correct key pulled from the shared module
  const { getBank } = await import('../shared/question-gen.ts');
  const { checkAnswer } = await import('../shared/quiz-types.ts');
  const bank = getBank();
  let correctCount = 0;
  for (const q of start.body.questions) {
    const full = bank.find((b) => b.id === q.id);
    let answer = null;
    if (full.key.type === 'index') answer = full.key.value.length > 1 ? full.key.value : full.key.value[0];
    else if (full.key.type === 'pairs') answer = full.key.value;
    else if (full.key.type === 'order') answer = full.key.value;
    const res = await req(`/api/session/${sId}/answer`, {
      method: 'POST', headers: auth, body: JSON.stringify({ questionId: q.id, answer, ms: 1200 }),
    });
    if (res.status === 200 && res.body.correct) correctCount += 1;
    if (res.status === 200 && !res.body.explanation) rec('answer response carries explanation', false, q.id);
  }
  rec('correct answers are graded as correct (server-side)', correctCount === qids.length, `${correctCount}/${qids.length}`);

  const dup = await req(`/api/session/${sId}/answer`, {
    method: 'POST', headers: auth, body: JSON.stringify({ questionId: qids[0], answer: 0 }),
  });
  rec('duplicate answer to the same question rejected', dup.status === 409);

  const foreign = await req(`/api/session/${sId}/answer`, {
    method: 'POST', headers: auth, body: JSON.stringify({ questionId: 'not-in-session', answer: 0 }),
  });
  rec('answer for a foreign question rejected', foreign.status === 400);

  const complete = await req(`/api/session/${sId}/complete`, {
    method: 'POST', headers: auth, body: JSON.stringify({ baseScore: 999999, durationSeconds: 120 }),
  });
  rec('session completes and scores', complete.status === 200 && complete.body.score > 0, `score=${complete.body.score} xp=${complete.body.xp}`);
  rec('client base score is capped server-side', complete.body.breakdown.gameplayScore <= qids.length * 120 * 0.5 + 1, `gameplay=${complete.body.breakdown.gameplayScore}`);

  const reComplete = await req(`/api/session/${sId}/complete`, { method: 'POST', headers: auth, body: JSON.stringify({}) });
  rec('double completion is idempotent (no score farming)', reComplete.status === 200 && reComplete.body.alreadyCompleted === true);

  const profile = await req('/api/me/profile', { headers: auth });
  rec('profile aggregates results', profile.status === 200 && profile.body.stats.answers === qids.length);

  const board = await req('/api/leaderboard');
  rec('leaderboard returns real rows', board.status === 200 && board.body.rows.length >= 1);

  const daily = await req('/api/challenges/daily');
  rec('daily challenge is deterministic for the day', daily.status === 200 && daily.body.questions.length === 5);

  const daily2 = await req('/api/challenges/daily');
  rec('daily challenge stable across calls', JSON.stringify(daily.body.questions.map((q) => q.id)) === JSON.stringify(daily2.body.questions.map((q) => q.id)));

  // RBAC
  const teacherApi = await req('/api/teacher/students', { headers: auth });
  rec('student cannot access teacher API', teacherApi.status === 403);

  const adminApi = await req('/api/admin/users', { headers: auth });
  rec('student cannot access admin API', adminApi.status === 403);

  const teacherLogin = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'teacher@arena.kz', password: 'Teacher12345!' }) });
  const tAuth = { Authorization: `Bearer ${teacherLogin.body.token}` };
  const students = await req('/api/teacher/students', { headers: tAuth });
  rec('teacher can list students', students.status === 200 && students.body.students.length > 0);
  const teacherAdmin = await req('/api/admin/users', { headers: tAuth });
  rec('teacher cannot access admin API', teacherAdmin.status === 403);

  const csv = await fetch(BASE + '/api/teacher/export.csv', { headers: tAuth });
  const csvText = await csv.text();
  rec('CSV export returns data', csv.status === 200 && csvText.includes('ОҚУШЫЛАР ЖИЫНТЫҒЫ'));

  const adminLogin = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@arena.kz', password: 'Admin12345!' }) });
  const aAuth = { Authorization: `Bearer ${adminLogin.body.token}` };
  const adminUsers = await req('/api/admin/users', { headers: aAuth });
  rec('admin can list users', adminUsers.status === 200 && adminUsers.body.users.length > 0);

  const qCreate = await req('/api/admin/questions', {
    method: 'POST', headers: aAuth,
    body: JSON.stringify({
      category: 'khanate', prompt: 'Тест сұрағы?', options: ['А', 'Б', 'В'],
      answerIndex: 1, explanation: 'Тест түсіндірмесі толық.', sourceId: 'ehistory',
    }),
  });
  rec('admin can create a question', qCreate.status === 201);

  const badQ = await req('/api/admin/questions', {
    method: 'POST', headers: aAuth,
    body: JSON.stringify({ category: 'khanate', prompt: 'x', options: ['А'], answerIndex: 0, explanation: 'y' }),
  });
  rec('incomplete question rejected', badQ.status === 400);

  const settings = await req('/api/admin/settings', { method: 'PATCH', headers: aAuth, body: JSON.stringify({ dailyChallenge: 'on' }) });
  rec('admin can edit settings', settings.status === 200);

  const relogin = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'TestPass123!' }) });
  rec('password hash is verifiable after restart-safe storage', relogin.status === 200);

  const logout = await req('/api/auth/logout', { method: 'POST', headers: auth });
  rec('logout succeeds', logout.status === 200);
  const afterLogout = await req('/api/me/profile', { headers: auth });
  rec('token invalid after logout', afterLogout.status === 401);

  // rate limiting
  let limited = false;
  for (let i = 0; i < 26; i++) {
    const r = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nobody@exam.kz', password: 'x' }) });
    if (r.status === 429) { limited = true; break; }
  }
  rec('login rate limiting engages', limited);

  return results;
}
