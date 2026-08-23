/* faq-trust-copy.js — versioned local truth for owner-reviewed FAQ facts. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FaqTrustCopy = api;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var VERSION = '20260823-trust-v2';
  var LINE_URL = 'https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true';
  var COPY = {
    faq_3: {
      question: {
        ja: '遠方に住んでいますが、お迎えは可能ですか？',
        en: 'I live far away. Can I still adopt?',
        zh: '我住得比较远，可以领养吗？'
      },
      answer: {
        ja: 'はい、全国へのお届けが可能です。動物愛護管理法により、ご契約は当キャッテリーの登録事業所（大阪市城東区東中浜2-6-23）で子猫の現物確認と対面説明を一度行ったうえで成立します。ご契約後は、空輸・陸送（空港お届けなど）でお届けできます。遠方の方は、LINEビデオ通話での事前相談・オンライン見学をご利用のうえ、ご契約時に一度ご来舎ください。配送費用は料金ガイドをご覧ください。',
        en: "Yes, we can deliver nationwide. Under Japan's Animal Welfare Act, the sales contract is concluded once, in person, at our registered premises (2-6-23 Higashinakahama, Joto-ku, Osaka), after you have seen the kitten and received the required explanation. After the contract, we can deliver by air or ground (airport hand-over available). Customers living far away are welcome to use a LINE video call for pre-consultation and an online viewing, then visit us once to sign. See the price guide for delivery fees.",
        zh: '可以，我们支持全国配送。依据日本《动物爱护管理法》，买卖合同需在本猫舍的登记营业所（大阪市城东区东中浜2-6-23）当面确认幼猫并听取说明后签订一次。签约后可通过空运或陆运（含机场交接）送达。远方客户可先通过 LINE 视频进行咨询和线上见学，签约时来舍一次即可。配送费用请参阅价格指南。'
      },
      links: {
        ja: [{ href: '/guide/price.html', label: '料金ガイド' }, { href: LINE_URL, label: 'LINEで相談' }],
        en: [{ href: '/guide/price.html', label: 'Price guide' }, { href: LINE_URL, label: 'Contact us on LINE' }],
        zh: [{ href: '/guide/price.html', label: '价格指南' }, { href: LINE_URL, label: '通过 LINE 咨询' }]
      }
    },
    faq_6: {
      question: {
        ja: 'サイベリアン以外の猫種も扱っていますか？',
        en: 'Do you breed cats other than Siberians?',
        zh: '除了西伯利亚猫还有其他猫种吗？'
      },
      answer: {
        ja: 'はい、サイベリアンを中心に、ブリティッシュショートヘア・ブリティッシュロングヘア、サイベリアン×ブリティッシュのミックスも取り扱っております。過去にラグドールの繁育実績もございますが、現在は繁育しておりません。ご希望の猫種がございましたらお問い合わせください。',
        en: "Yes — alongside our specialty Siberians, we also breed British Shorthairs, British Longhairs and Siberian × British Shorthair mixes. We have past breeding experience with Ragdolls but no longer breed them. Please ask if you are interested in a specific breed.",
        zh: '有的，以西伯利亚猫为主，同时也繁育英国短毛猫、英国长毛猫，以及西伯利亚×英国短毛的混血猫。布偶猫我们过去曾有繁育实绩，现在已不再繁育。如果您对特定猫种感兴趣，请告诉我们。'
      },
      links: {
        ja: [{ href: LINE_URL, label: 'LINEで相談' }],
        en: [{ href: LINE_URL, label: 'Contact us on LINE' }],
        zh: [{ href: LINE_URL, label: '通过 LINE 咨询' }]
      }
    },
    faq_7: {
      question: {
        ja: 'ワクチン接種は済んでいますか？',
        en: 'Are vaccinations completed?',
        zh: '是否已经接种疫苗？'
      },
      answer: {
        ja: 'お引渡し前に月齢に応じた1回目のワクチン接種を済ませております。2回目以降は、お迎え後にかかりつけの動物病院で接種をお願いしております。ワクチン証明書もお渡しします。（ワクチン代10,000円は子猫価格とは別に申し受けます）',
        en: 'The first vaccination (age-appropriate) is completed before handover. The second and subsequent vaccines should be given at your local vet after adoption. A vaccination certificate is included. (A separate vaccination fee of ¥10,000 applies in addition to the kitten price.)',
        zh: '交付前会按月龄完成第一针疫苗。第二针及以后请在领养后的本地宠物医院接种。我们会提供疫苗证明书。（疫苗费10,000日元另计，不含在幼猫价格内。）'
      },
      links: { ja: [], en: [], zh: [] }
    },
    faq_12: {
      question: {
        ja: 'ブリーダーの見学場所はどこですか？',
        en: 'Where is the cattery?',
        zh: '猫舍参观的地点在哪里？'
      },
      answer: {
        ja: '見学場所：大阪市城東区東中浜2-6-23（最寄り：Osaka Metro 緑橋駅）です。お車でのお越しも可能です。完全予約制のため、事前にLINEまたは予約ページからご連絡ください。',
        en: 'Visit location: 2-6-23 Higashinakahama, Joto-ku, Osaka (nearest station: Osaka Metro Midoribashi). Parking is available. Visits are by appointment only — please contact us via LINE or the booking page in advance.',
        zh: '见学地点：大阪市城东区东中浜2-6-23（最近车站：Osaka Metro 绿桥站）。可以自驾前来。因采用完全预约制，请提前通过LINE或预约页面联系我们。'
      },
      links: {
        ja: [{ href: '/booking.html', label: '見学を予約する' }, { href: LINE_URL, label: 'LINEで相談' }],
        en: [{ href: '/booking.html', label: 'Book a visit' }, { href: LINE_URL, label: 'Contact us on LINE' }],
        zh: [{ href: '/booking.html', label: '预约参观' }, { href: LINE_URL, label: '通过 LINE 咨询' }]
      }
    },
    faq_15: {
      question: {
        ja: '血統書は付きますか？',
        en: 'Is a pedigree certificate included?',
        zh: '是否提供血统证书？'
      },
      answer: {
        ja: '純血種の子猫にはCFAまたはTICAの血統書が付きます（ミックスは対象外）。お引渡し後に登録団体から郵送される場合がありますので、届くまで少々お時間をいただくことがあります。',
        en: 'Purebred kittens come with a CFA or TICA pedigree certificate (mixed-breed kittens are not eligible). The certificate may be mailed from the registry after handover, so it can take a little time to arrive.',
        zh: '纯种幼猫附带CFA或TICA血统证书（混血猫不适用）。证书可能在交付后由登记机构邮寄，可能需要一些时间送达。'
      },
      links: { ja: [], en: [], zh: [] }
    },
    faq_16: {
      question: {
        ja: '予約金やデポジットは必要ですか？',
        en: 'Is a deposit required?',
        zh: '需要预约金或定金吗？'
      },
      answer: {
        ja: 'ご成約時に予約金として50,000円をお願いしております。ご入金確認後、他のお客様からのお問い合わせをお断りし、商談中の状態に切り替えさせていただきます。残金は引き渡し日当日にお支払いください。',
        en: 'A ¥50,000 reservation deposit is required to confirm a kitten. Once received, we stop taking inquiries from other customers and mark the kitten as reserved. The remaining balance is due on the day of handover.',
        zh: '签约时需支付 50,000 日元的预约金。确认收款后，我们将停止接受其他客户的咨询，并将该猫咪状态切换为洽谈中。余款请在交付当日支付。'
      },
      links: { ja: [], en: [], zh: [] }
    },
    faq_18: {
      question: {
        ja: '購入をキャンセルすることはできますか？',
        en: 'Can I cancel my purchase?',
        zh: '可以取消订购吗？'
      },
      answer: {
        ja: 'やむを得ない事情がある場合はご相談ください。ただし、お客様のご都合によるキャンセルの場合、お支払いいただいた予約金（50,000円）はご返金いたしかねますのでご了承ください。詳しくはご契約時にご説明いたします。',
        en: "Please contact us if there are unavoidable circumstances. For cancellations at the customer's discretion, however, the ¥50,000 reservation deposit cannot be refunded — please understand. Details are explained at contract time.",
        zh: '如有不可避免的情况，请与我们商议。但因客户自身原因取消时，已支付的 50,000 日元预约金恕不退还，敬请谅解。具体内容将在签约时说明。'
      },
      links: { ja: [], en: [], zh: [] }
    },
    faq_2: {
      question: {
        ja: '見学は予約制ですか？',
        en: 'Are visits by appointment only?',
        zh: '参观需要预约吗？'
      },
      answer: {
        ja: '見学は完全予約制です。ご希望の日時は予約ページまたはLINEからお知らせください。平日・土日いずれも対応可能です。見学時間は約30分〜1時間を目安にしてください。',
        en: 'Visits are by appointment only. Please share your preferred date and time through the booking page or LINE. Weekdays and weekends are available. Please allow about 30 minutes to 1 hour for your visit.',
        zh: '参观采用完全预约制。请通过预约页面或 LINE 告知希望的日期和时间。平日和周末均可，每次参观请预留约 30 分钟至 1 小时。'
      },
      links: {
        ja: [{ href: '/booking.html', label: '予約ページ' }, { href: LINE_URL, label: 'LINEで相談' }],
        en: [{ href: '/booking.html', label: 'Booking page' }, { href: LINE_URL, label: 'Contact us on LINE' }],
        zh: [{ href: '/booking.html', label: '预约页面' }, { href: LINE_URL, label: '通过 LINE 咨询' }]
      }
    },
    faq_4: {
      question: {
        ja: '子猫の価格帯を教えてください。',
        en: 'How can I check kitten prices?',
        zh: '如何查看猫咪价格？'
      },
      answer: {
        ja: '料金は子猫ごとに異なります。各子猫ページの最新情報をご確認いただくか、LINEでお問い合わせください。',
        en: 'Prices vary by kitten. Please check the latest details on each kitten page or contact us on LINE.',
        zh: '价格因猫咪而异。请查看每只猫咪页面的最新信息，或通过 LINE 咨询。'
      },
      links: {
        ja: [{ href: '/kittens.html', label: '子猫一覧' }, { href: LINE_URL, label: 'LINEで相談' }],
        en: [{ href: '/kittens.html', label: 'View kittens' }, { href: LINE_URL, label: 'Contact us on LINE' }],
        zh: [{ href: '/kittens.html', label: '查看猫咪' }, { href: LINE_URL, label: '通过 LINE 咨询' }]
      }
    }
  };

  // New FAQ entries that do not yet exist in the backend /api/faq collection.
  // applyTrustOverrides() appends whichever of these are missing from the fetched
  // array (by id) so faq.html and the homepage mini-FAQ show them immediately,
  // without waiting on a backend change. If the backend later adds the same id,
  // the fetched item wins (no duplicate is appended) but its copy is still
  // overridden above via COPY, since these ids are also present there... note:
  // health-guarantee/mix/adult ids are NOT in COPY (nothing to override — they
  // simply don't exist upstream yet), so they are additions only.
  var ADDITIONS = [
    {
      id: 'faq_25',
      category: 'purchase',
      question: {
        ja: '生体保証（健康保証）はありますか？',
        en: 'Is there a health guarantee for the kitten?',
        zh: '幼猫有健康保证（生体保证）吗？'
      },
      answer: {
        ja: 'はい、無料の生体保証をご用意しております。お引き渡し日から30日以内に先天性疾患が原因で亡くなった場合、同猫種の子猫をお渡しいたします（治療費や金銭でのご返金は保証の対象外です）。ご利用には、当日中のご連絡と、獣医師による死亡診断書・検査結果原本のご提出が必要です。事故・感染症予防接種による体調不良、飼育環境に起因する体調不良など、一部の事由は保証の対象外となります。詳細はご契約時にご説明いたします。',
        en: "Yes. We provide a free health guarantee: if a kitten passes away within 30 days of handover due to a congenital condition, we will provide a replacement kitten of the same breed (this guarantee covers replacement only, not treatment costs or a cash refund). To use it, please contact us the same day and provide a vet's death certificate and original test results. Certain causes — such as accidents, vaccine reactions, or care-related issues — are excluded. Full details are explained at contract time.",
        zh: '有的，我们提供免费的生体保证：若幼猫在交付之日起30天内因先天性疾病死亡，我们将补偿一只同品种的幼猫（该保证仅限换猫，不含治疗费或现金赔偿）。使用该保证需在当天联系我们，并提供兽医出具的死亡诊断书及检测报告原件。因意外、疫苗接种反应或饲养环境等原因造成的情况不在保证范围内。详细内容将在签约时说明。'
      },
      links: { ja: [], en: [], zh: [] }
    },
    {
      id: 'faq_26',
      category: 'general',
      question: {
        ja: 'ミックスの子猫はどう違いますか？',
        en: 'How are the mixed-breed kittens different?',
        zh: '混血幼猫有什么不同？'
      },
      answer: {
        ja: '当キャッテリーのミックスは、サイベリアンとブリティッシュショートヘアの両親から生まれた子で、異なる品種の掛け合わせにより遺伝的多様性が高まり、特定の純血種に見られやすい遺伝性疾患のリスクが比較的低いとされています（個体差があり、健康を保証するものではありません）。サイベリアン譲りのふんわりとした被毛とブリティッシュ譲りの穏やかで人懐こい気質をあわせ持ち、価格も純血種よりお求めやすく設定しています。なお、ミックスのため血統書の発行はありません。',
        en: "Our mixed kittens are born to a Siberian and a British Shorthair parent; crossing two breeds increases genetic diversity, which is generally associated with a lower risk of the hereditary conditions seen in some purebred lines (individual results vary; this is not a health guarantee). They combine the Siberian's soft, plush coat with the British Shorthair's calm, affectionate temperament, at a more accessible price than our purebred kittens. As mixes, they do not come with a pedigree certificate.",
        zh: '本猫舍的混血猫由西伯利亚猫与英国短毛猫的父母所生，不同品种杂交提高了遗传多样性，通常认为特定纯种猫常见的遗传性疾病风险相对较低（存在个体差异，不构成健康保证）。它们兼具西伯利亚猫柔软蓬松的被毛与英短温和亲人的性格，价格也比纯种幼猫更易入手。由于是混血，不附带血统证书。'
      },
      links: { ja: [], en: [], zh: [] }
    },
    {
      id: 'faq_27',
      category: 'general',
      question: {
        ja: '成猫・若猫もお迎えできますか？',
        en: 'Can I adopt an adult or young-adult cat?',
        zh: '可以领养成猫或青年猫吗？'
      },
      answer: {
        ja: '生後12ヶ月以上の成猫・若猫も直接お迎えいただけます。性格がすでに出来上がっており、子猫期特有の夜鳴きやいたずら、頻繁なワクチン通院の時期を過ぎているため特別なケアは不要です（去勢・避妊済みの子は発情期の心配もありません）。初めて猫を迎える方や日中お仕事で留守にされる方にもおすすめで、そのままご家庭に迎えて今日から一緒に暮らし始められます。',
        en: 'Yes — cats aged 12 months and over are available to adopt directly. Their personality is already settled, and they are past the kitten stage of night-time crying, mischief and frequent vaccination visits, so no special care is needed (neutered or spayed cats also mean no heat-cycle concerns). They are a great match for first-time owners and households that are out during the day, ready to move in and start life with you today.',
        zh: '可以，12个月以上的成猫・青年猫也可以直接接回家。它们性格已经定型，已经度过幼猫期的夜间叫唤、调皮捣蛋和频繁疫苗就诊阶段，无需特殊照顾（已绝育的猫咪也不必担心发情期）。特别适合第一次养猫或白天上班不在家的家庭，可以直接接回家，从今天开始一起生活。'
      },
      links: { ja: [], en: [], zh: [] }
    }
  ];

  function normalizeLang(lang) {
    return lang === 'en' || lang === 'zh' ? lang : 'ja';
  }

  function applyTrustOverrides(items) {
    if (!Array.isArray(items)) return [];
    var out = items.map(function (item) {
      if (!item || typeof item !== 'object' || !Object.prototype.hasOwnProperty.call(COPY, item.id)) return item;
      var reviewed = COPY[item.id];
      var clone = {};
      Object.keys(item).forEach(function (key) { clone[key] = item[key]; });
      clone.question = Object.assign({}, reviewed.question);
      clone.answer = Object.assign({}, reviewed.answer);
      clone.trustCopyVersion = VERSION;
      return clone;
    });
    var seen = Object.create(null);
    out.forEach(function (item) { if (item && item.id) seen[item.id] = true; });
    ADDITIONS.forEach(function (addition) {
      if (seen[addition.id]) return; // backend already serves this id — don't duplicate
      out.push({
        id: addition.id,
        category: addition.category,
        question: Object.assign({}, addition.question),
        answer: Object.assign({}, addition.answer),
        trustCopyVersion: VERSION
      });
    });
    return out;
  }

  function linksFor(id, lang) {
    var reviewed = Object.prototype.hasOwnProperty.call(COPY, id) ? COPY[id] : null;
    if (!reviewed) {
      for (var i = 0; i < ADDITIONS.length; i++) {
        if (ADDITIONS[i].id === id) { reviewed = ADDITIONS[i]; break; }
      }
    }
    if (!reviewed || !reviewed.links) return [];
    return reviewed.links[normalizeLang(lang)].map(function (link) {
      return { href: link.href, label: link.label };
    });
  }

  return {
    version: VERSION,
    copy: COPY,
    additions: ADDITIONS,
    applyTrustOverrides: applyTrustOverrides,
    linksFor: linksFor
  };
}));
