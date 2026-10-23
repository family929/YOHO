// ドメインの DNS 設定を外から全部書き出す（読むだけ）。切り替えの前と後で照合する。
//   切り替え前： node dns-export.mjs --domain example.jp --out out/dns-before.json
//   切り替え後： node dns-export.mjs --domain example.jp --out out/dns-after.json --compare out/dns-before.json
// 注意：DKIM のセレクタ名（xxx._domainkey）は外から一覧できない。よく使われる名前だけ試すので、
//       今の DNS 管理画面の一覧も必ず控えておくこと（MIGRATION-PLAYBOOK.md 参照）。
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs, UA } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.domain || !args.out) {
  console.error('使い方: node dns-export.mjs --domain example.jp --out out/dns-before.json [--names sub1,sub2] [--compare out/dns-before.json]');
  process.exit(1);
}
const d = String(args.domain);
const doh = String(args.doh || 'https://cloudflare-dns.com/dns-query');
const TYPE = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 257: 'CAA' };

const apexTypes = ['A', 'AAAA', 'NS', 'MX', 'TXT', 'CAA', 'SOA'];
const dkimSelectors = ['default', 'google', 'selector1', 'selector2', 'k1', 'k2', 's1', 's2', 'mail', 'dkim', 'x', 'smtp', 'mxvault', 'resend', 'sendgrid', 'mailchimp'];
const subs = ['www', 'mail', 'smtp', 'pop', 'imap', 'webmail', 'ftp', 'autodiscover', 'autoconfig', 'cpanel', 'shop', 'blog'];
const extra = String(args.names || '').split(',').map((s) => s.trim()).filter(Boolean);

const queries = [
  ...apexTypes.map((t) => [d, t]),
  [`_dmarc.${d}`, 'TXT'],
  [`_mta-sts.${d}`, 'TXT'],
  [`_smtp._tls.${d}`, 'TXT'],
  [`_autodiscover._tcp.${d}`, 'SRV'],
  ...dkimSelectors.map((s) => [`${s}._domainkey.${d}`, 'TXT']),
  ...[...subs, ...extra].flatMap((s) => [[`${s}.${d}`, 'CNAME'], [`${s}.${d}`, 'A'], [`${s}.${d}`, 'TXT'], [`${s}.${d}`, 'MX']]),
];

async function ask(name, type) {
  const url = `${doh}?name=${encodeURIComponent(name)}&type=${type}`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/dns-json', 'user-agent': UA } });
    const j = await res.json();
    // CNAME をたどった先の答えも返ってくるので、聞いた名前・型のものだけ残す
    const want = name.replace(/\.$/, '').toLowerCase();
    return (j.Answer || [])
      .filter((a) => a.name.replace(/\.$/, '').toLowerCase() === want && TYPE[a.type] === type)
      .map((a) => a.data)
      .sort();
  } catch (e) {
    return [`ERROR ${e.cause?.code || e.message}`];
  }
}

const records = {};
for (const [name, type] of queries) {
  const ans = await ask(name, type);
  if (ans.length) records[`${name} ${type}`] = ans;
}
// SOA のシリアル番号は更新のたびに変わるので照合から外す
const soaKey = `${d} SOA`;
await writeFile(String(args.out), JSON.stringify({ domain: d, at: new Date().toISOString(), records }, null, 2));

console.log(`# ${d} の DNS（${Object.keys(records).length} 件）`);
for (const [k, v] of Object.entries(records)) console.log(`- ${k}: ${v.join(' / ')}`);

if (args.compare) {
  const before = JSON.parse(await readFile(String(args.compare), 'utf8')).records;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(records)])].filter((k) => k !== soaKey).sort();
  const diff = keys.filter((k) => JSON.stringify(before[k] || []) !== JSON.stringify(records[k] || []));
  console.log(`\n# 切り替え前との違い：${diff.length} 件`);
  for (const k of diff) console.log(`- ${k}\n    前: ${(before[k] || ['（なし）']).join(' / ')}\n    後: ${(records[k] || ['（なし）']).join(' / ')}`);
  console.log('\nA・AAAA・NS・www の違いは切り替えで変わる想定のもの。MX・TXT（SPF・DKIM・DMARC）・mail 系に違いがあれば、メールが届かなくなるおそれがあるので直す。');
  if (diff.some((k) => / (MX|TXT|SRV)$/.test(k) || /^(mail|smtp|pop|imap|autodiscover|webmail)\./.test(k))) process.exitCode = 2;
}
