/**
 * i18n.js - Internationalization for Fuluck Pet (福楽ペット)
 * Supports: Japanese (ja), English (en), Chinese Simplified (zh)
 */

const translations = {
  // ==================== JAPANESE (Default) ====================
  ja: {
    // Navigation
    'nav.about': '猫舎について',
    'nav.siberian': 'サイベリアン',
    'nav.kittens': '子猫一覧',
    'nav.parents': '親猫紹介',
    'nav.visit': '見学案内',
    'nav.faq': 'よくある質問',
    'nav.shop': 'Shop',

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
    'about.title': '福楽ペットについて',
    'about.desc': '健康で愛らしく、安定した性格を持つ子猫たちを育てることに全力を尽くしています。',
    'about.card1.title': '家庭的な環境',
    'about.card1.desc': 'わんちゃんやうさぎ、フェレットと共に暮らす環境で、子猫たちは自然に社会化トレーニングを受けます。人にも動物にも慣れた穏やかな子猫に育ちます。',
    'about.card2.title': '徹底した衛生管理',
    'about.card2.desc': '毎日の清掃と空気清浄システムを完備。ワクチン接種・健康チェック・ウイルス検査を実施し、安心してお迎えいただける体制を整えています。',
    'about.card3.title': 'お迎え準備',
    'about.card3.desc': '生後60日頃からシャワーとドライヤーの練習を開始。お迎え前には爪切り・シャンプーを実施し、新しいご家族との生活にスムーズに馴染めるよう準備します。',
    'about.card4.title': '充実のアフターサポート',
    'about.card4.desc': 'お迎え後もLINEで育て方や体調に関するご相談に対応。いつでもお気軽にご連絡ください。ずっと寄り添うパートナーでありたいと考えています。',

    // Siberian
    'siberian.title': 'サイベリアンの魅力',
    'siberian.desc': 'ロシア生まれの優雅な猫。家族を愛し、家庭に安らぎをもたらす最高のパートナーです。',
    'siberian.f1.tag': '低アレルゲン',
    'siberian.f1.title': '猫アレルギーの方にも',
    'siberian.f1.desc': 'サイベリアンは他の猫種に比べてアレルゲン（Fel d1）の分泌量が少なく、猫アレルギーをお持ちの方でも一緒に暮らせる可能性があります。',
    'siberian.f2.tag': '穏やかな性格',
    'siberian.f2.title': '家庭に馴染む',
    'siberian.f2.desc': '犬のような忠実さと猫らしい独立心を併せ持つ性格。家族との時間を大切にし、子どもや他のペットとも仲良く暮らせます。',
    'siberian.f3.tag': 'たくましい体',
    'siberian.f3.title': '健康で丈夫',
    'siberian.f3.desc': 'ロシアの厳しい自然環境で育まれた体質は丈夫で健康的。ふわふわのトリプルコートは見た目も美しく、触り心地も抜群です。',

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
    'flow.s2.title': '見学予約',
    'flow.s2.desc': '対面見学またはLINEビデオ通話での見学が可能です。実際に子猫と触れ合っていただけます。',
    'flow.s3.title': 'ご成約',
    'flow.s3.desc': '気に入った子猫が見つかりましたら、ご契約のお手続きを行います。お支払い方法もご相談ください。',
    'flow.s4.title': 'お迎え準備',
    'flow.s4.desc': 'ワクチン接種・健康診断・シャンプー・爪切りなど、万全の準備を整えてお引き渡しいたします。',
    'flow.s5.title': 'お迎え & アフターサポート',
    'flow.s5.desc': 'お迎え後もLINEでいつでもご相談いただけます。食事・健康・しつけなど、何でもお気軽にどうぞ。',

    // Voice (Reviews)
    'voice.title': 'お客様の声',
    'voice.total': '/ 113件のレビュー',
    'voice.r1.text': 'とても丁寧に対応していただき、安心してお迎えすることができました。子猫の性格や健康状態も詳しく教えてくださり、感謝しています。',
    'voice.r1.author': '— 大阪府 S様',
    'voice.r2.text': 'お迎え後もLINEで相談に乗っていただけて、初めて猫を飼う私たちにとって本当に心強いです。元気いっぱいの子猫に毎日癒されています。',
    'voice.r2.author': '— 兵庫県 M様',
    'voice.r3.text': '猫アレルギーがあり不安でしたが、サイベリアンなら大丈夫とアドバイスいただき、トライアルも対応してくださいました。今では家族の一員です。',
    'voice.r3.author': '— 京都府 K様',

    // FAQ
    'faq.title': 'よくある質問',
    'faq.q1': '猫アレルギーですが、サイベリアンなら大丈夫ですか？',
    'faq.a1': 'サイベリアンはアレルゲン（Fel d1）の分泌量が他の猫種より少ないとされていますが、個人差があります。ご心配な方にはトライアル期間を設けることも可能ですので、お気軽にご相談ください。',
    'faq.q2': '見学は予約制ですか？',
    'faq.a2': 'はい、完全予約制となっております。LINEまたはお電話にて前日までにご予約ください。対面見学のほか、LINEビデオ通話での見学も承っております。',
    'faq.q3': '遠方に住んでいますが、お迎えは可能ですか？',
    'faq.a3': 'はい、全国へのお届けに対応しております。空輸・陸送のほか、直接お迎えに来ていただくことも可能です。詳しくはお問い合わせください。',
    'faq.q4': '子猫の価格帯を教えてください。',
    'faq.a4': '猫種・血統・カラーにより異なりますが、概ね18万円〜29万円（税込）となっております。詳しくは子猫一覧ページをご確認いただくか、お問い合わせください。',
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

    // Footer
    'footer.navTitle': 'ナビゲーション',
    'footer.legalTitle': '動物取扱業表示',
  },

  // ==================== ENGLISH ====================
  en: {
    // Navigation
    'nav.about': 'About Us',
    'nav.siberian': 'Siberian Cats',
    'nav.kittens': 'Kittens',
    'nav.parents': 'Parent Cats',
    'nav.visit': 'Visit Us',
    'nav.faq': 'FAQ',
    'nav.shop': 'Shop',

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
    'about.title': 'About Fuluck Pet',
    'about.desc': 'We are dedicated to raising healthy, adorable kittens with stable and gentle temperaments.',
    'about.card1.title': 'A Home-Like Environment',
    'about.card1.desc': 'Our kittens grow up alongside dogs, rabbits, and ferrets, naturally learning socialization skills. They become gentle kittens that are comfortable around both people and other animals.',
    'about.card2.title': 'Thorough Hygiene Management',
    'about.card2.desc': 'We maintain daily cleaning and an air purification system. Vaccinations, health checks, and virus screenings are performed so you can welcome your kitten with confidence.',
    'about.card3.title': 'Pre-Adoption Preparation',
    'about.card3.desc': 'Starting around 60 days old, we begin shower and dryer training. Before adoption, we perform nail trimming and shampooing so kittens can adjust smoothly to their new homes.',
    'about.card4.title': 'Comprehensive After-Care Support',
    'about.card4.desc': 'Even after adoption, we provide ongoing consultations via LINE about care and health concerns. Please feel free to reach out at any time. We aim to be your lifelong partner.',

    // Siberian
    'siberian.title': 'The Appeal of Siberian Cats',
    'siberian.desc': 'An elegant breed from Russia. The perfect partner who loves family and brings peace to your home.',
    'siberian.f1.tag': 'Low Allergen',
    'siberian.f1.title': 'Suitable for Allergy Sufferers',
    'siberian.f1.desc': 'Siberians produce less of the allergen Fel d1 compared to other breeds, making it possible for people with cat allergies to live with them.',
    'siberian.f2.tag': 'Gentle Nature',
    'siberian.f2.title': 'Fits Right Into the Family',
    'siberian.f2.desc': 'With the loyalty of a dog and the independence of a cat, Siberians cherish family time and get along well with children and other pets.',
    'siberian.f3.tag': 'Strong & Sturdy',
    'siberian.f3.title': 'Healthy & Robust',
    'siberian.f3.desc': 'Bred in the harsh climate of Russia, Siberians are naturally healthy and strong. Their fluffy triple coat is beautiful to look at and wonderfully soft to the touch.',

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
    'flow.s2.title': 'Schedule a Visit',
    'flow.s2.desc': 'In-person visits or LINE video call viewings are available. You can interact with the kittens directly.',
    'flow.s3.title': 'Finalize the Agreement',
    'flow.s3.desc': 'Once you have found your perfect kitten, we will proceed with the contract. Payment methods are flexible.',
    'flow.s4.title': 'Preparation for Pickup',
    'flow.s4.desc': 'We complete vaccinations, health checks, shampooing, and nail trimming to ensure everything is ready for handover.',
    'flow.s5.title': 'Pickup & After-Care',
    'flow.s5.desc': 'After adoption, feel free to consult us anytime via LINE about diet, health, training, and anything else.',

    // Voice (Reviews)
    'voice.title': 'Customer Reviews',
    'voice.total': '/ 113 Reviews',
    'voice.r1.text': 'They were incredibly attentive and thorough, which made the adoption process worry-free. They gave us detailed information about the kitten\'s personality and health. Very grateful!',
    'voice.r1.author': '— S from Osaka',
    'voice.r2.text': 'Even after bringing our kitten home, they continued to offer advice via LINE. As first-time cat owners, this support has been invaluable. Our playful kitten brings us joy every day.',
    'voice.r2.author': '— M from Hyogo',
    'voice.r3.text': 'I was worried about my cat allergy, but they advised me that Siberians could be a good match and even arranged a trial period. Now our cat is a beloved member of the family.',
    'voice.r3.author': '— K from Kyoto',

    // FAQ
    'faq.title': 'Frequently Asked Questions',
    'faq.q1': 'I have cat allergies. Are Siberians safe for me?',
    'faq.a1': 'Siberians are known to produce less of the allergen Fel d1 than other breeds, though individual results may vary. For those with concerns, we can arrange a trial period. Please feel free to consult with us.',
    'faq.q2': 'Are visits by appointment only?',
    'faq.a2': 'Yes, visits are by appointment only. Please contact us via LINE or phone at least one day in advance. In addition to in-person visits, we also offer LINE video call viewings.',
    'faq.q3': 'I live far away. Can I still adopt a kitten?',
    'faq.a3': 'Yes, we offer nationwide delivery via air or ground transport. You are also welcome to pick up your kitten in person. Please contact us for details.',
    'faq.q4': 'What is the price range for kittens?',
    'faq.a4': 'Prices vary by breed, pedigree, and color, but generally range from 180,000 to 290,000 yen (tax included). Please check our kitten listings or contact us for details.',
    'faq.q5': 'Is after-adoption support available?',
    'faq.a5': 'Yes, we offer ongoing support via LINE after adoption. Feel free to contact us anytime about diet, health care, training, or any other concerns. We provide lifelong support.',
    'faq.q6': 'Do you breed cats other than Siberians?',
    'faq.a6': 'Yes, while Siberians are our specialty, we also breed British Shorthairs, British Longhairs, and Ragdolls. Please contact us if you are interested in a specific breed.',

    // Gallery
    'gallery.title': 'Alumni Gallery',
    'gallery.desc': 'Meet the kittens happily living with their new families.',

    // Visit
    'visit.title': 'Visit Information',
    'visit.desc': 'We look forward to introducing you to your future companion.',
    'visit.access': 'Access',
    'visit.address': 'Higashinakahama, Joto-ku, Osaka City, Osaka',
    'visit.addressNote': '* Detailed address will be provided upon reservation',
    'visit.info': 'About Visits',
    'visit.v1': 'By appointment only (please contact us at least one day prior)',
    'visit.v2': 'In-person visits & LINE video call viewings available',
    'visit.v3': 'Visit duration: approx. 30 min to 1 hour',
    'visit.v4': 'Families are welcome to visit together',
    'visit.lineTitle': 'Contact Us Easily via LINE',
    'visit.lineDesc': 'Reservations & inquiries through LINE',
    'visit.lineBtn': 'Add Us on LINE',

    // Footer
    'footer.navTitle': 'Navigation',
    'footer.legalTitle': 'Animal Dealer Registration',
  },

  // ==================== CHINESE SIMPLIFIED ====================
  zh: {
    // Navigation
    'nav.about': '关于我们',
    'nav.siberian': '西伯利亚猫',
    'nav.kittens': '幼猫一览',
    'nav.parents': '种猫介绍',
    'nav.visit': '参观指南',
    'nav.faq': '常见问题',
    'nav.shop': '商城',

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
    'about.title': '关于福楽宠物',
    'about.desc': '我们全力培育健康可爱、性格稳定温顺的幼猫。',
    'about.card1.title': '家庭式环境',
    'about.card1.desc': '幼猫从小在有狗狗、兔子和雪貂的环境中成长，自然而然地接受社会化训练，成为既亲人又亲近其他动物的温顺猫咪。',
    'about.card2.title': '严格的卫生管理',
    'about.card2.desc': '配备每日清洁和空气净化系统。实施疫苗接种、健康检查及病毒检测，确保您安心迎接幼猫回家。',
    'about.card3.title': '出窝前准备',
    'about.card3.desc': '从约60天大开始进行洗浴和吹干训练。出窝前进行修甲和洗浴护理，帮助幼猫顺利适应新家的生活。',
    'about.card4.title': '完善的售后支持',
    'about.card4.desc': '接猫回家后，您可以随时通过LINE咨询饲养和健康方面的问题。我们希望成为陪伴您一生的伙伴。',

    // Siberian
    'siberian.title': '西伯利亚猫的魅力',
    'siberian.desc': '源自俄罗斯的优雅猫种。深爱家人，为家庭带来安宁的理想伙伴。',
    'siberian.f1.tag': '低致敏',
    'siberian.f1.title': '猫过敏人群也适养',
    'siberian.f1.desc': '西伯利亚猫的过敏原（Fel d1）分泌量低于其他猫种，即使是有猫过敏症状的人也有可能与其共同生活。',
    'siberian.f2.tag': '性格温顺',
    'siberian.f2.title': '融入家庭',
    'siberian.f2.desc': '兼具犬般忠诚和猫的独立个性，珍视与家人的相处时光，能与儿童及其他宠物和睦相处。',
    'siberian.f3.tag': '体格强健',
    'siberian.f3.title': '健康强壮',
    'siberian.f3.desc': '在俄罗斯严酷的自然环境中锻炼出的强健体质。蓬松的三层被毛外观美丽，触感极佳。',

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
    'flow.s2.title': '预约参观',
    'flow.s2.desc': '可以现场参观或通过LINE视频通话远程看猫。您可以亲自与幼猫互动。',
    'flow.s3.title': '签订合同',
    'flow.s3.desc': '找到心仪的幼猫后，我们将办理合同手续。付款方式可协商。',
    'flow.s4.title': '出窝准备',
    'flow.s4.desc': '我们会完成疫苗接种、健康检查、洗浴护理和修甲等准备工作，确保万全交接。',
    'flow.s5.title': '接猫 & 售后支持',
    'flow.s5.desc': '接猫后可随时通过LINE咨询饮食、健康、训练等任何问题，请随时联系我们。',

    // Voice (Reviews)
    'voice.title': '客户评价',
    'voice.total': '/ 113条评价',
    'voice.r1.text': '非常细心周到的服务，让我们安心地迎接了小猫。详细介绍了猫咪的性格和健康状况，非常感谢！',
    'voice.r1.author': '— 大阪府 S先生/女士',
    'voice.r2.text': '接猫回家后，还能通过LINE随时咨询，对于第一次养猫的我们来说非常安心。活泼可爱的小猫每天都在治愈着我们。',
    'voice.r2.author': '— \u5175\u5e93\u53bf M\u5148\u751f/\u5973\u58eb',
    'voice.r3.text': '我有猫过敏一直很担心，但被告知西伯利亚猫可能没问题，还安排了试养期。现在猫咪已经是我们家庭的一员了。',
    'voice.r3.author': '— 京都府 K先生/女士',

    // FAQ
    'faq.title': '常见问题',
    'faq.q1': '我有猫过敏，养西伯利亚猫可以吗？',
    'faq.a1': '西伯利亚猫的过敏原（Fel d1）分泌量低于其他猫种，但因人而异。如果您有顾虑，我们可以安排试养期，请随时咨询。',
    'faq.q2': '参观需要预约吗？',
    'faq.a2': '是的，我们采用完全预约制。请至少提前一天通过LINE或电话预约。除现场参观外，我们也提供LINE视频看猫服务。',
    'faq.q3': '我住得比较远，可以领养吗？',
    'faq.a3': '可以的，我们支持全国配送，可通过空运或陆运送达。您也可以亲自前来接猫。详情请咨询我们。',
    'faq.q4': '幼猫的价格范围是多少？',
    'faq.a4': '根据猫种、血统和花色有所不同，大致在18万至29万日元（含税）之间。详情请查看幼猫一览页面或联系我们。',
    'faq.q5': '领养后有售后支持吗？',
    'faq.a5': '有的，领养后您可以随时通过LINE咨询饮食、健康管理、训练等任何问题。我们提供终身支持。',
    'faq.q6': '除了西伯利亚猫还有其他猫种吗？',
    'faq.a6': '有的，我们以西伯利亚猫为主，同时也繁育英国短毛猫、英国长毛猫和布偶猫。如果您有感兴趣的猫种，请随时咨询。',

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

    // Footer
    'footer.navTitle': '导航',
    'footer.legalTitle': '动物经营许可信息',
  }
};

// Keys that should use innerHTML instead of textContent
const htmlKeys = new Set([
  'hero.subtitle'
]);

/**
 * Apply translations to all elements with data-i18n attribute
 * @param {string} lang - Language code ('ja', 'en', or 'zh')
 */
function setLanguage(lang) {
  // Fallback to Japanese if the language is not supported
  if (!translations[lang]) {
    lang = 'ja';
  }

  const langData = translations[lang];

  // Translate all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    const key = el.getAttribute('data-i18n');
    if (langData[key] !== undefined) {
      if (htmlKeys.has(key)) {
        el.innerHTML = langData[key];
      } else {
        el.textContent = langData[key];
      }
    }
  });

  // Update active state on all language buttons
  document.querySelectorAll('.lang-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
  });

  // Update the html lang attribute
  document.documentElement.lang = lang;

  // Save preference to localStorage
  try {
    localStorage.setItem('fuluckpet-lang', lang);
  } catch (e) {
    // localStorage may not be available (e.g., private browsing)
  }
}

/**
 * Initialize i18n system
 */
function initI18n() {
  // Bind click events to all language buttons
  document.querySelectorAll('.lang-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var lang = this.getAttribute('data-lang');
      setLanguage(lang);
    });
  });

  // Check localStorage for saved language preference
  var savedLang = null;
  try {
    savedLang = localStorage.getItem('fuluckpet-lang');
  } catch (e) {
    // localStorage may not be available
  }

  // Apply saved language if it exists and is valid, otherwise default to 'ja'
  if (savedLang && translations[savedLang]) {
    setLanguage(savedLang);
  }
  // If no saved preference, keep the default Japanese content as-is
  // (the HTML already contains Japanese text)
}

// Initialize when the DOM is ready
document.addEventListener('DOMContentLoaded', initI18n);
