# 本番切り替え前のチェックリスト（familycleaning.jp）

最終更新：2026-10-23　／　印：`[x]` 確認済み　`[ ]` 未確認

> 本番のドメイン切り替え（DNS 変更）・WordPress の停止や削除・旧サーバーの解約・テスト公開は、**店主の OK をもらってから**。このリストが全部 `[x]` になってから OK をもらう。

## 1. URL と転送
- [ ] 旧サイトの全URL一覧を作った（`tools/inventory.mjs` → `out/old/urls.csv`）
- [ ] `/sentaku/`・`/shop/` の別WordPressのURLも一覧に入れた（メインのサイトマップには出てこない。扱いは ISSUES の D-2）
- [ ] 新サイトの URL の形を決めた（ISSUES の D-1）
- [ ] 旧URL → 新URL の転送表を作った（`tools/compare.mjs` → `out/compare/redirects.txt`）
- [ ] 転送表を新サイトに入れ、旧URLを開くと新URLに 301 で飛ぶことを確かめた
- [ ] 「新サイトに無い」URL が 0 件（またはわざと消すものだけ）

## 2. リンク切れ・画像の表示切れ
- [ ] サイト内のリンク切れ 0 件（`out/compare/broken.csv`）
- [ ] 画像の表示切れ 0 件（同上）
- [ ] 画像の住所が新サイト側（R2）になっていて、旧サーバーを見ていない（旧サーバー解約で消えないこと）
- [ ] スマホで、トップ・よく読まれる記事3本・固定ページ3枚を目で見た

## 3. title / description
- [ ] title が全ページ引き継がれている（`compare.csv` の title_same が全部 yes、違うものは理由がある）
- [ ] description が全ページ引き継がれている（description_same）
- [ ] canonical が本番の住所（`https://familycleaning.jp/...`）を指している

## 4. サイトマップ・robots.txt
- [ ] テスト中：全ページ noindex（`compare.mjs --expect-noindex` が 0 件で終わる）
- [ ] 切り替え直前：noindex を外す手順を用意した（どの設定を変えるか）
- [ ] 切り替え後：`/robots.txt` に `Sitemap:` 行があり、検索をふさいでいない
- [ ] 切り替え後：`/sitemap.xml` が開け、全ページが入っている

## 5. 動く機能
- [ ] 洗濯表示チェッカー：テスト用サイトの `/sentaku-checker/` で開ける
- [ ] 洗濯表示チェッカー：7問→判定まで進める（スマホ・ダークモード）
- [ ] 洗濯表示チェッカー：結果のボタン（洗剤・比較記事・宅配・LINE）とシェアボタンが正しい先に飛ぶ
- [ ] 洗濯表示チェッカー：テスト中は noindex 版、本番は noindex なしの版を置く
  - [x] noindex 版を作る道具を作り、手元のブラウザで7問→判定までエラーなしを確認（2026-10-23）
- [ ] お問い合わせ：受け方を決めた（ISSUES の D-3）・実際に1件送って届いた
- [ ] LINE の相談ボタンが全ページで正しい（`page.line.me/801ktflm`）
- [ ] 電話番号のリンク（tel:）がスマホで押せる
- [ ] ネットショップ（STORES）・宅配クリーニングへのリンクが開ける
- [ ] RSS（使っていれば）

## 6. ドメインの設定（メールを止めない）
- [ ] 切り替え前に DNS を全件書き出した：`node tools/dns-export.mjs --domain familycleaning.jp --out out/dns-before.json`
- [ ] 今の DNS 管理画面（サーバー会社・ドメイン会社）の一覧をスクショで控えた（DKIM は外から全部は見えないため）
- [ ] MX・SPF（`v=spf1`）・DKIM（`_domainkey`）・DMARC（`_dmarc`）・mail 系のレコードを、新しい DNS（Cloudflare）にも同じ値で入れた
- [ ] 切り替え後に照合した：`node tools/dns-export.mjs --domain familycleaning.jp --out out/dns-after.json --compare out/dns-before.json` で、MX・TXT・mail 系の違いが 0 件
- [ ] 切り替え後に、店のメールアドレスへ外から1通送って届き、店から外へ1通送って届いた

## 7. 切り替え後に Google Search Console で確認すること
- [ ] 所有者の確認が切れていない（DNS の TXT で確認している場合は、その TXT も引き継ぐ）
- [ ] 「サイトマップ」に新しい `sitemap.xml` を送信し、「成功」になった
- [ ] 「URL 検査」でトップと記事2本を調べ、「URL は Google に登録されています」または「登録をリクエスト」
- [ ] 「ページ」（インデックス登録）の「見つかりませんでした（404）」が増えていない（1週間・2週間後に見る）
- [ ] 「検索パフォーマンス」の表示回数・クリック数が大きく落ちていない（切り替え前の4週間と比べる）
- [ ] 旧URLが「リダイレクトがあるページ」として扱われている

## 8. 戻せるようにする
- [ ] 切り替え前の WordPress を丸ごとバックアップした（ファイル＋データベース）
- [ ] 旧サーバーは、切り替え後しばらく（目安1か月）解約しない
- [ ] 元に戻すときの手順（DNS を元の値に戻す）を書いた。DNS の値は `out/dns-before.json`
