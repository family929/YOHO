// サイトの棚卸し（読むだけ。サイトには何も書き込まない）
//   node inventory.mjs --base https://旧サイト --out out/old [--extra /sentaku-checker/,/contact/] [--limit 0]
// 出力：
//   urls.csv    全URLの状態・title・description・canonical・robots・画像数
//   images.csv  ページで使われている画像と大きさ
//   summary.md  ページ数・画像の合計容量・サーバーの名乗り（PHPの版が出ていれば分かる）
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs, get, sizeOf, pool, parsePage, collectSitemapUrls, csv, kb } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.base || !args.out) {
  console.error('使い方: node inventory.mjs --base https://example.com --out out/old [--extra /a/,/b/] [--limit 0]');
  process.exit(1);
}
const base = String(args.base).replace(/\/+$/, '') + '/';
const out = String(args.out);
const limit = Number(args.limit || 0);
await mkdir(out, { recursive: true });

// 1. トップページの応答ヘッダー（PHPの版が見えるかどうか）
const top = await get(base);
const headerNames = ['server', 'x-powered-by', 'x-generator', 'x-robots-tag', 'cf-ray', 'x-litespeed-cache'];
const headers = Object.fromEntries(headerNames.map((h) => [h, top.headers.get(h) || '']));
const phpHint = [headers['x-powered-by'], headers.server].find((v) => /php/i.test(v)) || '';

// 2. サイトマップから全URL
const { urls: smUrls, sitemapsUsed } = await collectSitemapUrls(base);
const extra = String(args.extra || '').split(',').map((s) => s.trim()).filter(Boolean).map((p) => new URL(p, base).href);
let urls = [...new Set([base, ...smUrls, ...extra])];
if (limit > 0) urls = urls.slice(0, limit);
console.log(`URL ${urls.length} 件を確認します（サイトマップ: ${sitemapsUsed.join(' / ') || '見つからず'}）`);

// 3. 各ページ
const pages = await pool(urls, 4, async (u, i) => {
  const r = await get(u);
  const p = r.ok ? parsePage(r.body, r.finalUrl) : { title: '', description: '', robots: '', canonical: '', ogTitle: '', generator: '', images: [], links: [] };
  if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${urls.length}`);
  return { url: u, status: r.status, finalUrl: r.finalUrl, error: r.error || '', xRobots: r.headers.get('x-robots-tag') || '', ...p };
});

// 4. 画像の大きさ（同じ画像は1回だけ数える）
const imageUse = new Map();
for (const p of pages) for (const img of p.images) {
  if (!imageUse.has(img)) imageUse.set(img, []);
  imageUse.get(img).push(p.url);
}
const imgList = [...imageUse.keys()];
const sizes = await pool(imgList, 6, (u) => sizeOf(u));
const images = imgList.map((u, i) => ({ url: u, ...sizes[i], usedOn: imageUse.get(u).length, firstPage: imageUse.get(u)[0] }));

// 5. 書き出し
const pathOf = (u) => { try { return new URL(u).pathname; } catch { return u; } };
await writeFile(join(out, 'urls.csv'), csv([
  ['path', 'url', 'status', 'final_url', 'title', 'description', 'canonical', 'robots_meta', 'x_robots_tag', 'images', 'error'],
  ...pages.map((p) => [pathOf(p.url), p.url, p.status, p.finalUrl, p.title, p.description, p.canonical, p.robots, p.xRobots, p.images.length, p.error]),
]));
await writeFile(join(out, 'images.csv'), csv([
  ['image_url', 'status', 'bytes', 'used_on_pages', 'first_page'],
  ...images.map((m) => [m.url, m.status, m.bytes, m.usedOn, m.firstPage]),
]));
await writeFile(join(out, 'pages.json'), JSON.stringify(pages.map(({ url, links, images: im }) => ({ url, links, images: im }))));

const okPages = pages.filter((p) => p.status === 200);
const bad = pages.filter((p) => p.status !== 200);
const totalBytes = images.filter((m) => m.status === 200).reduce((s, m) => s + m.bytes, 0);
const noDesc = okPages.filter((p) => !p.description).length;
const noindex = okPages.filter((p) => /noindex/i.test(p.robots + ' ' + p.xRobots)).length;
const summary = `# 棚卸しの結果：${base}

- 調べた日時：${new Date().toISOString()}
- サイトマップ：${sitemapsUsed.join(' / ') || '見つからず'}
- URL の数：${pages.length}（200 で開けた：${okPages.length}／それ以外：${bad.length}）
- 画像：${images.length} 枚、合計 ${kb(totalBytes).toLocaleString()} KB（ページに表示されている画像だけ。同じ画像は1回）
- 説明文（description）が無いページ：${noDesc}
- noindex が付いているページ：${noindex}

## トップページの応答ヘッダー
${headerNames.map((h) => `- ${h}: ${headers[h] || '（なし）'}`).join('\n')}

PHP の版：${phpHint ? `ヘッダーに出ています → ${phpHint}` : '外からは分かりませんでした（ヘッダーに出ていない）。管理画面で確かめてください'}

## 200 以外のURL
${bad.length ? bad.map((p) => `- ${p.status || 'エラー'} ${p.url} ${p.error}`).join('\n') : '- なし'}
`;
await writeFile(join(out, 'summary.md'), summary);
console.log(summary);
