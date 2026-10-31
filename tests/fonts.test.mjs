/**
 * Local font + Kazakh typography checks.
 *
 * The product owner asked for Kazakh correct typography with Lora. That means:
 * the font is served from our own origin (no Google Fonts request), and the
 * Kazakh-only letters are actually inside the files we ship.
 */
import fs from 'node:fs';
import path from 'node:path';

const KZ = 'ӘәҒғҚқҢңӨөҰұҮүҺһІі';

/**
 * Real glyph-coverage check, with zero external tooling.
 *
 * WOFF2 stores its table directory + glyph data Brotli-compressed, so a naive
 * reader cannot see the cmap. This walks the WOFF2 header, Brotli-decompresses
 * the single compressed stream with Node's built-in zlib, resolves the table
 * directory, and requires an uncompressed `cmap` — the common case. If a font
 * ever ships a *transformed* cmap we report it instead of silently passing.
 */
import zlib from 'node:zlib';

/** Parse the UIntBase128 number used throughout the WOFF2 directory. */
function readBase128(buf, pos) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[pos++];
    if (byte === undefined) throw new Error('truncated base128');
    if (i === 0 && byte === 0x80) throw new Error('invalid base128 padding');
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, pos };
  }
  throw new Error('base128 overflow');
}

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm',
  'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern',
  'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty',
  'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

/** Return the set of Unicode codepoints in one WOFF2 file's cmap. */
function woff2Codepoints(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'wOF2') throw new Error('not WOFF2');
  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);
  let pos = 48;

  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const flags = buf[pos++];
    const tagIndex = flags & 0x3f;
    const transformVersion = (flags >> 6) & 0x03;
    const known = tagIndex !== 0x3f;
    let tag;
    if (known) tag = KNOWN_TAGS[tagIndex];
    else { tag = buf.toString('ascii', pos, pos + 4); pos += 4; }
    const orig = readBase128(buf, pos); pos = orig.pos;
    // glyf/loca use a transformed length; every other table stores its real length
    const transformed = (tag === 'glyf' || tag === 'loca') ? transformVersion === 0 : transformVersion !== 0;
    let length = orig.value;
    if (transformed) length = readBase128(buf, pos).value, pos = readBase128.bind(null, buf)(pos).pos;
    tables[tag] = { length, transformed, offset: null };
  }

  const compressed = buf.subarray(pos, pos + totalCompressedSize);
  const raw = zlib.brotliDecompressSync(compressed);
  let cursor = 0;
  for (const [tag, t] of Object.entries(tables)) {
    t.offset = cursor;
    cursor += t.length;
  }

  const cmap = tables.cmap;
  if (!cmap) throw new Error('no cmap table');
  if (cmap.transformed) throw new Error('cmap is transformed (unexpected)');
  const c = raw.subarray(cmap.offset, cmap.offset + cmap.length);
  const numSubtables = c.readUInt16BE(2);
  const points = new Set();
  for (let i = 0; i < numSubtables; i++) {
    const rec = 4 + i * 8;
    const platform = c.readUInt16BE(rec);
    const encoding = c.readUInt16BE(rec + 2);
    const off = c.readUInt32BE(rec + 4);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    const format = c.readUInt16BE(off);
    if (format === 4) {
      const segX2 = c.readUInt16BE(off + 6);
      const endBase = off + 14;
      const startBase = endBase + segX2 + 2;
      for (let seg = 0; seg < segX2 / 2; seg++) {
        const end = c.readUInt16BE(endBase + seg * 2);
        const start = c.readUInt16BE(startBase + seg * 2);
        if (start === 0xffff && end === 0xffff) continue;
        for (let cp = start; cp <= end && cp !== 0x10000; cp++) points.add(cp);
      }
    } else if (format === 12) {
      const nGroups = c.readUInt32BE(off + 12);
      for (let g = 0; g < nGroups; g++) {
        const base = off + 16 + g * 12;
        const startCp = c.readUInt32BE(base);
        const endCp = c.readUInt32BE(base + 4);
        for (let cp = startCp; cp <= endCp; cp++) points.add(cp);
      }
    }
    // format 0 / 6 are byte/trimmed arrays; not emitted by Google Fonts subsets
  }
  return points;
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
    const covered = new Set();
    let parsed = 0;
    for (const f of files) {
      for (const cp of woff2Codepoints(path.join(dir, f))) covered.add(cp);
      parsed += 1;
    }
    const missing = [...KZ].filter((ch) => !covered.has(ch.codePointAt(0)));
    // guard against a silently empty parse: the subsets must contain thousands of glyphs
    rec('fonts: WOFF2 subsets are actually decoded', parsed === files.length && covered.size > 100, `${covered.size} codepoints`);
    rec(
      'fonts: all 18 Kazakh letters (upper + lower case) exist in the shipped subsets',
      missing.length === 0,
      `${KZ.length - missing.length}/${KZ.length}${missing.length ? ' missing ' + missing.join('') : ''}`,
    );
  } catch (e) {
    rec('fonts: glyph coverage check', false, 'decode failed: ' + e.message.slice(0, 120));
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
