// kitten-carousel.js — Dynamic kitten carousel for blog articles & FAQ
// Fetches real kitten data from API, renders a scrolling photo carousel
// Replaces static CTA boxes with living, breathing kitten cards
// Supports category-based contextual CTA messaging
(function() {
  var API = window.FULUCK_API_BASE || 'https://fuluck-api.mouxue56.workers.dev';
  var LINE_URL = 'https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true';
  var BOOKING_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScZHJxpxNwU1iGnaNaIFg5JQxVcAIO9KTJP22jPZ3Nyr0MNnw/viewform';

  function getLang() {
    try { return localStorage.getItem('fuluckpet-lang') || 'ja'; } catch(e) { return 'ja'; }
  }

  // Breed name mapping: API returns Japanese breed names, need translation for en/zh
  var BREED_MAP = {
    'サイベリアン': { en: 'Siberian', zh: '西伯利亚猫' },
    'ブリティッシュショートヘア': { en: 'British Shorthair', zh: '英国短毛猫' },
    'ブリティッシュロングヘア': { en: 'British Longhair', zh: '英国长毛猫' },
    'ラグドール': { en: 'Ragdoll', zh: '布偶猫' }
  };

  // Category-based CTA messaging
  var CTA_MAP = {
    ja: {
      'アレルギー':     { heading: 'アレルギーが心配？相性チェック見学へ', btn1: '見学を予約する', btn1Link: BOOKING_URL, btn2: 'LINEで相談', btn2Link: LINE_URL },
      '子猫育て':       { heading: 'お迎え準備、できていますか？', btn1: 'お迎えガイドを見る', btn1Link: '/guide/', btn2: 'LINEでお迎え相談', btn2Link: LINE_URL },
      'ブリーダー選び':  { heading: '信頼できるブリーダーをお探しですか？', btn1: '子猫一覧を見る', btn1Link: '/kittens.html', btn2: '見学を予約する', btn2Link: BOOKING_URL },
      '猫種知識':       { heading: 'サイベリアンの子猫に会いませんか？', btn1: '子猫一覧を見る', btn1Link: '/kittens.html', btn2: '見学を予約する', btn2Link: BOOKING_URL },
      '健康管理':       { heading: '健康管理を徹底した子猫たちです', btn1: '子猫の情報を見る', btn1Link: '/kittens.html', btn2: 'LINEで相談', btn2Link: LINE_URL },
      '飲食栄養':       { heading: '栄養管理された子猫をお届け', btn1: '子猫一覧を見る', btn1Link: '/kittens.html', btn2: 'LINEで相談', btn2Link: LINE_URL },
      '行動・しつけ':    { heading: '社会性豊かな子猫を育てています', btn1: '子猫一覧を見る', btn1Link: '/kittens.html', btn2: 'お迎えガイド', btn2Link: '/guide/' },
      '日常ケア':       { heading: '猫との暮らし、始めてみませんか？', btn1: '子猫一覧を見る', btn1Link: '/kittens.html', btn2: 'お迎えガイド', btn2Link: '/guide/' },
      '猫ライフ':       { heading: '猫との暮らし、始めてみませんか？', btn1: '子猫一覧を見る', btn1Link: '/kittens.html', btn2: 'お迎えガイド', btn2Link: '/guide/' },
      'シニア猫':       { heading: 'この子たちが待っています', btn1: '子猫一覧を見る', btn1Link: '/kittens.html', btn2: 'LINEで相談', btn2Link: LINE_URL }
    },
    en: {
      'アレルギー':     { heading: 'Worried about allergies? Book a compatibility visit', btn1: 'Book a Visit', btn1Link: BOOKING_URL, btn2: 'Chat on LINE', btn2Link: LINE_URL },
      '子猫育て':       { heading: 'Ready to welcome your kitten?', btn1: 'Preparation Guide', btn1Link: '/guide/', btn2: 'Ask on LINE', btn2Link: LINE_URL },
      'ブリーダー選び':  { heading: 'Looking for a trusted breeder?', btn1: 'View Kittens', btn1Link: '/kittens.html', btn2: 'Book a Visit', btn2Link: BOOKING_URL },
      '猫種知識':       { heading: 'Would you like to meet a Siberian kitten?', btn1: 'View Kittens', btn1Link: '/kittens.html', btn2: 'Book a Visit', btn2Link: BOOKING_URL },
      '健康管理':       { heading: 'Our kittens are raised with thorough health care', btn1: 'View Kittens', btn1Link: '/kittens.html', btn2: 'Chat on LINE', btn2Link: LINE_URL },
      '飲食栄養':       { heading: 'Properly nourished kittens for you', btn1: 'View Kittens', btn1Link: '/kittens.html', btn2: 'Chat on LINE', btn2Link: LINE_URL },
      '行動・しつけ':    { heading: 'Well-socialized kittens raised with love', btn1: 'View Kittens', btn1Link: '/kittens.html', btn2: 'Preparation Guide', btn2Link: '/guide/' },
      '日常ケア':       { heading: 'Ready to start life with a cat?', btn1: 'View Kittens', btn1Link: '/kittens.html', btn2: 'Preparation Guide', btn2Link: '/guide/' },
      '猫ライフ':       { heading: 'Ready to start life with a cat?', btn1: 'View Kittens', btn1Link: '/kittens.html', btn2: 'Preparation Guide', btn2Link: '/guide/' },
      'シニア猫':       { heading: 'Meet Our Kittens', btn1: 'View Kittens', btn1Link: '/kittens.html', btn2: 'Chat on LINE', btn2Link: LINE_URL }
    },
    zh: {
      'アレルギー':     { heading: '担心过敏？预约相性检查见学', btn1: '预约见学', btn1Link: BOOKING_URL, btn2: 'LINE咨询', btn2Link: LINE_URL },
      '子猫育て':       { heading: '接猫准备好了吗？', btn1: '查看接猫指南', btn1Link: '/guide/', btn2: 'LINE咨询', btn2Link: LINE_URL },
      'ブリーダー選び':  { heading: '在寻找可靠的繁殖人吗？', btn1: '查看幼猫', btn1Link: '/kittens.html', btn2: '预约见学', btn2Link: BOOKING_URL },
      '猫種知識':       { heading: '想见见西伯利亚幼猫吗？', btn1: '查看幼猫', btn1Link: '/kittens.html', btn2: '预约见学', btn2Link: BOOKING_URL },
      '健康管理':       { heading: '我们的幼猫健康管理严格', btn1: '查看幼猫', btn1Link: '/kittens.html', btn2: 'LINE咨询', btn2Link: LINE_URL },
      '飲食栄養':       { heading: '营养管理到位的幼猫', btn1: '查看幼猫', btn1Link: '/kittens.html', btn2: 'LINE咨询', btn2Link: LINE_URL },
      '行動・しつけ':    { heading: '社交能力出色的幼猫', btn1: '查看幼猫', btn1Link: '/kittens.html', btn2: '接猫指南', btn2Link: '/guide/' },
      '日常ケア':       { heading: '准备好和猫一起生活了吗？', btn1: '查看幼猫', btn1Link: '/kittens.html', btn2: '接猫指南', btn2Link: '/guide/' },
      '猫ライフ':       { heading: '准备好和猫一起生活了吗？', btn1: '查看幼猫', btn1Link: '/kittens.html', btn2: '接猫指南', btn2Link: '/guide/' },
      'シニア猫':       { heading: '这些小可爱等你来', btn1: '查看幼猫', btn1Link: '/kittens.html', btn2: 'LINE咨询', btn2Link: LINE_URL }
    }
  };

  var T = {
    ja: {
      heading: 'この子たちが待っています',
      sub: '福楽キャッテリーの子猫をご紹介',
      available: '募集中',
      reserved: '予約済',
      price: '¥{p}',
      viewAll: 'すべての子猫を見る →',
      lineBtn: 'LINEで見学予約',
      bookBtn: '📅 見学を予約する',
      male: '♂ 男の子',
      female: '♀ 女の子'
    },
    en: {
      heading: 'Meet Our Kittens',
      sub: 'Available kittens from Fuluck Cattery',
      available: 'Available',
      reserved: 'Reserved',
      price: '¥{p}',
      viewAll: 'View All Kittens →',
      lineBtn: 'Book a Visit on LINE',
      bookBtn: '📅 Book a Visit',
      male: '♂ Male',
      female: '♀ Female'
    },
    zh: {
      heading: '这些小可爱等你来',
      sub: '福楽猫舍的幼猫介绍',
      available: '可预约',
      reserved: '已预约',
      price: '¥{p}',
      viewAll: '查看所有幼猫 →',
      lineBtn: 'LINE预约参观',
      bookBtn: '📅 预约见学',
      male: '♂ 公猫',
      female: '♀ 母猫'
    }
  };

  function t(key) {
    var lang = getLang();
    var dict = T[lang] || T.ja;
    return dict[key] || T.ja[key];
  }

  function formatPrice(p) {
    return t('price').replace('{p}', Number(p).toLocaleString());
  }

  // Detect blog article category from .blog-meta-cat element
  function detectCategory() {
    var catEl = document.querySelector('.blog-meta-cat');
    if (catEl) return catEl.textContent.trim();
    return '';
  }

  // Get contextual CTA config based on category
  function getCTA(category) {
    var lang = getLang();
    var map = CTA_MAP[lang] || CTA_MAP.ja;
    if (category && map[category]) return map[category];
    // Default CTA
    return {
      heading: t('heading'),
      btn1: t('viewAll'),
      btn1Link: '/kittens.html',
      btn2: t('lineBtn'),
      btn2Link: LINE_URL
    };
  }

  // LINE SVG icon
  var LINE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596a.626.626 0 0 1-.199.031c-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.271.173-.508.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>';

  // Inject CSS once
  var style = document.createElement('style');
  style.textContent =
    '.kc-section { margin:40px 0; padding:0; }' +
    '.kc-header { text-align:center; margin-bottom:20px; }' +
    '.kc-header h2 { font-size:1.4rem; color:var(--text-heading,#2d3748); margin:0 0 6px; border:none; padding:0; }' +
    '.kc-header p { font-size:0.9rem; color:var(--text-note,#888); margin:0; }' +
    '.kc-track-wrap { position:relative; overflow:hidden; margin:0 -24px; padding:0 24px; }' +
    '.kc-track { display:flex; gap:16px; overflow-x:auto; scroll-behavior:smooth; -webkit-overflow-scrolling:touch; scrollbar-width:none; padding:8px 4px 16px; }' +
    '.kc-track::-webkit-scrollbar { display:none; }' +
    '.kc-card { flex:0 0 220px; background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08); transition:transform 0.25s,box-shadow 0.25s; text-decoration:none; color:inherit; cursor:pointer; }' +
    '.kc-card:hover { transform:translateY(-4px); box-shadow:0 6px 20px rgba(0,0,0,0.12); }' +
    '.kc-img { width:220px; height:220px; overflow:hidden; position:relative; background:#f5f5f5; }' +
    '.kc-img img { width:100%; height:100%; object-fit:cover; transition:transform 0.4s; }' +
    '.kc-card:hover .kc-img img { transform:scale(1.06); }' +
    '.kc-badge { position:absolute; top:10px; left:10px; font-size:0.72rem; font-weight:600; padding:3px 10px; border-radius:20px; color:#fff; }' +
    '.kc-badge-available { background:var(--mint,#7DD3C0); }' +
    '.kc-badge-reserved { background:var(--strawberry,#F4A896); }' +
    '.kc-badge-new { position:absolute; top:10px; right:10px; background:#FF6B6B; color:#fff; font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:10px; }' +
    '.kc-info { padding:12px 14px 14px; }' +
    '.kc-breed { font-size:0.82rem; font-weight:600; color:var(--text-heading,#2d3748); margin:0 0 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }' +
    '.kc-meta { font-size:0.75rem; color:var(--text-note,#888); margin:0 0 6px; }' +
    '.kc-price { font-size:0.95rem; font-weight:700; color:var(--mint-dark,#4db8a4); margin:0; }' +
    '.kc-actions { display:flex; gap:10px; justify-content:center; margin-top:20px; flex-wrap:wrap; }' +
    '.kc-btn { display:inline-flex; align-items:center; gap:6px; padding:12px 24px; border-radius:30px; font-weight:600; font-size:0.92rem; text-decoration:none; transition:all 0.2s; }' +
    '.kc-btn-primary { background:var(--mint,#7DD3C0); color:#fff; }' +
    '.kc-btn-primary:hover { background:var(--mint-dark,#4db8a4); transform:translateY(-1px); }' +
    '.kc-btn-line { background:#06C755; color:#fff; }' +
    '.kc-btn-line:hover { background:#05a648; transform:translateY(-1px); }' +
    '.kc-btn-book { background:var(--strawberry,#F4A896); color:#fff; }' +
    '.kc-btn-book:hover { background:#e8917a; transform:translateY(-1px); }' +
    '.kc-arrows { display:flex; gap:8px; justify-content:center; margin-top:12px; }' +
    '.kc-arrow { width:36px; height:36px; border-radius:50%; border:1.5px solid var(--mint,#7DD3C0); background:transparent; color:var(--mint,#7DD3C0); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; font-size:1.1rem; }' +
    '.kc-arrow:hover { background:var(--mint,#7DD3C0); color:#fff; }' +
    '.kc-dots { display:flex; gap:6px; justify-content:center; margin-top:10px; }' +
    '.kc-dot { width:6px; height:6px; border-radius:50%; background:#ddd; transition:background 0.3s; }' +
    '.kc-dot.active { background:var(--mint,#7DD3C0); width:18px; border-radius:3px; }' +
    '@media(max-width:600px){' +
      '.kc-card { flex:0 0 180px; }' +
      '.kc-img { width:180px; height:180px; }' +
      '.kc-actions { flex-direction:column; align-items:center; }' +
      '.kc-btn { width:100%; justify-content:center; }' +
    '}';
  document.head.appendChild(style);

  function renderCarousel(kittens, container) {
    var lang = getLang();
    var category = detectCategory();
    var cta = getCTA(category);
    var available = kittens.filter(function(k) { return k.status === 'available'; });
    var reserved = kittens.filter(function(k) { return k.status === 'reserved'; });
    // Show available first, then reserved, max 12
    var display = available.concat(reserved).slice(0, 12);
    if (display.length === 0) return;

    var html = '<div class="kc-section">' +
      '<div class="kc-header">' +
        '<h2>' + cta.heading + '</h2>' +
        '<p>' + t('sub') + '</p>' +
      '</div>' +
      '<div class="kc-track-wrap">' +
        '<div class="kc-track">';

    display.forEach(function(k) {
      // API fields: photos[], coverIndex, breed (Japanese), gender (♂/♀), color, price, status, isNew, breederId
      var photos = k.photos || [];
      var coverIdx = k.coverIndex || 0;
      var img = photos[coverIdx] || photos[0] || '';
      // Skip kittens with no photo
      if (!img) return;
      var breedJa = k.breed || '';
      var lang = getLang();
      var breedName = breedJa;
      if (lang !== 'ja' && BREED_MAP[breedJa]) {
        breedName = BREED_MAP[breedJa][lang] || breedJa;
      }
      var sex = k.gender === '♀' ? t('female') : t('male');
      var color = k.color || '';
      var statusText = k.status === 'available' ? t('available') : t('reserved');
      var statusClass = k.status === 'available' ? 'kc-badge-available' : 'kc-badge-reserved';
      var isNew = k.isNew || false;
      // Link to individual kitten detail page if available
      var kittenUrl = '/kittens/' + (k.breederId || k.id) + '.html';

      html += '<a href="' + kittenUrl + '" class="kc-card">' +
        '<div class="kc-img">' +
          '<img src="' + img + '" alt="' + breedName + '" loading="lazy">' +
          '<span class="kc-badge ' + statusClass + '">' + statusText + '</span>' +
          (isNew ? '<span class="kc-badge-new">NEW</span>' : '') +
        '</div>' +
        '<div class="kc-info">' +
          '<p class="kc-breed">' + breedName + '</p>' +
          '<p class="kc-meta">' + sex + (color ? ' ・ ' + color : '') + '</p>' +
          '<p class="kc-price">' + formatPrice(k.price) + '</p>' +
        '</div>' +
      '</a>';
    });

    html += '</div></div>' +
      '<div class="kc-arrows">' +
        '<button class="kc-arrow kc-prev" aria-label="前へ">‹</button>' +
        '<button class="kc-arrow kc-next" aria-label="次へ">›</button>' +
      '</div>' +
      '<div class="kc-actions">' +
        '<a href="' + cta.btn1Link + '" class="kc-btn kc-btn-primary">🐾 ' + cta.btn1 + '</a>' +
        '<a href="' + cta.btn2Link + '"' + (cta.btn2Link === LINE_URL ? ' target="_blank" rel="noopener"' : '') + ' class="kc-btn ' + (cta.btn2Link === LINE_URL ? 'kc-btn-line' : 'kc-btn-book') + '">' +
          (cta.btn2Link === LINE_URL ? LINE_SVG + ' ' : '') + cta.btn2 +
        '</a>' +
      '</div>' +
    '</div>';

    container.innerHTML = html;

    // Wire up scroll arrows
    var track = container.querySelector('.kc-track');
    var prevBtn = container.querySelector('.kc-prev');
    var nextBtn = container.querySelector('.kc-next');
    if (track && prevBtn && nextBtn) {
      var scrollAmt = 240;
      prevBtn.addEventListener('click', function() { track.scrollBy({ left: -scrollAmt, behavior: 'smooth' }); });
      nextBtn.addEventListener('click', function() { track.scrollBy({ left: scrollAmt, behavior: 'smooth' }); });
    }

    // Auto-scroll animation
    var autoInterval = setInterval(function() {
      if (!track) { clearInterval(autoInterval); return; }
      var maxScroll = track.scrollWidth - track.clientWidth;
      if (track.scrollLeft >= maxScroll - 10) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        track.scrollBy({ left: 240, behavior: 'smooth' });
      }
    }, 4000);

    // Pause auto-scroll on hover/touch
    track.addEventListener('mouseenter', function() { clearInterval(autoInterval); });
    track.addEventListener('touchstart', function() { clearInterval(autoInterval); }, { passive: true });
  }

  // Find target: .blog-cta-box in blog articles, or .kitten-carousel-mount placeholder
  function findTargets() {
    var targets = [];
    // Blog article CTA box
    var ctaBox = document.querySelector('.blog-cta-box');
    if (ctaBox) {
      var wrap = document.createElement('div');
      wrap.className = 'kitten-carousel-mount';
      ctaBox.parentNode.replaceChild(wrap, ctaBox);
      targets.push(wrap);
    }
    // Explicit placeholder
    var explicit = document.querySelectorAll('.kitten-carousel-mount');
    for (var i = 0; i < explicit.length; i++) {
      if (targets.indexOf(explicit[i]) === -1) targets.push(explicit[i]);
    }
    return targets;
  }

  // Fetch & render
  fetch(API + '/api/kittens')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var kittens = data || [];
      var targets = findTargets();
      targets.forEach(function(el) {
        renderCarousel(kittens, el);
      });
    })
    .catch(function(err) {
      console.warn('Kitten carousel: API fetch failed', err);
    });

  // Re-render on language change
  window.addEventListener('langChanged', function() {
    var carousels = document.querySelectorAll('.kc-section');
    if (carousels.length === 0) return;
    fetch(API + '/api/kittens')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var mounts = document.querySelectorAll('.kitten-carousel-mount');
        for (var i = 0; i < mounts.length; i++) {
          renderCarousel(data || [], mounts[i]);
        }
      })
      .catch(function() {});
  });
})();
