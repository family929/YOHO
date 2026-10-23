import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [D, S] = process.argv.slice(2);
const html = fs.readFileSync(D + '/hp-notice.html', 'utf8');
const css = fs.readFileSync(D + '/hp-notice.css', 'utf8');
const cocoonLike = `body{margin:0;font-family:"Noto Sans JP",sans-serif;background:#fff;color:#333}
.article{max-width:860px;margin:0 auto;padding:16px;font-size:18px;line-height:1.8}
.article p{margin:0 0 1.8em}.article h2{background:#f6f6f6;padding:20px}`;
const page = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=block" rel="stylesheet">
<style>${cocoonLike}</style><style>${css}</style></head><body><main class="article"><div class="entry-content">${html}</div></main></body></html>`;
fs.writeFileSync(S + '/hp-preview.html', page);
const SRC = `いつもファミリークリーニングをご利用いただき、ありがとうございます。
台風の接近に伴い、お客様とスタッフの安全を第一に考え、10月25日（日）・26日（月）の2日間を臨時休業とさせていただきます。
【営業再開】10月27日（火）より通常どおり営業いたします。
【お預かり品について】この期間にお仕上がり予定のお品物は、27日以降にお受け取りいただけます。宅配でお預かりしているお品物は、発送・お届けが数日遅れる場合がございます。
台風の状況により予定が変わる場合は、改めてお知らせいたします。
ご不便をおかけいたしますが、何卒ご理解のほどよろしくお願い申し上げます。`;
const n = s => s.replace(/\s+/g, '');
const b = await chromium.launch();
for (const [name, w] of [['phone375', 375], ['phone320', 320], ['pc1280', 1280]]) {
  const p = await b.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2 });
  await p.goto('file://' + S + '/hp-preview.html', { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => ({
    text: document.querySelector('.fc-typhoon').innerText,
    hscroll: document.documentElement.scrollWidth > window.innerWidth,
    minFont: Math.min(...[...document.querySelectorAll('.fc-typhoon p')].map(e => parseFloat(getComputedStyle(e).fontSize))),
  }));
  console.log(name, 'text=' + (n(r.text) === n(SRC) ? 'OK' : 'NG'), 'hscroll=' + r.hscroll, 'minFont=' + r.minFont + 'px');
  await p.locator('.fc-typhoon').screenshot({ path: `${S}/hp-${name}.png` });
}
await b.close();
