// 移行チェック用の共通部品（Node.js 18 以上。追加のインストール不要）
// どの店のサイトでも使えるよう、店の固有情報はここに書かない。

export const UA = 'site-migration-check/1.0 (+read-only)';

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

export async function get(url, { method = 'GET', timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA } });
    const body = method === 'HEAD' ? '' : await res.text();
    return { ok: true, status: res.status, finalUrl: res.url, headers: res.headers, body };
  } catch (e) {
    return { ok: false, status: 0, finalUrl: url, headers: new Headers(), body: '', error: String(e.cause?.code || e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

// 画像などの大きさを調べる。HEAD で content-length が無いときだけ GET して数える
export async function sizeOf(url) {
  const head = await get(url, { method: 'HEAD' });
  const len = Number(head.headers.get('content-length'));
  if (head.ok && head.status < 400 && len > 0) return { status: head.status, bytes: len };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': UA } });
    const buf = await res.arrayBuffer();
    return { status: res.status, bytes: buf.byteLength };
  } catch (e) {
    return { status: 0, bytes: 0, error: String(e.cause?.code || e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : '';
}

function metaContent(html, key, value) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (attr(tag, key).toLowerCase() === value) return attr(tag, 'content');
  }
  return '';
}

function linkHref(html, rel) {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (attr(tag, 'rel').toLowerCase().split(/\s+/).includes(rel)) return attr(tag, 'href');
  }
  return '';
}

// ページの中から、移行で引き継ぎたい情報を取り出す（正規表現なので、崩れたHTMLでは取りこぼすことがある）
export function parsePage(html, pageUrl) {
  const abs = (u) => { try { return new URL(u, pageUrl).href; } catch { return ''; } };
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim());
  const images = new Set();
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const src = attr(tag, 'src') || attr(tag, 'data-src');
    if (src && !src.startsWith('data:')) images.add(abs(src));
  }
  const links = new Set();
  for (const tag of html.match(/<a\b[^>]*>/gi) || []) {
    const href = attr(tag, 'href');
    if (!href || /^(#|mailto:|tel:|javascript:|line:)/i.test(href)) continue;
    const u = abs(href);
    if (u) links.add(u.split('#')[0]);
  }
  return {
    title,
    description: metaContent(html, 'name', 'description'),
    robots: metaContent(html, 'name', 'robots'),
    canonical: linkHref(html, 'canonical'),
    ogTitle: metaContent(html, 'property', 'og:title'),
    generator: metaContent(html, 'name', 'generator'),
    images: [...images].filter(Boolean),
    links: [...links].filter(Boolean),
  };
}

export function locsFromXml(xml) {
  const sitemaps = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
  const urls = [...xml.matchAll(/<url>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
  return { sitemaps, urls };
}

// サイトマップをたどって、公開されている全URLを集める
export async function collectSitemapUrls(base, { candidates = ['/wp-sitemap.xml', '/sitemap_index.xml', '/sitemap.xml'] } = {}) {
  const seen = new Set();
  const urls = new Set();
  const used = [];
  async function walk(smUrl, depth) {
    if (seen.has(smUrl) || depth > 3) return;
    seen.add(smUrl);
    const r = await get(smUrl);
    if (!r.ok || r.status >= 400 || !/<(urlset|sitemapindex)/i.test(r.body)) return;
    used.push(smUrl);
    const { sitemaps, urls: u } = locsFromXml(r.body);
    u.forEach((x) => urls.add(x));
    for (const s of sitemaps) await walk(s, depth + 1);
  }
  for (const c of candidates) {
    await walk(new URL(c, base).href, 0);
    if (urls.size) break;
  }
  return { urls: [...urls], sitemapsUsed: used };
}

export function csv(rows) {
  const esc = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

export function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

export const kb = (bytes) => Math.round(bytes / 1024);
