// card-loader.js — Dynamic card rendering from API
// Fetches kittens/parents/reviews from Worker API and replaces hardcoded HTML cards.
// Keeps static HTML as SEO fallback (crawlers see hardcoded content).
// Must be loaded BEFORE script.js so rebindCards() is available after fetch completes.

(function() {
  var API = window.FULUCK_API_BASE || 'https://fuluck-api.mouxue56.workers.dev';

  // ===== Utility Functions =====

  function getCoverPhoto(item) {
    if (!item.photos || item.photos.length === 0) return '';
    var idx = item.coverIndex || 0;
    return item.photos[Math.min(idx, item.photos.length - 1)] || '';
  }

  function fmtBday(bday) {
    // "2025-12" → "2025年12月生まれ", "2024-02" → "2024年2月生まれ"
    if (!bday) return '';
    var parts = bday.split('-');
    if (parts.length < 2) return '';
    var y = parts[0];
    var m = parseInt(parts[1], 10);
    return y + '年' + m + '月生まれ';
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
    var statusText = k.status === 'available' ? '販売中' : k.status === 'reserved' ? '商談中' : 'ご家族決定';
    var genderFull = k.gender === '♂' ? '♂ 男の子' : '♀ 女の子';
    var dataImages = opts && opts.showImages && cover ? escAttr(cover) : '';
    var bdayText = fmtBday(k.birthday);
    var priceText = fmtPrice(k.price);

    return '<div class="kitten-card" data-status="' + escAttr(k.status) + '" data-price="' + k.price + '" data-birthday="' + escAttr(fmtBdayAttr(k.birthday)) + '" data-images="' + dataImages + '" data-video="' + escAttr(k.video || '') + '" data-papa="' + escAttr(k.papa || '') + '" data-mama="' + escAttr(k.mama || '') + '" data-new="' + k.isNew + '" data-name="" data-breeder-id="' + escAttr(k.breederId || '') + '">' +
      '<div class="kitten-img">' +
        (cover ? '<img src="' + cover + '" alt="子猫の写真" loading="lazy" style="width:100%;height:100%;object-fit:cover;">' : '<div class="img-placeholder"><span>🐱</span></div>') +
        '<span class="kit-status ' + statusClass + '">' + statusText + '</span>' +
        (k.isNew ? '<span class="kit-badge-new">NEW</span>' : '') +
      '</div>' +
      '<div class="kitten-body">' +
        '<h3>' + escAttr(k.breed) + '</h3>' +
        '<p class="kit-meta">' + genderFull + ' ・ ' + escAttr(k.color) + '</p>' +
        '<p class="kit-meta">' + bdayText + '</p>' +
        (k.note ? '<p class="kit-meta" style="font-size:11px;color:var(--text-note);">' + escAttr(k.note) + '</p>' : '') +
        '<p class="kit-price">' + priceText + ' <span class="tax">（税込）</span></p>' +
      '</div>' +
    '</div>';
  }

  // Generate parent card HTML matching existing structure
  function parentCardHTML(p) {
    var cover = getCoverPhoto(p);
    var roleClass = p.role === 'パパ猫' ? 'role-papa' : 'role-mama';

    return '<div class="parent-card" data-name="' + escAttr(p.name) + '" data-breed="' + escAttr(p.breed) + '" data-gender="' + escAttr(p.gender) + '" data-role="' + escAttr(p.role) + '" data-age="' + escAttr(p.age) + '" data-color="' + escAttr(p.color) + '" data-tested="' + p.tested + '" style="position:relative;cursor:pointer;">' +
      '<span class="health-tag tag-good" style="position:absolute;top:8px;right:8px;font-size:11px;padding:2px 8px;">✓ 遺伝子検査済</span>' +
      (cover ? '<img src="' + cover + '" alt="' + escAttr(p.name) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-lg) var(--radius-lg) 0 0;">' : '') +
      '<div class="parent-body">' +
        '<h3>' + escAttr(p.name) + '</h3>' +
        '<p>' + escAttr(p.breed) + ' ・ ' + escAttr(p.gender) + ' ・ ' + escAttr(p.color) + '</p>' +
        '<p style="font-size:12px;color:var(--text-note);">' + escAttr(p.age) + '</p>' +
        '<span class="parent-role ' + roleClass + '">' + escAttr(p.role) + '</span>' +
      '</div>' +
    '</div>';
  }

  // Generate review card HTML matching existing structure
  function reviewCardHTML(r) {
    return '<div class="review-card">' +
      '<div class="review-header">' +
        '<div class="review-stars">★★★★★</div>' +
        '<span class="review-platform">みんなの子猫ブリーダー</span>' +
      '</div>' +
      '<p class="review-body">' + escAttr(r.body) + '</p>' +
      '<div class="review-footer">' +
        '<p class="review-author">— ' + escAttr(r.region) + ' ' + escAttr(r.author) + '（' + escAttr(r.date) + '）</p>' +
        '<span class="review-verified">✓ 認証済みレビュー</span>' +
      '</div>' +
    '</div>';
  }

  // ===== Page Detection =====

  var kittensGrid = document.getElementById('kittensGrid');   // index.html
  var isIndex = !!kittensGrid && !document.querySelector('.page-hero');
  var isKittensPage = document.title.indexOf('子猫') >= 0 && !!document.querySelector('.page-hero');
  var isParentsPage = document.title.indexOf('親猫') >= 0 && !!document.querySelector('.page-hero');
  var isReviewsPage = document.title.indexOf('お客様') >= 0 && !!document.querySelector('.page-hero');

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
          grids[0].innerHTML = sib.map(function(k) { return kittenCardHTML(k, {showImages: true}); }).join('');
        }

        // Render British section
        if (brit.length > 0) {
          grids[1].innerHTML = brit.map(function(k) { return kittenCardHTML(k, {showImages: true}); }).join('');
        }

        // Update section header counts
        var headers = document.querySelectorAll('.sec-title');
        headers.forEach(function(h) {
          var text = h.textContent;
          if (text.indexOf('サイベリアン') >= 0) {
            h.textContent = 'サイベリアン (' + sib.length + '匹)';
          } else if (text.indexOf('ブリティッシュ') >= 0 || text.indexOf('British') >= 0) {
            h.textContent = h.textContent.replace(/\(\d+匹\)/, '(' + brit.length + '匹)');
          }
        });

        if (typeof window.rebindCards === 'function') {
          window.rebindCards();
        }
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

})();
