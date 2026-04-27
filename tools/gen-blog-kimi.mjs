#!/usr/bin/env node
// Generate 10 long-tail JP SEO blog articles via Kimi k2.6 (Anthropic-compat)
// Saves /tmp/blog-articles-batch.json (the 10 new articles, schema-matched to existing KV)
// AND /tmp/blog-merged.json (existing 118 + new 10 = 128 total)

import fs from 'node:fs';
import path from 'node:path';

const KIMI_API_KEY = process.env.KIMI_API_KEY;
if (!KIMI_API_KEY) { console.error('KIMI_API_KEY missing'); process.exit(1); }

const KIMI_URL = 'https://api.kimi.com/coding/v1/messages';
const MODEL = 'kimi-k2.6';

const SPECS = [
  { slug: 'siberian-allergy-test-real', title: 'サイベリアンは本当にアレルギーが出ない？Fel d1 タンパク質と相性チェックの完全ガイド', kw: 'サイベリアン アレルギー テスト', cat: 'allergy', tags: ['サイベリアン','アレルギー','Fel d1','低アレルゲン','大阪'], stage: 'mid' },
  { slug: 'first-time-cat-checklist-osaka', title: '初めて子猫を迎える方へ：大阪・関西で揃えたいもの完全チェックリスト', kw: '子猫 迎え 準備 大阪', cat: 'kitten', tags: ['子猫','お迎え準備','大阪','チェックリスト'], stage: 'mid' },
  { slug: 'siberian-coat-color-guide', title: 'サイベリアンの毛色完全図鑑：シルバータビー / ブルーリンクスポイント / ネヴァマスカレードの違い', kw: 'サイベリアン 毛色 違い', cat: 'breed', tags: ['サイベリアン','毛色','シルバータビー','ネヴァマスカレード'], stage: 'top' },
  { slug: 'kitten-socialization-3to12-weeks', title: '子猫の社会化期 (生後3〜12週) — 大阪・福楽キャッテリーの育て方', kw: '子猫 社会化 時期', cat: 'kitten', tags: ['子猫','社会化期','育て方','ブリーダー'], stage: 'mid' },
  { slug: 'spay-neuter-timing-siberian', title: 'サイベリアンの去勢・避妊手術はいつがいい？月齢別ガイド', kw: '去勢 避妊 タイミング サイベリアン', cat: 'health', tags: ['去勢','避妊','サイベリアン','月齢'], stage: 'bottom' },
  { slug: 'first-week-arrival-tips', title: '子猫が家に来た最初の1週間：ストレスを減らす5つのコツ', kw: '子猫 迎えた日 1週間', cat: 'kitten', tags: ['子猫','お迎え','ストレス','1週間'], stage: 'bottom' },
  { slug: 'siberian-vs-bsh-vs-ragdoll', title: 'サイベリアン・ブリティッシュショートヘア・ラグドール どれが向いてる？性格・お手入れ・価格を徹底比較', kw: 'サイベリアン BSH ラグドール 比較', cat: 'breed', tags: ['サイベリアン','ブリティッシュショートヘア','ラグドール','比較'], stage: 'top' },
  { slug: 'breeder-visit-flow-osaka', title: '大阪のブリーダー見学はどう進む？予約から契約までの全ステップ', kw: 'ブリーダー 見学 流れ 大阪', cat: 'breeder', tags: ['ブリーダー','見学','大阪','契約'], stage: 'mid' },
  { slug: 'hcm-pkd-test-explained', title: 'HCM・PKD遺伝子検査の意味と、ブリーダー選びで確認すべきポイント', kw: 'サイベリアン HCM PKD 検査', cat: 'health', tags: ['HCM','PKD','遺伝子検査','ブリーダー'], stage: 'mid' },
  { slug: 'siberian-kitten-feeding-guide', title: 'サイベリアン子猫の食事ガイド — 月齢・量・おすすめフード', kw: 'サイベリアン 子猫 食事 量', cat: 'nutrition', tags: ['サイベリアン','子猫','食事','フード'], stage: 'bottom' },
];

// stagger publish dates across past 2 weeks for organic look
const STAGGER_DAYS = [13, 11, 9, 7, 5, 4, 3, 2, 1, 0]; // days back from today
function stagDate(i) {
  const d = new Date('2026-04-26T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - STAGGER_DAYS[i]);
  // pseudo-random hour offset for realism
  d.setUTCHours(9 + (i % 8), (i * 7) % 60, 0, 0);
  return d.toISOString();
}

function buildPrompt(spec) {
  return `あなたは大阪・城東区にある「福楽キャッテリー」(サイベリアン専門ブリーダー、第一種動物取扱業220012A、200+卒業猫、2025年全国1位アワード受賞) のオウンドメディア編集者です。
以下のスペックに従って、日本語ブログ記事を1本書いてください。

## 記事仕様
- スラッグ: ${spec.slug}
- タイトル: ${spec.title}
- ターゲットキーワード: ${spec.kw}
- 想定読者: ${spec.stage === 'top' ? '購入検討前 (品種比較中)' : spec.stage === 'mid' ? '購入を真剣に検討' : '迎えた直後の飼い主'}
- 文字数 (body_html 内のテキストのみ): 1500〜2200字程度
- 構成 (必須):
  1. 導入リード (1段落、フックで読者の悩みを言語化)
  2. H2 セクション 3〜5本
  3. 各 H2 の下に H3 形式の Q&A を 1〜2個 (AI検索エンジンの抽出向け)
  4. 適宜 <ul><li> の箇条書き
  5. 結びの段落 (ソフトCTA)
- 内部リンク (本文中に最低2つ): /booking.html, /siberian.html, /faq.html, /kittens.html から選んで <a href="...">アンカーテキスト</a> 形式
- LINE誘導 (結びに含める): <a href="https://page.line.me/915hnnlk">LINE公式</a>
- 信頼要素として以下を本文に1〜2回自然に織り込む (羅列ではなく):
  - 大阪・城東区の小規模キャッテリー
  - 第一種動物取扱業 220012A
  - 200頭以上の卒業猫
  - 2025年全国1位アワード受賞
- 禁止事項:
  - 中国語・英語の混入 (固有名詞のローマ字は可)
  - <html> <body> <head> ラッパー
  - <script> や inline style
  - 事実の捏造 (上記4要素以外の数字・場所・受賞は書かない)
- スタイル: 親身で丁寧、断定しすぎず「〜が一般的です」「〜と言われています」など適度にやわらかく

## 出力形式 (JSONのみ、コードブロック・前置き・後置き一切不要)
{
  "slug": "${spec.slug}",
  "title": "...",
  "excerpt": "...(140〜160字の要約)",
  "body_html": "<p>...</p><h2>...</h2><h3>...</h3><p>...</p>...",
  "tags": ["...", "..."],
  "category": "${spec.cat}"
}`;
}

async function callKimi(messages, max_tokens = 4000, retries = 2) {
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
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

function extractJson(text) {
  // strip code fences if any
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  // find first { ... last }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON braces found');
  return JSON.parse(t.slice(start, end + 1));
}

function validate(art, spec) {
  const errors = [];
  if (art.slug !== spec.slug) errors.push(`slug mismatch: ${art.slug}`);
  if (!art.title || art.title.length < 20) errors.push(`title too short`);
  if (!art.excerpt || art.excerpt.length < 80) errors.push(`excerpt too short (${art.excerpt?.length})`);
  if (!art.body_html || art.body_html.length < 1200) errors.push(`body too short (${art.body_html?.length})`);
  const h2Count = (art.body_html.match(/<h2[\s>]/g) || []).length;
  if (h2Count < 3 || h2Count > 6) errors.push(`H2 count out of range: ${h2Count}`);
  if (!/page\.line\.me\/915hnnlk/.test(art.body_html)) errors.push(`missing LINE link`);
  const internalLinks = (art.body_html.match(/href="\/(?:booking|siberian|faq|kittens)\.html"/g) || []).length;
  if (internalLinks < 1) errors.push(`no internal links`);
  if (!Array.isArray(art.tags) || art.tags.length < 3) errors.push(`tags too few`);
  // Chinese contamination check (Han chars used by Chinese but rarely JP — heuristic)
  // Actually JP uses kanji; instead check for typical CJK simplified-only or English sentences.
  if (/[a-zA-Z]{15,}/.test(art.body_html.replace(/<[^>]+>/g, '').replace(/https?:\/\/\S+/g, ''))) {
    // long English run outside tags/urls — flag
    errors.push(`possible English contamination`);
  }
  return errors;
}

function toKvSchema(art, spec, idx, baseId) {
  const publishedAt = stagDate(idx);
  return {
    slug: art.slug,
    title: { ja: art.title, en: '', zh: '' },
    excerpt: { ja: art.excerpt, en: '', zh: '' },
    content: { ja: art.body_html, en: '', zh: '' },
    category: art.category || spec.cat,
    coverImage: '/images/blog-placeholder.svg',
    tags: art.tags || spec.tags,
    published: true,
    publishedAt,
    createdAt: publishedAt,
    updatedAt: '2026-04-26T13:30:00.000Z',
    id: `art_${baseId + idx + 1}`,
  };
}

(async () => {
  // load existing
  const existing = JSON.parse(fs.readFileSync('/tmp/articles-current.json', 'utf-8'));
  const ids = existing.map(a => parseInt((a.id || 'art_0').replace('art_', '')) || 0);
  const baseId = Math.max(...ids);
  console.log(`Existing articles: ${existing.length}, base id: art_${baseId}`);

  const newArticles = [];
  let totalIn = 0, totalOut = 0;
  const todos = [];

  for (let i = 0; i < SPECS.length; i++) {
    const spec = SPECS[i];
    console.log(`\n[${i + 1}/10] ${spec.slug}`);
    const messages = [{ role: 'user', content: buildPrompt(spec) }];
    let parsed = null;
    let lastErr = null;
    for (let pass = 0; pass < 2 && !parsed; pass++) {
      try {
        const resp = await callKimi(messages, 4000, 2);
        const text = resp.content?.[0]?.text || '';
        totalIn += resp.usage?.input_tokens || 0;
        totalOut += resp.usage?.output_tokens || 0;
        const candidate = extractJson(text);
        const errors = validate(candidate, spec);
        if (errors.length === 0) {
          parsed = candidate;
        } else {
          lastErr = `validation: ${errors.join('; ')}`;
          console.log(`  pass ${pass + 1} validation errors:`, errors.join(' | '));
          // patch in retry: ask Kimi to fix
          if (pass === 0) {
            messages.push({ role: 'assistant', content: text });
            messages.push({ role: 'user', content: `修正してください。問題: ${errors.join(' / ')}。再度JSON1個だけ出力。` });
          }
        }
      } catch (e) {
        lastErr = e.message;
        console.log(`  pass ${pass + 1} error:`, e.message);
      }
    }
    if (!parsed) {
      console.log(`  SKIPPED — last error: ${lastErr}`);
      todos.push({ slug: spec.slug, error: lastErr });
      continue;
    }
    const kvArt = toKvSchema(parsed, spec, i, baseId);
    const charCount = parsed.body_html.replace(/<[^>]+>/g, '').length;
    console.log(`  OK — ${charCount}字`);
    newArticles.push(kvArt);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Generated: ${newArticles.length}/10`);
  console.log(`Skipped (TODO): ${todos.length}`, todos);
  console.log(`Tokens — input: ${totalIn}, output: ${totalOut}, total: ${totalIn + totalOut}`);

  // word counts
  newArticles.forEach(a => {
    const cc = (a.content.ja || '').replace(/<[^>]+>/g, '').length;
    console.log(`  ${a.slug}: ${cc}字`);
  });

  fs.writeFileSync('/tmp/blog-articles-batch.json', JSON.stringify(newArticles, null, 2));
  fs.writeFileSync('/tmp/blog-merged.json', JSON.stringify([...existing, ...newArticles]));
  fs.writeFileSync('/tmp/blog-gen-summary.json', JSON.stringify({
    generated: newArticles.length,
    skipped: todos,
    tokens: { input: totalIn, output: totalOut, total: totalIn + totalOut },
    slugs: newArticles.map(a => a.slug),
    titles: newArticles.map(a => a.title.ja),
  }, null, 2));
  console.log(`\nWrote: /tmp/blog-articles-batch.json (${newArticles.length} new)`);
  console.log(`Wrote: /tmp/blog-merged.json (${existing.length + newArticles.length} total)`);
})();
