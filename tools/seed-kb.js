#!/usr/bin/env node
/*
 * tools/seed-kb.js — emit pinned Wrangler commands to seed the
 * static knowledge-base chunks consumed by retrieveKnowledge() in api/worker.js.
 *
 * Usage:
 *   node tools/seed-kb.js              # print the seed commands to stdout
 *   node tools/seed-kb.js > /tmp/seed.sh && (cd api && bash /tmp/seed.sh)
 *
 * The emitted commands always use --remote. Wrangler otherwise defaults to
 * local KV, which would leave production chat knowledge unchanged.
 *
 * The chunks below were pre-cleaned with Kimi (kimi-k2.6) from raw HTML
 * extracts of siberian.html / about.html / index.html / booking.html so the
 * AI assistant can ground answers without parsing live HTML at runtime.
 *
 * Regenerate after major HTML copy changes:
 *   1. Adjust the raw extracts below (or re-run the cleanup against Kimi using
 *      `KIMI_API_KEY` from .env).
 *   2. Run `node tools/seed-kb.js | tee /tmp/seed.sh` and inspect the pinned commands.
 *   3. Restart the worker (or simply re-deploy) — retrieveKnowledge() reads the
 *      latest values on every chat turn.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { CONFIG } = require('../boarding-public-config.js');
const { formatCareKnowledge } = require('./care-catalog-static.js');

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// 1) Raw HTML extractor — kept so owners can verify the source-of-truth still
//    contains the same facts. Output only used as a sanity check, not seeded.
// ---------------------------------------------------------------------------
function strip(html) {
  return html
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSection(html, anchor) {
  const re = new RegExp(
    `<section[^>]*id=["']${anchor}["'][^>]*>([\\s\\S]*?)</section>`,
    'i',
  );
  const m = html.match(re);
  return m ? strip(m[1]) : '';
}

function readIfExists(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return ''; }
}

const sources = {
  'siberian.html': readIfExists(path.join(ROOT, 'siberian.html')),
  'about.html':    readIfExists(path.join(ROOT, 'about.html')),
  'index.html':    readIfExists(path.join(ROOT, 'index.html')),
  'booking.html':  readIfExists(path.join(ROOT, 'booking.html')),
};

// ---------------------------------------------------------------------------
// 2) Cleaned KB chunks — Kimi-distilled facts the chat assistant should cite.
//    Each value is plain Japanese; the emitter caps values at 8,000 characters
//    and the Worker reads a bounded excerpt for each retrieval.
// ---------------------------------------------------------------------------
function buildChunks(config = CONFIG) {
  return {
  'kb:siberian':
    'サイベリアンはロシア原産の天然猫種で、千年以上の歴史を持つ。人為的な交配ではなく自然淘汰によって生まれた「ナチュラルブリード」である。ロシアでは「国宝」とも称される。極寒の気候に適応したトリプルコート（防水性あり）を持ち、力強い体格と人間との深い絆が特徴。CFAの現行猫種プロファイル（https://cfa.org/breed/siberian/）による成猫体重の目安は、オス約5.4〜8.2kg、メス約3.6〜5.4kg（原文はオス12〜18lb、メス8〜12lb）。体重や成長速度には個体差がある。性格は穏やかで忠実、遊び好き。寿命は12-15年。近年、Fel d1タンパク質の分泌量が他の猫種より少ないことが研究で示され、猫アレルギーをお持ちの方にも人気が高まっている。ただし個体差があり、完全にアレルゲンフリーではない。当舎ではアレルギーが心配な方に、見学時に相性チェックの時間を長めに設けることが可能。お迎え前にアレルギー検査を受けることを推奨する。',

  'kb:about':
    '福楽キャッテリーは大阪のサイベリアン専門ブリーダー。代表取締役は羅方遠（ラホウエン）。法人名は福楽株式会社、所在地は大阪府大阪市城東区。家庭的な環境で子猫を育て、わんちゃんやうさぎ、フェレットと共に暮らす環境により自然な社会化トレーニングを実施。受賞歴として、みんなの子猫ブリーダーにて2025年上半期全国サイベリアンブリーダーお客様評価第一位、2025年下半期全国第二位、2025年下半期大阪府第一位を受賞。衛生管理として毎日の清掃と空気清浄システムを完備し、ワクチン接種・健康チェック・ウイルス検査を実施。生後60日頃からシャワーとドライヤーの練習を開始し、お迎え前に爪切り・シャンプーを実施する。',

  'kb:visit':
    '見学は完全予約制で、希望日時は予約ページまたはLINEから伝える。現地見学に加え、LINEビデオ通話は事前相談・オンライン見学として利用できる。見学時間は約30分〜1時間。場所は大阪市城東区東中浜で、詳細住所は予約時に案内する。契約前には登録事業所で子猫の現物確認と対面説明が必要で、ビデオ通話だけでは売買契約を成立させられない。お届け方法は空輸、関西圏の陸送、猫舎での直接お迎え。予約フォーム送信後はメールまたはLINEで連絡し、フォームが苦手な方はLINEから相談できる。',

  'kb:pricing':
    '子猫の料金は猫種・血統・カラーなどにより個体ごとに異なる。最新の金額は各子猫ページで確認するか、LINEで問い合わせる。サイベリアン以外にもブリティッシュショートヘア・ブリティッシュロングヘア・ラグドールも取り扱う。支払い条件・予約金などの詳細はLINEで個別にご案内。',

  'kb:health':
    'すべての親猫に対して遺伝子検査を実施。PKD（多発性嚢胞腎）の遺伝子検査を全親猫に実施し、陰性を確認して繁殖。HCM（肥大型心筋症）の遺伝子検査も実施し、心臓の健康を確認。遺伝子検査の結果は証明書として保管し、ご希望の方には提示可能。子猫の引渡し時には両親の検査結果を伝える。ワクチン接種・健康チェック・ウイルス検査を実施。毎日の清掃と空気清浄システムで衛生管理。',

  'kb:aftercare':
    'お迎え後のサポートはLINEで永続的に提供。食事・健康管理・しつけなど、いつでもご相談可能。末永くサポートを行う。お迎え前には生後60日頃からシャワーとドライヤーの練習を開始し、爪切り・シャンプーを実施して新しい家族への馴染みを支援。ずっと寄り添うパートナーとしての関係を目指している。',

  'kb:boarding':
    formatCareKnowledge(config),

  'kb:legal':
    `動物取扱業者として正式に登録。福楽株式会社の事業所「福楽ペット」は大阪市城東区東中浜6丁目10番7号、動物取扱責任者は羅方遠。登録は販売220012A、保管220012B、貸出し220012C、展示220012E。登録年月日2022年4月27日、有効期限2027年4月26日。
販売目的の繁殖は販売登録に含まれ、独立した登録種別ではない。Fulluck Kittyは販売240051A、有効期限2029年7月16日。`,
  };
}

// ---------------------------------------------------------------------------
// 3) Emit shell commands. Owner pipes into bash from the api/ directory.
// ---------------------------------------------------------------------------
function shellEscape(s) {
  // wrap in single quotes; escape embedded single quotes
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

function main(args = process.argv.slice(2)) {
  const chunks = buildChunks(CONFIG);
  if (args.includes('--check') || args.includes('-c')) {
  // Sanity check mode — print extract sizes side-by-side with chunk sizes.
  console.error('# RAW EXTRACT SIZES (sanity)');
  console.error('# siberian.html (full strip):', strip(sources['siberian.html']).length);
  console.error('# about.html    (full strip):', strip(sources['about.html']).length);
  console.error('# index.html#visit         :', extractSection(sources['index.html'], 'visit').length);
  console.error('# index.html#faq           :', extractSection(sources['index.html'], 'faq').length);
  console.error('# booking.html  (full strip):', strip(sources['booking.html']).length);
  console.error('# CLEANED CHUNK SIZES');
  for (const [k, v] of Object.entries(chunks)) console.error(`# ${k}: ${v.length}`);
  console.error('# (use without --check to emit pinned Wrangler commands)');
    return;
  }

console.log('# Auto-generated by tools/seed-kb.js — run from api/ directory.');
console.log('# Example: cd api && bash /tmp/seed.sh');
console.log('# Each command writes a static knowledge-base chunk into remote KV (binding=DATA).');
console.log('');
  let count = 0;
  for (const [k, v] of Object.entries(chunks)) {
    if (!v || !v.trim()) continue;
    const safe = v.slice(0, 8000);
    console.log(`npx --yes wrangler@4.70.0 kv key put --binding=DATA --remote ${shellEscape(k)} ${shellEscape(safe)}`);
    count++;
  }
  console.log('');
  console.log(`# Total: ${count} chunks (kb:* keys)`);
}

if (require.main === module) main();

module.exports = { buildChunks, extractSection, main, shellEscape, strip };
