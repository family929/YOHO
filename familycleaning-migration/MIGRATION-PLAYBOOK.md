# WordPress → Cloudflare（EmDash）移行の手順書

小さなお店のサイトを、WordPress から Cloudflare Workers ＋ EmDash に移すときの流れ。どの店でも使えるよう、店の固有情報は書かない（`<店のドメイン>` などに読みかえる）。

- 第1号の実施例で使った道具：`tools/`（Node.js 18 以上。追加のインストール不要。サイトは読むだけで書き込まない）
- 作業時間の実績：`work-log.md`（この手順書の各段階の見積もりは、実績がたまったら書き足す）

## 守ること（全段階で共通）

- 次は**お客様（店主）の OK をもらってから**：DNS の切り替え／WordPress の停止・削除／旧サーバーの解約／テスト公開
- パスワード・ログイン情報は Claude が扱わない。管理画面の操作は、店主向けの手順を書いて店主にやってもらう
- テスト公開は必ず noindex（検索に出さない）。workers.dev の住所のまま公開する
- 測っていない数字・確かめていない事実は書かない（「未計測」「未確認」と書く）
- 作業のたびに `work-log.md` に1行（日付｜内容｜種類｜分）。店主の作業時間は区切りごとに聞いて書く

## 全体の流れ

| 段階 | やること | Claude が自動でやること | 人（店主）がやること |
|---|---|---|---|
| 0. 安全確認 | 旧サイトの PHP の版・WordPress・プラグインの更新状況 | 応答ヘッダーで版が見えるか調べる（`inventory.mjs` の summary） | 見えなければ管理画面で確認（手順書を渡す）。版上げの OK |
| 1. 棚卸し | 全URL・title・description・画像・容量・動く機能の一覧 | サイトマップから全URLを集め、各ページを読んで一覧に（`inventory.mjs`）。動く機能の候補を洗い出す | 「サイトマップに出てこないページ」「別に入れた WordPress」「フォームの送信先」を教える |
| 2. 数字（移行前） | 速度・ページ数・画像容量・サーバー代 | Lighthouse で速度を測る（店主のPCで動かす場合）。ページ数・容量は棚卸しから | 月々のサーバー代を伝える。Lighthouse が使えなければ PageSpeed Insights で測る |
| 3. DNS の控え | MX・SPF・DKIM・DMARC など全件 | 外から引ける分を全部書き出す（`dns-export.mjs`） | DNS 管理画面の一覧をスクショ（DKIM の名前は外から全部は分からない） |
| 4. 決めること | URL の形・別サイトの扱い・問い合わせの受け方・料金プラン | 選択肢を2〜3個にしぼり、おすすめと理由を出す | 決める |
| 5. 新サイトを作る | EmDash を Workers に置く（workers.dev・noindex） | 作る・設定ファイルを書く・投稿と固定ページを写す・画像を R2 に入れる | Cloudflare のログイン・支払い方法の登録・管理者の登録（パスキー） |
| 6. 動く機能 | 自社ツール・問い合わせ・LINE・電話リンク | 静的なツールは `public/` に置く。テスト中は noindex 版（`add-noindex.mjs`） | 決めた受け方で実際に1件送ってみる |
| 7. 照合 | 旧の全URLが新でどうなるか | 同じ住所→決めた住所の順に探し、title・description・noindex・画像切れ・リンク切れを照合。転送表を自動で作る（`compare.mjs`） | スマホで目で見る（トップ・人気記事・固定ページ） |
| 8. 直す | 照合で出たものを直す | 優先度の高いものから「直す→照合し直す→ISSUES.md 更新」 | 迷うものを決める |
| 9. 切り替え前 | `launch-checklist.md` を全部埋める | 埋められるものは自動で確認して印を付ける | 最後に目で確認して OK |
| 10. 切り替え | DNS を Cloudflare へ | 手順書を作る。切り替え後に DNS を照合（`dns-export.mjs --compare`）、全URLを再照合 | DNS の変更ボタンを押す（OK を出した本人が） |
| 11. 切り替え後 | 検索・メール・数字 | 速度とページを測り直して `metrics.md` に書く | Search Console でサイトマップ送信・URL 検査。メールの送受信を確かめる |
| 12. 片付け | 旧サーバー | 解約してよいかの確認リストを作る | 1か月ほど様子を見てから解約 |

## コマンド（店主のPC、または Claude Code で）

```
cd tools
# 1. 棚卸し（旧・新）
node inventory.mjs --base https://<旧サイト> --out out/old --extra /<自社ツールの住所>/
node inventory.mjs --base https://<新サイト>.workers.dev --out out/new --extra /<自社ツールの住所>/
# 3. DNS の控え（切り替え前）
node dns-export.mjs --domain <店のドメイン> --out out/dns-before.json
# 6. 自社ツールのテスト用コピー（noindex つき）
node add-noindex.mjs --in <ツールの index.html> --out <新サイト>/public/<ツール>/index.html
# 7. 照合（新サイトで記事の住所が /posts/記事名 になる場合は --try-prefix /posts/）
node compare.mjs --old out/old/urls.csv --new-base https://<新サイト>.workers.dev --out out/compare --try-prefix /posts/ --expect-noindex
# 10. 切り替え後の DNS 照合（MX・TXT・mail 系の違いがあれば終了コード 2）
node dns-export.mjs --domain <店のドメイン> --out out/dns-after.json --compare out/dns-before.json
```

## つまずきやすいところ（第1号で分かったこと）

- WordPress の「ショートコード」「埋め込み」「テーマ独自の飾り（クラス名つきの枠など）」は EmDash に移らない。写す前に、どの記事に入っているか洗い出す
- EmDash の CLI で Markdown から変換すると、表が使えない。表は HTML の枠で入れるか、箇条書きにする
- 同じドメインの下に、別の WordPress を入れていることがある（例：`/shop/`）。ドメインを丸ごと切り替えると、それも開けなくなる。棚卸しで必ず聞く
- 自社ツールを手でアップロードしている場合、サイトマップに出てこない。`--extra` で足す
- Workers の無料プランは1回の CPU 時間が10ミリ秒まで。EmDash は超えることがあるので、本番は有料プラン（月5ドル）を勧める
- workers.dev の住所では、Cloudflare の AIクローラー設定の画面が出ない。独自ドメインを付けてから設定する。「学習」をブロックすると Googlebot まで止まる
- R2（画像置き場）を使うには、無料でも支払い方法の登録が要る
- WordPress の管理画面で記事を開いたまま、外から同じ記事を書き換えると、管理画面側の保存で上書きされる。写すときは管理画面を閉じてもらう
- クラウド版の Claude Code は、環境のネットワーク許可に入っていないサイトを開けない。照合は店主のPCの Claude Code で動かすか、許可に旧・新サイトと DNS 照会先を足す

## 料金の目安を決めるための記録

- 「移行のみ」と「デザイン込み」の差は、`work-log.md` の「デザイン」の合計時間で判断する
- 1件目は手順づくりの時間が入るので、2件目以降の時間と分けて見る
