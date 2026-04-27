#!/usr/bin/env node
// Step 5b: Inject <figure> + update og:image + JSON-LD + blog-cover for the 46 EXISTING
// static blog HTML files matched to edu photos.
// Reads /tmp/photo-mapping.json + /tmp/figcaptions.json
// Modifies in-place: blog/{slug}.html

import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/lauralyu/projects/fuluckpet-website';
const BLOG_DIR = path.join(ROOT, 'blog');

const KEEP_SNS_COVER = new Set(['fuluck-founder-story']);

const photoMap = JSON.parse(fs.readFileSync('/tmp/photo-mapping.json', 'utf-8'));
const captions = JSON.parse(fs.readFileSync('/tmp/figcaptions.json', 'utf-8'));

const photoTopics = {
  K01_origin: 'サイベリアン品種の歴史と起源',
  K02_breed_standard: 'CFA公式品種スタンダード',
  K03_personality: 'サイベリアンの性格特性',
  K04_hypoallergenic: 'Fel d1低アレルゲン特性',
  H01_HCM: 'HCM心臓構造比較',
  H02_vaccine: '子猫のワクチンスケジュール',
  H03_daily_care: '毎日の健康ケアチェック',
  C01_new_kitten: '新しい子猫を迎える準備',
  C02_socialization: '社会化トレーニング',
  C03_body_language: 'しっぽと耳のボディランゲージ',
  C01_nutrition: '子猫の月齢別栄養',
  C02_allergy: 'フードアレルギー症状',
  C03_urinary: '下部尿路疾患の予防',
  C04_dental: '歯磨きと歯周病ケア',
  G01_deworming: '寄生虫の駆虫スケジュール',
  G02_nutrition: 'ドライ vs ウェットフード',
  G03_grooming: '長毛種のブラッシング',
  G04_nail_trim: '爪切りの安全な角度',
  G05_bath: '猫の正しい洗い方',
  G06_common_diseases: '猫がかかりやすい病気のサイン',
  G07_dental_care: '歯磨きの方法',
  G08_environment_safety: '室内の危険スポット',
  P02_kitten_raising: 'キャッテリーでの子猫育成',
  P03_choose_kitten: '価格の決定要素',
  P04_reviews: '卒業生フィードバック集計',
  P05_support: 'アフターサポート体制',
  P06_delivery: '関西から全国への配送',
  P07_price: '子猫価格の決定要素',
  P08_visit_booking: '見学予約から契約までの流れ',
  T01_allergy_friendly: 'Fel d1低タンパク質',
  T02_first_cat_mistakes: '新人飼い主が犯しがちな失敗',
  T03_family_multi_pet: '家庭環境別マッチング',
  T04_why_choose: '福楽キャッテリーの強み',
  T05_breed_comparison: '人気3品種の比較',
  T06_daily_life: 'キャッテリーの一日',
  T07_customer_story: '卒業猫の成長物語',
  T08_booking_guide: '予約・契約のステップ',
  X01_coat_colors: 'サイベリアンの毛色図鑑',
  X02_seasonal_shedding: '四季の換毛サイクル',
  X03_age_chart: '猫年齢と人間年齢の換算',
  X04_weight_management: '理想体重とBCS判定',
  X05_play_exercise: '年齢別の遊びと運動量',
  X06_sleep_habits: '猫の睡眠サイクル',
  X07_moving_travel: '引っ越し・旅行ストレス対策',
  X08_senior_care: 'シニア猫のケアポイント',
  Y01_advanced_body_language: '上級ボディランゲージ',
  Y02_meow_meanings: '12種の鳴き声',
  Y03_social_hierarchy: '多頭飼いの社会的順位',
  Y04_stress_signs: 'ストレスサイン',
  Y05_play_aggression: '遊び攻撃と本気噛み',
  Y06_marking_behavior: 'マーキング行動',
  Y07_hunting_instinct: '狩りの段階',
  Y08_territorial: '縄張り意識',
  Z01_senses: '猫の五感',
  Z02_taste: '味蕾と味覚',
  Z03_thermoregulation: '体温調節',
  Z04_jumping: 'ジャンプ力と骨格',
  Z05_whiskers: 'ひげの感覚野',
  Z06_paw_pads: '肉球のクッション機能',
  Z07_slow_blink: 'ゆっくり瞬きの信頼サイン',
  Z08_kneading: 'ふみふみ行動',
  A01_dreams: 'レム睡眠サイクル',
  A02_memory: '記憶のメカニズム',
  A03_emotions: '感情表現スペクトル',
  A04_communication: 'ゴロゴロ音の周波数',
  A05_play_toys: 'おもちゃと知育効果',
  A06_spatial: '3D空間認知',
  A07_magnetoreception: '磁気感覚と帰巣本能',
  A08_history: '猫と人の共進化',
  B01_cat_tongue: '舌のザラザラ構造',
  B02_claws: '引き込み式爪のメカニズム',
  B03_righting_reflex: '空中での立ち直り反射',
  B04_balance: '内耳前庭器官のバランス',
  B05_drinking: '舌での水の引き上げ方',
  B06_pupils: '縦長スリット瞳孔',
  B07_hearing: '超音波聴取域',
  B08_smell: 'ヤコブソン器官と嗅覚',
};

let processed = 0;
let coverUpdated = 0;
let figuresInjected = 0;
let figuresReplaced = 0;
let ogUpdated = 0;
let jsonLdUpdated = 0;
let skipped = [];

for (const m of photoMap) {
  if (m.decision !== 'match-existing') continue;
  const slug = m.target_slug;
  const file = path.join(BLOG_DIR, `${slug}.html`);
  if (!fs.existsSync(file)) {
    skipped.push(slug);
    continue;
  }
  let html = fs.readFileSync(file, 'utf-8');
  const photo = m.photo;
  const captionKey = `${photo}::${slug}`;
  const caption = captions[captionKey] || photoTopics[photo] || '';
  const alt = (photoTopics[photo] || '猫の図解').slice(0, 70);
  const newCover = `/images/blog-edu/${photo}_1200.webp`;
  const keepSns = KEEP_SNS_COVER.has(slug);

  // 1. Update og:image (unless keep_sns)
  if (!keepSns) {
    const newOg = `<meta property="og:image" content="https://fuluckpet.com${newCover}">`;
    if (/<meta property="og:image"[^>]+>/.test(html)) {
      const before = html;
      html = html.replace(/<meta property="og:image"[^>]+>/, newOg);
      if (before !== html) ogUpdated++;
    }
  }

  // 2. Update JSON-LD image
  if (!keepSns) {
    const before = html;
    // Match: "image":"https://fuluckpet.com/images/..."
    html = html.replace(
      /("image"\s*:\s*)"https:\/\/fuluckpet\.com\/images\/blog\/[^"]+"/,
      `$1"https://fuluckpet.com${newCover}"`
    );
    if (before !== html) jsonLdUpdated++;
  }

  // 3. Update or insert blog-cover img (the hero image at top of <article>)
  if (!keepSns) {
    const before = html;
    const newImgTag = `<img src="${newCover}" alt="${alt}" class="blog-cover">`;
    if (/<img[^>]+class="blog-cover"[^>]*>/.test(html)) {
      html = html.replace(/<img[^>]+class="blog-cover"[^>]*>/, newImgTag);
    }
    if (before !== html) coverUpdated++;
  }

  // 4. Inject or replace <figure class="blog-figure"> after first <h2>
  // First check if there's an existing figure pointing to /images/blog/ — replace it
  const figRe = /<figure class="blog-figure">[\s\S]*?<\/figure>/;
  const newFigure = `<figure class="blog-figure">
      <img src="${newCover}" alt="${alt}" width="1200" height="1200" loading="lazy">
      <figcaption>${caption}</figcaption>
    </figure>`;
  if (figRe.test(html)) {
    // Replace first existing figure
    const before = html;
    html = html.replace(figRe, newFigure);
    if (before !== html) figuresReplaced++;
  } else {
    // Insert after first </h2>
    const h2Match = html.match(/<\/h2>/);
    if (h2Match) {
      const idx = h2Match.index + h2Match[0].length;
      html = html.slice(0, idx) + '\n\n    ' + newFigure + '\n\n' + html.slice(idx);
      figuresInjected++;
    }
  }

  fs.writeFileSync(file, html, 'utf-8');
  processed++;
}

console.log(`Processed: ${processed}`);
console.log(`  Cover img updated: ${coverUpdated}`);
console.log(`  Figures replaced: ${figuresReplaced}`);
console.log(`  Figures injected: ${figuresInjected}`);
console.log(`  og:image updated: ${ogUpdated}`);
console.log(`  JSON-LD image updated: ${jsonLdUpdated}`);
if (skipped.length) {
  console.log(`Skipped (no static file): ${skipped.length}`);
  for (const s of skipped) console.log(`  ${s}`);
}
