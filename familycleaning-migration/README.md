# familycleaning.jp の Cloudflare（EmDash）移行

| ファイル | 中身 |
|---|---|
| `ISSUES.md` | 残りの修正（優先度・種類つき）と、店主に決めてほしいこと |
| `php-version-check.md` | 旧WordPressの PHP の版の確かめ方（PHP2Shell 対策） |
| `launch-checklist.md` | 本番切り替え前のチェックリスト |
| `metrics.md` | 移行前と移行後の数字 |
| `work-log.md` | 作業時間の記録（種類ごとの合計を一番上に） |
| `MIGRATION-PLAYBOOK.md` | 他のお店でも使える移行の手順書 |
| `tools/` | 照合の道具（Node.js 18 以上・読むだけ） |

新サイトのソースは自宅PC（`cloudflare-blog` ／ `sns-work\tools\cloudflare`）にあり、このリポジトリには入っていない。

## 道具の動かし方（自宅PC）

```
cd familycleaning-migration\tools
node inventory.mjs --base https://familycleaning.jp --out out\old --extra /sentaku-checker/
node inventory.mjs --base https://familycleaning-test.simisodan.workers.dev --out out\new --extra /sentaku-checker/
node dns-export.mjs --domain familycleaning.jp --out out\dns-before.json
node compare.mjs --old out\old\urls.csv --new-base https://familycleaning-test.simisodan.workers.dev --out out\compare --try-prefix /posts/ --expect-noindex
```

`out\` には結果が出る（Git には入れない）。
