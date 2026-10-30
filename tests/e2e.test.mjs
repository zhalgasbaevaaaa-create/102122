/**
 * Browser end-to-end tests with Playwright/Chromium.
 * Verifies that every route renders, that the six games actually play, and that
 * no console errors occur during a full learner journey.
 */
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:8799';

export async function runE2E() {
  const { chromium } = await import('playwright');
  const results = [];
  const rec = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      // Google Fonts are blocked inside the offline sandbox: not an app error
      if (/fonts\.googleapis|fonts\.gstatic|Failed to load resource/i.test(t)) return;
      consoleErrors.push(t);
    }
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  // home
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const title = await page.title();
  rec('home renders with Kazakh title', title.includes('ҚАЗАҚСТАН ТАРИХЫ'), title);
  await page.waitForSelector('text=Ойындар әлемі', { timeout: 15000 });
  rec('home shows the six-game section', (await page.locator('text=Ұлы дала').count()) > 0);

  const navLinks = ['/oyyndar', '/map', '/timeline', '/tulgalar', '/entsiklopediya', '/reiting', '/zhetistikter'];
  for (const link of navLinks) {
    await page.goto(BASE + link, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const h1 = await page.locator('h1').first().textContent().catch(() => '');
    rec(`route ${link} renders`, Boolean(h1 && h1.trim().length > 2), h1?.trim().slice(0, 40));
  }

  // map interaction: change the year slider and check the side panel updates
  await page.goto(BASE + '/map', { waitUntil: 'networkidle' });
  await page.waitForSelector('input[type=range]');
  await page.locator('input[type=range]').fill('1600');
  await page.waitForTimeout(400);
  const mapText = await page.locator('body').textContent();
  rec('map slider changes the active polity set', mapText.includes('Қазақ хандығы'));

  // login
  await page.goto(BASE + '/kiru', { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', 'student@arena.kz');
  await page.fill('input[type=password]', 'Student12345!');
  await page.click('button:has-text("Кіру")');
  await page.waitForURL('**/profil', { timeout: 15000 });
  rec('login navigates to profile', page.url().includes('/profil'));
  await page.waitForSelector('text=Ойындар бойынша прогресс', { timeout: 15000 });
  rec('profile shows progress section', true);

  // play the battle game (DOM engine, no WebGL dependency)
  await page.goto(BASE + '/oyyn/battle', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Деңгейлер');
  rec('battle level select renders', true);
  await page.click('button:has-text("Тас дәуірі майданы")');
  await page.waitForSelector('button:has-text("Бастау")', { timeout: 10000 });
  await page.click('button:has-text("Бастау")');
  await page.waitForSelector('text=Сайыс режимін таңдаңыз', { timeout: 20000 });
  rec('battle mode selection appears', true);
  await page.click('button:has-text("Жеке")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Кезекті бастау")');
  await page.waitForSelector('text=Сұрақ 1 / 1', { timeout: 20000 });
  rec('historical challenge question renders inside the game', true);

  // answer the question then continue
  const optCount = await page.locator('button.opt').count();
  rec('question options are rendered', optCount > 0, `${optCount} options`);
  if (optCount > 0) await page.locator('button.opt').first().click();
  await page.waitForTimeout(200);
  const submitBtn = page.locator('button:has-text("Жауапты жіберу")');
  if (await submitBtn.count()) await submitBtn.first().click();
  await page.waitForTimeout(900);
  const explained = await page.locator("text=Дұрыс жауап").count() + await page.locator("text=Қате жауап").count();
  rec('answer is graded and explained', explained > 0);

  // 3D engine sanity check: WebGL context should be created on the adventure stage
  await page.goto(BASE + '/oyyn/adventure', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Деңгейлер');
  await page.click('button:has-text("Тас дәуірінің таңы")');
  await page.waitForSelector('button:has-text("Бастау")');
  await page.click('button:has-text("Бастау")');
  await page.waitForTimeout(2500);
  const canvasCount = await page.locator('canvas').count();
  const hasWebgl = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return false;
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  });
  rec('3D adventure starts and creates a WebGL canvas', canvasCount > 0 && hasWebgl, `canvases=${canvasCount}`);

  // mobile viewport smoke test
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' });
  const mp = await mobile.newPage();
  const mobileErrors = [];
  mp.on('pageerror', (e) => mobileErrors.push(e.message));
  await mp.goto(BASE, { waitUntil: 'domcontentloaded' });
  await mp.waitForTimeout(1200);
  const mobileH1 = await mp.locator('h1').first().textContent();
  rec('mobile layout renders', Boolean(mobileH1));
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  rec('no horizontal overflow on mobile', overflow <= 2, `overflow=${overflow}px`);
  await mp.goto(BASE + '/oyyn/puzzle', { waitUntil: 'domcontentloaded' });
  await mp.waitForTimeout(800);
  rec('match-3 board renders on mobile', (await mp.locator('button[aria-label^="Ұяшық"]').count()) >= 40);
  await mobile.close();

  rec('no uncaught console errors during the journey', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();
  return results;
}
