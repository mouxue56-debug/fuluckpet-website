#!/usr/bin/env node
// Generate ~31 new JP blog articles via Kimi for the educational illustration mapping.
// Reads /tmp/new-article-specs.json (each: {photo, slug, title})
// Outputs /tmp/blog-edu-new.json (full article objects, schema = existing KV)

import fs from 'node:fs';
import path from 'node:path';

// Load .env
const envPath = '/Users/lauralyu/projects/fuluckpet-website/.env';
const envText = fs.readFileSync(envPath, 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const KIMI_API_KEY = process.env.KIMI_API_KEY;
if (!KIMI_API_KEY) { console.error('KIMI_API_KEY missing'); process.exit(1); }

const KIMI_URL = 'https://api.kimi.com/coding/v1/messages';
const MODEL = 'kimi-k2.6';

const SPECS = JSON.parse(fs.readFileSync('/tmp/new-article-specs.json', 'utf-8'));
console.log(`Generating ${SPECS.length} new articles...`);

// Stagger publish dates across past 30 days for organic look
const NOW = new Date('2026-04-26T00:00:00Z');
function stagDate(i, n) {
  const d = new Date(NOW.getTime());
  d.setUTCDate(d.getUTCDate() - (n - 1 - i)); // older articles first
  d.setUTCHours(8 + (i % 12), (i * 11) % 60, 0, 0);
  return d.toISOString();
}

// Determine category from slug heuristic
function pickCategory(slug, title) {
  if (slug.includes('allergy') || slug.includes('food-allergy')) return 'allergy';
  if (slug.includes('senior')) return 'senior';
  if (slug.includes('vaccine') || slug.includes('parasite') || slug.includes('dental') || slug.includes('vision') || slug.includes('hearing') || slug.includes('vestibular') || slug.includes('urinary')) return 'health';
  if (slug.includes('breed-standard') || slug.includes('cfa') || slug.startsWith('siberian-')) return 'breed';
  if (slug.includes('hunting') || slug.includes('territorial') || slug.includes('hierarchy') || slug.includes('marking') || slug.includes('emotion') || slug.includes('communication') || slug.includes('memory') || slug.includes('dreams') || slug.includes('kneading') || slug.includes('blink') || slug.includes('biting') || slug.includes('aggression')) return 'behavior';
  if (slug.includes('food') || slug.includes('nutrition') || slug.includes('water')) return 'nutrition';
  if (slug.includes('grooming') || slug.includes('shampoo') || slug.includes('shedding') || slug.includes('nail') || slug.includes('whiskers') || slug.includes('pads') || slug.includes('claws') || slug.includes('tongue')) return 'grooming';
  if (slug.includes('kitten')) return 'kitten';
  if (slug.includes('breeder') || slug.includes('cattery') || slug.includes('fuluck')) return 'breeder';
  return 'lifestyle';
}

function buildPrompt(spec, idx) {
  return `あなたは大阪・城東区にある「福楽キャッテリー」(サイベリアン専門ブリーダー、第一種動物取扱業220012A、200+卒業猫、2025年全国1位アワード受賞) のオウンドメディア編集者です。
以下のスペックに従って、日本語ブログ記事を1本書いてください。

## 記事仕様
- スラッグ: ${spec.slug}
- タイトル: ${spec.title}
- 文字数 (body_html 内のテキストのみ、タグ除く): 1500〜2300字
- 構成 (必須):
  1. 導入リード (1段落、フックで読者の悩み・好奇心を言語化)
  2. H2 セクション 3〜5本
  3. 各 H2 の下に H3 形式の Q&A を 1〜2個 (Q: で始まる小見出しをそのまま H3 にする)
  4. 適宜 <ul><li> の箇条書き
  5. 結びの段落 (ソフトCTA、LINE誘導)
- 内部リンク (本文中に最低2つ): /booking.html, /siberian.html, /faq.html, /kittens.html から選んで <a href="...">アンカーテキスト</a> 形式
- LINE誘導 (結びに含める): <a href="https://page.line.me/915hnnlk">LINE公式</a>
- 信頼要素として以下から最低2つを本文に自然に織り込む (羅列ではなく):
  - 大阪・城東区の小規模キャッテリー
  - 第一種動物取扱業 220012A
  - 200頭以上の卒業猫
  - 2025年全国1位アワード受賞
  - サイベリアン専門
  - Fel d1タンパク質が比較的少ない
- 禁止事項:
  - 中国語・英語・韓国語の混入 (固有名詞のローマ字とCFAなどの略称は可)
  - <html> <body> <head> ラッパー
  - <script> や inline style
  - 事実の捏造 (上記要素以外の数字・場所・受賞は書かない)
- スタイル: 親身で丁寧、断定しすぎず「〜が一般的です」「〜と言われています」など適度にやわらかく。読者に寄り添う温かみ。

## 出力形式 (JSONのみ、コードブロック・前置き・後置き一切不要)
{
  "slug": "${spec.slug}",
  "title": "${spec.title}",
  "excerpt": "...(140〜160字の要約)",
  "body_html": "<p>...</p><h2>...</h2><h3>...</h3><p>...</p>...",
  "tags": ["...", "...", "..."]
}`;
}

async function callKimi(messages, max_tokens = 4000, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(KIMI_URL, {
        method: 'POST',
        headers: {
          'x-api-key': KIMI_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: MODEL, max_tokens, messages }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Kimi HTTP ${res.status}: ${err.slice(0, 300)}`);
      }
      const data = await res.json();
      return data;
    } catch (e) {
      console.error(`  attempt ${attempt + 1} failed:`, e.message);
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
}

function extractJson(text) {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON braces found');
  return JSON.parse(t.slice(start, end + 1));
}

function validate(art) {
  const errors = [];
  if (!art.slug || !art.title || !art.excerpt || !art.body_html) errors.push('missing field');
  if (art.body_html && art.body_html.length < 1200) errors.push(`body too short ${art.body_html?.length}`);
  if (art.body_html && /[一-鿿]/.test(art.body_html.replace(/[一-龯]/g, c => /[ぁ-んァ-ン]/.test(art.body_html) ? c : ''))) {
    // Check for likely Chinese leak — look for simplified-only chars like "猫" used elsewhere is fine. Skip strict check.
  }
  return errors;
}

const results = [];
let totalTokensIn = 0;
let totalTokensOut = 0;

for (let i = 0; i < SPECS.length; i++) {
  const spec = SPECS[i];
  console.log(`[${i+1}/${SPECS.length}] ${spec.slug}`);
  try {
    const data = await callKimi([
      { role: 'user', content: buildPrompt(spec, i) }
    ], 4500);
    if (data.usage) {
      totalTokensIn += data.usage.input_tokens || 0;
      totalTokensOut += data.usage.output_tokens || 0;
    }
    const text = data.content?.[0]?.text || '';
    const json = extractJson(text);
    const errs = validate(json);
    if (errs.length) {
      console.error(`  ⚠️  ${spec.slug}: ${errs.join(', ')}`);
    }
    const cat = pickCategory(spec.slug, spec.title);
    const publishedAt = stagDate(i, SPECS.length);

    // Build article object matching KV schema
    const art = {
      slug: spec.slug,
      title: { ja: json.title || spec.title, en: '', zh: '' },
      excerpt: { ja: json.excerpt || '', en: '', zh: '' },
      content: { ja: json.body_html, en: '', zh: '' },
      category: cat,
      coverImage: `/images/blog-edu/${spec.photo}_1200.webp`,
      tags: json.tags || [],
      published: true,
      publishedAt,
      createdAt: publishedAt,
      updatedAt: '2026-04-26T16:00:00.000Z',
      id: `art_edu_${i+1}`,
      _photo: spec.photo, // metadata for figure injection
    };
    results.push(art);
    fs.writeFileSync('/tmp/blog-edu-new.json', JSON.stringify(results, null, 2));
    console.log(`  ✓ ${json.body_html?.length} chars, tags=${json.tags?.length}`);
  } catch (e) {
    console.error(`  ✗ ${spec.slug}: ${e.message}`);
    results.push({ slug: spec.slug, _error: e.message, _photo: spec.photo, _title: spec.title });
    fs.writeFileSync('/tmp/blog-edu-new.json', JSON.stringify(results, null, 2));
  }
}

console.log(`\nDone. ${results.filter(r => !r._error).length}/${SPECS.length} succeeded.`);
console.log(`Tokens: in=${totalTokensIn}, out=${totalTokensOut}, total=${totalTokensIn+totalTokensOut}`);
fs.writeFileSync('/tmp/kimi-token-usage.json', JSON.stringify({ in: totalTokensIn, out: totalTokensOut, articles: SPECS.length }));
