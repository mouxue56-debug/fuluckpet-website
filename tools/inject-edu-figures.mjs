#!/usr/bin/env node
// Step 5: For photos that match existing articles, inject <figure> with the edu photo
// after first H2 of body content.ja. Also generate JP figcaptions via Kimi (batch).
//
// Decision rules per spec:
// - edu photos win when topic-specific (replace coverImage to edu photo)
// - SNS photos win for atmospheric articles (founder, family, good morning)
// - Always inject figure inline + keep coverImage updated to edu photo for matched articles
//
// Inputs: /tmp/photo-mapping.json (77 entries), /tmp/all-articles.json (136 KV)
// Outputs: /tmp/blog-merged.json (136 + new = 167 articles, with figures injected)

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.FULUCK_REPO_ROOT
  ? path.resolve(process.env.FULUCK_REPO_ROOT)
  : path.resolve(import.meta.dirname, '..');
const envPath = process.env.FULUCK_ENV_FILE || path.join(ROOT, '.env');
const envText = fs.readFileSync(envPath, 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const KIMI_API_KEY = process.env.KIMI_API_KEY;

const KIMI_URL = 'https://api.kimi.com/coding/v1/messages';
const MODEL = 'kimi-k2.6';

// Topics that should KEEP their Wave F SNS atmosphere photo (don't override coverImage)
// Any article with these slugs: keep SNS coverImage, just inject inline edu figure
const KEEP_SNS_COVER = new Set([
  'fuluck-founder-story', // 12_family_warmth — atmospheric
]);

const photoMap = JSON.parse(fs.readFileSync('/tmp/photo-mapping.json', 'utf-8'));
const articles = JSON.parse(fs.readFileSync('/tmp/all-articles.json', 'utf-8'));
const newArticles = JSON.parse(fs.readFileSync('/tmp/blog-edu-new.json', 'utf-8'));

console.log(`Existing articles: ${articles.length}`);
console.log(`New articles from Kimi: ${newArticles.length}`);
console.log(`Photo mapping entries: ${photoMap.length}`);

// Build slug -> [photos...] mapping (multiple photos can match one article)
const slugToPhotos = {};
for (const m of photoMap) {
  if (m.decision !== 'match-existing') continue;
  if (!slugToPhotos[m.target_slug]) slugToPhotos[m.target_slug] = [];
  slugToPhotos[m.target_slug].push(m.photo);
}
const matchedSlugs = Object.keys(slugToPhotos);
console.log(`Slugs with matched edu photos: ${matchedSlugs.length}`);

// ---- Step A: Generate figcaptions in BATCH ----
// For each (slug, photo) pair, ask Kimi for a 30-50 char JP figcaption
// Batch 8-10 pairs per call
const captionPairs = [];
for (const m of photoMap) {
  if (m.decision !== 'match-existing') continue;
  const art = articles.find(a => a.slug === m.target_slug);
  if (!art) continue;
  captionPairs.push({
    photo: m.photo,
    slug: m.target_slug,
    title: art.title.ja,
    excerpt: art.excerpt.ja.slice(0, 120),
  });
}

// Also new articles need figcaption
for (const a of newArticles) {
  if (a._error) continue;
  captionPairs.push({
    photo: a._photo,
    slug: a.slug,
    title: a.title.ja,
    excerpt: a.excerpt.ja.slice(0, 120),
    is_new: true,
  });
}

console.log(`Total caption pairs to generate: ${captionPairs.length}`);

async function callKimi(messages, max_tokens = 2000, retries = 3) {
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
        throw new Error(`Kimi HTTP ${res.status}: ${err.slice(0, 200)}`);
      }
      return await res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

const photoTopics = {
  K01_origin: 'サイベリアン品種の歴史と起源',
  K02_breed_standard: 'CFA公式品種スタンダードの図解',
  K03_personality: 'サイベリアンの性格特性チャート',
  K04_hypoallergenic: 'Fel d1低アレルゲン特性の解説',
  H01_HCM: 'HCM(肥大型心筋症)の心臓構造',
  H02_vaccine: '子猫のワクチンスケジュール',
  H03_daily_care: '毎日の健康ケアチェック項目',
  C01_new_kitten: '新しい子猫を迎える準備',
  C02_socialization: '生後3-12週の社会化トレーニング',
  C03_body_language: 'しっぽと耳のボディランゲージ',
  C01_nutrition: '子猫の月齢別栄養バランス',
  C02_allergy: 'フードアレルギー症状チャート',
  C03_urinary: '下部尿路疾患の予防図解',
  C04_dental: '歯磨きと歯周病ケア',
  G01_deworming: '内部・外部寄生虫の駆虫スケジュール',
  G02_nutrition: 'ドライ vs ウェットフード比較',
  G03_grooming: '長毛種のブラッシング道具と手順',
  G04_nail_trim: '爪切りの安全な角度と頻度',
  G05_bath: '猫の正しい洗い方ステップ',
  G06_common_diseases: '猫がかかりやすい病気の早期サイン',
  G07_dental_care: '歯磨きの方法と頻度',
  G08_environment_safety: '室内の危険スポット10箇所',
  P02_kitten_raising: 'キャッテリーでの子猫育成プロセス',
  P03_choose_kitten: '価格に影響する要素の図解',
  P04_reviews: '卒業生からのフィードバック集計',
  P05_support: 'アフターサポート体制',
  P06_delivery: '関西から全国への配送オプション',
  P07_price: '子猫価格の決定要素',
  P08_visit_booking: '見学予約から契約までの流れ',
  T01_allergy_friendly: 'Fel d1低タンパク質の特性',
  T02_first_cat_mistakes: '新人飼い主が犯しがちな失敗',
  T03_family_multi_pet: '家庭環境別マッチング',
  T04_why_choose: '福楽キャッテリーの強み',
  T05_breed_comparison: '人気3品種の徹底比較',
  T06_daily_life: 'キャッテリーの一日の流れ',
  T07_customer_story: '卒業猫の成長物語',
  T08_booking_guide: '予約・契約のステップ',
  X01_coat_colors: 'サイベリアンの毛色図鑑',
  X02_seasonal_shedding: '四季の換毛サイクル',
  X03_age_chart: '猫年齢と人間年齢の換算表',
  X04_weight_management: '理想体重とBCS判定',
  X05_play_exercise: '年齢別の遊び方と運動量',
  X06_sleep_habits: '猫の睡眠サイクルと寝姿',
  X07_moving_travel: '引っ越し・旅行のストレス対策',
  X08_senior_care: 'シニア猫のケアポイント',
  Y01_advanced_body_language: '上級ボディランゲージ読解',
  Y02_meow_meanings: '12種の鳴き声の意味',
  Y03_social_hierarchy: '多頭飼いの社会的順位',
  Y04_stress_signs: 'ストレスサインの見抜き方',
  Y05_play_aggression: '遊び攻撃と本気噛みの違い',
  Y06_marking_behavior: 'マーキング・スプレー行動',
  Y07_hunting_instinct: '狩りの4段階',
  Y08_territorial: '縄張り意識と空間構造',
  Z01_senses: '猫の五感のスペクトル',
  Z02_taste: '味蕾の数と甘味受容体',
  Z03_thermoregulation: '体温調節と暑さ対策',
  Z04_jumping: 'ジャンプ力と骨格構造',
  Z05_whiskers: 'ひげの感覚野の役割',
  Z06_paw_pads: '肉球のクッション機能',
  Z07_slow_blink: 'ゆっくり瞬きの信頼サイン',
  Z08_kneading: 'ふみふみ行動の起源',
  A01_dreams: 'レム・ノンレム睡眠サイクル',
  A02_memory: '短期・長期記憶のメカニズム',
  A03_emotions: '猫の感情表現スペクトル',
  A04_communication: 'ゴロゴロ音の周波数と意味',
  A05_play_toys: 'おもちゃの種類と知育効果',
  A06_spatial: '3D空間認知の能力',
  A07_magnetoreception: '磁気感覚と帰巣本能',
  A08_history: '9500年の猫と人の共進化',
  B01_cat_tongue: '舌のザラザラ(糸状乳頭)の構造',
  B02_claws: '引き込み式爪のメカニズム',
  B03_righting_reflex: '空中での立ち直り反射',
  B04_balance: '内耳前庭器官のバランス機能',
  B05_drinking: '舌での水の引き上げ方',
  B06_pupils: '縦長スリット瞳孔の役割',
  B07_hearing: '超音波聴取域',
  B08_smell: 'ヤコブソン器官と嗅覚',
};

function buildCaptionPrompt(batch) {
  const list = batch.map((p, i) => `${i+1}. 写真ID: ${p.photo} (${photoTopics[p.photo] || ''})\n   記事タイトル: ${p.title}\n   記事概要: ${p.excerpt}`).join('\n\n');
  return `以下の写真と記事のペアそれぞれに、図解写真の内容を説明する figcaption (日本語、30〜50字) を書いてください。

ルール:
- 単に「〜の図」ではなく、図解の中身と記事の主張をリンクさせる
- 例: 写真「水を飲む流体力学」+ 記事「水分補給」→ 「猫が水を飲む際の独特な流体力学。だから少量ずつ何度も飲む習性がある」
- 30〜50字、句点なしも可
- 出力は JSON 配列のみ、コードブロック・前置き・後置き不要

入力:
${list}

出力形式:
[
  {"photo": "K01_origin", "caption": "..."},
  {"photo": "K02_breed_standard", "caption": "..."},
  ...
]`;
}

const captions = {};
const BATCH_SIZE = 10;
let captionTokensIn = 0;
let captionTokensOut = 0;

for (let i = 0; i < captionPairs.length; i += BATCH_SIZE) {
  const batch = captionPairs.slice(i, i + BATCH_SIZE);
  console.log(`Caption batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(captionPairs.length/BATCH_SIZE)} (${batch.length} items)`);
  try {
    const data = await callKimi([
      { role: 'user', content: buildCaptionPrompt(batch) }
    ], 2500);
    if (data.usage) {
      captionTokensIn += data.usage.input_tokens || 0;
      captionTokensOut += data.usage.output_tokens || 0;
    }
    let text = data.content?.[0]?.text || '';
    text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    const arr = JSON.parse(text.slice(start, end + 1));
    for (const item of arr) {
      // key by photo+slug for uniqueness across multiple article assignments
      const orig = batch.find(b => b.photo === item.photo);
      if (orig) {
        const key = `${item.photo}::${orig.slug}`;
        captions[key] = item.caption;
      }
    }
    console.log(`  ✓ ${arr.length} captions`);
  } catch (e) {
    console.error(`  ✗ batch failed: ${e.message}`);
    // fallback: use topic
    for (const p of batch) {
      const key = `${p.photo}::${p.slug}`;
      captions[key] = photoTopics[p.photo] || `${p.title}の図解`;
    }
  }
}

fs.writeFileSync('/tmp/figcaptions.json', JSON.stringify(captions, null, 2));
console.log(`\nGenerated ${Object.keys(captions).length} captions. Tokens: in=${captionTokensIn} out=${captionTokensOut}`);

// ---- Step B: Inject figure into existing matched articles ----
function injectFigure(html, photo, caption, alt) {
  const fig = `\n\n    <figure class="blog-figure">\n      <img src="/images/blog-edu/${photo}_1200.webp" alt="${alt}" width="1200" height="1200" loading="lazy">\n      <figcaption>${caption}</figcaption>\n    </figure>\n\n`;
  // Insert AFTER the first <h2>...</h2> that does NOT already have a figure right after it.
  // Strategy: find first </h2>, check if next 200 chars include 'blog-figure', if not insert.
  const h2EndRe = /<\/h2>/g;
  let match;
  while ((match = h2EndRe.exec(html)) !== null) {
    const idx = match.index + match[0].length;
    const window = html.slice(idx, idx + 300);
    if (window.includes('blog-figure') && window.indexOf('blog-figure') < 100) {
      // already has figure right after this h2 — skip and try the next h2
      continue;
    }
    // insert here
    return html.slice(0, idx) + fig + html.slice(idx);
  }
  // No h2 found — append at top
  return fig + html;
}

// Replace existing wave-F figure if we have a more specific edu photo
function replaceOrInsertFigure(html, photo, caption, alt) {
  const fig = `<figure class="blog-figure">\n      <img src="/images/blog-edu/${photo}_1200.webp" alt="${alt}" width="1200" height="1200" loading="lazy">\n      <figcaption>${caption}</figcaption>\n    </figure>`;
  // Find existing wave-F figure (uses /images/blog/NN_*.webp)
  const waveFFigureRe = /<figure class="blog-figure">\s*<img src="\/images\/blog\/[^"]+"[^>]*>\s*<figcaption>[^<]*<\/figcaption>\s*<\/figure>/;
  if (waveFFigureRe.test(html)) {
    return html.replace(waveFFigureRe, fig);
  }
  // No wave-F figure found — try inject after first h2
  return injectFigure(html, photo, caption, alt);
}

const updatedArticles = articles.map(a => ({ ...a }));
const articleBySlug = {};
updatedArticles.forEach(a => articleBySlug[a.slug] = a);

let injected = 0;
let coverUpdated = 0;
const photoUsageCount = {}; // photo -> count

for (const m of photoMap) {
  if (m.decision !== 'match-existing') continue;
  const art = articleBySlug[m.target_slug];
  if (!art) continue;
  const captionKey = `${m.photo}::${m.target_slug}`;
  const caption = captions[captionKey] || photoTopics[m.photo] || `${art.title.ja}の図解`;
  const alt = (photoTopics[m.photo] || art.title.ja).slice(0, 80);

  // Inject figure into body (replace wave-F figure or insert new)
  const oldHtml = art.content.ja;
  art.content.ja = replaceOrInsertFigure(oldHtml, m.photo, caption, alt);
  if (art.content.ja !== oldHtml) injected++;

  // Update coverImage unless this article is in KEEP_SNS_COVER
  if (!KEEP_SNS_COVER.has(m.target_slug)) {
    art.coverImage = `/images/blog-edu/${m.photo}_1200.webp`;
    coverUpdated++;
  }

  art.updatedAt = '2026-04-26T16:30:00.000Z';
  photoUsageCount[m.photo] = (photoUsageCount[m.photo] || 0) + 1;
}

console.log(`\nFigures injected/replaced: ${injected}`);
console.log(`Cover images updated to edu: ${coverUpdated}`);
console.log(`Photos used 0 times: ${Object.keys(photoTopics).filter(p => !photoUsageCount[p]).filter(p => photoMap.find(m => m.photo === p && m.decision === 'match-existing')).length}`);

// ---- Step C: For NEW articles, inject figure after first h2 ----
const finalNewArticles = [];
for (const a of newArticles) {
  if (a._error) {
    console.error(`Skipping errored: ${a.slug}`);
    continue;
  }
  const captionKey = `${a._photo}::${a.slug}`;
  const caption = captions[captionKey] || photoTopics[a._photo] || `${a.title.ja}の図解`;
  const alt = (photoTopics[a._photo] || a.title.ja).slice(0, 80);
  // Inject figure after first H2
  const newHtml = injectFigure(a.content.ja, a._photo, caption, alt);
  const cleaned = {
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    content: { ja: newHtml, en: '', zh: '' },
    category: a.category,
    coverImage: a.coverImage,
    tags: a.tags,
    published: true,
    publishedAt: a.publishedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    id: a.id,
  };
  finalNewArticles.push(cleaned);
  photoUsageCount[a._photo] = (photoUsageCount[a._photo] || 0) + 1;
}

console.log(`\nNew articles ready: ${finalNewArticles.length}`);

// Merge: existing 136 (updated) + new
const merged = [...updatedArticles, ...finalNewArticles];
fs.writeFileSync('/tmp/blog-merged.json', JSON.stringify(merged, null, 2));
console.log(`Wrote /tmp/blog-merged.json (${merged.length} articles)`);

// Photo distribution stats
const dist = {};
for (const [photo, count] of Object.entries(photoUsageCount)) {
  dist[count] = (dist[count] || 0) + 1;
}
console.log(`\nPhoto usage distribution:`);
for (const [c, n] of Object.entries(dist).sort((a,b) => Number(a[0])-Number(b[0]))) {
  console.log(`  ${c} use(s): ${n} photos`);
}
const unused = Object.keys(photoTopics).filter(p => !photoUsageCount[p]);
console.log(`Unused photos: ${unused.length} ${unused.length ? '(' + unused.slice(0,5).join(', ') + ')' : ''}`);

fs.writeFileSync('/tmp/photo-usage.json', JSON.stringify({ usage: photoUsageCount, unused }));
fs.writeFileSync('/tmp/figcaption-tokens.json', JSON.stringify({ in: captionTokensIn, out: captionTokensOut }));
