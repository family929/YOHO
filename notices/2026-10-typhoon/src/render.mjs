// 貼り紙(PDF/PNG)とSNS画像(PNG)を書き出し、文言・はみ出し・フォントを自動チェックする。
// 使い方: NODE_PATH=/opt/node22/lib/node_modules node src/render.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..');

// 依頼文そのまま（改行・空白を除いて照合する）
const SOURCE = `臨時休業のお知らせ
台風接近のため、下記の日程を臨時休業とさせていただきます。
10月25日（日）・10月26日（月）
10月27日（火）より通常営業いたします。
お客様とスタッフの安全を考えての判断です。
ご迷惑をおかけいたしますが、よろしくお願い申し上げます。
ファミリークリーニング`;
const norm = (s) => s.replace(/\s+/g, '');

async function check(page, name) {
  const r = await page.evaluate(async () => {
    await document.fonts.ready;
    const font = document.fonts.check('900 20px "Noto Sans JP"');
    const over = [];
    for (const el of document.querySelectorAll('.page, .page *')) {
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline') {
        over.push(`${el.className || el.tagName}: ${el.scrollWidth}>${el.clientWidth}`);
      }
    }
    const pg = document.querySelector('.page');
    const last = pg.lastElementChild.getBoundingClientRect();
    const box = pg.getBoundingClientRect();
    if (last.bottom > box.bottom) over.push(`page bottom: ${last.bottom}>${box.bottom}`);
    return { font, over, text: pg.innerText };
  });
  const textOk = norm(r.text) === norm(SOURCE);
  console.log(`[${name}] font=${r.font} text=${textOk ? 'OK' : 'NG'} overflow=${r.over.length ? r.over.join(' / ') : 'なし'}`);
  if (!textOk) console.log(r.text);
  return r.font && textOk && r.over.length === 0;
}

const browser = await chromium.launch();
let ok = true;

// A4 = 794×1123 CSS px。300dpi(2480×3508)になるよう倍率をかける
const a4 = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2480 / 794 });
await a4.goto('file://' + path.join(here, 'poster.html'), { waitUntil: 'networkidle' });
ok = (await check(a4, 'poster')) && ok;
await a4.screenshot({ path: path.join(out, 'poster-A4.png'), clip: { x: 0, y: 0, width: 794, height: 1123 } });
await a4.pdf({ path: path.join(out, 'poster-A4.pdf'), format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });

const sq = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
await sq.goto('file://' + path.join(here, 'sns.html'), { waitUntil: 'networkidle' });
ok = (await check(sq, 'sns')) && ok;
await sq.screenshot({ path: path.join(out, 'sns-1080.png') });

await browser.close();
process.exit(ok ? 0 : 1);
