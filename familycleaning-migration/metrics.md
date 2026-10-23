# 移行前と移行後の数字

最終更新：2026-10-23。**測っていない数字は書かない**（「未計測」とする）。

| 項目 | 旧サイト（WordPress） | 新サイト（Cloudflare / EmDash） | 測った日・方法 |
|---|---|---|---|
| 表示速度（スマホ）PageSpeed の点数 | 未計測 | 未計測 | — |
| 表示速度（スマホ）LCP（いちばん大きい部分が出るまで） | 未計測 | 未計測 | — |
| 表示速度（PC）PageSpeed の点数 | 未計測 | 未計測 | — |
| 表示速度（PC）LCP | 未計測 | 未計測 | — |
| ページ数 | 投稿161・固定40（10/21 記録）／固定41（10/22 の一覧）※外からは未確認 | 未計測（投稿を写した段階） | Notion の記録。`tools/inventory.mjs` で確定させる |
| 画像の合計容量 | 未計測 | 未計測 | `tools/inventory.mjs` の summary.md |
| 月々のサーバー代 | **店主に確認中**（推測で書かない） | 0円（テスト用サイト。Workers・D1・R2・KV とも無料枠、10/21 記録）。本番で有料プランにすれば月5ドル＋ドメイン代は別 | Cloudflare の請求画面 |

- 新サイトの数字は、テスト用サイト（workers.dev）で測る。本番の住所に移したあと、もう一度測って書き足す
- 速度は日によってぶれるので、同じ日に旧・新を続けて3回ずつ測り、真ん中の値を書く

## 測り方

### A. 店主が PageSpeed Insights で測る（1ページ5分）

1. https://pagespeed.web.dev/ を開く
2. `https://familycleaning.jp/` を入れて「分析」
3. 上の「携帯電話」の点数（丸い数字）と、下の「Largest Contentful Paint（LCP）」の秒数を控える
4. 「デスクトップ」に切り替えて、同じく控える
5. 新サイト `https://familycleaning-test.simisodan.workers.dev/` でも 2〜4
6. 同じことを、よく読まれる記事1本（旧と新で同じ記事）でもやる
7. 数字を Claude に伝える（スクショでもよい）

### B. 自宅PCの Claude Code で Lighthouse を使う（自動）

```
npx lighthouse https://familycleaning.jp/ --only-categories=performance --output=json --output-path=old-mobile.json --chrome-flags="--headless"
npx lighthouse https://familycleaning.jp/ --preset=desktop --only-categories=performance --output=json --output-path=old-desktop.json --chrome-flags="--headless"
```
新サイトも同じ。Chrome が入っていれば動く。点数は `categories.performance.score`（×100）、LCP は `audits["largest-contentful-paint"].displayValue`。

### C. ページ数・画像の合計容量

```
node tools/inventory.mjs --base https://familycleaning.jp --out out/old --extra /sentaku-checker/
node tools/inventory.mjs --base https://familycleaning-test.simisodan.workers.dev --out out/new --extra /sentaku-checker/
```
それぞれの `summary.md` の「URL の数」「画像の合計」を上の表に写す。
