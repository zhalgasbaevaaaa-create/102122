/**
 * Local font + Kazakh typography checks.
 *
 * The product owner asked for Kazakh correct typography with Lora. That means:
 * the font is served from our own origin (no Google Fonts request), and the
 * Kazakh-only letters are actually inside the files we ship.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const KZ = 'ӘәҒғҚқҢңӨөҰұҮүҺһІі';

/**
 * Real glyph-coverage check: decode the fonts with fontTools (python3) and
 * confirm the Kazakh letters are present in the union of the shipped subsets.
 * WOFF2 is Brotli-compressed with a compact table directory, so hand-parsing it
 * in JS would be both long and easy to get subtly wrong — use the real decoder.
 */
function glyphCoverage(files) {
  const py = `
import glob, json, sys
from fontTools.ttLib import TTFont
chars = "ӘәҒғҚқҢңӨөҰұҮүҺһІі"
cov = set()
files = sorted(glob.glob("public/fonts/*-normal-*.woff2"))
for f in files:
    t = TTFont(f)
    for tb in t["cmap"].tables:
        cov |= set(tb.cmap.keys())
missing = [c for c in chars if ord(c) not in cov]
print(json.dumps({"files": len(files), "covered": len(chars) - len(missing), "total": len(chars), "missing": "".join(missing)}))
`;
  const out = execFileSync('python3', ['-c', py], { encoding: 'utf8', timeout: 60_000 });
  return JSON.parse(out.trim());
}

export async function runFontTests(baseUrl, rec) {
  const dir = 'public/fonts';
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.woff2')) : [];
  rec('fonts: Lora woff2 files are shipped locally', files.length >= 2, `${files.length} files`);

  const total = files.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  rec('fonts: payload stays small', total < 500_000, `${Math.round(total / 1024)} KB`);

  // every file must at least start with the WOFF2 signature
  const magicOk = files.every((f) => fs.readFileSync(path.join(dir, f)).toString('ascii', 0, 4) === 'wOF2');
  rec('fonts: every file is a real WOFF2 container', magicOk);

  // and the Kazakh letters must genuinely be inside the fonts we ship
  try {
    const cov = glyphCoverage(files);
    rec(
      'fonts: all 17 Kazakh letters exist in the shipped subsets',
      cov.covered === cov.total,
      `${cov.covered}/${cov.total}${cov.missing ? ' missing ' + cov.missing : ''}`,
    );
  } catch (e) {
    rec('fonts: glyph coverage check', false, 'fontTools/python3 unavailable: ' + e.message.slice(0, 80));
  }

  // the CSS we generate must declare the cyrillic + cyrillic-ext ranges
  const cssPath = 'src/fonts.css';
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  rec('fonts: @font-face rules exist', (css.match(/@font-face/g) || []).length >= 4, `${(css.match(/@font-face/g) || []).length} faces`);
  rec('fonts: cyrillic-ext range declared (ә ғ қ ң ө ұ ү һ)', /U\+0460-052F/.test(css));
  rec('fonts: cyrillic range declared (і, ұ)', /U\+0400-045F/.test(css));
  rec('fonts: faces are self-hosted from /fonts/', /url\('\/fonts\/lora-/.test(css) && !/fonts\.gstatic\.com/.test(css));

  // the app must reference the local stylesheet and not Google Fonts
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  rec('fonts: index.html preloads the local cyrillic subsets',
    /preload[^>]+lora-normal-cyrillic-ext\.woff2/.test(indexHtml) && /preload[^>]+lora-normal-cyrillic\.woff2/.test(indexHtml));
  rec('fonts: no Google Fonts request in index.html', !/fonts\.(googleapis|gstatic)\.com/.test(indexHtml));

  const appCss = fs.readFileSync('src/index.css', 'utf8');
  rec('fonts: Lora is the primary family for body and display text',
    /--font-display:[^;]*'Lora'/.test(appCss) && /--font-sans:[^;]*'Lora'/.test(appCss));
  rec('fonts: fonts.css is imported by the app stylesheet', /@import\s+'\.\/fonts\.css'/.test(appCss));

  // Kazakh text handling declared
  rec('fonts: Kazakh language rules present (:lang(kk))', /:lang\(kk\)/.test(appCss));

  // served over HTTP with the right content type
  if (baseUrl) {
    const res = await fetch(`${baseUrl}/fonts/lora-normal-cyrillic-ext.woff2`);
    const type = res.headers.get('content-type') || '';
    rec('fonts: served over HTTP as font/woff2', res.status === 200 && /font\/woff2/.test(type), `${res.status} ${type}`);
    const page = await fetch(baseUrl + '/');
    const html = await page.text();
    rec('fonts: served page has no third-party font origin',
      !/fonts\.(googleapis|gstatic)\.com/.test(html));
  }

  // the Kazakh alphabet appears in shipped copy with real glyphs
  const home = fs.readFileSync('src/pages/HomePage.tsx', 'utf8');
  const present = [...KZ].filter((ch) => home.includes(ch));
  rec('fonts: Kazakh-specific letters used in the UI copy', present.length >= 8, `${present.length} of ${KZ.length} letters in HomePage`);
}
