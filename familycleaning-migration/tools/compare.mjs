// 旧サイトの全URLが新サイトでどうなっているかを照合する（読むだけ）
//   node compare.mjs --old out/old/urls.csv --new-base https://新サイト --out out/compare
//                    [--map map.csv] [--try-prefix /posts/] [--expect-noindex]
// map.csv は old_path,new_path の2列（手で決めた転送先）。無いURLは
//   1) 同じパス → 2) --try-prefix を付けたパス（/slug/ → /posts/slug）の順に探す。
// 出力：compare.csv（1URL=1行）・redirects.txt（Cloudflare の _redirects 形式）・broken.csv・summary.md
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs, get, sizeOf, pool, parsePage, parseCsv, csv } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.old || !args['new-base'] || !args.out) {
  console.error('使い方: node compare.mjs --old out/old/urls.csv --new-base https://example.workers.dev --out out/compare [--map map.csv] [--try-prefix /posts/] [--expect-noindex]');
  process.exit(1);
}
const newBase = String(args['new-base']).replace(/\/+$/, '');
const out = String(args.out);
const prefix = args['try-prefix'] ? '/' + String(args['try-prefix']).replace(/^\/+|\/+$/g, '') + '/' : '';
await mkdir(out, { recursive: true });

const oldRows = parseCsv(await readFile(String(args.old), 'utf8')).filter((r) => r.status === '200');
const manual = new Map();
if (args.map) for (const r of parseCsv(await readFile(String(args.map), 'utf8'))) manual.set(r.old_path, r.new_path);

// タイトルの「｜店名」などの後ろを外して比べる（サイト名の付け方が変わっても中身が同じなら同じとみなす）
const core = (t) => t.split(/\s*[|｜–—]\s*|\s+-\s+/)[0].trim();

function candidates(oldPath) {
  if (manual.has(oldPath)) return [manual.get(oldPath)];
  const list = [oldPath];
  const trimmed = oldPath.replace(/\/+$/, '');
  if (trimmed && trimmed !== oldPath) list.push(trimmed);
  if (prefix && oldPath !== '/') {
    const slug = trimmed.split('/').filter(Boolean).pop();
    if (slug) list.push(prefix + slug, prefix + slug + '/');
  }
  return list;
}

const results = await pool(oldRows, 4, async (o) => {
  let hit = null;
  const tried = [];
  for (const path of candidates(o.path)) {
    const r = await get(newBase + path);
    tried.push(`${path}=${r.status}`);
    if (r.status === 200) { hit = { path, r }; break; }
  }
  if (!hit) return { o, tried, found: false };
  const p = parsePage(hit.r.body, hit.r.finalUrl);
  return {
    o, tried, found: true, newPath: hit.path, page: p,
    noindex: /noindex/i.test(p.robots + ' ' + (hit.r.headers.get('x-robots-tag') || '')),
  };
});

// 見つかった新ページの画像と、同じサイト内へのリンクが切れていないか
const newHost = new URL(newBase).host;
const assetCheck = new Map();
for (const r of results.filter((x) => x.found)) {
  for (const u of r.page.images) if (!assetCheck.has(u)) assetCheck.set(u, { kind: 'image', from: r.newPath });
  for (const u of r.page.links) {
    try { if (new URL(u).host === newHost && !assetCheck.has(u)) assetCheck.set(u, { kind: 'link', from: r.newPath }); } catch {}
  }
}
const assetUrls = [...assetCheck.keys()];
const assetStatus = await pool(assetUrls, 6, async (u) => (assetCheck.get(u).kind === 'image' ? (await sizeOf(u)).status : (await get(u)).status));
const broken = assetUrls.map((u, i) => ({ u, s: assetStatus[i], ...assetCheck.get(u) })).filter((a) => a.s !== 200);

// 書き出し
await writeFile(join(out, 'compare.csv'), csv([
  ['old_path', 'new_path', 'found', 'tried', 'old_title', 'new_title', 'title_same', 'old_description', 'new_description', 'description_same', 'new_noindex', 'new_canonical'],
  ...results.map((r) => [
    r.o.path, r.newPath || '', r.found ? 'yes' : 'NO', r.tried.join(' '),
    r.o.title, r.page?.title || '', r.found ? (core(r.o.title) === core(r.page.title) ? 'yes' : 'NO') : '',
    r.o.description, r.page?.description || '', r.found ? (r.o.description.trim() === r.page.description.trim() ? 'yes' : 'NO') : '',
    r.found ? (r.noindex ? 'yes' : 'no') : '', r.page?.canonical || '',
  ]),
]));
const redirects = results.filter((r) => r.found && r.newPath !== r.o.path).map((r) => `${r.o.path} ${r.newPath} 301`);
await writeFile(join(out, 'redirects.txt'), redirects.join('\n') + (redirects.length ? '\n' : ''));
await writeFile(join(out, 'broken.csv'), csv([['kind', 'url', 'status', 'found_on'], ...broken.map((b) => [b.kind, b.u, b.s, b.from])]));

const found = results.filter((r) => r.found);
const missing = results.filter((r) => !r.found);
const titleNg = found.filter((r) => core(r.o.title) !== core(r.page.title));
const descNg = found.filter((r) => r.o.description.trim() !== r.page.description.trim());
const indexable = found.filter((r) => !r.noindex);
const summary = `# 旧→新の照合結果

- 調べた日時：${new Date().toISOString()}
- 新サイト：${newBase}
- 旧サイトで開けたURL：${results.length}
- 新サイトで見つかった：${found.length}（転送が要るもの：${redirects.length}）
- 新サイトに無い：${missing.length}
- タイトルが違う：${titleNg.length}
- 説明文（description）が違う：${descNg.length}
- 画像の表示切れ：${broken.filter((b) => b.kind === 'image').length}
- サイト内のリンク切れ：${broken.filter((b) => b.kind === 'link').length}
${args['expect-noindex'] ? `- noindex が付いていないページ：${indexable.length}（テスト公開中は 0 であること）\n` : ''}
## 新サイトに無いURL（先頭50件）
${missing.slice(0, 50).map((r) => `- ${r.o.path}（試したパス: ${r.tried.join(' ')}）`).join('\n') || '- なし'}

## 画像の表示切れ・リンク切れ（先頭50件）
${broken.slice(0, 50).map((b) => `- [${b.kind}] ${b.s || 'エラー'} ${b.u}（${b.from}）`).join('\n') || '- なし'}
`;
await writeFile(join(out, 'summary.md'), summary);
console.log(summary);
if (args['expect-noindex'] && indexable.length) process.exitCode = 2;
