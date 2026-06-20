// card-loader.js — Dynamic card rendering from API
// Fetches kittens/parents/reviews from Worker API and replaces hardcoded HTML cards.
// Keeps static HTML as SEO fallback (crawlers see hardcoded content).
// Must be loaded BEFORE script.js so rebindCards() is available after fetch completes.

(function() {
  var API = window.FULUCK_API_BASE || 'https://fuluck-api.mouxue56.workers.dev';

  // ===== i18n for card-loader =====
  function getLang() {
    try { return localStorage.getItem('fuluckpet-lang') || 'ja'; } catch(e) { return 'ja'; }
  }

  var CARD_I18N = {
    ja: {
      available: '販売中', reserved: '商談中', sold: 'ご家族決定',
      male: '♂ 男の子', female: '♀ 女の子',
      photoAlt: '子猫の写真', taxIncl: '（税込）',
      dnaTested: '✓ 遺伝子検査済', verifiedReview: '✓ 認証済みレビュー',
      reviewPlatform: 'みんなの子猫ブリーダー',
      bornFmt: function(y, m) { return y + '年' + m + '月生まれ'; },
      counter: '匹'
    },
    en: {
      available: 'Available', reserved: 'Reserved', sold: 'Adopted',
      male: '♂ Male', female: '♀ Female',
      photoAlt: 'Kitten photo', taxIncl: '(tax incl.)',
      dnaTested: '✓ DNA Tested', verifiedReview: '✓ Verified Review',
      reviewPlatform: 'Minna no Koneko Breeder',
      bornFmt: function(y, m) { return 'Born ' + y + '/' + m; },
      counter: '',
      breeds: { 'サイベリアン': 'Siberian', 'ブリティッシュショートヘア': 'British Shorthair', 'ブリティッシュロングヘア': 'British Longhair', 'ラグドール': 'Ragdoll' },
      roles: { 'パパ猫': 'Father', 'ママ猫': 'Mother' }
    },
    zh: {
      available: '可预约', reserved: '已预订', sold: '已出售',
      male: '♂ 男孩', female: '♀ 女孩',
      photoAlt: '小猫照片', taxIncl: '（含税）',
      dnaTested: '✓ 基因检测完毕', verifiedReview: '✓ 已认证评价',
      reviewPlatform: '大家的幼猫繁殖者',
      bornFmt: function(y, m) { return y + '年' + m + '月出生'; },
      counter: '只',
      breeds: { 'サイベリアン': '西伯利亚猫', 'ブリティッシュショートヘア': '英国短毛猫', 'ブリティッシュロングヘア': '英国长毛猫', 'ラグドール': '布偶猫' },
      roles: { 'パパ猫': '父猫', 'ママ猫': '母猫' }
    }
  };

  function ct(key) {
    var lang = getLang();
    return (CARD_I18N[lang] || CARD_I18N.ja)[key] || CARD_I18N.ja[key];
  }

  function ctBreed(breed) {
    var t = CARD_I18N[getLang()];
    return (t && t.breeds && t.breeds[breed]) || breed;
  }

  function ctRole(role) {
    var t = CARD_I18N[getLang()];
    return (t && t.roles && t.roles[role]) || role;
  }

  // ===== Utility Functions =====

  function getCoverPhoto(item) {
    if (!item.photos || item.photos.length === 0) return '';
    var idx = item.coverIndex || 0;
    return item.photos[Math.min(idx, item.photos.length - 1)] || '';
  }

  function fmtBday(bday) {
    if (!bday) return '';
    var parts = bday.split('-');
    if (parts.length < 2) return '';
    var y = parts[0];
    var m = parseInt(parts[1], 10);
    var lang = getLang();
    var t = CARD_I18N[lang] || CARD_I18N.ja;
    return t.bornFmt(y, m);
  }

  function fmtBdayAttr(bday) {
    // "2025-12" → "2025-12-01" for data-birthday attribute
    if (!bday) return '';
    if (bday.length === 7) return bday + '-01';
    return bday;
  }

  function fmtPrice(price) {
    // 200000 → "¥200,000"
    if (!price && price !== 0) return '';
    return '¥' + Number(price).toLocaleString('ja-JP');
  }

  function escAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ===== Card HTML Generators =====

  // Generate kitten card HTML matching existing structure exactly
  // opts.showImages: if true, populate data-images with cover photo (for kittens.html)
  //                  if false, leave data-images="" (for index.html, Drive loader fills later)
  function kittenCardHTML(k, opts) {
    var cover = getCoverPhoto(k);
    var statusClass = k.status === 'available' ? 'st-available' : k.status === 'reserved' ? 'st-reserved' : 'st-sold';
    var statusText = k.status === 'available' ? ct('available') : k.status === 'reserved' ? ct('reserved') : ct('sold');
    var genderFull = k.gender === '♂' ? ct('male') : ct('female');
    var dataImages = opts && opts.showImages && cover ? escAttr(cover) : '';
    var bdayText = fmtBday(k.birthday);
    var priceText = fmtPrice(k.price);

    // Above-the-fold cards (opts.priority) load eagerly with high fetchpriority so the
    // worker-proxied LCP image on the kittens money-page isn't deferred behind lazy-load.
    var imgLoad = opts && opts.priority ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';

    var detailUrl = '/kittens/' + (k.breederId || k.id) + '.html';
    return '<div class="kitten-card" data-status="' + escAttr(k.status) + '" data-price="' + k.price + '" data-birthday="' + escAttr(fmtBdayAttr(k.birthday)) + '" data-images="' + dataImages + '" data-video="' + escAttr(k.video || '') + '" data-papa="' + escAttr(k.papa || '') + '" data-mama="' + escAttr(k.mama || '') + '" data-new="' + k.isNew + '" data-name="" data-breeder-id="' + escAttr(k.breederId || '') + '" data-detail-url="' + escAttr(detailUrl) + '">' +
      '<div class="kitten-img">' +
        (cover ? '<img src="' + cover + '" alt="' + ct('photoAlt') + '" ' + imgLoad + ' style="width:100%;height:100%;object-fit:cover;">' : '<div class="img-placeholder"><span>🐱</span></div>') +
        '<span class="kit-status ' + statusClass + '">' + statusText + '</span>' +
        (k.isNew ? '<span class="kit-badge-new">NEW</span>' : '') +
      '</div>' +
      '<div class="kitten-body">' +
        '<h3>' + escAttr(ctBreed(k.breed)) + '</h3>' +
        '<p class="kit-meta">' + genderFull + ' ・ ' + escAttr(k.color) + '</p>' +
        '<p class="kit-meta">' + bdayText + '</p>' +
        (k.note ? '<p class="kit-meta" style="font-size:11px;color:var(--text-note);">' + escAttr(k.note) + '</p>' : '') +
        '<p class="kit-price">' + priceText + ' <span class="tax">' + ct('taxIncl') + '</span></p>' +
      '</div>' +
    '</div>';
  }

  // Generate parent card HTML matching existing structure
  function parentCardHTML(p) {
    var cover = getCoverPhoto(p);
    var roleClass = p.role === 'パパ猫' ? 'role-papa' : 'role-mama';
    var dataImages = cover ? escAttr(cover) : '';

    return '<div class="parent-card" data-name="' + escAttr(p.name) + '" data-breed="' + escAttr(p.breed) + '" data-gender="' + escAttr(p.gender) + '" data-role="' + escAttr(p.role) + '" data-age="' + escAttr(p.age) + '" data-color="' + escAttr(p.color) + '" data-tested="' + p.tested + '" data-images="' + dataImages + '" style="position:relative;cursor:pointer;">' +
      '<span class="health-tag tag-good" style="position:absolute;top:8px;right:8px;font-size:11px;padding:2px 8px;">' + ct('dnaTested') + '</span>' +
      (cover ? '<img src="' + cover + '" alt="' + escAttr(p.name) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-lg) var(--radius-lg) 0 0;">' : '') +
      '<div class="parent-body">' +
        '<h3>' + escAttr(p.name) + '</h3>' +
        '<p>' + escAttr(ctBreed(p.breed)) + ' ・ ' + escAttr(p.gender) + ' ・ ' + escAttr(p.color) + '</p>' +
        '<p style="font-size:12px;color:var(--text-note);">' + escAttr(p.age) + '</p>' +
        '<span class="parent-role ' + roleClass + '">' + escAttr(ctRole(p.role)) + '</span>' +
      '</div>' +
    '</div>';
  }

  // Generate review card HTML matching existing structure
  function reviewCardHTML(r) {
    return '<div class="review-card">' +
      '<div class="review-header">' +
        '<div class="review-stars">★★★★★</div>' +
        '<span class="review-platform">' + ct('reviewPlatform') + '</span>' +
      '</div>' +
      '<p class="review-body">' + escAttr(r.body) + '</p>' +
      '<div class="review-footer">' +
        '<p class="review-author">— ' + escAttr(r.region) + ' ' + escAttr(r.author) + '（' + escAttr(r.date) + '）</p>' +
        '<span class="review-verified">' + ct('verifiedReview') + '</span>' +
      '</div>' +
    '</div>';
  }

  // ===== Page Detection =====

  var kittensGrid = document.getElementById('kittensGrid');   // index.html
  var isIndex = !!kittensGrid && !document.querySelector('.page-hero');
  var pageHero = !!document.querySelector('.page-hero');
  var pathname = window.location.pathname;
  var isKittensPage = pageHero && (pathname.indexOf('kittens') >= 0 || document.title.indexOf('子猫') >= 0);
  var isParentsPage = pageHero && (pathname.indexOf('parents') >= 0 || document.title.indexOf('親猫') >= 0);
  var isReviewsPage = pageHero && (pathname.indexOf('reviews') >= 0 || document.title.indexOf('お客様') >= 0);

  // ===== index.html — Load kittens + parents + reviews =====
  if (isIndex) {
    Promise.all([
      fetch(API + '/api/kittens').then(function(r) { return r.json(); }),
      fetch(API + '/api/parents').then(function(r) { return r.json(); }),
      fetch(API + '/api/reviews').then(function(r) { return r.json(); })
    ]).then(function(results) {
      var kittens = results[0] || [];
      var parents = results[1] || [];
      var reviews = results[2] || [];

      // Kittens: only Siberian group, not sold
      var sib = kittens.filter(function(k) { return k.group === 'c995680' && k.status !== 'sold'; });
      if (sib.length > 0 && kittensGrid) {
        kittensGrid.innerHTML = sib.map(function(k) { return kittenCardHTML(k, {showImages: false}); }).join('');
        var vc = document.getElementById('visibleCount');
        if (vc) vc.textContent = sib.length;
      }

      // Parents: show first 3 Siberian parents
      var parGrid = document.querySelector('#parents .parents-grid');
      var sibParents = parents.filter(function(p) { return p.group === 'c995680'; }).slice(0, 3);
      if (sibParents.length > 0 && parGrid) {
        parGrid.innerHTML = sibParents.map(function(p) { return parentCardHTML(p); }).join('');
      }

      // Reviews: show first 3
      var revGrid = document.querySelector('#reviews .reviews-grid');
      if (reviews.length > 0 && revGrid) {
        revGrid.innerHTML = reviews.slice(0, 3).map(function(r) { return reviewCardHTML(r); }).join('');
      }

      // Rebind events after dynamic rendering
      if (typeof window.rebindCards === 'function') {
        window.rebindCards();
      }
      // Notify drive-loader to re-scan cards after dynamic render
      window.dispatchEvent(new Event('cardsLoaded'));
    }).catch(function(err) {
      // API failed — keep static HTML fallback (SEO + offline)
      console.log('card-loader: API unavailable, using static fallback');
    });
  }

  // ===== kittens.html — Load all kittens into two sections =====
  if (isKittensPage) {
    fetch(API + '/api/kittens').then(function(r) { return r.json(); })
      .then(function(kittens) {
        if (!kittens || kittens.length === 0) return;
        var grids = document.querySelectorAll('.kittens-grid');
        if (grids.length < 2) return;

        var sib = kittens.filter(function(k) { return k.group === 'c995680'; });
        var brit = kittens.filter(function(k) { return k.group === 'd696506'; });

        // Render Siberian section
        if (sib.length > 0) {
          grids[0].innerHTML = sib.map(function(k, i) { return kittenCardHTML(k, {showImages: true, priority: i < 2}); }).join('');
        }

        // Render British section
        if (brit.length > 0) {
          grids[1].innerHTML = brit.map(function(k) { return kittenCardHTML(k, {showImages: true}); }).join('');
        }

        // Update section header counts
        var headers = document.querySelectorAll('.sec-title');
        var ctr = ct('counter');
        headers.forEach(function(h) {
          var text = h.textContent;
          if (text.indexOf('サイベリアン') >= 0 || text.indexOf('Siberian') >= 0) {
            var baseName = text.replace(/\s*\(.*\)/, '').trim();
            h.textContent = baseName + ' (' + sib.length + ctr + ')';
          } else if (text.indexOf('ブリティッシュ') >= 0 || text.indexOf('British') >= 0) {
            h.textContent = h.textContent.replace(/\(\d+[匹只]*\)/, '(' + brit.length + ctr + ')');
          }
        });

        // Inject per-kitten JSON-LD Product schema for SEO
        var available = kittens.filter(function(k) { return k.status === 'available'; });
        if (available.length > 0) {
          var ldItems = available.map(function(k) {
            var gender = k.gender === '♂' ? '男の子' : '女の子';
            return {
              '@type': 'Product',
              'name': (k.breed || 'サイベリアン') + ' ' + gender + ' ' + (k.color || ''),
              'description': '大阪の福楽キャッテリー（ブリーダー：羅方遠/ラホウエン）の' + (k.breed || 'サイベリアン') + '子猫。' + gender + '・' + (k.color || '') + (k.birthday ? '・' + k.birthday.replace('-', '年').replace(/-0?/, '月') + '生まれ' : '') + '。',
              'brand': { '@type': 'Brand', 'name': '福楽キャッテリー' },
              'offers': {
                '@type': 'Offer',
                'price': String(k.price || ''),
                'priceCurrency': 'JPY',
                'availability': 'https://schema.org/InStock',
                'seller': { '@type': 'Organization', 'name': '福楽キャッテリー', 'url': 'https://fuluckpet.com/' }
              }
            };
          });
          var ldScript = document.createElement('script');
          ldScript.type = 'application/ld+json';
          ldScript.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': ldItems });
          document.head.appendChild(ldScript);
        }

        if (typeof window.rebindCards === 'function') {
          window.rebindCards();
        }
        window.dispatchEvent(new Event('cardsLoaded'));
      }).catch(function() {
        console.log('card-loader: kittens API unavailable, using static fallback');
      });
  }

  // ===== parents.html — Load all parents into two sections =====
  if (isParentsPage) {
    fetch(API + '/api/parents').then(function(r) { return r.json(); })
      .then(function(parents) {
        if (!parents || parents.length === 0) return;
        var grids = document.querySelectorAll('.parents-grid');
        if (grids.length < 2) return;

        var sib = parents.filter(function(p) { return p.group === 'c995680'; });
        var brit = parents.filter(function(p) { return p.group === 'd696506'; });

        if (sib.length > 0) {
          grids[0].innerHTML = sib.map(function(p) { return parentCardHTML(p); }).join('');
        }
        if (brit.length > 0) {
          grids[1].innerHTML = brit.map(function(p) { return parentCardHTML(p); }).join('');
        }

        if (typeof window.rebindCards === 'function') {
          window.rebindCards();
        }
        window.dispatchEvent(new Event('cardsLoaded'));
      }).catch(function() {
        console.log('card-loader: parents API unavailable, using static fallback');
      });
  }

  // ===== reviews.html — Load all reviews =====
  if (isReviewsPage) {
    fetch(API + '/api/reviews').then(function(r) { return r.json(); })
      .then(function(reviews) {
        if (!reviews || reviews.length === 0) return;
        var grid = document.querySelector('.reviews-page-grid');
        if (!grid) return;

        grid.innerHTML = reviews.map(function(r) { return reviewCardHTML(r); }).join('');

        if (typeof window.rebindCards === 'function') {
          window.rebindCards();
        }
      }).catch(function() {
        console.log('card-loader: reviews API unavailable, using static fallback');
      });
  }

  // Re-render cards when language changes
  window.addEventListener('langChanged', function() {
    if (isIndex) {
      Promise.all([
        fetch(API + '/api/kittens').then(function(r) { return r.json(); }),
        fetch(API + '/api/parents').then(function(r) { return r.json(); }),
        fetch(API + '/api/reviews').then(function(r) { return r.json(); })
      ]).then(function(results) {
        var kittens = results[0] || [];
        var parents = results[1] || [];
        var reviews = results[2] || [];
        var sib = kittens.filter(function(k) { return k.group === 'c995680' && k.status !== 'sold'; });
        if (sib.length > 0 && kittensGrid) {
          kittensGrid.innerHTML = sib.map(function(k) { return kittenCardHTML(k, {showImages: false}); }).join('');
        }
        var parGrid = document.querySelector('#parents .parents-grid');
        var sibParents = parents.filter(function(p) { return p.group === 'c995680'; }).slice(0, 3);
        if (sibParents.length > 0 && parGrid) {
          parGrid.innerHTML = sibParents.map(function(p) { return parentCardHTML(p); }).join('');
        }
        var revGrid = document.querySelector('#reviews .reviews-grid');
        if (reviews.length > 0 && revGrid) {
          revGrid.innerHTML = reviews.slice(0, 3).map(function(r) { return reviewCardHTML(r); }).join('');
        }
        if (typeof window.rebindCards === 'function') window.rebindCards();
        window.dispatchEvent(new Event('cardsLoaded'));
      }).catch(function() {});
    }

    if (isKittensPage) {
      fetch(API + '/api/kittens').then(function(r) { return r.json(); })
        .then(function(kittens) {
          if (!kittens || kittens.length === 0) return;
          var grids = document.querySelectorAll('.kittens-grid');
          if (grids.length < 2) return;
          var sib = kittens.filter(function(k) { return k.group === 'c995680'; });
          var brit = kittens.filter(function(k) { return k.group === 'd696506'; });
          if (sib.length > 0) grids[0].innerHTML = sib.map(function(k, i) { return kittenCardHTML(k, {showImages: true, priority: i < 2}); }).join('');
          if (brit.length > 0) grids[1].innerHTML = brit.map(function(k) { return kittenCardHTML(k, {showImages: true}); }).join('');
          if (typeof window.rebindCards === 'function') window.rebindCards();
          window.dispatchEvent(new Event('cardsLoaded'));
        }).catch(function() {});
    }

    if (isParentsPage) {
      fetch(API + '/api/parents').then(function(r) { return r.json(); })
        .then(function(parents) {
          if (!parents || parents.length === 0) return;
          var grids = document.querySelectorAll('.parents-grid');
          if (grids.length < 2) return;
          var sib = parents.filter(function(p) { return p.group === 'c995680'; });
          var brit = parents.filter(function(p) { return p.group === 'd696506'; });
          if (sib.length > 0) grids[0].innerHTML = sib.map(function(p) { return parentCardHTML(p); }).join('');
          if (brit.length > 0) grids[1].innerHTML = brit.map(function(p) { return parentCardHTML(p); }).join('');
          if (typeof window.rebindCards === 'function') window.rebindCards();
          window.dispatchEvent(new Event('cardsLoaded'));
        }).catch(function() {});
    }

    if (isReviewsPage) {
      fetch(API + '/api/reviews').then(function(r) { return r.json(); })
        .then(function(reviews) {
          if (!reviews || reviews.length === 0) return;
          var grid = document.querySelector('.reviews-page-grid');
          if (!grid) return;
          grid.innerHTML = reviews.map(function(r) { return reviewCardHTML(r); }).join('');
          if (typeof window.rebindCards === 'function') window.rebindCards();
        }).catch(function() {});
    }
  });

})();
