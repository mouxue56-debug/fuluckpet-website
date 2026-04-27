#!/usr/bin/env node
// Wave C — 8 ZERO-OVERLAP differentiated articles
// 5 Osaka/Kansai-local + 3 fuluckpet-exclusive
// Hard rule: ONLY use verifiable KB facts. No fabricated medical/legal/biographical detail.

import fs from 'node:fs';

const KIMI_API_KEY = process.env.KIMI_API_KEY;
if (!KIMI_API_KEY) { console.error('KIMI_API_KEY missing'); process.exit(1); }

const KIMI_URL = 'https://api.kimi.com/coding/v1/messages';
const MODEL = 'kimi-k2.6';

// Verifiable KB — generator is constrained to these facts only
const KB_FACTS = `
[検証済み事実 — これ以外の固有情報は書かない]
- 所在地: 大阪市城東区東中浜（具体的な番地は本文では出さず、LINEで案内）
- 第一種動物取扱業: 220012A（〜2027年4月26日有効）+ 240051A（〜2029年7月16日有効）
- 法人: 福楽株式会社、代表取締役 羅方遠（らほうえん / ラホウエン）
- 卒業猫: 200頭以上
- 受賞: 2025年「みんなの子猫ブリーダー」全国上半期1位 / 全国下半期2位 / 大阪府1位
- 価格帯: ¥160,000〜¥290,000
- 品種: サイベリアン専門（Fel d1タンパク質が比較的少ないとされる猫種）
- 主な販路: LINE公式（page.line.me/915hnnlk）

[書いてはいけないこと]
- 具体的な動物病院名・住所・電話番号・医師名
- 具体的な物流業者名・正確な料金
- 創業者の出身地以外の個人情報（来日時期/家族構成/学歴/業界歴年数など）
- 猫舎の詳細な番地・最寄駅からの徒歩分数の確定値
- アワードの細部（賞金額・選考委員名など）
`;

const SPECS = [
  {
    slug: 'osaka-cat-vet-network',
    title: '大阪市内サイベリアン対応の動物病院ガイド｜城東区・近隣エリアの探し方',
    kw: '大阪 サイベリアン 動物病院',
    cat: 'breeder',
    tags: ['大阪','動物病院','サイベリアン','城東区','病院探し'],
    angle: 'osaka_vets_generic',
    body_guide: `
大阪市内（特に城東区・近隣エリア）でサイベリアンを診てもらう動物病院の「探し方」のガイド。
**重要**: 具体的な病院名・住所・電話番号・医師名は絶対に書かない。代わりに以下の構造で書く:
1. なぜサイベリアンに「相性のいい」病院選びが大切か（長毛種特有の被毛・体格、HCM/PKDなどの遺伝疾患、Fel d1関連の質問対応）
2. 大阪市内・城東区周辺の地域特性（24時間救急が比較的充実、JRと地下鉄でアクセス可、ペット可賃貸も多い等の一般情報）
3. 病院選びの実用チェックリスト — 長毛種の経験／猫専門外来の有無／健診メニュー／救急対応／LINE/予約システム
4. Google マップ検索のコツ — 「動物病院 大阪 城東区」「猫 専門 診察 大阪」などの検索キーワード活用、口コミ・診療科目を見るポイント
5. 福楽キャッテリーが卒業猫の飼い主に行うフォロー — お迎え後にLINEで「相性のいい病院がわからない」と相談された場合に、200頭以上の卒業猫のオーナーから集まった実体験ベースの紹介をご案内可能

(注) 業主は具体的提携病院は公開していない。「LINEで実体験のご紹介可能」という導線にする。`,
  },
  {
    slug: 'kansai-cat-shipping-options',
    title: '関西から全国へ：サイベリアン子猫の空輸・陸送・直接お迎え 比較完全ガイド',
    kw: 'サイベリアン 関西 空輸 陸送',
    cat: 'breeder',
    tags: ['空輸','陸送','関西','サイベリアン','お迎え方法'],
    angle: 'shipping_methods_compare',
    body_guide: `
大阪・関西発の子猫お迎え3ルート（直接来訪 / 陸送 / 空輸）の比較ガイド。
1. 直接お迎え（推奨）— 大阪市城東区まで来ていただく場合のメリット（顔合わせ、親猫確認、引き渡し時の状態説明）と所要時間目安（関東から新幹線で約3時間など一般情報）
2. 陸送 — ペット陸送会社の一般的な仕組み、所要時間、料金は事前見積もりが基本
3. 空輸 — 関西空港・伊丹空港発、ANA/JALのペット預かりルール一般、夏季の温度規制
4. 比較表（H2 + table or list）— ストレス／費用感／所要時間／健康リスク
5. 福楽キャッテリーの方針 — 安全のため直接お迎えを推奨、それ以外の場合はLINEで個別相談

具体的な料金数字は出さず、「業者によって異なるため事前見積もり」で統一。`,
  },
  {
    slug: 'osaka-jouto-access-guide',
    title: '福楽キャッテリーへの見学アクセス｜城東区・東中浜への JR・地下鉄・車ルート',
    kw: '福楽キャッテリー アクセス 城東区',
    cat: 'breeder',
    tags: ['見学','アクセス','城東区','東中浜','大阪'],
    angle: 'access_routes',
    body_guide: `
大阪市城東区東中浜エリアへの一般的な交通アクセスガイド。
**重要**: 具体的な番地・最寄駅からの徒歩分数の確定値・駐車場の正確な情報は絶対に出さない。「詳細住所と地図リンクは予約確定後 LINE でお送りします」というフォーマットを徹底。
1. 城東区東中浜エリアの位置（大阪市東部、JR京橋駅と大阪城公園の北東あたりという一般情報）
2. JR利用 — JR京橋駅、JR鴫野駅などの一般的な近隣駅。乗り換え目安は概ねの方向感のみ
3. 地下鉄 — 中央線・今里筋線などの一般情報。具体的な徒歩分数は書かない
4. 車 — 阪神高速13号東大阪線エリアという一般情報。駐車場の有無は予約確定後LINEで案内
5. 関東・東京方面から — 新幹線で新大阪駅まで約3時間目安、その後は公共交通でお越しいただく一般情報
6. 見学予約フロー — まず /booking.html またはLINE公式で予約 → 予約確定後にLINEで詳細住所と地図リンク送付 → 当日来訪
7. 服装・持ち物 — マスク（呼吸器疾患予防）、消毒準備など一般的な見学マナー

各セクションで「番地・地図リンクは予約確定後にLINEでお送りします」を1〜2回明示する。`,
  },
  {
    slug: 'kansai-vs-kanto-cattery',
    title: '関西 vs 関東のサイベリアン購入｜価格相場・送料・選び方の違い',
    kw: 'サイベリアン 関西 関東 比較',
    cat: 'breeder',
    tags: ['関西','関東','サイベリアン','価格相場','選び方'],
    angle: 'kansai_vs_kanto',
    body_guide: `
関西と関東でサイベリアンを迎える場合の違いを比較。
1. 価格相場 — 関西も関東も¥160,000〜¥290,000程度のレンジが一般的（福楽キャッテリーの実価格として明示OK）。地域による大きな差はないことが多い
2. ブリーダー数 — 関東のほうが数は多いが、サイベリアン専門は全国的に少数。関西では福楽キャッテリーのような専門ブリーダーが希少
3. 送料・移動コスト — 関東から関西への直接お迎えは新幹線で日帰り可能。逆方向も同様
4. 見学のしやすさ — 関東在住なら関東のブリーダーが便利だが、サイベリアン専門の選択肢が限られる場合は関西も検討余地あり
5. アフターサポート — オンライン相談（LINE）が普及しているため、地理的距離は以前ほど障壁ではない
6. どちらを選ぶか — 専門性・実績・親猫確認の機会・価格透明性で判断

福楽キャッテリーの2025年全国1位アワードと200+卒業猫実績を「関西発でも全国規模の信頼」の根拠として2回触れる。`,
  },
  {
    slug: 'osaka-pet-allergy-clinics',
    title: '大阪・関西の猫アレルギー検査ができる病院｜サイベリアンお迎え前のチェック',
    kw: '大阪 猫アレルギー 検査',
    cat: 'allergy',
    tags: ['アレルギー','大阪','検査','サイベリアン','Fel d1'],
    angle: 'allergy_test_locations',
    body_guide: `
大阪・関西で猫アレルギー検査を受けたい人向け、検査の探し方ガイド。
**重要**: 具体的なクリニック名・住所・医師名は出さない。
1. 猫アレルギーとは — Fel d1タンパク質が主因。サイベリアンはFel d1が比較的少ないとされるが、個人差があるためテストが推奨
2. アレルギー検査の種類 — IgE特異的抗体検査（一般的な血液検査）、皮膚プリックテスト、View39など。一般情報
3. 大阪・関西で受けるには — アレルギー科のある総合病院、皮膚科併設クリニック、内科で対応可。Google マップで「アレルギー検査 大阪」「アレルギー科 〇〇区」と検索する一般的な方法
4. 検査前の準備 — 抗ヒスタミン薬の休薬期間、保険適用の有無は医院により異なる
5. 福楽キャッテリーの「お試し抱っこ」サポート — 検査結果が陰性でも実際の猫との相性は別問題。お迎え前に見学で実際にサイベリアンと過ごす時間を作るサポートを行う方針

最後にLINE誘導 — 「アレルギー検査の結果をLINEでご相談ください」`,
  },
  {
    slug: 'fuluck-200-graduates-stories',
    title: '200匹以上の卒業猫から学んだこと｜福楽キャッテリーの独自育成法',
    kw: 'サイベリアン 卒業猫 育成',
    cat: 'breeder',
    tags: ['卒業猫','育成','サイベリアン','社会化','福楽キャッテリー'],
    angle: 'graduates_lessons',
    body_guide: `
福楽キャッテリー独自データ・200頭以上の卒業猫から得られた知見を語る。
**重要**: 具体的な飼い主名・猫名・病歴・住所は書かない。一般化した傾向のみ。
1. 200頭という数字の意味 — 大阪市城東区の小規模キャッテリーで、第一種動物取扱業220012A取得から積み上げてきた信頼の蓄積
2. 卒業猫の傾向（一般化）— 子猫期に社会化トレーニングを受けた猫は新しい家庭に馴染むまでの期間が短い傾向／親猫の遺伝検査を済ませている／お迎え前のFel d1相談を経た飼い主は満足度が高い等
3. 200匹お見送りして見えた「失敗パターン」と対策 — 例: 引き渡し当日の急なストレス → 事前にニオイ付きのタオルを送る／環境変化の段階化／フード継続性の確認
4. 福楽の独自育成法5要素 — 早期社会化（生後3〜12週）／親猫との十分な過ごし時間／人間との毎日のスキンシップ／環境エンリッチメント（多様な音・床材）／お迎え前カウンセリング（LINEで質問対応）
5. 2025年全国1位アワード受賞は「200匹のフィードバックループ」の結果 — 飼い主からの感想を次の育成に反映するサイクル
6. これから迎える人へ — お試し見学とLINE相談の活用方法

数字（200+、220012A、2025年1位）を本文中で2回以上自然に触れる。`,
  },
  {
    slug: 'fuluck-2025-award-1st-reasons',
    title: '2025年全国第1位を受賞した理由｜福楽キャッテリーが選ばれる5つの強み',
    kw: '福楽キャッテリー 2025年 1位',
    cat: 'breeder',
    tags: ['アワード','2025年','全国1位','サイベリアン','選び方'],
    angle: 'why_we_won',
    body_guide: `
2025年「みんなの子猫ブリーダー」全国上半期1位 / 大阪府1位を受賞した背景を、KB事実から推論される5つの強みとして整理。
1. 受賞概要 — 2025年「みんなの子猫ブリーダー」全国上半期1位、全国下半期2位、大阪府1位（事実）
2. 強み1: サイベリアンに特化した小規模専門ブリーダー — 城東区東中浜の小規模キャッテリーで、品種を絞ることで遺伝・社会化の専門性を高めている
3. 強み2: 200頭以上の卒業実績 — 飼い主からのフィードバックを次の育成に反映するサイクル
4. 強み3: 第一種動物取扱業220012A（〜2027/4/26）+ 240051A（〜2029/7/16）— 法令遵守の二重ライセンス
5. 強み4: 価格透明性 — ¥160,000〜¥290,000の明確な価格帯を公開
6. 強み5: アフターサポート重視 — LINE公式での質問対応、お迎え後のフォローアップ
7. これら5つは「数字や受賞名」だけでなく、200+件の卒業猫体験で実証された強み

事実検証可能な情報のみで構成。`,
  },
  {
    slug: 'fuluck-founder-story',
    title: 'なぜ大阪でサイベリアン専門ブリーダー？福楽キャッテリー創業の理由',
    kw: '福楽キャッテリー 創業 サイベリアン 大阪',
    cat: 'breeder',
    tags: ['創業','大阪','サイベリアン','福楽株式会社','専門ブリーダー'],
    angle: 'founder_business_story',
    body_guide: `
**重要**: 創業者の個人プライベート情報（来日時期/家族/教育/趣味/年齢/業界歴年数など）は完全に書かない。
公開事実のみ使用 = 代表取締役 羅方遠（ラホウエン、中国出身）、現在大阪で福楽キャッテリーを運営、福楽株式会社、第一種動物取扱業220012A + 240051A取得、2025年全国1位アワード受賞。
個人biographyではなく「業務ロジック」=「なぜ大阪を選んだか・なぜサイベリアン専門にしたか」を書く。

構成:
1. なぜサイベリアン専門？（業務ロジック）— Fel d1タンパク質が比較的少ない品種としてアレルギー需要に応えられる、温厚な性格・大柄でファミリー向き、近年の人気上昇トレンド、長毛で美しい外見、ロシア原産の頑健さ。「アレルギーで猫を諦めかけていた人にも選択肢を」という市場ニーズ
2. なぜ大阪を選んだか（業務ロジック）— 関西は西日本のハブで全国アクセス良好、城東区は JR・地下鉄・阪神高速のアクセス便利、ペット可賃貸が比較的多い地域特性、東京一極集中ではなく関西発のサイベリアン専門ブリーダーとして希少価値
3. なぜ法人化した？（福楽株式会社）— 個人ブリーダーから法人へ。第一種動物取扱業220012A + 240051Aの二重取得で長期的な責任体制を構築。法人としての持続性・透明性
4. 200頭以上の卒業猫が示すこと — 飼い主からのフィードバックを次の育成に反映するサイクルが回り、2025年全国1位アワードという形で評価された
5. 代表からのメッセージ — 「お気軽にLINEでご相談ください」のソフトCTA

文体は「代表の」一人称ではなく、第三者視点（編集部視点）で書く。代表取締役 羅方遠の名前は1〜2回程度の自然言及にとどめる。`,
  },
];

// Stagger 8 articles across 2026-04-15 to 2026-04-27
const STAGGER_DATES = [
  '2026-04-15T10:30:00.000Z',
  '2026-04-17T09:15:00.000Z',
  '2026-04-19T11:45:00.000Z',
  '2026-04-21T14:20:00.000Z',
  '2026-04-22T16:00:00.000Z',
  '2026-04-24T10:00:00.000Z',
  '2026-04-25T13:30:00.000Z',
  '2026-04-27T15:45:00.000Z',
];

function buildPrompt(spec) {
  return `あなたは大阪・城東区にある「福楽キャッテリー」（サイベリアン専門ブリーダー、第一種動物取扱業220012A、200+卒業猫、2025年全国1位アワード受賞、福楽株式会社、代表取締役 羅方遠）のオウンドメディア編集者です。

${KB_FACTS}

## この記事のテーマ
- スラッグ: ${spec.slug}
- タイトル: ${spec.title}
- ターゲットキーワード: ${spec.kw}
- カテゴリ: ${spec.cat}

## 記事構成ガイド (この通りに書く)
${spec.body_guide}

## 必須要件
- 文字数 (body_html 内のテキストのみ、HTMLタグ除外): 1500〜2500字
- タイトル長: 40〜65字
- 抜粋(excerpt)長: 140〜160字
- 構成: 導入リード → H2セクション 3〜5本 → 各H2の下にH3形式のQ&A 1〜2個 → 結びの段落
- 内部リンク: 本文中に最低2つ、/booking.html / /siberian.html / /faq.html / /kittens.html / /about.html から選んで <a href="...">アンカー</a>
- LINE誘導: 結びに <a href="https://page.line.me/915hnnlk">LINE公式</a>
- 信頼要素: 城東区 / 220012A / 200+卒業猫 / 2025年全国1位 / 福楽株式会社 / Fel d1 のうち**少なくとも2つ**を本文中に自然に織り込む（羅列ではなく文脈に溶かす）
- 文体: 親身で丁寧、「〜が一般的です」「〜とされています」など断定を避けるソフトトーン

## 絶対禁止
- 検証済みKB事実以外の固有情報（病院名・住所・電話・医師名・物流業者名・正確料金・創業者個人プライベート情報など）
- 中国語・英語の混入（固有名詞のローマ字は可、ただしルビ的に）
- <html><body><head>ラッパー、<script>、inline style
- 数字の捏造（200+、220012A、2025年1位、¥160,000〜¥290,000以外の具体数字を出すな）

## 出力 (JSONのみ、コードブロック・前置き・後置き不要)
{
  "slug": "${spec.slug}",
  "title": "...",
  "excerpt": "...(140〜160字)",
  "body_html": "<p>...</p><h2>...</h2><h3>...</h3><p>...</p>...",
  "tags": ["...", "..."],
  "category": "${spec.cat}"
}`;
}

async function callKimi(messages, max_tokens = 5000, retries = 2) {
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
      return await res.json();
    } catch (e) {
      console.error(`  attempt ${attempt + 1} failed:`, e.message);
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
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

// Trust signals required: at least 2 of these tokens must appear in body
const TRUST_TOKENS = [
  /城東区/,
  /220012A/,
  /200(?:[頭匹]|\+|以上)/,
  /2025年.{0,8}(1位|第1位|一位|アワード|受賞)/,
  /福楽株式会社/,
  /Fel\s?d1/i,
];

function validate(art, spec) {
  const errors = [];
  if (art.slug !== spec.slug) errors.push(`slug mismatch: ${art.slug}`);
  if (!art.title || art.title.length < 30 || art.title.length > 70) errors.push(`title length out of range (${art.title?.length})`);
  if (!art.excerpt || art.excerpt.length < 70 || art.excerpt.length > 220) errors.push(`excerpt length out of range (${art.excerpt?.length})`);
  if (!art.body_html) { errors.push(`body missing`); return errors; }
  const textLen = art.body_html.replace(/<[^>]+>/g, '').length;
  if (textLen < 1400) errors.push(`body too short (${textLen})`);
  if (textLen > 3200) errors.push(`body too long (${textLen})`);
  const h2Count = (art.body_html.match(/<h2[\s>]/g) || []).length;
  if (h2Count < 3 || h2Count > 6) errors.push(`H2 count out of range: ${h2Count}`);
  const h3Count = (art.body_html.match(/<h3[\s>]/g) || []).length;
  if (h3Count < 3) errors.push(`H3 count too low: ${h3Count}`);
  if (!/page\.line\.me\/915hnnlk/.test(art.body_html)) errors.push(`missing LINE link`);
  const internalLinks = (art.body_html.match(/href="\/(?:booking|siberian|faq|kittens|about)\.html"/g) || []).length;
  if (internalLinks < 2) errors.push(`internal links < 2 (got ${internalLinks})`);
  if (!Array.isArray(art.tags) || art.tags.length < 3) errors.push(`tags too few`);
  // English contamination
  if (/[a-zA-Z]{20,}/.test(art.body_html.replace(/<[^>]+>/g, '').replace(/https?:\/\/\S+/g, '').replace(/Fel\s?d1/gi, '').replace(/220012A|240051A/g, ''))) {
    errors.push(`possible English contamination`);
  }
  // Trust signals — must hit at least 2
  const hits = TRUST_TOKENS.filter(rx => rx.test(art.body_html));
  if (hits.length < 2) errors.push(`trust signals < 2 (got ${hits.length})`);
  // Forbidden fabrication patterns
  // Specific clinic names (○○病院 with proper noun, addresses with 番地)
  if (/\d{1,3}-\d{1,3}-\d{1,3}|\d{1,3}丁目\d{1,3}番地?\d{0,3}号?/.test(art.body_html)) {
    errors.push(`looks like a fabricated specific address`);
  }
  // Specific phone numbers
  if (/0\d{1,2}-\d{2,4}-\d{4}/.test(art.body_html)) errors.push(`looks like a fabricated phone number`);
  return errors;
}

function toKvSchema(art, spec, idx, baseId) {
  const publishedAt = STAGGER_DATES[idx];
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
    updatedAt: '2026-04-26T14:00:00.000Z',
    id: `art_${baseId + idx + 1}`,
  };
}

(async () => {
  const existing = JSON.parse(fs.readFileSync('/tmp/articles-current.json', 'utf-8'));
  const ids = existing.map(a => parseInt((a.id || 'art_0').replace('art_', '')) || 0);
  const baseId = Math.max(...ids);
  console.log(`Existing articles: ${existing.length}, base id: art_${baseId}`);

  const newArticles = [];
  let totalIn = 0, totalOut = 0;
  const todos = [];

  for (let i = 0; i < SPECS.length; i++) {
    const spec = SPECS[i];
    console.log(`\n[${i + 1}/${SPECS.length}] ${spec.slug}`);
    const messages = [{ role: 'user', content: buildPrompt(spec) }];
    let parsed = null;
    let lastErr = null;
    for (let pass = 0; pass < 3 && !parsed; pass++) {
      try {
        const resp = await callKimi(messages, 5000, 2);
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
          if (pass < 2) {
            messages.push({ role: 'assistant', content: text });
            messages.push({ role: 'user', content: `修正してください。問題点: ${errors.join(' / ')}。要件を満たすJSONを1個だけ再出力してください。前置き不要。` });
          }
        }
      } catch (e) {
        lastErr = e.message;
        console.log(`  pass ${pass + 1} error:`, e.message);
        if (pass < 2) {
          messages.push({ role: 'user', content: `JSON抽出に失敗しました。コードブロック・前置きなしで純粋なJSONオブジェクトのみ出力してください。` });
        }
      }
    }
    if (!parsed) {
      console.log(`  SKIPPED — last error: ${lastErr}`);
      todos.push({ slug: spec.slug, error: lastErr });
      continue;
    }
    const kvArt = toKvSchema(parsed, spec, i, baseId);
    const charCount = parsed.body_html.replace(/<[^>]+>/g, '').length;
    console.log(`  OK — ${charCount}字, title=${parsed.title.length}字`);
    newArticles.push(kvArt);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Generated: ${newArticles.length}/${SPECS.length}`);
  console.log(`Skipped (TODO): ${todos.length}`, todos);
  console.log(`Tokens — input: ${totalIn}, output: ${totalOut}, total: ${totalIn + totalOut}`);

  newArticles.forEach(a => {
    const cc = (a.content.ja || '').replace(/<[^>]+>/g, '').length;
    console.log(`  ${a.slug}: ${cc}字 / title=${a.title.ja.length}字`);
  });

  fs.writeFileSync('/tmp/blog-articles-batch-c.json', JSON.stringify(newArticles, null, 2));
  fs.writeFileSync('/tmp/blog-merged-c.json', JSON.stringify([...existing, ...newArticles]));
  fs.writeFileSync('/tmp/blog-gen-summary-c.json', JSON.stringify({
    generated: newArticles.length,
    skipped: todos,
    tokens: { input: totalIn, output: totalOut, total: totalIn + totalOut },
    slugs: newArticles.map(a => a.slug),
    titles: newArticles.map(a => a.title.ja),
  }, null, 2));
  console.log(`\nWrote: /tmp/blog-articles-batch-c.json (${newArticles.length} new)`);
  console.log(`Wrote: /tmp/blog-merged-c.json (${existing.length + newArticles.length} total)`);
})();
