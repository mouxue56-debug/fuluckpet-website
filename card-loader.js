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
      male: '<i class="ico ico-mars" aria-hidden="true"></i> 男の子', female: '<i class="ico ico-venus" aria-hidden="true"></i> 女の子',
      photoAlt: '子猫の写真', taxIncl: '（税込）',
      dnaTested: '<i class="ico ico-check" aria-hidden="true"></i> 遺伝子検査済', verifiedReview: '<i class="ico ico-check" aria-hidden="true"></i> 認証済みレビュー',
      reviewPlatform: 'みんなの子猫ブリーダー',
      bornFmt: function(y, m) { return y + '年' + m + '月生まれ'; },
      counter: '匹',
      hypoallergenic: '低アレルゲンのシベリアン'
    },
    en: {
      available: 'Available', reserved: 'Reserved', sold: 'Adopted',
      male: '<i class="ico ico-mars" aria-hidden="true"></i> Male', female: '<i class="ico ico-venus" aria-hidden="true"></i> Female',
      photoAlt: 'Kitten photo', taxIncl: '(tax incl.)',
      dnaTested: '<i class="ico ico-check" aria-hidden="true"></i> DNA Tested', verifiedReview: '<i class="ico ico-check" aria-hidden="true"></i> Verified Review',
      reviewPlatform: 'Minna no Koneko Breeder',
      bornFmt: function(y, m) { return 'Born ' + y + '/' + m; },
      counter: '',
      hypoallergenic: 'Hypoallergenic Siberian',
      breeds: { 'サイベリアン': 'Siberian', 'ブリティッシュショートヘア': 'British Shorthair', 'ブリティッシュロングヘア': 'British Longhair', 'ラグドール': 'Ragdoll' },
      roles: { 'パパ猫': 'Father', 'ママ猫': 'Mother' }
    },
    zh: {
      available: '可预约', reserved: '已预订', sold: '已出售',
      male: '<i class="ico ico-mars" aria-hidden="true"></i> 男孩', female: '<i class="ico ico-venus" aria-hidden="true"></i> 女孩',
      photoAlt: '小猫照片', taxIncl: '（含税）',
      dnaTested: '<i class="ico ico-check" aria-hidden="true"></i> 基因检测完毕', verifiedReview: '<i class="ico ico-check" aria-hidden="true"></i> 已认证评价',
      reviewPlatform: '大家的幼猫繁殖者',
      bornFmt: function(y, m) { return y + '年' + m + '月出生'; },
      counter: '只',
      hypoallergenic: '低致敏西伯利亚猫',
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

  // Translate a raw ja color/breed data value using the generated single-source catalog
  // (window.FULUCK_CATALOG_I18N, emitted by tools/generate-site.js). ja → passthrough;
  // en/zh → lookup, fallback to raw ja if unmapped (never invent). Degrades safely when
  // the catalog artifact is missing (returns the raw value, no exception).
  function ctCatalog(kind, value) {
    if (!value) return value || '';
    var lang = getLang();
    if (lang === 'ja') return value;
    var cat = window.FULUCK_CATALOG_I18N;
    var table = cat && cat[kind] && cat[kind][lang];
    return (table && table[value]) || value;
  }
  function ctColor(color) { return ctCatalog('colors', color); }

  // ===== Breed taxonomy — MUST mirror tools/generate-site.js BREED_CONFIG =====
  // The list page bakes exactly these breed sections, in this order, and assigns each
  // kitten to a section by BREED (never by platform group). The partial-match rule folds
  // the mix 'サイベリアン×ブリティッシュ' into the Siberian section, matching the generator.
  // Grid order on kittens.html: [0]=Siberian, [1]=British Shorthair, [2]=British Longhair.
  var BREED_ORDER = ['サイベリアン', 'ブリティッシュショートヘア', 'ブリティッシュロングヘア', 'ラグドール'];

  // The baked .sec-tag (English, language-invariant) identifies each rendered section's
  // breed. Used to align API-side breed groups to the actual grids on the page, which the
  // generator emits ONLY for breeds that have inventory (so grid order can vary). Anchoring
  // to sec-tag — not a fixed grid index — keeps assignment correct even if a breed is absent.
  var TAG_TO_BREED = {
    'Siberian': 'サイベリアン',
    'British Shorthair': 'ブリティッシュショートヘア',
    'British Longhair': 'ブリティッシュロングヘア',
    'Ragdoll': 'ラグドール'
  };

  // Return the BREED_ORDER index a kitten's breed belongs to. Exact match first, then the
  // generator's partial-match fallback (breed.includes(key) || key.includes(breed)).
  // Unknown/empty breed → 0 (Siberian): never drop inventory (FIX 7 — was dropping 14).
  function breedSectionIndex(breed) {
    breed = breed || '';
    var exact = BREED_ORDER.indexOf(breed);
    if (exact !== -1) return exact;
    for (var i = 0; i < BREED_ORDER.length; i++) {
      var key = BREED_ORDER[i];
      if (breed.indexOf(key) >= 0 || key.indexOf(breed) >= 0) return i;
    }
    if (breed) console.warn('card-loader: unknown breed "' + breed + '" — folding into Siberian section (kept visible)');
    return 0;
  }

  // Localized breed name for a section header (uses the same breeds table as ctBreed).
  function sectionBreedName(breedJa) {
    var t = CARD_I18N[getLang()];
    return (t && t.breeds && t.breeds[breedJa]) || breedJa;
  }

  // Count suffix — mirrors tools/generate-site.js countLabel() exactly per language:
  // ja " (N匹)"  en " (N)"  zh "（N只）" (fullwidth, no leading space).
  function countLabel(n) {
    var lang = getLang();
    if (lang === 'en') return ' (' + n + ')';
    if (lang === 'zh') return '（' + n + '只）';
    return ' (' + n + '匹)';
  }

  // FIX 9 — display-consistency dedupe (NOT a data fix). A few breederIds have two API
  // records; the detail-page generator collapses them last-write-wins. Mirror that here so
  // a listing card's price matches its surviving detail page. Keep the LAST record per
  // fileId (breederId||id) in array order. Interim measure pending owner data cleanup —
  // we are NOT choosing which record is "true" (owner decision, flagged separately).
  function dedupeByFileId(kittens) {
    var order = [];
    var byId = {};
    kittens.forEach(function(k) {
      var id = k.breederId || k.id;
      if (byId[id] === undefined) order.push(id);
      byId[id] = k; // last write wins
    });
    return order.map(function(id) { return byId[id]; });
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
    // Hypoallergenic chip: ONLY on pure Siberian (breed exactly 'サイベリアン').
    // NOT on the mix 'サイベリアン×ブリティッシュ' — that would overclaim on a mixed breed.
    var hypoChip = k.breed === 'サイベリアン'
      ? '<span class="usp-chip usp-chip--card" data-i18n="chip.hypoallergenic">' + ct('hypoallergenic') + '</span>'
      : '';
    return '<div class="kitten-card" data-status="' + escAttr(k.status) + '" data-price="' + k.price + '" data-birthday="' + escAttr(fmtBdayAttr(k.birthday)) + '" data-images="' + dataImages + '" data-video="' + escAttr(k.video || '') + '" data-papa="' + escAttr(k.papa || '') + '" data-mama="' + escAttr(k.mama || '') + '" data-new="' + k.isNew + '" data-name="" data-breeder-id="' + escAttr(k.breederId || '') + '" data-detail-url="' + escAttr(detailUrl) + '">' +
      '<div class="kitten-img">' +
        (cover ? '<img src="' + cover + '" alt="' + ct('photoAlt') + '" ' + imgLoad + ' style="width:100%;height:100%;object-fit:cover;">' : '<div class="img-placeholder"><span><i class="ico ico-cat" aria-hidden="true"></i></span></div>') +
        '<span class="kit-status ' + statusClass + '">' + statusText + '</span>' +
        (k.isNew ? '<span class="kit-badge-new">NEW</span>' : '') +
      '</div>' +
      '<div class="kitten-body">' +
        '<h3>' + escAttr(ctBreed(k.breed)) + '</h3>' +
        hypoChip +
        '<p class="kit-meta">' + genderFull + ' ・ ' + escAttr(ctColor(k.color)) + '</p>' +
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
        '<p>' + escAttr(ctBreed(p.breed)) + ' ・ ' + escAttr(p.gender) + ' ・ ' + escAttr(ctColor(p.color)) + '</p>' +
        '<p style="font-size:12px;color:var(--text-note);">' + escAttr(p.age) + '</p>' +
        '<span class="parent-role ' + roleClass + '">' + escAttr(ctRole(p.role)) + '</span>' +
      '</div>' +
    '</div>';
  }

  // Generate review card HTML matching existing structure
  function reviewCardHTML(r) {
    return '<div class="review-card">' +
      '<div class="review-header">' +
        '<div class="review-stars"><i class="ico ico-star" aria-hidden="true"></i><i class="ico ico-star" aria-hidden="true"></i><i class="ico ico-star" aria-hidden="true"></i><i class="ico ico-star" aria-hidden="true"></i><i class="ico ico-star" aria-hidden="true"></i></div>' +
        '<span class="review-platform">' + ct('reviewPlatform') + '</span>' +
      '</div>' +
      '<p class="review-body">' + escAttr(r.body) + '</p>' +
      '<div class="review-footer">' +
        '<p class="review-author">— ' + escAttr(r.region) + ' ' + escAttr(r.author) + '（' + escAttr(r.date) + '）</p>' +
        '<span class="review-verified">' + ct('verifiedReview') + '</span>' +
      '</div>' +
    '</div>';
  }

  // Render the kittens.html list: assign every kitten to its breed section grid
  // (FIX 7 — breed-based, never group-based, so no inventory is dropped), rewrite each
  // section header with ITS OWN grid's true count in the current language (FIX 8), and
  // dedupe listing cards by fileId keeping the last record (FIX 9). One shared function
  // for both the initial render and the langChanged re-render (was duplicated + drifting).
  function renderKittensPage(kittens) {
    var sections = document.querySelectorAll('.section');
    // Collect the rendered breed sections: each carries one .kittens-grid + .sec-tag + .sec-title.
    var slots = [];
    for (var si = 0; si < sections.length; si++) {
      var grid = sections[si].querySelector('.kittens-grid');
      if (!grid) continue;
      var tagEl = sections[si].querySelector('.sec-tag');
      var title = sections[si].querySelector('.sec-title');
      var breedJa = tagEl ? TAG_TO_BREED[tagEl.textContent.trim()] : null;
      slots.push({ grid: grid, title: title, breedJa: breedJa });
    }
    if (slots.length === 0) return;

    var deduped = dedupeByFileId(kittens);
    // Bucket each kitten to the slot whose breed matches its breed-section; if no slot
    // matches (a breed the page didn't bake a section for), append to the first slot so the
    // kitten stays visible — never silently drop inventory (FIX 7).
    var buckets = slots.map(function() { return []; });
    var slotByBreed = {};
    slots.forEach(function(s, idx) { if (s.breedJa) slotByBreed[s.breedJa] = idx; });
    deduped.forEach(function(k) {
      var breedJa = BREED_ORDER[breedSectionIndex(k.breed)];
      var idx = slotByBreed[breedJa];
      if (idx === undefined) idx = 0;
      buckets[idx].push(k);
    });

    // Render each grid and rewrite its OWN header (breed name + count) in the current lang —
    // per-section, so the ブリティッシュ substring collision that copied the BSH count onto
    // the BLH header can't happen (FIX 8), and the count format matches the baked per-lang form.
    slots.forEach(function(s, idx) {
      var group = buckets[idx];
      s.grid.innerHTML = group.map(function(k, i) {
        return kittenCardHTML(k, { showImages: true, priority: idx === 0 && i < 2 });
      }).join('');
      if (s.title && s.breedJa) {
        s.title.textContent = sectionBreedName(s.breedJa) + countLabel(group.length);
      }
    });
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
      // Homepage Siberian subset: select by BREED (folds the mix into Siberian), not by
      // platform group — empty-group Siberian records were being dropped here too (FIX 7).
      var sib = dedupeByFileId(kittens).filter(function(k) { return breedSectionIndex(k.breed) === 0 && k.status !== 'sold'; });
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
        if (grids.length === 0) return;

        renderKittensPage(kittens);

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
        var sib = dedupeByFileId(kittens).filter(function(k) { return breedSectionIndex(k.breed) === 0 && k.status !== 'sold'; });
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
          if (document.querySelectorAll('.kittens-grid').length === 0) return;
          renderKittensPage(kittens);
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
