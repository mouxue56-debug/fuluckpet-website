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
    'nav.parents': '親猫紹介',
    'nav.visit': '見学案内',
    'nav.faq': 'よくある質問',
    'nav.shop': 'Shop',
    'nav.more': 'もっと見る',
    'nav.siberian': 'サイベリアンの魅力',
    'nav.aboutPage': '受賞歴・認定',
    'nav.gallery': '卒業猫ギャラリー',
    'nav.reviews': 'お客様の声',
    'nav.naming': '子猫の名前ツール',
    'nav.allKittens': '子猫一覧（すべて）',
    'nav.allParents': '親猫紹介（すべて）',
    'parents.moreLink': 'すべての親猫を見る →',
    'kittens.allLink': 'すべての子猫を見る →',

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

    // Kittens
    'kittens.title': '子猫一覧',
    'kittens.desc': '新しいご家族を待っている子猫たちをご紹介します。',
    'kittens.all': 'すべて',
    'kittens.available': '販売中',
    'kittens.reserved': '商談中',
    'kittens.sold': 'ご家族決定',
    'kittens.soldText': 'ご家族が決まりました',
    'kittens.cta': '気になる子がいたらお問い合わせ',

    // Parents
    'parents.title': '親猫紹介',
    'parents.desc': '優秀な血統と愛情深い性格を持つ、当舎自慢の親猫たちです。',
    'parents.papa': 'パパ猫',
    'parents.mama': 'ママ猫',

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

    // FAQ
    'faq.title': 'よくある質問',
    'faq.q1': '猫アレルギーですが、サイベリアンなら大丈夫ですか？',
    'faq.a1': 'サイベリアンはアレルゲン（Fel d1）の分泌量が他の猫種より少ないとされていますが、個人差があります。ご心配な方にはトライアル期間を設けることも可能ですので、お気軽にご相談ください。',
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

    // Gallery
    'gallery.title': '卒業猫ギャラリー',
    'gallery.desc': '新しいご家族の元で幸せに暮らす卒業猫たちをご紹介します。',

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

    // Law Notice
    'law.title': '動物愛護管理法に基づく対面販売',
    'law.text': '法律の規定により、ご購入前に必ずキャッテリーにお越しいただき、子猫と対面していただく必要がございます。対面販売・対面説明・現物確認は法律で義務付けられております。',

    // Footer
    'footer.navTitle': 'ナビゲーション',
    'footer.legalTitle': '動物取扱業表示',
    'footer.pagesTitle': '詳しく見る',

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

    // Common
    'common.home': 'ホーム',
    'common.moreBtn': 'もっと見る',
    'common.backHome': 'ホームに戻る',
    'common.viewKittens': '子猫を見る',
    'common.bookVisit': '見学を予約する',
  },

  // ==================== ENGLISH ====================
  en: {
    // Navigation
    'nav.about': 'About Us',
    'nav.kittens': 'Kittens',
    'nav.parents': 'Parent Cats',
    'nav.visit': 'Visit Us',
    'nav.faq': 'FAQ',
    'nav.shop': 'Shop',
    'nav.more': 'More',
    'nav.siberian': 'About Siberians',
    'nav.aboutPage': 'Awards & Certifications',
    'nav.gallery': 'Alumni Gallery',
    'nav.reviews': 'Customer Reviews',
    'nav.naming': 'Kitten Naming Tool',
    'nav.allKittens': 'All Kittens',
    'nav.allParents': 'All Parent Cats',
    'parents.moreLink': 'View All Parent Cats →',
    'kittens.allLink': 'View All Kittens →',

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

    // Kittens
    'kittens.title': 'Available Kittens',
    'kittens.desc': 'Meet the kittens waiting for their new families.',
    'kittens.all': 'All',
    'kittens.available': 'Available',
    'kittens.reserved': 'Reserved',
    'kittens.sold': 'Adopted',
    'kittens.soldText': 'Found a loving family',
    'kittens.cta': 'Interested? Contact us today',

    // Parents
    'parents.title': 'Parent Cats',
    'parents.desc': 'Our proud parent cats with excellent pedigrees and loving personalities.',
    'parents.papa': 'Father',
    'parents.mama': 'Mother',

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

    // FAQ
    'faq.title': 'Frequently Asked Questions',
    'faq.q1': 'I have cat allergies. Are Siberians safe for me?',
    'faq.a1': 'Siberians produce less Fel d1 allergen than other breeds, though individual results vary. We can arrange a trial period for those with concerns.',
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

    // Gallery
    'gallery.title': 'Alumni Gallery',
    'gallery.desc': 'Meet the kittens happily living with their new families.',

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

    // Law Notice
    'law.title': 'In-Person Sales (Animal Protection Law)',
    'law.text': 'Under Japanese law, an in-person meeting at our cattery is required before purchase. Face-to-face sales, explanation, and physical confirmation are legally mandated.',

    // Footer
    'footer.navTitle': 'Navigation',
    'footer.legalTitle': 'Animal Dealer Registration',
    'footer.pagesTitle': 'Learn More',

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

    // Common
    'common.home': 'Home',
    'common.moreBtn': 'See More',
    'common.backHome': 'Back to Home',
    'common.viewKittens': 'View Kittens',
    'common.bookVisit': 'Book a Visit',
  },

  // ==================== CHINESE SIMPLIFIED ====================
  zh: {
    // Navigation
    'nav.about': '关于我们',
    'nav.kittens': '幼猫一览',
    'nav.parents': '种猫介绍',
    'nav.visit': '参观指南',
    'nav.faq': '常见问题',
    'nav.shop': '商城',
    'nav.more': '更多',
    'nav.siberian': '西伯利亚猫的魅力',
    'nav.aboutPage': '获奖·认证',
    'nav.gallery': '毕业猫相册',
    'nav.reviews': '客户评价',
    'nav.naming': '幼猫起名工具',
    'nav.allKittens': '幼猫一览（全部）',
    'nav.allParents': '种猫介绍（全部）',
    'parents.moreLink': '查看所有种猫 →',
    'kittens.allLink': '查看所有幼猫 →',

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

    // Kittens
    'kittens.title': '幼猫一览',
    'kittens.desc': '为您介绍正在等待新家人的幼猫们。',
    'kittens.all': '全部',
    'kittens.available': '在售',
    'kittens.reserved': '洽谈中',
    'kittens.sold': '已找到家庭',
    'kittens.soldText': '已找到温暖的家',
    'kittens.cta': '心动了？快来咨询吧',

    // Parents
    'parents.title': '种猫介绍',
    'parents.desc': '拥有优秀血统和温柔性格的优质种猫。',
    'parents.papa': '猫爸爸',
    'parents.mama': '猫妈妈',

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

    // FAQ
    'faq.title': '常见问题',
    'faq.q1': '我有猫过敏，养西伯利亚猫可以吗？',
    'faq.a1': '西伯利亚猫的过敏原（Fel d1）分泌量低于其他猫种，但因人而异。如有顾虑，我们可以安排试养期。',
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

    // Gallery
    'gallery.title': '毕业猫相册',
    'gallery.desc': '看看在新家庭中幸福生活的毕业猫咪们。',

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

    // Law Notice
    'law.title': '动物爱护管理法·面对面销售',
    'law.text': '根据法律规定，购买前必须亲自到猫舍与幼猫见面。面对面销售、面对面说明及实物确认是法律义务。',

    // Footer
    'footer.navTitle': '导航',
    'footer.legalTitle': '动物经营许可信息',
    'footer.pagesTitle': '了解更多',

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

    // Common
    'common.home': '首页',
    'common.moreBtn': '查看更多',
    'common.backHome': '返回首页',
    'common.viewKittens': '查看幼猫',
    'common.bookVisit': '预约参观',
  }
};

// Keys that should use innerHTML instead of textContent
const htmlKeys = new Set([
  'hero.subtitle'
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
        // Preserve SVG/child elements (e.g. dropdown toggle chevron)
        const svg = el.querySelector('svg');
        if (svg) {
          el.childNodes.forEach(n => { if (n.nodeType === 3) n.remove(); });
          el.insertBefore(document.createTextNode(langData[key] + ' '), svg);
        } else {
          el.textContent = langData[key];
        }
      }
    }
  });

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
  });

  document.documentElement.lang = lang;

  try {
    localStorage.setItem('fuluckpet-lang', lang);
  } catch (e) {}
}

/**
 * Initialize i18n system
 */
function initI18n() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      setLanguage(this.getAttribute('data-lang'));
    });
  });

  var savedLang = null;
  try {
    savedLang = localStorage.getItem('fuluckpet-lang');
  } catch (e) {}

  if (savedLang && translations[savedLang]) {
    setLanguage(savedLang);
  }
}

document.addEventListener('DOMContentLoaded', initI18n);
