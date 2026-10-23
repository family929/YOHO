// テスト公開用に、HTML に「検索に出さない」印（noindex）を付けたコピーを作る。元のファイルは変えない。
//   node add-noindex.mjs --in ../../sentaku-checker/index.html --out out/test-site/sentaku-checker/index.html
// 本番に置くときは、このコピーではなく元のファイルを使う。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.in || !args.out) {
  console.error('使い方: node add-noindex.mjs --in 元.html --out テスト用.html');
  process.exit(1);
}
let html = await readFile(String(args.in), 'utf8');
const tag = '<meta name="robots" content="noindex, nofollow">';
if (/<meta\s+name=["']robots["'][^>]*>/i.test(html)) {
  html = html.replace(/<meta\s+name=["']robots["'][^>]*>/i, tag);
} else if (/<meta\s+charset[^>]*>/i.test(html)) {
  html = html.replace(/(<meta\s+charset[^>]*>)/i, `$1\n${tag}`);
} else {
  console.error('<meta charset> が見つからないので、付ける場所が決められません');
  process.exit(1);
}
await mkdir(dirname(String(args.out)), { recursive: true });
await writeFile(String(args.out), html);
console.log(`noindex を付けたコピーを作りました: ${args.out}`);
