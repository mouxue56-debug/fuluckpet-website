/**
 * i18n.js - Internationalization for 福楽キャッテリー
 * Supports: Japanese (ja), English (en), Chinese Simplified (zh)
 */

const translations = {
  // ==================== JAPANESE (Default) ====================
  ja: {
    // Navigation
    'nav.about': '猫舎について',
    'nav.kittens': '子猫一覧',
    'nav.smallAnimals': '小動物一覧',
    'nav.parents': '親猫紹介',
    'nav.visit': '見学案内',
    'nav.faq': 'よくある質問',
    'nav.group.kittens': '子猫',
    'nav.group.breed': 'サイベリアン',
    'nav.group.adoption': 'お迎え',
    'nav.group.cattery': '猫舎・実績',
    'nav.shop': 'ショップ',
    'nav.more': 'もっと見る',
    'nav.siberian': 'サイベリアンの魅力',
    'nav.diary': '子猫成長日記',
    'nav.allergy': '猫アレルギーと飼育',
    'nav.booking': '見学予約',
    'nav.waitlist': 'お迎え予約（ウェイトリスト）',
    'nav.osakaAdoption': '大阪・関西のお迎え',
    'nav.aboutPage': '受賞歴・認定',
    'nav.gallery': '卒業猫ギャラリー',
    'nav.reviews': 'お客様の声',
    'nav.boarding': 'お預かり / ペットホテル',
    'nav.naming': '子猫の名前ツール',
    'nav.guide': 'お迎えガイド',
    'nav.blog': '知識ライブラリ',
    'nav.allKittens': '子猫一覧（すべて）',
    'nav.allParents': '親猫紹介（すべて）',
    'nav.menu': 'メニュー',
    'nav.close': 'メニューを閉じる',
    'nav.new': '新着',
    'parents.moreLink': 'すべての親猫を見る →',
    'kittens.allLink': 'すべての子猫を見る →',
    'header.telLabel': 'お電話 / LINE',
    'header.telAria': 'LINEで電話相談',

    // Hero
    'hero.award': '2025年 ブリーダーアワード受賞',
    'hero.no1': '全国満足度 No.1',
    'hero.title1': '家族になる、',
    'hero.title2': 'しあわせな出会い。',
    'hero.subtitle': '大阪のサイベリアン専門キャッテリー。<br>低アレルゲンで、家庭に馴染む穏やかな性格の子猫をお届けします。',
    'hero.cta1': '子猫を見る',
    'hero.cta2': '見学を予約する',
    'hero.stat1': 'お客様評価',
    'hero.stat2': 'レビュー',
    'hero.stat3': '卒業猫',
    'obi.rank': '全国 1位',
    'obi.rankSub': 'みんなの子猫ブリーダー 2025年上半期',
    'obi.reviews': 'レビュー113件',
    'obi.all': '全頭',
    'obi.tested': '遺伝子検査済み',
    'chip.hypoallergenic': '低アレルゲンのシベリアン',

    // About
    'about.title': '福楽キャッテリーについて',
    'about.desc': '健康で愛らしく、安定した性格を持つ子猫たちを育てることに全力を尽くしています。',
    'about.card1.title': '家庭的な環境',
    'about.card1.desc': 'わんちゃんやうさぎ、フェレットと共に暮らす環境で、子猫たちは自然に社会化トレーニングを受けます。人にも動物にも慣れた穏やかな子猫に育ちます。',
    'about.card2.title': '徹底した衛生管理',
    'about.card2.desc': '毎日の清掃と空気清浄システムを完備。ワクチン接種・健康チェック・ウイルス検査を実施し、安心してお迎えいただける体制を整えています。',
    'about.card3.title': 'お迎え準備',
    'about.card3.desc': '生後60日頃からシャワーとドライヤーの練習を開始。お迎え前には爪切り・シャンプーを実施し、新しいご家族との生活にスムーズに馴染めるよう準備します。',
    'about.card4.title': '充実のアフターサポート',
    'about.card4.desc': 'お迎え後もLINEで育て方や体調に関するご相談に対応。いつでもお気軽にご連絡ください。ずっと寄り添うパートナーでありたいと考えています。',
    'about.siberianLink': 'サイベリアンについて詳しく見る →',
    'about.awardsLink': '受賞歴・認定を見る →',

    // Instagram
    'instagram.title': '最新のInstagram',
    'instagram.desc': '日々の猫舎の様子をお届けしています。',
    'instagram.follow': 'Instagramをフォロー',

    // Kittens
    'kittens.title': '子猫一覧',
    'kittens.desc': '新しいご家族を待っている子猫たちをご紹介します。',
    'kittens.heroSub': '新しいご家族を待っている子猫たちをご紹介します。価格帯: ¥140,000～¥290,000（税込）',
    'diary.title': '子猫成長日記',
    'diary.heroSub': '妊娠から出産、週ごとの成長まで。福楽キャッテリーで生まれた子猫たちの記録を、きょうだいごとのタイムラインでまとめています。',
    'diary.emptyHeading': '公開中の成長記録はまだありません',
    'diary.emptyBody': '出産や成長の記録が公開されると、こちらできょうだいごとのタイムラインとして読めるようになります。',
    'diary.emptyButton': '現在紹介中の子猫を見る',
    'a11y.skipToMain': 'メインコンテンツへスキップ',
    'kittens.all': 'すべて',
    'kittens.available': '販売中',
    'kittens.reserved': 'ご予約済',
    'kittens.sold': 'ご家族決定',
    'kittens.soldText': 'ご家族が決まりました',
    'kittens.cta': '気になる子がいたらお問い合わせ',
    'kittens.sort': '並び替え:',
    'kittens.priceRange': '価格帯: ¥160,000～¥290,000（税込）',
    'kittens.loadMore': 'もっと見る',

    // Parents
    'parents.title': '親猫紹介',
    'parents.desc': '優秀な血統と愛情深い性格を持つ、当舎自慢の親猫たちです。',
    'parents.papa': 'パパ猫',
    'parents.mama': 'ママ猫',
    'parentModal.intro': '紹介',
    'parentModal.defaultDesc': '親猫の詳細情報です。',
    'parentModal.children': 'この子の子猫たち',

    // Flow
    'flow.title': 'お迎えの流れ',
    'flow.desc': 'お問い合わせからお迎えまで、安心のステップをご案内します。',
    'flow.s1.title': 'お問い合わせ',
    'flow.s1.desc': 'LINEまたはお電話でお気軽にご連絡ください。ご希望の猫種・性別・カラーなどをお伺いします。',
    'flow.s2.title': '見学予約・対面',
    'flow.s2.desc': '動物愛護管理法に基づき、ご購入前に必ずキャッテリーにお越しいただき、子猫と対面していただく必要がございます。対面見学またはLINEビデオ通話での見学が可能です。',
    'flow.s3.title': 'ご成約',
    'flow.s3.desc': '気に入った子猫が見つかりましたら、ご契約のお手続きを行います。お支払い方法もご相談ください。',
    'flow.s4.title': 'お迎え準備',
    'flow.s4.desc': 'ワクチン接種・健康診断・シャンプー・爪切りなど、万全の準備を整えてお引き渡しいたします。',
    'flow.s5.title': 'お迎え & アフターサポート',
    'flow.s5.desc': 'お迎え後もLINEでいつでもご相談いただけます。食事・健康・しつけなど、何でもお気軽にどうぞ。',

    // Voice (Reviews)
    'voice.title': 'お客様の声',
    'voice.total': '/ 113件のレビュー',
    'voice.r1.text': '質問にも丁寧に答えてくださり、引き渡し前には爪切りやシャンプーまで準備してくださいました。安心してお迎えできました。',
    'voice.r1.author': '— 大阪府 L.A様',
    'voice.r2.text': '説明がとても分かりやすく、素晴らしいブリーダーさんです。可愛い子猫をお迎えでき、食事やケアについても丁寧にアドバイスいただきました。',
    'voice.r2.author': '— 滋賀県 Kei様',
    'voice.r3.text': '初めて猫を飼いましたが、とても丁寧にサポートしていただけました。子猫はすぐにご飯を食べてくれて、人懐こくてとても可愛いです。',
    'voice.r3.author': '— 大阪府 H.U様',
    'voice.more': 'もっと見る',
    'voice.moreLink': 'もっと見る →',
    'voice.source': '出典：みんなの子猫ブリーダー',

    // FAQ
    'faq.title': 'よくある質問',
    'faq.q1': '猫アレルギーですが、サイベリアンなら大丈夫ですか？',
    'faq.a1': 'サイベリアンはアレルゲン（Fel d1）の分泌量が他の猫種より少ないとされていますが、個人差があります。ご心配な方には見学時にアレルギーの相性チェックのお時間を長めにお取りすることが可能です。お気軽にLINEでご相談ください。',
    'faq.q2': '見学は予約制ですか？',
    'faq.a2': 'はい、完全予約制となっております。LINEまたはお電話にて前日までにご予約ください。対面見学のほか、LINEビデオ通話での見学も承っております。',
    'faq.q3': '遠方に住んでいますが、お迎えは可能ですか？',
    'faq.a3': 'はい、全国へのお届けに対応しております。空輸・陸送のほか、直接お迎えに来ていただくことも可能です。詳しくはお問い合わせください。',
    'faq.q4': '子猫の価格帯を教えてください。',
    'faq.a4': '猫種・血統・カラーにより異なりますが、概ね16万円〜29万円（税込）となっております。詳しくは子猫一覧ページをご確認いただくか、お問い合わせください。',
    'faq.q5': 'お迎え後のサポートはありますか？',
    'faq.a5': 'はい、お迎え後もLINEにていつでもご相談いただけます。食事・健康管理・しつけなど、何でもお気軽にご連絡ください。末永くサポートいたします。',
    'faq.q6': 'サイベリアン以外の猫種も扱っていますか？',
    'faq.a6': 'はい、サイベリアンを中心に、ブリティッシュショートヘア・ブリティッシュロングヘア・ラグドールも取り扱っております。ご希望の猫種がございましたらお問い合わせください。',
    'faq.moreLink': 'すべてのFAQを見る →',
    'faq.tag': 'FAQ',
    'faq.pageTitle': 'よくある質問',
    'faq.pageSubtitle': 'お迎えに関するよくある質問をまとめました',
    'faq.guideTitle': 'もっと詳しく知りたい方へ',
    'faq.guideDesc': 'お迎え準備から日々のケアまで、初めての方にもわかりやすくまとめたガイドをご用意しています。',

    // FAQ Page (faq.html — 24-item Q&A, JA mirrors visible HTML defaults)
    'faqPage.q.faq_1': '猫アレルギーですが、サイベリアンなら大丈夫ですか？',
    'faqPage.a.faq_1': 'サイベリアンはアレルゲン（Fel d1）の分泌量が他の猫種より少ないとされていますが、個人差があります。ご心配な方には見学時にアレルギーの相性チェックのお時間を長めにお取りすることが可能です。お気軽にLINEでご相談ください。',
    'faqPage.q.faq_2': '見学は予約制ですか？',
    'faqPage.a.faq_2': 'はい、完全予約制です。LINEまたはお問い合わせフォームからご希望の日時をお知らせください。平日・土日いずれも対応可能です。見学時間は約1〜2時間を目安にしてください。',
    'faqPage.q.faq_3': '遠方に住んでいますが、お迎えは可能ですか？',
    'faqPage.a.faq_3': 'はい、空輸（航空便）や陸送での全国対応が可能です。また、ご来舎でのお引渡しも歓迎しております。詳しい送料や手配については、LINEにてご案内いたします。',
    'faqPage.q.faq_4': '子猫の価格帯を教えてください。',
    'faqPage.a.faq_4': '猫種・血統・毛色により異なりますが、16万円〜29万円（税込）程度です。※価格は予告なく変更になることがあります。最新の価格はLINEまたはお問い合わせフォームにてご確認ください。',
    'faqPage.q.faq_5': 'お迎え後のサポートはありますか？',
    'faqPage.a.faq_5': 'はい、お迎え後もLINEにていつでもご相談いただけます。食事・健康管理・しつけなど、何でもお気軽にご連絡ください。末永くサポートいたします。',
    'faqPage.q.faq_6': 'サイベリアン以外の猫種も扱っていますか？',
    'faqPage.a.faq_6': 'はい、サイベリアンを中心に、ブリティッシュショートヘア・ブリティッシュロングヘア・ラグドールも取り扱っております。ご希望の猫種がございましたらお問い合わせください。',
    'faqPage.q.faq_7': 'ワクチン接種は済んでいますか？',
    'faqPage.a.faq_7': 'お引渡し前に月齢に応じた1回目のワクチン接種を済ませております。2回目以降は、お迎え後にかかりつけの動物病院で接種をお願いしております。ワクチン証明書もお渡しします。',
    'faqPage.q.faq_8': '遺伝子検査は行っていますか？',
    'faqPage.a.faq_8': 'はい、親猫全頭にPKD（多発性嚢胞腎）、HCM（肥大型心筋症）などの遺伝子検査を実施しており、検査結果もご確認いただけます。健康な子猫をお届けするために最善を尽くしています。',
    'faqPage.q.faq_9': '去勢・避妊手術はいつ頃がいいですか？',
    'faqPage.a.faq_9': '一般的に生後6〜8ヶ月頃が適切とされています。かかりつけの獣医師とご相談のうえ、適切な時期に手術を受けることをおすすめします。手術に関するご質問もLINEでサポートいたします。',
    'faqPage.q.faq_10': '猫がかかりやすい病気はありますか？',
    'faqPage.a.faq_10': 'サイベリアンは比較的健康な猫種ですが、HCM（肥大型心筋症）やPKD（多発性嚢胞腎）には注意が必要です。当キャッテリーでは親猫の遺伝子検査を徹底し、リスクの低減に努めています。定期的な健康診断もおすすめします。',
    'faqPage.q.faq_11': 'マイクロチップは装着されていますか？',
    'faqPage.a.faq_11': 'はい、法律に基づきお引渡し前にマイクロチップを装着しております。所有者情報の変更手続きについてもご案内いたしますのでご安心ください。',
    'faqPage.q.faq_12': 'ブリーダーの見学場所はどこですか？',
    'faqPage.a.faq_12': '大阪府内にキャッテリーがございます。最寄り駅からのアクセスなど、詳細はご予約時にLINEでご案内いたします。お車でのお越しも可能です。',
    'faqPage.q.faq_13': '猫を飼うのは初めてですが大丈夫ですか？',
    'faqPage.a.faq_13': 'もちろん大丈夫です！初めての方にも安心してお迎えいただけるよう、食事・トイレ・健康管理・しつけなど詳しくご説明いたします。お迎え後もLINEでいつでもご相談いただけますので、ご安心ください。',
    'faqPage.q.faq_14': 'キャッテリーの衛生管理はどうしていますか？',
    'faqPage.a.faq_14': '猫舎は毎日清掃・消毒を行い、常に清潔な環境を維持しています。来客時の手指消毒、靴カバーの着用もお願いしており、猫たちの健康を第一に考えた管理体制を整えています。',
    'faqPage.q.faq_15': '血統書は付きますか？',
    'faqPage.a.faq_15': 'はい、全ての子猫にCFA または TICA の血統書が付きます。お引渡し後に登録団体から郵送される場合がありますので、届くまで少々お時間をいただくことがあります。',
    'faqPage.q.faq_16': '予約金やデポジットは必要ですか？',
    'faqPage.a.faq_16': 'ご成約時に予約金として5万円をお願いしております。残金はお引渡し時にお支払いいただく形です。お支払い方法は銀行振込となります。',
    'faqPage.q.faq_17': 'お引渡しの時期はいつ頃ですか？',
    'faqPage.a.faq_17': '子猫の健康状態や社会化の進捗を見て、生後2.5〜3ヶ月頃のお引渡しを目安としております。早すぎるお引渡しは子猫の心身の発達に影響するため、適切な時期をご案内します。',
    'faqPage.q.faq_18': '購入をキャンセルすることはできますか？',
    'faqPage.a.faq_18': 'やむを得ない事情の場合はご相談ください。ただし、ご予約後のキャンセルにつきましては、予約金のご返金は致しかねますのでご了承ください。詳しくはご契約時にご説明いたします。',
    'faqPage.q.faq_19': '支払い方法は何がありますか？',
    'faqPage.a.faq_19': '銀行振込でのお支払いをお願いしております。クレジットカードには対応しておりません。お振込先の詳細はご成約時にLINEでご案内いたします。',
    'faqPage.q.faq_20': 'おすすめのキャットフードはありますか？',
    'faqPage.a.faq_20': '当キャッテリーではロイヤルカナンのキトン用フードを与えております。お迎え時に現在使用しているフードをお伝えしますので、急な変更は避け、徐々に切り替えてください。',
    'faqPage.q.faq_21': '子猫のトイレのしつけは必要ですか？',
    'faqPage.a.faq_21': 'お引渡し時にはトイレトレーニングが完了しています。同じタイプの猫砂をご使用いただければ、新しい環境でもスムーズにトイレを使えることがほとんどです。',
    'faqPage.q.faq_22': '多頭飼いは可能ですか？',
    'faqPage.a.faq_22': 'サイベリアンは穏やかで社交的な性格のため、多頭飼いに向いています。先住猫がいる場合は、段階的な対面（別室→ドア越し→短時間同室）をおすすめします。詳しいアドバイスもいたします。',
    'faqPage.q.faq_23': 'ブラッシングはどのくらいの頻度が必要ですか？',
    'faqPage.a.faq_23': 'サイベリアンはトリプルコートの長毛種のため、週2〜3回のブラッシングをおすすめします。換毛期（春・秋）は毎日のブラッシングが理想的です。毛玉防止と皮膚の健康維持に効果的です。',
    'faqPage.q.faq_24': '爪切りはどうすればいいですか？',
    'faqPage.a.faq_24': '2週間に1回程度の爪切りをおすすめします。子猫のうちから慣れさせると、大人になっても嫌がりにくくなります。やり方がわからない場合は、見学時にお教えいたしますので、お気軽にお申し付けください。',

    // Gallery
    'gallery.title': '卒業猫ギャラリー',
    'gallery.desc': '新しいご家族の元で幸せに暮らす卒業猫たちをご紹介します。',
    'gallery.moreLink': 'もっと見る →',

    // Visit
    'visit.title': '見学案内',
    'visit.desc': '子猫との出会いをお待ちしております。',
    'visit.access': 'アクセス',
    'visit.address': '大阪府大阪市城東区東中浜',
    'visit.addressNote': '※ 詳細な住所はご予約時にお伝えします',
    'visit.info': '見学について',
    'visit.v1': '完全予約制（前日までにご連絡ください）',
    'visit.v2': '対面見学 ・ LINEビデオ通話対応',
    'visit.v3': '見学時間 約30分〜1時間',
    'visit.v4': 'ご家族でのご来訪も歓迎です',
    'visit.lineTitle': 'LINEでお気軽にお問い合わせ',
    'visit.lineDesc': '見学のご予約・ご質問はLINEから',
    'visit.lineBtn': 'LINEで友達追加',
    'visit.bookBtn': '見学を予約する',
    'visit.delivery': 'お届け方法',
    'visit.lawNotice': '動物愛護管理法の規定により、ご購入前に必ずキャッテリーにお越しいただくか、LINEビデオ通話にて子猫と対面していただく必要がございます。対面説明後にご契約・お届けとなります。',
    'visit.d1.title': '空輸（全国対応）',
    'visit.d1.desc': '空港でのお受け取り。専用キャリーでお届けします。',
    'visit.d2.title': '陸送（関西圏）',
    'visit.d2.desc': '大阪・兵庫・京都・奈良近郊はお届け可能です。',
    'visit.d3.title': '直接お迎え',
    'visit.d3.desc': '猫舎にお越しいただき、直接お迎えいただけます。',

    // Law Notice
    'law.title': '動物愛護管理法に基づく対面販売',
    'law.text': '法律の規定により、ご購入前に必ずキャッテリーにお越しいただき、子猫と対面していただく必要がございます。対面販売・対面説明・現物確認は法律で義務付けられております。',

    // Footer
    'footer.navTitle': 'ナビゲーション',
    'footer.legalTitle': '動物取扱業表示',
    'footer.pagesTitle': '詳しく見る',
    'footer.tagline': 'サイベリアン｜大阪・福楽キャッテリー',
    'footer.lawNotice': '動物愛護管理法に基づき、販売時には事前に対面による現物確認・説明が義務付けられています。ご購入前に必ず見学（対面またはビデオ通話）をお願いしております。',
    'footer.lawTitle': '動物愛護管理法に基づく対面販売',
    'footer.lawTitleShort': '対面販売について',
    'footer.lawNoticeShort': '法律の規定により、ご購入前に対面での説明と現物確認が必要です。',

    // Secondary Pages
    'siberian.pageTitle': 'サイベリアンの魅力',
    'siberian.pageDesc': 'ロシア生まれの優雅な猫。家族を愛し、家庭に安らぎをもたらす最高のパートナーです。',
    'awards.pageTitle': '受賞歴・認定',
    'awards.pageDesc': '全国トップクラスの評価と信頼の実績をご紹介します。',
    'gallery.pageTitle': '卒業猫ギャラリー',
    'gallery.pageDesc': '新しいご家族の元で幸せに暮らす卒業猫たちをご紹介します。',
    'reviews.pageTitle': 'お客様の声',
    'reviews.pageDesc': '実際にお迎えいただいたお客様からの温かいメッセージをご紹介します。',

    // Trust Bar
    'trust.award': '全国ブリーダーアワード受賞',
    'trust.rating': '口コミ評価 5.00 / 113件',
    'trust.license': '第一種動物取扱業 登録済',
    'trust.support': 'お迎え後も生涯LINEサポート',
    'trust.graduates': '200+ 卒業猫',

    // Mobile sticky CTA bar
    'cta.line': 'LINEで相談',
    'cta.booking': '見学予約',
    'cta.tel': '電話',

    // Kitten Detail Pages
    'kitten.basicInfo': '基本情報',
    'kitten.breed': '品種',
    'kitten.sex': '性別',
    'kitten.color': '毛色',
    'kitten.birthday': '誕生日',
    'kitten.price': '価格（税込）',
    'kitten.status': '状態',
    'kitten.health': '健康情報',
    'kitten.dnaTested': '遺伝子検査済み',
    'kitten.vaccinated': 'ワクチン接種済み',
    'kitten.lineChat': 'この子についてLINEで相談',
    'kitten.bookVisit': '見学を予約する',
    'kitten.backToList': '← 子猫一覧に戻る',
    'kitten.parentInfo': '親猫情報',
    'kitten.recommended': 'おすすめの子猫',
    'kitten.video': '動画',
    'kitten.note': '備考',
    'kitten.breadcrumb.kittens': '子猫一覧',
    'kitten.male': '男の子',
    'kitten.female': '女の子',
    'kitten.available': '販売中',
    'kitten.reserved': 'ご予約済',
    'kitten.sold': 'ご家族決定',
    'kitten.taxIncl': '（税込）',
    'kitten.bornYear': '年',
    'kitten.bornMonth': '月生まれ',
    'kitten.photoAlt': '子猫の写真',

    // Breed names
    'breed.siberian': 'サイベリアン',
    'breed.british-sh': 'ブリティッシュショートヘア',
    'breed.british-lh': 'ブリティッシュロングヘア',
    'breed.ragdoll': 'ラグドール',


    // Common
    'common.home': 'ホーム',
    'common.moreBtn': 'もっと見る',
    'common.backHome': 'ホームに戻る',
    'common.viewKittens': '子猫を見る',
    'common.bookVisit': '見学を予約する',

    // Blog (Knowledge Base)
    'blog.tag': '知識ライブラリ',
    'blog.title': '猫の飼い方｜知識ライブラリ',
    'blog.subtitle': '猫の健康管理・食事・しつけなど、ブリーダーが分かりやすく解説します',

    // Booking Page
    'booking.title': '見学予約',
    'booking.subtitle': '対面見学・LINEビデオ通話、お好きな方法でご予約ください。\nお気軽にどうぞ。',
    'booking.formTitle': '予約フォーム',
    'booking.formIntro': 'ご希望の日時と見学方法をお知らせください。分かる範囲で大丈夫です。',
    'booking.requiredNote': '必須項目です。',
    'booking.sectionContact': 'ご連絡先',
    'booking.sectionSchedule': '見学日時・方法',
    'booking.sectionMessage': '気になる子・ご相談内容',
    'booking.name': 'お名前',
    'booking.email': 'メールアドレス',
    'booking.phone': '電話番号',
    'booking.date': '第一希望日',
    'booking.time': 'ご希望の時間帯',
    'booking.timePlaceholder': '選択してください',
    'booking.timeMorning': '午前（10:00〜12:00）',
    'booking.timeAfternoon': '午後（13:00〜15:00）',
    'booking.timeEvening': '夕方（15:00〜17:00）',
    'booking.date2': '第二希望日',
    'booking.date2Hint': '日程調整のため、第二希望もご記入いただけると助かります。',
    'booking.method': '見学方法',
    'booking.methodPlaceholder': '選択してください',
    'booking.methodInPerson': '対面見学（来場）',
    'booking.methodVideo': 'LINEビデオ通話',
    'booking.methodEither': 'どちらでも可',
    'booking.kitten': '気になる子猫',
    'booking.kittenHint': '子猫の名前や掲載番号をお書きください（複数可）。',
    'booking.message': 'ご質問・ご要望',
    'booking.submit': '予約を送信する',
    'booking.sending': '送信中…',
    'booking.privacyNote': 'ご記入の情報はご予約のご連絡のみに使用し、第三者には提供しません。すぐのご相談はLINEからもどうぞ。',
    'booking.successTitle': '予約を送信しました！',
    'booking.successDesc': '24時間以内にメールまたはLINEでご連絡いたします。お待ちくださいませ。',
    'booking.successLine': 'LINEでも相談する',
    'booking.successKittens': '子猫一覧を見る',
    'booking.errorTitle': '送信に失敗しました',
    'booking.errorDesc': '申し訳ございません。お手数ですが、下記のLINEから直接ご連絡ください。すぐに対応いたします。',
    'booking.errorLine': 'LINEで予約・相談する',
    'booking.errorRetry': 'もう一度送信する',
    'booking.infoTitle': '見学について',
    'booking.infoTime': '完全予約制（前日までにご連絡ください）',
    'booking.infoVideo': '対面見学・LINEビデオ通話対応',
    'booking.infoDuration': '見学時間：約30分〜1時間',
    'booking.infoFamily': 'ご家族でのご来訪も歓迎です',
    'booking.infoLocation': '大阪市城東区東中浜（詳細住所はご予約時にお伝えします）',
    'booking.lawTitle': '対面販売について',
    'booking.lawText': '動物愛護管理法の規定により、ご購入前に必ず対面（来場またはLINEビデオ通話）での説明と現物確認が必要です。',
    'booking.lineTitle': 'LINEでも予約OK',
    'booking.lineDesc': 'フォームが苦手な方は、LINEからお気軽にメッセージください。',
    'booking.lineBtn': 'LINEで予約する',

    // Story Card Generator V2 — 4-Step Wizard
    'story.title': 'うちの子ストーリーカード',
    'story.subtitle': '写真1枚でAIが特別なカードを作るよ',
    'story.sampleTitle': 'こんなカードが作れます',
    'story.start': 'カードを作る',
    // Step 1 — Photo
    'story.step1Prompt': '一番かわいく撮れたやつ、見せて〜',
    'story.step1Sub': '写真1枚だけでOK！AIが自動で読み取るよ',
    'story.photoClick': 'タップして写真を選ぶ',
    'story.photoChange': 'タップして写真を変更',
    'story.analyzing': 'AIが読み取り中... ',
    'story.next': '次へ',
    'story.back': '戻る',
    // Step 2 — Name, Gender & Date
    'story.step2Prompt': 'この子のこと教えて〜',
    'story.step2Sub': '名前と性別、いつおうちに来たか教えてね',
    'story.nameHint': '例：ゆき、モカ、レオ',
    'story.genderMale': '男の子',
    'story.genderFemale': '女の子',
    'story.date': 'お迎え日',
    // Step 3 — Pets at Home
    'story.step3Prompt': 'おうちに先輩ペットいる？',
    'story.step3Sub': 'いたらタップ！いなければそのまま次へ',
    'story.pet1Cat': '先住猫1匹',
    'story.pet2Cats': '先住猫2匹+',
    'story.petDog': '犬',
    'story.petRabbit': 'うさぎ',
    'story.petHamster': 'ハムスター',
    'story.petBird': '鳥',
    'story.petOther': 'その他',
    'story.petNone': 'いない（初めてのペット）',
    'story.skip': 'スキップ >',
    // Step 4 — Traits & Story
    'story.step4Prompt': 'どんな子？エピソードもあれば ',
    'story.step4Sub': '書かなくてもAIがいい感じに仕上げるよ〜',
    'story.generateFinal': 'カードを作る！',
    'story.skipGenerate': 'そのまま作る',
    // Loading & Result
    'story.loading': 'AIが文章を作成中...',
    'story.loadingHint': '少々お待ちください（約10秒）',
    'story.resultTitle': 'できたよ〜！',
    'story.tabJa': '日本語版',
    'story.tabZh': '中文版',
    'story.download': '画像をダウンロード',
    'story.copyText': 'テキストをコピー',
    'story.shareHint': 'Instagramに投稿する際は <strong>@fuluckpet</strong> をタグ付けしてね！',
    'story.retry': 'もう1枚作る',

    // Guide Pages
    // Guide Common
    'guide.breadcrumb.home': 'ホーム',
    'guide.breadcrumb.guide': 'お迎えガイド',
    'guide.brand': 'サイベリアン｜大阪・福楽キャッテリー',
    'guide.cta.text': '見学のご相談はLINEへ ',
    'guide.cta.sub1': '現地・オンライン（LINEビデオ）どちらもOK',
    'guide.cta.sub2': '気になる子がいれば、リンクを送るだけでOK',
    'guide.cta.btn': 'LINEで相談する',
    'guide.nav.prev': '← 前のガイド',
    'guide.nav.next': '次のガイド →',
    'guide.nav.back': '← ガイド一覧に戻る',
    'guide.disclaimer.medical': '※ 本ページの内容は一般的な参考情報です。心配な時や症状が強い場合は、かかりつけの動物病院にご相談ください。',

    // Guide Hub (index.html)
    'guide.hub.title': 'お迎えガイド',
    'guide.hub.desc': '見学の流れ・料金・お迎え準備・育て方まで、すべてのガイドをまとめました。初めてでも大丈夫。一つずつ、ゆっくりご覧ください。',
    'guide.hub.cat1': '見学・ご予約',
    'guide.hub.cat2': 'お迎え準備',
    'guide.hub.cat3': 'お迎え後サポート',

    // Hub card titles
    'guide.hub.visit.title': '見学の流れ・消毒ガイド',
    'guide.hub.visit.desc': '見学の流れが分かる',
    'guide.hub.price.title': '料金の説明',
    'guide.hub.price.desc': '料金体系とお支払い方法',
    'guide.hub.prepare.title': '準備チェックリスト',
    'guide.hub.prepare.desc': 'まずは必須だけでOK',
    'guide.hub.bring.title': 'お迎え当日の持ち物',
    'guide.hub.bring.desc': '当日はこのリストだけ見ればOK',
    'guide.hub.safety.title': 'おうち安全チェック',
    'guide.hub.safety.desc': 'できる範囲でOK',
    'guide.hub.day1.title': '初日ガイド',
    'guide.hub.day1.desc': '最初の24時間は安心できる場所',
    'guide.hub.week1.title': '7日チェック',
    'guide.hub.week1.desc': 'ゆるめの記録で変化に気づく',
    'guide.hub.family.title': 'ご家族向けスタートガイド',
    'guide.hub.family.desc': 'お子さま・わんちゃんがいる家庭',
    'guide.hub.multi.title': '多頭飼いスタートガイド',
    'guide.hub.multi.desc': '先住猫・先住犬との慣らし方',
    'guide.hub.neuter.title': '去勢・避妊ケアガイド',
    'guide.hub.neuter.desc': '術後は静かに休むがいちばん',
    'guide.hub.grooming.title': '換毛期のお手入れガイド',
    'guide.hub.grooming.desc': '春と秋の抜け毛対策',
    'guide.hub.behavior.title': '爪とぎ・甘噛みサポート',
    'guide.hub.behavior.desc': '叱らず誘導で整える',
    'guide.hub.passport.title': '子猫パスポート',
    'guide.hub.passport.desc': '交付サンプル',
    'guide.hub.weight.title': '体重記録シート',
    'guide.hub.weight.desc': '気楽に残せる記録表',

    // Homepage Guide Entrance
    'guide.entrance.title': '初めての方へ',
    'guide.entrance.desc': '見学の流れ・料金・お迎え準備・育て方まで、すべてのガイドをまとめました。',
    'guide.entrance.btn': 'お迎えガイドを見る',

    // Visit Page
    'guide.visit.title': '見学の流れ・消毒ガイド',
    'guide.visit.lead': '初めてでも大丈夫。順番にご案内しますので、約30〜60分ほどで安心してお会いいただけます。',
    'guide.visit.s1.title': '当日の流れ（目安：30〜60分）',
    'guide.visit.s2.title': '見学当日のコツ',
    'guide.visit.s3.title': '消毒・衛生について',
    'guide.visit.s4.title': '気軽に聞いてください',
    'guide.visit.meta': '約4分 ｜ 最終更新：2026年2月',

    // Price Page
    'guide.price.title': '料金の説明',
    'guide.price.lead': 'サイト掲載価格をベースに、必要なオプションだけ追加するシンプルな仕組みです。',
    'guide.price.s1.title': '料金の仕組み',
    'guide.price.s2.title': '選べるオプション',
    'guide.price.s3.title': '予約金・残金の流れ',

    // Prepare Page
    'guide.prepare.title': '準備チェックリスト',
    'guide.prepare.lead': 'お迎えの前にそろえておきたいアイテムをまとめました。まずは必須だけでOK！',

    // Bring Page
    'guide.bring.title': 'お迎え当日の持ち物',
    'guide.bring.lead': 'お迎え当日はこのリストだけ確認すればOK！忘れ物チェックにどうぞ。',

    // Home Safety Page
    'guide.safety.title': 'おうち安全チェック',
    'guide.safety.lead': '子猫が安全に過ごせるお部屋づくりのポイントをご紹介します。できる範囲でOKです。',

    // Day 1 Page
    'guide.day1.title': '初日ガイド',
    'guide.day1.lead': 'お迎え初日の過ごし方を、やさしいステップでご案内します。',
    'guide.day1.meta': '約3分 ｜ 最終更新：2026年2月',

    // Week 1 Page
    'guide.week1.title': '7日チェック',
    'guide.week1.lead': '最初の1週間で気をつけたいポイントと、ゆるめのチェック項目をまとめました。',
    'guide.week1.meta': '約4分 ｜ 最終更新：2026年2月',

    // Family Page
    'guide.family.title': 'ご家族向けスタートガイド',
    'guide.family.lead': 'お子さまや他のペットがいるご家庭向けのアドバイスです。',

    // Multi-cat Page
    'guide.multi.title': '多頭飼いスタートガイド',
    'guide.multi.lead': '先住猫・先住犬がいるご家庭での慣らし方をご紹介します。',

    // Neuter Page
    'guide.neuter.title': '去勢・避妊ケアガイド',
    'guide.neuter.lead': '手術前後の準備とケアのポイントをまとめました。',

    // Grooming Page
    'guide.grooming.title': '換毛期のお手入れガイド',
    'guide.grooming.lead': '春と秋の換毛期に気をつけたいお手入れポイントをご紹介します。',

    // Behavior Page
    'guide.behavior.title': '爪とぎ・甘噛みサポート',
    'guide.behavior.lead': '子猫の自然な行動を理解し、叱らず上手に付き合う方法をご紹介します。',

    // Passport Page
    'guide.passport.title': '子猫パスポート',
    'guide.passport.lead': 'お引渡し時にお渡しする「子猫パスポート」のサンプルです。',

    // Weight Log Page
    'guide.weight.title': '体重記録シート',
    'guide.weight.lead': '月に1〜2回くらいのペースで記録するだけでOKです。',
  },

  // ==================== ENGLISH ====================
  en: {
    // Navigation
    'nav.about': 'About Us',
    'nav.kittens': 'Kittens',
    'nav.smallAnimals': 'Small Animals',
    'nav.parents': 'Parent Cats',
    'nav.visit': 'Visit Us',
    'nav.faq': 'FAQ',
    'nav.group.kittens': 'Kittens',
    'nav.group.breed': 'Siberians',
    'nav.group.adoption': 'Adoption',
    'nav.group.cattery': 'Cattery',
    'nav.shop': 'Shop',
    'nav.more': 'More',
    'nav.siberian': 'About Siberians',
    'nav.diary': 'Kitten Growth Diary',
    'nav.allergy': 'Cat Allergies & Care',
    'nav.booking': 'Book a Visit',
    'nav.waitlist': 'Adoption Waitlist',
    'nav.osakaAdoption': 'Adoption in Osaka & Kansai',
    'nav.aboutPage': 'Awards & Certifications',
    'nav.gallery': 'Alumni Gallery',
    'nav.reviews': 'Customer Reviews',
    'nav.boarding': 'Pet Boarding',
    'nav.naming': 'Kitten Naming Tool',
    'nav.guide': 'Adoption Guide',
    'nav.blog': 'Knowledge Base',
    'nav.allKittens': 'All Kittens',
    'nav.allParents': 'All Parent Cats',
    'nav.menu': 'MENU',
    'nav.close': 'Close menu',
    'nav.new': 'New',
    'parents.moreLink': 'View All Parent Cats →',
    'kittens.allLink': 'View All Kittens →',
    'header.telLabel': 'Call / LINE',
    'header.telAria': 'Call us via LINE',

    // Hero
    'hero.award': '2025 Breeder Award Winner',
    'hero.no1': 'No.1 Customer Satisfaction Nationwide',
    'hero.title1': 'Becoming Family,',
    'hero.title2': 'A Joyful Encounter.',
    'hero.subtitle': 'A Siberian cat specialty cattery in Osaka.<br>We deliver gentle, low-allergen kittens that blend perfectly into your home.',
    'hero.cta1': 'View Kittens',
    'hero.cta2': 'Book a Visit',
    'hero.stat1': 'Customer Rating',
    'hero.stat2': 'Reviews',
    'hero.stat3': 'Kittens Adopted',
    'obi.rank': '#1 Nationwide',
    'obi.rankSub': 'Minna no Koneko Breeder · H1 2025',
    'obi.reviews': '113 reviews',
    'obi.all': 'Every cat',
    'obi.tested': 'Genetically tested',
    'chip.hypoallergenic': 'Hypoallergenic Siberian',

    // About
    'about.title': 'About Fuluck Cattery',
    'about.desc': 'We are dedicated to raising healthy, adorable kittens with stable and gentle temperaments.',
    'about.card1.title': 'A Home-Like Environment',
    'about.card1.desc': 'Our kittens grow up alongside dogs, rabbits, and ferrets, naturally learning socialization skills. They become gentle kittens comfortable around both people and animals.',
    'about.card2.title': 'Thorough Hygiene Management',
    'about.card2.desc': 'We maintain daily cleaning and air purification. Vaccinations, health checks, and virus screenings ensure you can welcome your kitten with confidence.',
    'about.card3.title': 'Pre-Adoption Preparation',
    'about.card3.desc': 'Starting around 60 days old, we begin shower and dryer training. Before adoption, nail trimming and shampooing help kittens adjust to their new homes.',
    'about.card4.title': 'Comprehensive After-Care',
    'about.card4.desc': 'After adoption, we provide ongoing consultations via LINE about care and health. Please feel free to reach out anytime.',
    'about.siberianLink': 'Learn More About Siberians →',
    'about.awardsLink': 'View Awards & Certifications →',

    // Instagram
    'instagram.title': 'Latest on Instagram',
    'instagram.desc': 'Follow our daily cattery life.',
    'instagram.follow': 'Follow on Instagram',

    // Kittens
    'kittens.title': 'Available Kittens',
    'kittens.desc': 'Meet the kittens waiting for their new families.',
    'kittens.heroSub': 'Meet the kittens waiting for their new families. Price range: ¥140,000–¥290,000 (tax incl.).',
    'diary.title': 'Kitten Growth Diary',
    'diary.heroSub': 'From pregnancy and birth to weekly growth — the records of kittens born at Fuluck Cattery, gathered as a per-litter timeline.',
    'diary.emptyHeading': 'Our kitten diary is coming soon',
    'diary.emptyBody': 'In the meantime, meet the kittens currently looking for homes.',
    'diary.emptyButton': 'See available kittens',
    'a11y.skipToMain': 'Skip to main content',
    'kittens.all': 'All',
    'kittens.available': 'Available',
    'kittens.reserved': 'Reserved',
    'kittens.sold': 'Adopted',
    'kittens.soldText': 'Found a loving family',
    'kittens.cta': 'Interested? Contact us today',
    'kittens.sort': 'Sort:',
    'kittens.priceRange': 'Price range: ¥160,000–¥290,000 (tax incl.)',
    'kittens.loadMore': 'Load More',

    // Parents
    'parents.title': 'Parent Cats',
    'parents.desc': 'Our proud parent cats with excellent pedigrees and loving personalities.',
    'parents.papa': 'Father',
    'parents.mama': 'Mother',
    'parentModal.intro': 'Introduction',
    'parentModal.defaultDesc': 'Details about this parent cat.',
    'parentModal.children': 'Kittens from this parent',

    // Flow
    'flow.title': 'Adoption Process',
    'flow.desc': 'A step-by-step guide from inquiry to welcoming your new kitten.',
    'flow.s1.title': 'Contact Us',
    'flow.s1.desc': 'Reach out via LINE or phone. We will ask about your preferred breed, gender, color, and more.',
    'flow.s2.title': 'Visit & Meet',
    'flow.s2.desc': 'Under the Animal Protection Law, an in-person meeting at our cattery is required before purchase. In-person visits or LINE video call viewings are available.',
    'flow.s3.title': 'Finalize Agreement',
    'flow.s3.desc': 'Once you find your perfect kitten, we proceed with the contract. Payment methods are flexible.',
    'flow.s4.title': 'Preparation',
    'flow.s4.desc': 'Vaccinations, health checks, shampooing, and nail trimming ensure everything is ready.',
    'flow.s5.title': 'Pickup & After-Care',
    'flow.s5.desc': 'After adoption, consult us anytime via LINE about diet, health, training, and more.',

    // Voice
    'voice.title': 'Customer Reviews',
    'voice.total': '/ 113 Reviews',
    'voice.r1.text': 'They answered all my questions thoroughly and even prepared the kitten with nail trimming and shampoo before handover. Very reassuring adoption experience.',
    'voice.r1.author': '— L.A from Osaka',
    'voice.r2.text': 'The explanations were very clear and thorough. A wonderful breeder! We received great advice on diet and care for our lovely new kitten.',
    'voice.r2.author': '— Kei from Shiga',
    'voice.r3.text': 'This was our first cat, and the support was incredible. Our kitten started eating right away and is so affectionate and adorable!',
    'voice.r3.author': '— H.U from Osaka',
    'voice.more': 'See More',
    'voice.moreLink': 'See More →',
    'voice.source': 'Source: Minna no Koneko Breeder',

    // FAQ
    'faq.title': 'Frequently Asked Questions',
    'faq.q1': 'I have cat allergies. Are Siberians safe for me?',
    'faq.a1': 'Siberians produce less Fel d1 allergen than other breeds, but individual sensitivity varies. We can extend visit time so you have a longer in-room compatibility check. Feel free to consult us via LINE.',
    'faq.q2': 'Are visits by appointment only?',
    'faq.a2': 'Yes, visits are by appointment only. Please contact us via LINE or phone at least one day in advance.',
    'faq.q3': 'I live far away. Can I still adopt?',
    'faq.a3': 'Yes, we offer nationwide delivery via air or ground transport. You can also pick up in person.',
    'faq.q4': 'What is the price range?',
    'faq.a4': 'Prices range from 160,000 to 290,000 yen (tax included), varying by breed, pedigree, and color.',
    'faq.q5': 'Is after-adoption support available?',
    'faq.a5': 'Yes, we offer lifelong support via LINE for diet, health care, training, and any concerns.',
    'faq.q6': 'Do you breed cats other than Siberians?',
    'faq.a6': 'Yes, we also breed British Shorthairs, British Longhairs, and Ragdolls alongside our specialty Siberians.',
    'faq.moreLink': 'View All FAQs →',
    'faq.tag': 'FAQ',
    'faq.pageTitle': 'FAQ',
    'faq.pageSubtitle': 'Frequently asked questions about adopting from our cattery',
    'faq.guideTitle': 'Want to Learn More?',
    'faq.guideDesc': 'We have comprehensive guides covering everything from preparation to daily care, perfect for first-time cat owners.',

    // FAQ Page (faq.html — 24-item Q&A, EN)
    'faqPage.q.faq_1': 'I have cat allergies. Are Siberians OK for me?',
    'faqPage.a.faq_1': 'Siberians produce less Fel d1 allergen than other breeds, but individual sensitivity varies. We can extend visit time so you have a longer in-room compatibility check. Feel free to consult us via LINE.',
    'faqPage.q.faq_2': 'Are visits by appointment only?',
    'faqPage.a.faq_2': 'Yes, visits are by appointment only. Please share your preferred date/time via LINE or the booking form. Weekdays and weekends are both available. Please plan for about 1–2 hours per visit.',
    'faqPage.q.faq_3': 'I live far away. Can I still adopt?',
    'faqPage.a.faq_3': 'Yes, we offer nationwide delivery via air or ground transport. In-person pickup is also welcome. We will explain shipping fees and arrangements via LINE.',
    'faqPage.q.faq_4': 'What is the price range?',
    'faqPage.a.faq_4': 'Prices range roughly from 160,000 to 290,000 yen (tax included), varying by breed, pedigree, and color. Prices may change without notice — please confirm the latest pricing via LINE or the contact form.',
    'faqPage.q.faq_5': 'Is there post-adoption support?',
    'faqPage.a.faq_5': 'Yes, you can consult us anytime via LINE after adoption — diet, health, training, anything. We provide lifelong support.',
    'faqPage.q.faq_6': 'Do you breed cats other than Siberians?',
    'faqPage.a.faq_6': 'Yes, alongside Siberians (our specialty) we also breed British Shorthairs, British Longhairs, and Ragdolls. Please ask if you are interested in a specific breed.',
    'faqPage.q.faq_7': 'Are vaccinations completed?',
    'faqPage.a.faq_7': 'The first vaccination (age-appropriate) is completed before handover. The second and subsequent vaccines should be given at your local vet after adoption. A vaccination certificate is included.',
    'faqPage.q.faq_8': 'Do you perform genetic testing?',
    'faqPage.a.faq_8': 'Yes, all parent cats are tested for PKD (polycystic kidney disease), HCM (hypertrophic cardiomyopathy) and other genetic markers. Test results are available for review. We do everything we can to deliver healthy kittens.',
    'faqPage.q.faq_9': 'When should we spay/neuter?',
    'faqPage.a.faq_9': 'Generally around 6–8 months of age is appropriate. Please consult your vet for the right timing. We are happy to support you on LINE with any questions.',
    'faqPage.q.faq_10': 'Are there breed-specific health concerns?',
    'faqPage.a.faq_10': 'Siberians are generally healthy, but HCM (hypertrophic cardiomyopathy) and PKD (polycystic kidney disease) require attention. We genetically test all parent cats to reduce risk. Regular health checks are also recommended.',
    'faqPage.q.faq_11': 'Do kittens have microchips?',
    'faqPage.a.faq_11': 'Yes, by Japanese law all kittens are microchipped before handover. We will guide you through the owner-information transfer process — please rest assured.',
    'faqPage.q.faq_12': 'Where is the cattery?',
    'faqPage.a.faq_12': 'Our cattery is located in Osaka. Detailed access (nearest station, route) is shared via LINE upon booking confirmation. Parking is also available.',
    'faqPage.q.faq_13': 'I am a first-time cat owner. Will I be OK?',
    'faqPage.a.faq_13': 'Of course! We explain food, litter, health care, and training in detail so first-time owners can adopt with confidence. You can consult us anytime via LINE after adoption — please rest assured.',
    'faqPage.q.faq_14': 'How do you manage hygiene?',
    'faqPage.a.faq_14': 'The cattery is cleaned and disinfected daily to maintain a clean environment. Visitors are asked to disinfect their hands and wear shoe covers — kitten health is our top priority.',
    'faqPage.q.faq_15': 'Is a pedigree certificate included?',
    'faqPage.a.faq_15': 'Yes, every kitten comes with a CFA or TICA pedigree certificate. The certificate may be mailed from the registry after handover, so it can take a little time to arrive.',
    'faqPage.q.faq_16': 'Is a deposit required?',
    'faqPage.a.faq_16': 'A 50,000 yen reservation deposit is required at contract. The remainder is paid at handover. Payment is by bank transfer.',
    'faqPage.q.faq_17': 'When is handover?',
    'faqPage.a.faq_17': 'We aim for handover at around 2.5–3 months of age, depending on the kitten’s health and socialization progress. Earlier handover affects the kitten’s development, so we will guide you to the right timing.',
    'faqPage.q.faq_18': 'Can I cancel my purchase?',
    'faqPage.a.faq_18': 'Please consult us if there is an unavoidable circumstance. However, the reservation deposit is non-refundable after booking — please understand. Details are explained at contract time.',
    'faqPage.q.faq_19': 'What payment methods do you accept?',
    'faqPage.a.faq_19': 'Bank transfer only. Credit cards are not accepted. Transfer details are shared via LINE upon contract.',
    'faqPage.q.faq_20': 'Which cat food do you recommend?',
    'faqPage.a.faq_20': 'We feed Royal Canin Kitten formula at the cattery. We will tell you what your kitten currently eats at handover — please switch food gradually rather than abruptly.',
    'faqPage.q.faq_21': 'Is litter training needed?',
    'faqPage.a.faq_21': 'Litter training is already complete by the time of handover. Using the same type of litter at home means most kittens transition smoothly.',
    'faqPage.q.faq_22': 'Can I keep multiple cats?',
    'faqPage.a.faq_22': 'Siberians are calm and sociable, so multi-cat households are a good fit. If you have a resident cat, we recommend gradual introduction (separate room → through-door → short same-room sessions). We are happy to advise.',
    'faqPage.q.faq_23': 'How often should I brush?',
    'faqPage.a.faq_23': 'Siberians have a triple coat, so 2–3 brushings per week are recommended. Daily brushing is ideal during shedding seasons (spring/autumn). Helps prevent mats and supports skin health.',
    'faqPage.q.faq_24': 'How do I trim claws?',
    'faqPage.a.faq_24': 'Trim claws about every two weeks. Getting kittens used to it early makes adult life easier. If you are unsure, we are happy to demonstrate during your visit — just ask.',

    // Gallery
    'gallery.title': 'Alumni Gallery',
    'gallery.desc': 'Meet the kittens happily living with their new families.',
    'gallery.moreLink': 'See More →',

    // Visit
    'visit.title': 'Visit Information',
    'visit.desc': 'We look forward to introducing you to your future companion.',
    'visit.access': 'Access',
    'visit.address': 'Higashinakahama, Joto-ku, Osaka City',
    'visit.addressNote': '* Detailed address provided upon reservation',
    'visit.info': 'About Visits',
    'visit.v1': 'By appointment only (contact us at least one day prior)',
    'visit.v2': 'In-person visits & LINE video call viewings',
    'visit.v3': 'Visit duration: approx. 30 min to 1 hour',
    'visit.v4': 'Families welcome to visit together',
    'visit.lineTitle': 'Contact Us via LINE',
    'visit.lineDesc': 'Reservations & inquiries through LINE',
    'visit.lineBtn': 'Add Us on LINE',
    'visit.bookBtn': 'Book a Visit',
    'visit.delivery': 'Delivery Methods',
    'visit.lawNotice': 'Under the Animal Protection Law, an in-person meeting (on-site or via LINE video call) is required before purchase. After the meeting, contracts and delivery arrangements will be made.',
    'visit.d1.title': 'Air Transport (Nationwide)',
    'visit.d1.desc': 'Pick up at the airport. Delivered in a dedicated carrier.',
    'visit.d2.title': 'Ground Delivery (Kansai Area)',
    'visit.d2.desc': 'Available for Osaka, Hyogo, Kyoto, and Nara areas.',
    'visit.d3.title': 'Direct Pickup',
    'visit.d3.desc': 'Visit our cattery and pick up your kitten directly.',

    // Law Notice
    'law.title': 'In-Person Sales (Animal Protection Law)',
    'law.text': 'Under Japanese law, an in-person meeting at our cattery is required before purchase. Face-to-face sales, explanation, and physical confirmation are legally mandated.',

    // Footer
    'footer.navTitle': 'Navigation',
    'footer.legalTitle': 'Animal Dealer Registration',
    'footer.pagesTitle': 'Learn More',
    'footer.tagline': 'Siberian Cat | Fuluck Cattery, Osaka',
    'footer.lawNotice': 'Under the Animal Protection Law, an in-person meeting for verification and explanation is required before purchase. Please arrange a visit (in-person or video call) before purchasing.',
    'footer.lawTitle': 'In-Person Sales under the Animal Protection Law',
    'footer.lawTitleShort': 'About In-Person Sales',
    'footer.lawNoticeShort': 'By law, an in-person explanation and viewing of the actual animal are required before purchase.',

    // Secondary Pages
    'siberian.pageTitle': 'The Appeal of Siberian Cats',
    'siberian.pageDesc': 'An elegant breed from Russia. The perfect partner who loves family and brings peace to your home.',
    'awards.pageTitle': 'Awards & Certifications',
    'awards.pageDesc': 'Nationally recognized for top-class quality and trusted service.',
    'gallery.pageTitle': 'Alumni Gallery',
    'gallery.pageDesc': 'Meet the kittens happily living with their new families.',
    'reviews.pageTitle': 'Customer Reviews',
    'reviews.pageDesc': 'Warm messages from families who have welcomed our kittens.',

    // Trust Bar
    'trust.award': 'National Breeder Award Winner',
    'trust.rating': '5.00 Rating / 113 Reviews',
    'trust.license': 'Licensed Animal Dealer',
    'trust.support': 'Lifetime LINE Support After Adoption',
    'trust.graduates': '200+ Adopted Kittens',

    // Mobile sticky CTA bar
    'cta.line': 'Chat on LINE',
    'cta.booking': 'Book a Visit',
    'cta.tel': 'Call',

    // Kitten Detail Pages
    'kitten.basicInfo': 'Basic Info',
    'kitten.breed': 'Breed',
    'kitten.sex': 'Sex',
    'kitten.color': 'Color',
    'kitten.birthday': 'Birthday',
    'kitten.price': 'Price (tax incl.)',
    'kitten.status': 'Status',
    'kitten.health': 'Health Info',
    'kitten.dnaTested': 'DNA Tested',
    'kitten.vaccinated': 'Vaccinated',
    'kitten.lineChat': 'Ask about this kitten on LINE',
    'kitten.bookVisit': 'Book a Visit',
    'kitten.backToList': '← Back to Kittens',
    'kitten.parentInfo': 'Parent Info',
    'kitten.recommended': 'Recommended Kittens',
    'kitten.video': 'Video',
    'kitten.note': 'Notes',
    'kitten.breadcrumb.kittens': 'Kittens',
    'kitten.male': 'Male',
    'kitten.female': 'Female',
    'kitten.available': 'Available',
    'kitten.reserved': 'Reserved',
    'kitten.sold': 'Adopted',
    'kitten.taxIncl': '(tax incl.)',
    'kitten.bornYear': '/',
    'kitten.bornMonth': '',
    'kitten.photoAlt': 'Kitten photo',

    // Breed names
    'breed.siberian': 'Siberian',
    'breed.british-sh': 'British Shorthair',
    'breed.british-lh': 'British Longhair',
    'breed.ragdoll': 'Ragdoll',


    // Common
    'common.home': 'Home',
    'common.moreBtn': 'See More',
    'common.backHome': 'Back to Home',
    'common.viewKittens': 'View Kittens',
    'common.bookVisit': 'Book a Visit',

    // Blog (Knowledge Base)
    'blog.tag': 'Knowledge Base',
    'blog.title': 'Cat Care | Knowledge Base',
    'blog.subtitle': 'Expert tips on cat health, nutrition, grooming and behavior from our breeder',

    // Booking Page
    'booking.title': 'Book a Visit',
    'booking.subtitle': 'In-person visit or LINE video call — choose your preferred method.\nFeel free to reach out!',
    'booking.formTitle': 'Reservation Form',
    'booking.formIntro': 'Tell us your preferred date, time, and visit method. Fill in what you know.',
    'booking.requiredNote': 'Required fields are marked with *.',
    'booking.sectionContact': 'Contact Details',
    'booking.sectionSchedule': 'Visit Date and Method',
    'booking.sectionMessage': 'Kitten and Questions',
    'booking.name': 'Your Name',
    'booking.email': 'Email Address',
    'booking.phone': 'Phone Number',
    'booking.date': 'Preferred Date',
    'booking.time': 'Preferred Time',
    'booking.timePlaceholder': 'Select a time',
    'booking.timeMorning': 'Morning (10:00–12:00)',
    'booking.timeAfternoon': 'Afternoon (13:00–15:00)',
    'booking.timeEvening': 'Evening (15:00–17:00)',
    'booking.date2': 'Alternative Date',
    'booking.date2Hint': 'A second choice helps us coordinate schedules.',
    'booking.method': 'Visit Method',
    'booking.methodPlaceholder': 'Select a method',
    'booking.methodInPerson': 'In-Person Visit',
    'booking.methodVideo': 'LINE Video Call',
    'booking.methodEither': 'Either is fine',
    'booking.kitten': 'Kitten of Interest',
    'booking.kittenHint': 'Enter kitten name or listing number (multiple OK).',
    'booking.message': 'Questions / Requests',
    'booking.submit': 'Submit Reservation',
    'booking.sending': 'Sending…',
    'booking.privacyNote': 'We use your information only to contact you about your reservation. You can also reach us on LINE.',
    'booking.successTitle': 'Reservation Sent!',
    'booking.successDesc': 'We will contact you within 24 hours via email or LINE. Thank you!',
    'booking.successLine': 'Contact us on LINE',
    'booking.successKittens': 'View Kittens',
    'booking.errorTitle': 'Submission Failed',
    'booking.errorDesc': 'Sorry, something went wrong. Please contact us directly on LINE below — we will get right back to you.',
    'booking.errorLine': 'Book / ask on LINE',
    'booking.errorRetry': 'Try again',
    'booking.infoTitle': 'About Visits',
    'booking.infoTime': 'By appointment only (contact us at least 1 day prior)',
    'booking.infoVideo': 'In-person visits & LINE video call available',
    'booking.infoDuration': 'Duration: approx. 30 min – 1 hour',
    'booking.infoFamily': 'Families welcome to visit together',
    'booking.infoLocation': 'Higashinakahama, Joto-ku, Osaka (exact address shared upon booking)',
    'booking.lawTitle': 'In-Person Meeting Requirement',
    'booking.lawText': 'Under the Animal Protection Law, an in-person meeting (on-site or LINE video call) is required before purchase.',
    'booking.lineTitle': 'Also Available via LINE',
    'booking.lineDesc': 'If forms aren\'t your thing, feel free to message us on LINE.',
    'booking.lineBtn': 'Book via LINE',

    // Story Card Generator V2 — 4-Step Wizard
    'story.title': 'My Cat Story Card',
    'story.subtitle': 'One photo + AI = your special card ',
    'story.sampleTitle': 'Cards you can create',
    'story.start': 'Create a Card',
    // Step 1 — Photo
    'story.step1Prompt': 'Show me the cutest pic you\'ve got~ ',
    'story.step1Sub': 'Just one photo! AI does the rest',
    'story.photoClick': 'Tap to choose a photo',
    'story.photoChange': 'Tap to change photo',
    'story.analyzing': 'AI reading your photo... ',
    'story.next': 'Next',
    'story.back': 'Back',
    // Step 2 — Name, Gender & Date
    'story.step2Prompt': 'Tell me about this cutie~ ',
    'story.step2Sub': 'Name, gender, and when they came home',
    'story.nameHint': 'e.g. Yuki, Mocha, Leo',
    'story.genderMale': 'Boy',
    'story.genderFemale': 'Girl',
    'story.date': 'Adoption Date',
    // Step 3 — Pets at Home
    'story.step3Prompt': 'Any fur siblings at home? ',
    'story.step3Sub': 'Tap if yes! Otherwise just hit next',
    'story.pet1Cat': '1 resident cat',
    'story.pet2Cats': '2+ resident cats',
    'story.petDog': 'Dog',
    'story.petRabbit': 'Rabbit',
    'story.petHamster': 'Hamster',
    'story.petBird': 'Bird',
    'story.petOther': 'Other',
    'story.petNone': 'None (first pet)',
    'story.skip': 'Skip >',
    // Step 4 — Traits & Story
    'story.step4Prompt': 'What are they like? Any fun stories? ',
    'story.step4Sub': 'Skip is fine~ AI will make it great!',
    'story.generateFinal': 'Make my card!',
    'story.skipGenerate': 'Just make it',
    // Loading & Result
    'story.loading': 'AI is writing your story...',
    'story.loadingHint': 'Please wait a moment (about 10 seconds)',
    'story.resultTitle': 'Here it is~! ',
    'story.tabJa': 'Japanese',
    'story.tabZh': 'Chinese',
    'story.download': 'Download Image',
    'story.copyText': 'Copy Text',
    'story.shareHint': 'Tag <strong>@fuluckpet</strong> when you post on Instagram!',
    'story.retry': 'Create Another',

    // Guide Pages
    // Guide Common
    'guide.breadcrumb.home': 'Home',
    'guide.breadcrumb.guide': 'Adoption Guide',
    'guide.brand': 'Siberian Cat | Fuluck Cattery, Osaka',
    'guide.cta.text': 'Contact us on LINE for visits ',
    'guide.cta.sub1': 'In-person or online (LINE video) — both OK',
    'guide.cta.sub2': 'Just send us a link if you find a kitten you like',
    'guide.cta.btn': 'Chat on LINE',
    'guide.nav.prev': '← Previous Guide',
    'guide.nav.next': 'Next Guide →',
    'guide.nav.back': '← Back to Guide List',
    'guide.disclaimer.medical': '※ This page is for general reference only. If you are concerned or symptoms are severe, please consult your veterinarian.',

    // Guide Hub (index.html)
    'guide.hub.title': 'Adoption Guide',
    'guide.hub.desc': 'Everything from visiting to pricing, preparation, and care — all in one place. Take your time and browse at your own pace.',
    'guide.hub.cat1': 'Visit & Reservation',
    'guide.hub.cat2': 'Preparation',
    'guide.hub.cat3': 'After-Care Support',

    // Hub card titles
    'guide.hub.visit.title': 'Visit Process & Hygiene Guide',
    'guide.hub.visit.desc': 'Understand the visit process',
    'guide.hub.price.title': 'Pricing Guide',
    'guide.hub.price.desc': 'Pricing structure & payment methods',
    'guide.hub.prepare.title': 'Preparation Checklist',
    'guide.hub.prepare.desc': 'Start with the essentials',
    'guide.hub.bring.title': 'Pickup Day Items',
    'guide.hub.bring.desc': 'Just follow this list on the day',
    'guide.hub.safety.title': 'Home Safety Check',
    'guide.hub.safety.desc': 'Do what you can',
    'guide.hub.day1.title': 'First Day Guide',
    'guide.hub.day1.desc': 'A safe space for the first 24 hours',
    'guide.hub.week1.title': '7-Day Check',
    'guide.hub.week1.desc': 'Light tracking to notice changes',
    'guide.hub.family.title': 'Family Start Guide',
    'guide.hub.family.desc': 'For families with children or dogs',
    'guide.hub.multi.title': 'Multi-Cat Introduction Guide',
    'guide.hub.multi.desc': 'How to introduce to existing pets',
    'guide.hub.neuter.title': 'Spay/Neuter Care Guide',
    'guide.hub.neuter.desc': 'Quiet rest is best after surgery',
    'guide.hub.grooming.title': 'Shedding Season Care Guide',
    'guide.hub.grooming.desc': 'Spring & fall shedding solutions',
    'guide.hub.behavior.title': 'Scratching & Biting Support',
    'guide.hub.behavior.desc': 'Guide without scolding',
    'guide.hub.passport.title': 'Kitten Passport',
    'guide.hub.passport.desc': 'Sample document',
    'guide.hub.weight.title': 'Weight Log Sheet',
    'guide.hub.weight.desc': 'Easy tracking sheet',

    // Homepage Guide Entrance
    'guide.entrance.title': 'For First-Time Visitors',
    'guide.entrance.desc': 'Everything from visits to pricing, preparation, and care — all in one place.',
    'guide.entrance.btn': 'View Adoption Guide',

    // Visit Page
    'guide.visit.title': 'Visit Process & Hygiene Guide',
    'guide.visit.lead': 'No worries if it\'s your first time. We\'ll guide you step by step through a 30-60 minute visit.',
    'guide.visit.s1.title': 'Day-of Process (approx. 30-60 min)',
    'guide.visit.s2.title': 'Tips for Visit Day',
    'guide.visit.s3.title': 'Hygiene & Sanitization',
    'guide.visit.s4.title': 'Feel Free to Ask',
    'guide.visit.meta': '~4 min read ｜ Updated: Feb 2026',

    // Price Page
    'guide.price.title': 'Pricing Guide',
    'guide.price.lead': 'A simple system based on the listed price, with only the options you need.',
    'guide.price.s1.title': 'Pricing Structure',
    'guide.price.s2.title': 'Available Options',
    'guide.price.s3.title': 'Deposit & Payment Flow',

    // Prepare Page
    'guide.prepare.title': 'Preparation Checklist',
    'guide.prepare.lead': 'A list of items to prepare before bringing your kitten home. Start with essentials!',

    // Bring Page
    'guide.bring.title': 'Pickup Day Items',
    'guide.bring.lead': 'Just check this list on pickup day! Use it as a last-minute checklist.',

    // Home Safety Page
    'guide.safety.title': 'Home Safety Check',
    'guide.safety.lead': 'Tips for making your home safe for a kitten. Do what you can!',

    // Day 1 Page
    'guide.day1.title': 'First Day Guide',
    'guide.day1.lead': 'A gentle step-by-step guide for your kitten\'s first day home.',
    'guide.day1.meta': '~3 min read ｜ Updated: Feb 2026',

    // Week 1 Page
    'guide.week1.title': '7-Day Check',
    'guide.week1.lead': 'Key points and a gentle checklist for your kitten\'s first week.',
    'guide.week1.meta': '~4 min read ｜ Updated: Feb 2026',

    // Family Page
    'guide.family.title': 'Family Start Guide',
    'guide.family.lead': 'Advice for families with children or other pets.',

    // Multi-cat Page
    'guide.multi.title': 'Multi-Cat Introduction Guide',
    'guide.multi.lead': 'How to introduce a new kitten to your existing cat or dog.',

    // Neuter Page
    'guide.neuter.title': 'Spay/Neuter Care Guide',
    'guide.neuter.lead': 'Key points for preparation and care before and after surgery.',

    // Grooming Page
    'guide.grooming.title': 'Shedding Season Care Guide',
    'guide.grooming.lead': 'Care tips for spring and fall shedding seasons.',

    // Behavior Page
    'guide.behavior.title': 'Scratching & Biting Support',
    'guide.behavior.lead': 'Understanding natural kitten behaviors and managing them without scolding.',

    // Passport Page
    'guide.passport.title': 'Kitten Passport',
    'guide.passport.lead': 'A sample of the "Kitten Passport" document provided at pickup.',

    // Weight Log Page
    'guide.weight.title': 'Weight Log Sheet',
    'guide.weight.lead': 'Just record once or twice a month — that\'s enough.',
  },

  // ==================== CHINESE SIMPLIFIED ====================
  zh: {
    // Navigation
    'nav.about': '关于我们',
    'nav.kittens': '幼猫一览',
    'nav.smallAnimals': '小动物一览',
    'nav.parents': '种猫介绍',
    'nav.visit': '参观指南',
    'nav.faq': '常见问题',
    'nav.group.kittens': '幼猫',
    'nav.group.breed': '西伯利亚猫',
    'nav.group.adoption': '接猫',
    'nav.group.cattery': '猫舍·实绩',
    'nav.shop': '商城',
    'nav.more': '更多',
    'nav.siberian': '西伯利亚猫的魅力',
    'nav.diary': '幼猫成长日记',
    'nav.allergy': '猫过敏与饲养',
    'nav.booking': '预约参观',
    'nav.waitlist': '接猫预约（候补名单）',
    'nav.osakaAdoption': '大阪·关西接猫',
    'nav.aboutPage': '获奖·认证',
    'nav.gallery': '毕业猫相册',
    'nav.reviews': '客户评价',
    'nav.boarding': '宠物寄养',
    'nav.naming': '幼猫起名工具',
    'nav.guide': '接猫指南',
    'nav.blog': '知识库',
    'nav.allKittens': '幼猫一览（全部）',
    'nav.allParents': '种猫介绍（全部）',
    'nav.menu': '菜单',
    'nav.close': '关闭菜单',
    'nav.new': '新',
    'parents.moreLink': '查看所有种猫 →',
    'kittens.allLink': '查看所有幼猫 →',
    'header.telLabel': '电话 / LINE',
    'header.telAria': '通过 LINE 拨打电话',

    // Hero
    'hero.award': '2025年 繁殖人大奖获得者',
    'hero.no1': '全国客户满意度 No.1',
    'hero.title1': '成为家人，',
    'hero.title2': '幸福的相遇。',
    'hero.subtitle': '大阪西伯利亚猫专业猫舍。<br>为您送上低致敏、性格温顺、适合家庭饲养的幼猫。',
    'hero.cta1': '查看幼猫',
    'hero.cta2': '预约参观',
    'hero.stat1': '客户评分',
    'hero.stat2': '条评价',
    'hero.stat3': '已出窝',
    'obi.rank': '全国第1位',
    'obi.rankSub': 'みんなの子猫ブリーダー · 2025上半年',
    'obi.reviews': '113条评价',
    'obi.all': '全部',
    'obi.tested': '已做基因检测',
    'chip.hypoallergenic': '低致敏西伯利亚猫',

    // About
    'about.title': '关于福楽猫舍',
    'about.desc': '我们全力培育健康可爱、性格稳定温顺的幼猫。',
    'about.card1.title': '家庭式环境',
    'about.card1.desc': '幼猫从小在有狗狗、兔子和雪貂的环境中成长，自然接受社会化训练，成为既亲人又亲近其他动物的温顺猫咪。',
    'about.card2.title': '严格的卫生管理',
    'about.card2.desc': '配备每日清洁和空气净化系统。实施疫苗接种、健康检查及病毒检测，确保您安心迎接幼猫回家。',
    'about.card3.title': '出窝前准备',
    'about.card3.desc': '从约60天大开始进行洗浴和吹干训练。出窝前进行修甲和洗浴护理，帮助幼猫顺利适应新家。',
    'about.card4.title': '完善的售后支持',
    'about.card4.desc': '接猫回家后，您可以随时通过LINE咨询饲养和健康方面的问题。我们希望成为陪伴您一生的伙伴。',
    'about.siberianLink': '了解更多西伯利亚猫 →',
    'about.awardsLink': '查看获奖·认证 →',

    // Instagram
    'instagram.title': '最新Instagram动态',
    'instagram.desc': '每日分享猫舍日常生活。',
    'instagram.follow': '关注Instagram',

    // Kittens
    'kittens.title': '幼猫一览',
    'kittens.desc': '为您介绍正在等待新家人的幼猫们。',
    'kittens.heroSub': '为您介绍正在等待新家庭的猫咪们。价格区间：¥140,000～¥290,000（含税）。',
    'diary.title': '小猫成长日记',
    'diary.heroSub': '从怀孕、出生到每周成长——福楽猫舍出生的小猫们的记录，按每一窝整理成时间线。',
    'diary.emptyHeading': '成长日记筹备中',
    'diary.emptyBody': '在此期间，欢迎先看看正在寻找新家的小猫们。',
    'diary.emptyButton': '查看待售小猫',
    'a11y.skipToMain': '跳转到正文',
    'kittens.all': '全部',
    'kittens.available': '在售',
    'kittens.reserved': '洽谈中',
    'kittens.sold': '已找到家庭',
    'kittens.soldText': '已找到温暖的家',
    'kittens.cta': '心动了？快来咨询吧',
    'kittens.sort': '排序：',
    'kittens.priceRange': '价格范围：¥160,000～¥290,000（含税）',
    'kittens.loadMore': '加载更多',

    // Parents
    'parents.title': '种猫介绍',
    'parents.desc': '拥有优秀血统和温柔性格的优质种猫。',
    'parents.papa': '猫爸爸',
    'parents.mama': '猫妈妈',
    'parentModal.intro': '简介',
    'parentModal.defaultDesc': '关于这只种猫的详细信息。',
    'parentModal.children': '这只种猫的幼猫',

    // Flow
    'flow.title': '领养流程',
    'flow.desc': '从咨询到接猫回家，为您安心引导每一步。',
    'flow.s1.title': '咨询联系',
    'flow.s1.desc': '请通过LINE或电话联系我们，我们会了解您期望的猫种、性别、花色等信息。',
    'flow.s2.title': '预约参观・面谈',
    'flow.s2.desc': '根据动物爱护管理法，购买前必须亲自到猫舍与幼猫见面。可现场参观或LINE视频通话看猫。',
    'flow.s3.title': '签订合同',
    'flow.s3.desc': '找到心仪的幼猫后，我们将办理合同手续。付款方式可协商。',
    'flow.s4.title': '出窝准备',
    'flow.s4.desc': '我们会完成疫苗接种、健康检查、洗浴护理和修甲等准备工作，确保万全交接。',
    'flow.s5.title': '接猫 & 售后支持',
    'flow.s5.desc': '接猫后可随时通过LINE咨询饮食、健康、训练等任何问题。',

    // Voice
    'voice.title': '客户评价',
    'voice.total': '/ 113条评价',
    'voice.r1.text': '问题都耐心解答，交接前还帮猫咪剪了指甲、洗了澡，准备得非常周到。非常安心地迎接了小猫。',
    'voice.r1.author': '— 大阪府 L.A',
    'voice.r2.text': '说明非常清楚易懂，是很棒的繁殖者。迎接了可爱的小猫，还在饮食和护理方面给了很多细心的建议。',
    'voice.r2.author': '— 滋贺县 Kei',
    'voice.r3.text': '第一次养猫，得到了非常耐心的支持。小猫马上就开始吃饭了，又亲人又可爱！',
    'voice.r3.author': '— 大阪府 H.U',
    'voice.more': '查看更多',
    'voice.moreLink': '查看更多 →',
    'voice.source': '来源：大家的幼猫繁殖者',

    // FAQ
    'faq.title': '常见问题',
    'faq.q1': '我有猫过敏，养西伯利亚猫可以吗？',
    'faq.a1': '西伯利亚猫的过敏原（Fel d1）分泌量低于其他猫种，但因人而异。如有顾虑，参观时可延长时间做亲和度测试。欢迎通过LINE咨询。',
    'faq.q2': '参观需要预约吗？',
    'faq.a2': '是的，完全预约制。请至少提前一天通过LINE或电话预约。除现场参观外，也提供LINE视频看猫。',
    'faq.q3': '我住得比较远，可以领养吗？',
    'faq.a3': '可以的，我们支持全国配送，可通过空运或陆运送达。也可以亲自前来接猫。',
    'faq.q4': '幼猫的价格范围是多少？',
    'faq.a4': '根据猫种、血统和花色有所不同，大致在16万至29万日元（含税）之间。',
    'faq.q5': '领养后有售后支持吗？',
    'faq.a5': '有的，领养后可随时通过LINE咨询饮食、健康管理、训练等任何问题。我们提供终身支持。',
    'faq.q6': '除了西伯利亚猫还有其他猫种吗？',
    'faq.a6': '有的，以西伯利亚猫为主，同时也繁育英国短毛猫、英国长毛猫和布偶猫。',
    'faq.moreLink': '查看所有FAQ →',
    'faq.tag': 'FAQ',
    'faq.pageTitle': '常见问题',
    'faq.pageSubtitle': '关于领养的常见问题汇总',
    'faq.guideTitle': '想了解更多？',
    'faq.guideDesc': '从接猫准备到日常护理，我们为新手铲屎官准备了详细的指南。',

    // FAQ Page (faq.html — 24-item Q&A, ZH)
    'faqPage.q.faq_1': '我有猫过敏，养西伯利亚猫可以吗？',
    'faqPage.a.faq_1': '西伯利亚猫的过敏原（Fel d1）分泌量低于其他猫种，但因人而异。如有顾虑，参观时可延长时间做亲和度测试。欢迎通过LINE咨询。',
    'faqPage.q.faq_2': '参观需要预约吗？',
    'faqPage.a.faq_2': '是的，完全预约制。请通过LINE或预约表单告知您希望的日期与时间。平日和周末均可。每次参观约1〜2小时。',
    'faqPage.q.faq_3': '我住得比较远，可以领养吗？',
    'faqPage.a.faq_3': '可以的。我们支持空运（航空便）或陆运全国配送。也欢迎您亲自上门接猫。运费及具体安排会通过LINE说明。',
    'faqPage.q.faq_4': '幼猫的价格范围是多少？',
    'faqPage.a.faq_4': '根据猫种、血统、毛色不同，约在16万〜29万日元（含税）之间。价格可能不另行通知调整，最新价格请通过LINE或表单确认。',
    'faqPage.q.faq_5': '领养后有售后支持吗？',
    'faqPage.a.faq_5': '有的，领养后可随时通过LINE咨询饮食、健康、训练等任何问题。我们提供终身支持。',
    'faqPage.q.faq_6': '除了西伯利亚猫还有其他猫种吗？',
    'faqPage.a.faq_6': '有的。以西伯利亚猫为主，同时也繁育英国短毛猫、英国长毛猫和布偶猫。如果您对特定猫种感兴趣，请告诉我们。',
    'faqPage.q.faq_7': '是否已经接种疫苗？',
    'faqPage.a.faq_7': '交付前会按月龄完成第一针疫苗。第二针及以后请在领养后的本地宠物医院接种。我们会提供疫苗证明书。',
    'faqPage.q.faq_8': '是否进行基因检测？',
    'faqPage.a.faq_8': '是的，所有种猫都进行了PKD（多囊肾）、HCM（肥厚型心肌病）等基因检测，检测结果可供查阅。我们尽力交付健康的幼猫。',
    'faqPage.q.faq_9': '什么时候做绝育手术合适？',
    'faqPage.a.faq_9': '一般在出生6〜8个月左右合适。请与您的兽医商议确定时机。如有疑问，欢迎通过LINE咨询。',
    'faqPage.q.faq_10': '猫咪容易患的疾病有哪些？',
    'faqPage.a.faq_10': '西伯利亚猫整体较健康，但需注意HCM（肥厚型心肌病）和PKD（多囊肾）。我们对种猫进行严格基因检测以降低风险。同时建议定期体检。',
    'faqPage.q.faq_11': '是否安装了微芯片？',
    'faqPage.a.faq_11': '是的，根据日本法律，所有幼猫在交付前都已植入微芯片。所有者信息变更手续我们也会指导，请放心。',
    'faqPage.q.faq_12': '猫舍参观的地点在哪里？',
    'faqPage.a.faq_12': '猫舍位于大阪府内。最近车站及具体路线会在预约确认后通过LINE告知。也可以驾车前来。',
    'faqPage.q.faq_13': '我是第一次养猫，可以吗？',
    'faqPage.a.faq_13': '当然可以！为了让新手也能安心领养，我们会详细说明饮食、厕所、健康管理、训练等。领养后也可随时通过LINE咨询，请放心。',
    'faqPage.q.faq_14': '猫舍的卫生管理如何？',
    'faqPage.a.faq_14': '猫舍每日清扫消毒，始终保持清洁。来访时请配合手部消毒和鞋套穿戴。我们以猫咪健康为第一优先。',
    'faqPage.q.faq_15': '是否提供血统证书？',
    'faqPage.a.faq_15': '是的，每只幼猫都附CFA或TICA血统证书。证书可能在交付后由登记机构邮寄，可能需要一些时间送达。',
    'faqPage.q.faq_16': '需要预约金或定金吗？',
    'faqPage.a.faq_16': '签约时需支付5万日元的预约金。余款在交付时支付。支付方式为银行转账。',
    'faqPage.q.faq_17': '什么时候可以接猫？',
    'faqPage.a.faq_17': '根据幼猫的健康与社会化情况，一般在出生2.5〜3个月左右交付。过早交付会影响幼猫身心发展，我们会指导合适的时机。',
    'faqPage.q.faq_18': '可以取消订购吗？',
    'faqPage.a.faq_18': '如有不可避免的情况请与我们商议。但预约后取消的预约金恕不退还，请知悉。具体内容签约时会说明。',
    'faqPage.q.faq_19': '支持哪些支付方式？',
    'faqPage.a.faq_19': '仅支持银行转账。不接受信用卡。汇款详情会在签约时通过LINE告知。',
    'faqPage.q.faq_20': '推荐什么猫粮？',
    'faqPage.a.faq_20': '本猫舍使用皇家（Royal Canin）幼猫配方。交付时会告知当前使用的猫粮，请避免突然更换，逐渐过渡。',
    'faqPage.q.faq_21': '需要训练上厕所吗？',
    'faqPage.a.faq_21': '交付时已完成上厕所训练。使用相同类型的猫砂，大多数幼猫在新环境也能顺利使用厕所。',
    'faqPage.q.faq_22': '可以多猫饲养吗？',
    'faqPage.a.faq_22': '西伯利亚猫性格温和、社交性好，适合多猫饲养。如已有先住猫，建议分阶段引见（分房→隔门→短时同室）。我们会提供详细建议。',
    'faqPage.q.faq_23': '梳毛多久一次？',
    'faqPage.a.faq_23': '西伯利亚猫为三层被毛长毛种，建议每周2〜3次梳毛。换毛季（春秋）每天梳毛最理想。可防止毛球、维护皮肤健康。',
    'faqPage.q.faq_24': '如何修剪指甲？',
    'faqPage.a.faq_24': '建议每两周修剪一次。幼猫期开始习惯后，长大也不易抗拒。如不熟悉操作，参观时可现场演示，欢迎告知。',

    // Gallery
    'gallery.title': '毕业猫相册',
    'gallery.desc': '看看在新家庭中幸福生活的毕业猫咪们。',
    'gallery.moreLink': '查看更多 →',

    // Visit
    'visit.title': '参观指南',
    'visit.desc': '期待与您和幼猫的美好相遇。',
    'visit.access': '交通方式',
    'visit.address': '大阪府大阪市城东区东中浜',
    'visit.addressNote': '※ 详细地址将在预约时告知',
    'visit.info': '关于参观',
    'visit.v1': '完全预约制（请至少提前一天联系）',
    'visit.v2': '支持现场参观 & LINE视频看猫',
    'visit.v3': '参观时间约30分钟至1小时',
    'visit.v4': '欢迎全家一起来访',
    'visit.lineTitle': '通过LINE轻松咨询',
    'visit.lineDesc': '预约参观和咨询请通过LINE',
    'visit.lineBtn': '添加LINE好友',
    'visit.bookBtn': '预约见学',
    'visit.delivery': '配送方式',
    'visit.lawNotice': '根据动物爱护管理法规定，购买前必须亲自到猫舍或通过LINE视频通话与幼猫见面。面谈后方可签约和配送。',
    'visit.d1.title': '空运（全国）',
    'visit.d1.desc': '在机场领取。使用专用航空箱配送。',
    'visit.d2.title': '陆运（关西地区）',
    'visit.d2.desc': '大阪、兵库、京都、奈良周边可配送。',
    'visit.d3.title': '自行接猫',
    'visit.d3.desc': '亲自到猫舍接猫回家。',

    // Law Notice
    'law.title': '动物爱护管理法·面对面销售',
    'law.text': '根据法律规定，购买前必须亲自到猫舍与幼猫见面。面对面销售、面对面说明及实物确认是法律义务。',

    // Footer
    'footer.navTitle': '导航',
    'footer.legalTitle': '动物经营许可信息',
    'footer.pagesTitle': '了解更多',
    'footer.tagline': '西伯利亚猫｜大阪·福楽猫舍',
    'footer.lawNotice': '根据动物爱护管理法，销售前必须进行面对面的实物确认和说明。购买前请务必安排参观（面对面或视频通话）。',
    'footer.lawTitle': '依据《动物爱护管理法》的面对面销售',
    'footer.lawTitleShort': '关于面对面销售',
    'footer.lawNoticeShort': '根据法律规定，购买前须进行面对面说明并现场确认实物。',

    // Secondary Pages
    'siberian.pageTitle': '西伯利亚猫的魅力',
    'siberian.pageDesc': '源自俄罗斯的优雅猫种。深爱家人，为家庭带来安宁的理想伙伴。',
    'awards.pageTitle': '获奖历程·认证',
    'awards.pageDesc': '全国顶级评价与信赖实绩。',
    'gallery.pageTitle': '毕业猫相册',
    'gallery.pageDesc': '看看在新家庭中幸福生活的毕业猫咪们。',
    'reviews.pageTitle': '客户评价',
    'reviews.pageDesc': '来自已迎接猫咪的家庭的温馨留言。',

    // Trust Bar
    'trust.award': '全国繁殖人大奖获得者',
    'trust.rating': '口碑评分 5.00 / 113条',
    'trust.license': '第一种动物经营许可 已登记',
    'trust.support': '接猫后终身LINE咨询支持',
    'trust.graduates': '200+ 毕业猫',

    // Mobile sticky CTA bar
    'cta.line': 'LINE咨询',
    'cta.booking': '预约参观',
    'cta.tel': '电话',

    // Kitten Detail Pages
    'kitten.basicInfo': '基本信息',
    'kitten.breed': '品种',
    'kitten.sex': '性别',
    'kitten.color': '毛色',
    'kitten.birthday': '生日',
    'kitten.price': '价格（含税）',
    'kitten.status': '状态',
    'kitten.health': '健康信息',
    'kitten.dnaTested': '基因检测完毕',
    'kitten.vaccinated': '已接种疫苗',
    'kitten.lineChat': '通过LINE咨询这只猫咪',
    'kitten.bookVisit': '预约见学',
    'kitten.backToList': '← 返回幼猫列表',
    'kitten.parentInfo': '亲猫信息',
    'kitten.recommended': '推荐幼猫',
    'kitten.video': '视频',
    'kitten.note': '备注',
    'kitten.breadcrumb.kittens': '幼猫一览',
    'kitten.male': '男孩',
    'kitten.female': '女孩',
    'kitten.available': '可预约',
    'kitten.reserved': '已预订',
    'kitten.sold': '已出售',
    'kitten.taxIncl': '（含税）',
    'kitten.bornYear': '年',
    'kitten.bornMonth': '月出生',
    'kitten.photoAlt': '小猫照片',

    // Breed names
    'breed.siberian': '西伯利亚猫',
    'breed.british-sh': '英国短毛猫',
    'breed.british-lh': '英国长毛猫',
    'breed.ragdoll': '布偶猫',


    // Common
    'common.home': '首页',
    'common.moreBtn': '查看更多',
    'common.backHome': '返回首页',
    'common.viewKittens': '查看幼猫',
    'common.bookVisit': '预约参观',

    // Blog (Knowledge Base)
    'blog.tag': '知识库',
    'blog.title': '养猫指南｜知识库',
    'blog.subtitle': '专业繁殖人为您讲解猫咪健康管理、饮食、护理与行为知识',

    // Booking Page
    'booking.title': '预约参观',
    'booking.subtitle': '现场参观或LINE视频通话，选择您喜欢的方式预约。\n请随时联系我们！',
    'booking.formTitle': '预约表单',
    'booking.formIntro': '请告诉我们希望的日期、时间和参观方式。知道的部分先填写即可。',
    'booking.requiredNote': '带 * 的项目为必填。',
    'booking.sectionContact': '联系方式',
    'booking.sectionSchedule': '参观日期与方式',
    'booking.sectionMessage': '感兴趣的幼猫与咨询内容',
    'booking.name': '姓名',
    'booking.email': '邮箱地址',
    'booking.phone': '电话号码',
    'booking.date': '第一希望日',
    'booking.time': '希望时间段',
    'booking.timePlaceholder': '请选择',
    'booking.timeMorning': '上午（10:00〜12:00）',
    'booking.timeAfternoon': '下午（13:00〜15:00）',
    'booking.timeEvening': '傍晚（15:00〜17:00）',
    'booking.date2': '第二希望日',
    'booking.date2Hint': '填写第二希望日有助于我们协调日程。',
    'booking.method': '参观方式',
    'booking.methodPlaceholder': '请选择',
    'booking.methodInPerson': '现场参观',
    'booking.methodVideo': 'LINE视频通话',
    'booking.methodEither': '均可',
    'booking.kitten': '感兴趣的幼猫',
    'booking.kittenHint': '请填写幼猫名字或编号（可多只）。',
    'booking.message': '问题·需求',
    'booking.submit': '提交预约',
    'booking.sending': '提交中…',
    'booking.privacyNote': '您填写的信息仅用于预约联系，不会提供给第三方。也可以通过LINE直接咨询。',
    'booking.successTitle': '预约已提交！',
    'booking.successDesc': '我们将在24小时内通过邮件或LINE与您联系。请稍候。',
    'booking.successLine': '也可以通过LINE咨询',
    'booking.successKittens': '查看幼猫列表',
    'booking.errorTitle': '提交失败',
    'booking.errorDesc': '抱歉，提交出现问题。请通过下方的LINE直接联系我们，我们会尽快回复。',
    'booking.errorLine': '通过LINE预约·咨询',
    'booking.errorRetry': '重新提交',
    'booking.infoTitle': '关于参观',
    'booking.infoTime': '完全预约制（请至少提前1天联系）',
    'booking.infoVideo': '支持现场参观·LINE视频通话',
    'booking.infoDuration': '参观时间：约30分钟〜1小时',
    'booking.infoFamily': '欢迎全家一起来访',
    'booking.infoLocation': '大阪市城东区东中浜（详细地址预约时告知）',
    'booking.lawTitle': '关于面对面确认',
    'booking.lawText': '根据动物爱护管理法，购买前必须进行面对面（到场或LINE视频通话）的说明和实物确认。',
    'booking.lineTitle': 'LINE也可以预约',
    'booking.lineDesc': '不方便填表的话，欢迎通过LINE直接联系我们。',
    'booking.lineBtn': '通过LINE预约',

    // Story Card Generator V2 — 4-Step Wizard
    'story.title': '我家猫咪故事卡',
    'story.subtitle': '一张照片+AI=专属纪念卡',
    'story.sampleTitle': '可以制作这样的卡片',
    'story.start': '开始制作',
    // Step 1 — Photo
    'story.step1Prompt': '拍得最可爱的那张给我看看~ ',
    'story.step1Sub': '只要一张照片！AI帮你搞定',
    'story.photoClick': '点击选择照片',
    'story.photoChange': '点击更换照片',
    'story.analyzing': 'AI读取中... ',
    'story.next': '下一步',
    'story.back': '返回',
    // Step 2 — Name, Gender & Date
    'story.step2Prompt': '跟我说说这个小可爱~ ',
    'story.step2Sub': '名字、性别，还有什么时候到家的',
    'story.nameHint': '例：雪球、摩卡、Leo',
    'story.genderMale': '男孩',
    'story.genderFemale': '女孩',
    'story.date': '迎接日期',
    // Step 3 — Pets at Home
    'story.step3Prompt': '家里有前辈宠物吗？',
    'story.step3Sub': '有就点一下！没有直接下一步',
    'story.pet1Cat': '1只原住猫',
    'story.pet2Cats': '2只以上原住猫',
    'story.petDog': '狗',
    'story.petRabbit': '兔子',
    'story.petHamster': '仓鼠',
    'story.petBird': '鸟',
    'story.petOther': '其他',
    'story.petNone': '没有（第一只宠物）',
    'story.skip': '跳过 >',
    // Step 4 — Traits & Story
    'story.step4Prompt': '是什么性格的猫咪？有趣的事也说说 ',
    'story.step4Sub': '不写也行～AI会帮你搞定的',
    'story.generateFinal': '生成卡片！',
    'story.skipGenerate': '直接生成',
    // Loading & Result
    'story.loading': 'AI正在创作文案...',
    'story.loadingHint': '请稍候（约10秒）',
    'story.resultTitle': '做好啦～',
    'story.tabJa': '日语版',
    'story.tabZh': '中文版',
    'story.download': '下载图片',
    'story.copyText': '复制文案',
    'story.shareHint': '发到Instagram时记得标记 <strong>@fuluckpet</strong> 哦！',
    'story.retry': '再做一张',

    // Guide Pages
    // Guide Common
    'guide.breadcrumb.home': '首页',
    'guide.breadcrumb.guide': '接猫指南',
    'guide.brand': '西伯利亚猫｜大阪·福楽猫舍',
    'guide.cta.text': '参观咨询请联系LINE ',
    'guide.cta.sub1': '现场·线上（LINE视频）均可',
    'guide.cta.sub2': '看中哪只小猫，发链接给我们即可',
    'guide.cta.btn': '用LINE咨询',
    'guide.nav.prev': '← 上一篇',
    'guide.nav.next': '下一篇 →',
    'guide.nav.back': '← 返回指南列表',
    'guide.disclaimer.medical': '※ 本页内容仅供一般参考。如有担心或症状严重，请咨询您的兽医。',

    // Guide Hub (index.html)
    'guide.hub.title': '接猫指南',
    'guide.hub.desc': '从参观流程、价格、接猫准备到养护方法，所有指南汇总于此。慢慢浏览，不用着急。',
    'guide.hub.cat1': '参观·预约',
    'guide.hub.cat2': '接猫准备',
    'guide.hub.cat3': '接猫后支持',

    // Hub card titles
    'guide.hub.visit.title': '参观流程·消毒指南',
    'guide.hub.visit.desc': '了解参观流程',
    'guide.hub.price.title': '价格说明',
    'guide.hub.price.desc': '价格体系与支付方式',
    'guide.hub.prepare.title': '准备清单',
    'guide.hub.prepare.desc': '先准备必需品即可',
    'guide.hub.bring.title': '接猫当天物品',
    'guide.hub.bring.desc': '当天看这份清单就行',
    'guide.hub.safety.title': '居家安全检查',
    'guide.hub.safety.desc': '力所能及即可',
    'guide.hub.day1.title': '第一天指南',
    'guide.hub.day1.desc': '最初24小时需要安心的空间',
    'guide.hub.week1.title': '7日检查',
    'guide.hub.week1.desc': '轻松记录发现变化',
    'guide.hub.family.title': '家庭入门指南',
    'guide.hub.family.desc': '有小孩或狗狗的家庭',
    'guide.hub.multi.title': '多猫家庭入门指南',
    'guide.hub.multi.desc': '与先住猫·先住狗的磨合方法',
    'guide.hub.neuter.title': '绝育护理指南',
    'guide.hub.neuter.desc': '术后安静休息最重要',
    'guide.hub.grooming.title': '换毛期护理指南',
    'guide.hub.grooming.desc': '春秋换毛对策',
    'guide.hub.behavior.title': '磨爪·轻咬行为指导',
    'guide.hub.behavior.desc': '不责骂，引导纠正',
    'guide.hub.passport.title': '幼猫护照',
    'guide.hub.passport.desc': '交付样本',
    'guide.hub.weight.title': '体重记录表',
    'guide.hub.weight.desc': '轻松记录表',

    // Homepage Guide Entrance
    'guide.entrance.title': '致初次来访者',
    'guide.entrance.desc': '从参观流程、价格、接猫准备到养护方法，所有指南汇总于此。',
    'guide.entrance.btn': '查看接猫指南',

    // Visit Page
    'guide.visit.title': '参观流程·消毒指南',
    'guide.visit.lead': '第一次也没关系。我们会按顺序引导您，大约30〜60分钟即可安心见面。',
    'guide.visit.s1.title': '当天流程（约30〜60分钟）',
    'guide.visit.s2.title': '参观当天小贴士',
    'guide.visit.s3.title': '消毒·卫生须知',
    'guide.visit.s4.title': '请随时提问',
    'guide.visit.meta': '约4分钟 ｜ 更新：2026年2月',

    // Price Page
    'guide.price.title': '价格说明',
    'guide.price.lead': '以网站标价为基础，按需添加选项的简单体系。',
    'guide.price.s1.title': '价格体系',
    'guide.price.s2.title': '可选项目',
    'guide.price.s3.title': '定金·尾款流程',

    // Prepare Page
    'guide.prepare.title': '准备清单',
    'guide.prepare.lead': '接猫前需要准备的物品清单。先准备必需品就好！',

    // Bring Page
    'guide.bring.title': '接猫当天物品',
    'guide.bring.lead': '接猫当天只需确认这份清单！用来检查有没有遗漏。',

    // Home Safety Page
    'guide.safety.title': '居家安全检查',
    'guide.safety.lead': '介绍让幼猫安全生活的房间布置要点。力所能及即可。',

    // Day 1 Page
    'guide.day1.title': '第一天指南',
    'guide.day1.lead': '用简单的步骤引导您度过接猫第一天。',
    'guide.day1.meta': '约3分钟 ｜ 更新：2026年2月',

    // Week 1 Page
    'guide.week1.title': '7日检查',
    'guide.week1.lead': '最初一周需要注意的要点和轻松的检查项目汇总。',
    'guide.week1.meta': '约4分钟 ｜ 更新：2026年2月',

    // Family Page
    'guide.family.title': '家庭入门指南',
    'guide.family.lead': '适用于有小孩或其他宠物的家庭的建议。',

    // Multi-cat Page
    'guide.multi.title': '多猫家庭入门指南',
    'guide.multi.lead': '介绍有先住猫·先住狗家庭的新猫磨合方法。',

    // Neuter Page
    'guide.neuter.title': '绝育护理指南',
    'guide.neuter.lead': '手术前后的准备和护理要点汇总。',

    // Grooming Page
    'guide.grooming.title': '换毛期护理指南',
    'guide.grooming.lead': '春秋换毛期的护理要点介绍。',

    // Behavior Page
    'guide.behavior.title': '磨爪·轻咬行为指导',
    'guide.behavior.lead': '了解幼猫的自然行为，不责骂、巧妙引导的方法。',

    // Passport Page
    'guide.passport.title': '幼猫护照',
    'guide.passport.lead': '交付时提供的"幼猫护照"样本。',

    // Weight Log Page
    'guide.weight.title': '体重记录表',
    'guide.weight.lead': '每月记录1〜2次就够了。',
  }
};

// Keys that should use innerHTML instead of textContent
const htmlKeys = new Set([
  'hero.subtitle',
  'story.subtitle',
  'story.shareHint'
]);

/**
 * Apply translations to all elements with data-i18n attribute
 */
function setLanguage(lang) {
  if (!translations[lang]) lang = 'ja';
  const langData = translations[lang];

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (langData[key] !== undefined) {
      if (htmlKeys.has(key)) {
        el.innerHTML = langData[key];
      } else {
        // Preserve icon children (mask .ico or inline svg, e.g. nav chevron); update only text
        const icon = el.querySelector('svg, .ico');
        if (icon) {
          var tn = null;
          el.childNodes.forEach(function (n) { if (!tn && n.nodeType === 3 && n.textContent.trim()) tn = n; });
          var val = langData[key];
          if (tn) {
            var lead = /^\s/.test(tn.textContent), trail = /\s$/.test(tn.textContent);
            tn.textContent = (lead ? ' ' : '') + val + (trail ? ' ' : '');
          } else if (el.firstChild === icon) {
            el.appendChild(document.createTextNode(' ' + val));
          } else {
            el.insertBefore(document.createTextNode(val + ' '), icon);
          }
        } else {
          el.textContent = langData[key];
        }
      }
    }
  });

  // Birthday formatting (data-i18n-birthday="2025-05")
  document.querySelectorAll('[data-i18n-birthday]').forEach(el => {
    var raw = el.getAttribute('data-i18n-birthday');
    var parts = raw.split('-');
    if (parts.length >= 2) {
      var y = parts[0], m = parseInt(parts[1], 10);
      if (lang === 'en') el.textContent = 'Born ' + y + '/' + m;
      else if (lang === 'zh') el.textContent = y + '\u5E74' + m + '\u6708\u51FA\u751F';
      else el.textContent = y + '\u5E74' + m + '\u6708\u751F\u307E\u308C';
    }
  });

  // Guide body block replacement (data-i18n-html)
  if (typeof guideBodyTranslations !== 'undefined') {
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      var key = el.getAttribute('data-i18n-html');
      if (lang === 'ja') {
        // Restore original Japanese HTML
        if (el._i18nOriginal) el.innerHTML = el._i18nOriginal;
      } else {
        // Save original on first switch
        if (!el._i18nOriginal) el._i18nOriginal = el.innerHTML;
        if (guideBodyTranslations[lang] && guideBodyTranslations[lang][key]) {
          el.innerHTML = guideBodyTranslations[lang][key];
        }
      }
    });
  }

  document.querySelectorAll('.lang-btn').forEach(btn => {
    var on = btn.getAttribute('data-lang') === lang;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  document.documentElement.lang = lang;

  try {
    localStorage.setItem('fuluckpet-lang', lang);
  } catch (e) {}

  window.dispatchEvent(new CustomEvent('langChanged', { detail: { lang: lang } }));
}

/**
 * Initialize i18n system
 */
function initI18n() {
  // Detect a static language prefix in the URL path (/en/... or /zh/...).
  // Static localized pages live under /en/ and /zh/; this keeps them in-language.
  var path = window.location.pathname;
  var pathLang = path.indexOf('/en/') === 0 ? 'en' : (path.indexOf('/zh/') === 0 ? 'zh' : null);
  var rootPath = pathLang ? path.substring(3) : path; // strip "/en" or "/zh"

  // Ja-root paths that have hand-baked /en/ + /zh/ siblings but whose page lacks a
  // .mobile-nav element, so nav.js bails and i18n.js owns the switch here (B2). On these
  // the switch must NAVIGATE to the sibling, not translate in place. Kept in sync with
  // nav.js hasStaticSibling(): the 5 blog slugs with real localized siblings. (Kitten
  // detail pages DO have .mobile-nav, so nav.js handles those — not needed here, but the
  // kitten-detail pattern is included for defence-in-depth in case that ever changes.)
  var I18N_BLOG_SIBLINGS = {
    '/blog/breeder-visit-flow-osaka.html': true,
    '/blog/choose-healthy-kitten-checklist.html': true,
    '/blog/siberian-coat-color-guide.html': true,
    '/blog/siberian-kitten-feeding-guide.html': true,
    '/blog/siberian-vs-bsh-vs-ragdoll.html': true
  };
  var I18N_KITTEN_DETAIL_RE = /^\/kittens\/[^\/]+\.html$/;
  function jaHasStaticSibling(p) {
    return !!(I18N_BLOG_SIBLINGS[p] || I18N_KITTEN_DETAIL_RE.test(p));
  }

  // Language-switch clicks are owned SOLELY by nav.js (one unified mechanism: it handles
  // per-language static siblings + in-place translation + localStorage persistence).
  // i18n.js only binds a fallback IF nav.js is absent, so the two never both fire on the
  // same button. window.__fuluckNavLangSwitch is set true by nav.js once it takes over.
  if (!window.__fuluckNavLangSwitch) {
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.__fuluckNavLangSwitch) return; // nav.js came online after DOMContentLoaded
        var target = this.getAttribute('data-lang');
        if (pathLang || jaHasStaticSibling(rootPath)) {
          // On a static localized page, OR a ja page with a hand-baked sibling:
          // navigate to the target language's URL instead of translating in place.
          try { localStorage.setItem('fuluckpet-lang', target); } catch (e) {}
          window.location.href = (target === 'ja' ? '' : '/' + target) + rootPath;
        } else {
          setLanguage(target);
        }
      });
    });
  }

  // Check URL parameter (?lang=en, ?lang=zh)
  var urlParams = new URLSearchParams(window.location.search);
  var urlLang = urlParams.get('lang');

  var savedLang = null;
  try {
    savedLang = localStorage.getItem('fuluckpet-lang');
  } catch (e) {}

  // Priority: static path prefix > URL parameter > saved preference
  var activeLang = pathLang || ((urlLang && translations[urlLang]) ? urlLang : savedLang);
  if (activeLang && translations[activeLang]) {
    setLanguage(activeLang);
  }
}

document.addEventListener('DOMContentLoaded', initI18n);


/* GA4 conversion event tracking (delegated, fires on LINE/booking/CTA clicks) */
document.addEventListener('click', function (e) {
  var a = e.target && e.target.closest ? e.target.closest('a, button') : null;
  if (!a || typeof window.gtag !== 'function') return;
  var href = (a.getAttribute('href') || '');
  var cta = a.getAttribute('data-cta') || '';
  try {
    if (/page\.line\.me/.test(href) || cta === 'line') {
      window.gtag('event', 'line_click', { link_location: a.className || 'link' });
    } else if (/\/booking\.html/.test(href) || cta === 'booking') {
      window.gtag('event', 'booking_click', { link_location: a.className || 'link' });
    }
  } catch (_) {}
}, true);

/* ===== YouTube lazy-load facade: swap thumbnail for iframe on first interaction ===== */
(function () {
  function loadFacade(f) {
    if (!f || f.dataset.loaded) return;
    var id = f.getAttribute('data-yt');
    if (!id) return;
    f.dataset.loaded = '1';
    var ifr = document.createElement('iframe');
    ifr.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
    ifr.title = f.getAttribute('aria-label') || 'YouTube';
    ifr.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    ifr.setAttribute('allowfullscreen', '');
    ifr.loading = 'lazy';
    f.innerHTML = '';
    f.appendChild(ifr);
    try { if (typeof window.gtag === 'function') window.gtag('event', 'video_play', { video_id: id }); } catch (_) {}
  }
  document.addEventListener('click', function (e) {
    var f = e.target.closest('.yt-facade');
    if (f) loadFacade(f);
  }, false);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var f = e.target.closest && e.target.closest('.yt-facade');
    if (f) { e.preventDefault(); loadFacade(f); }
  }, false);
})();
