// blog-listing-i18n-apply.js — Translates blog.html listing page cards on language switch
// Requires: blog-listing-i18n.js loaded first (provides window._blogListingI18n)
(function() {
  var data = window._blogListingI18n;
  if (!data) return;

  // Cache original JA content on first language switch
  var originalJA = null;

  function cacheOriginals() {
    if (originalJA) return;
    originalJA = { cards: [], tags: [], headings: [], hero: {} };

    // Hero
    var heroH1 = document.querySelector('.blog-hero h1');
    var heroP = document.querySelector('.blog-hero p');
    if (heroH1) originalJA.hero.title = heroH1.innerHTML;
    if (heroP) originalJA.hero.subtitle = heroP.innerHTML;

    // Category tags
    document.querySelectorAll('.blog-cat-tag').forEach(function(tag) {
      originalJA.tags.push(tag.textContent);
    });

    // Category headings
    document.querySelectorAll('.blog-cat-heading').forEach(function(h) {
      originalJA.headings.push(h.textContent);
    });

    // Article cards
    document.querySelectorAll('.blog-card').forEach(function(card) {
      var titleEl = card.querySelector('.blog-card-title');
      var descEl = card.querySelector('.blog-card-desc');
      var catEl = card.querySelector('.blog-card-cat');
      originalJA.cards.push({
        title: titleEl ? titleEl.textContent : '',
        desc: descEl ? descEl.textContent : '',
        cat: catEl ? catEl.textContent : ''
      });
    });
  }

  // Map category JA name to key
  var JA_CAT_MAP = {
    '猫種知識': 'breed', '健康管理': 'health', '飲食栄養': 'nutrition',
    '日常ケア': 'grooming', '行動・しつけ': 'behavior', '子猫育て': 'kitten',
    'ブリーダー選び': 'breeder', 'アレルギー': 'allergy',
    '猫ライフ': 'lifestyle', 'シニア猫': 'senior'
  };

  // Category count map (from JA tag text)
  var CAT_COUNTS = {};
  document.querySelectorAll('.blog-cat-tag').forEach(function(tag) {
    var text = tag.textContent;
    var match = text.match(/[（(](\d+)[）)]/);
    if (match) {
      // Extract JA name without count
      var jaName = text.replace(/[（(]\d+[）)]/, '').trim();
      var key = JA_CAT_MAP[jaName];
      if (key) CAT_COUNTS[key] = match[1];
    }
  });

  function applyLanguage(lang) {
    if (lang === 'ja') {
      restoreJA();
      return;
    }

    cacheOriginals();

    // Hero
    var heroH1 = document.querySelector('.blog-hero h1');
    var heroP = document.querySelector('.blog-hero p');
    if (data.hero && data.hero[lang]) {
      if (heroH1 && data.hero[lang].title) heroH1.textContent = data.hero[lang].title;
      if (heroP && data.hero[lang].subtitle) heroP.textContent = data.hero[lang].subtitle;
    }

    // Category tags
    var tags = document.querySelectorAll('.blog-cat-tag');
    tags.forEach(function(tag) {
      var href = tag.getAttribute('href') || '';
      var catKey = href.replace('#', '');
      if (data.categories[catKey] && data.categories[catKey][lang]) {
        var count = CAT_COUNTS[catKey] || '';
        tag.textContent = data.categories[catKey][lang] + (count ? '（' + count + '）' : '');
      }
    });

    // Category headings
    var headings = document.querySelectorAll('.blog-cat-heading');
    headings.forEach(function(h) {
      var catKey = h.id;
      if (data.categories[catKey] && data.categories[catKey][lang]) {
        h.textContent = data.categories[catKey][lang];
      }
    });

    // Article cards
    var cards = document.querySelectorAll('.blog-card');
    cards.forEach(function(card) {
      var href = card.getAttribute('href') || '';
      var slug = href.replace(/^\/blog\//, '').replace(/\.html$/, '');
      var article = data.articles[slug];
      if (!article || !article[lang]) return;

      var titleEl = card.querySelector('.blog-card-title');
      var descEl = card.querySelector('.blog-card-desc');
      var catEl = card.querySelector('.blog-card-cat');

      if (titleEl && article[lang].title) titleEl.textContent = article[lang].title;
      if (descEl && article[lang].excerpt) descEl.textContent = article[lang].excerpt;

      // Translate category label on card
      if (catEl) {
        var jaText = catEl.textContent;
        var catKey = JA_CAT_MAP[jaText];
        // If already translated, try matching by iterating
        if (!catKey) {
          for (var k in data.categories) {
            if (data.categories[k].en === jaText || data.categories[k].zh === jaText) {
              catKey = k;
              break;
            }
          }
        }
        if (catKey && data.categories[catKey] && data.categories[catKey][lang]) {
          catEl.textContent = data.categories[catKey][lang];
        }
      }
    });

    // Bottom CTA section
    if (data.cta && data.cta[lang]) {
      var ctaHeading = document.querySelector('.blog-bottom-cta h2');
      var ctaDesc = document.querySelector('.blog-bottom-cta p');
      if (ctaHeading && data.cta[lang].heading) ctaHeading.textContent = data.cta[lang].heading;
      if (ctaDesc && data.cta[lang].desc) ctaDesc.textContent = data.cta[lang].desc;
    }
  }

  function restoreJA() {
    if (!originalJA) return;

    // Hero
    var heroH1 = document.querySelector('.blog-hero h1');
    var heroP = document.querySelector('.blog-hero p');
    if (heroH1 && originalJA.hero.title) heroH1.innerHTML = originalJA.hero.title;
    if (heroP && originalJA.hero.subtitle) heroP.innerHTML = originalJA.hero.subtitle;

    // Tags
    var tags = document.querySelectorAll('.blog-cat-tag');
    tags.forEach(function(tag, i) {
      if (originalJA.tags[i] !== undefined) tag.textContent = originalJA.tags[i];
    });

    // Headings
    var headings = document.querySelectorAll('.blog-cat-heading');
    headings.forEach(function(h, i) {
      if (originalJA.headings[i] !== undefined) h.textContent = originalJA.headings[i];
    });

    // Cards
    var cards = document.querySelectorAll('.blog-card');
    cards.forEach(function(card, i) {
      if (!originalJA.cards[i]) return;
      var titleEl = card.querySelector('.blog-card-title');
      var descEl = card.querySelector('.blog-card-desc');
      var catEl = card.querySelector('.blog-card-cat');
      if (titleEl) titleEl.textContent = originalJA.cards[i].title;
      if (descEl) descEl.textContent = originalJA.cards[i].desc;
      if (catEl) catEl.textContent = originalJA.cards[i].cat;
    });

    // CTA
    // Let data-i18n handle CTA restoration (or just re-read from original if needed)
  }

  // Apply on initial load if URL has ?lang= parameter
  function getLang() {
    try { return localStorage.getItem('fuluckpet-lang') || 'ja'; } catch(e) { return 'ja'; }
  }
  var initLang = getLang();
  if (initLang !== 'ja') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { applyLanguage(initLang); });
    } else {
      applyLanguage(initLang);
    }
  }

  // Listen for language changes
  window.addEventListener('langChanged', function() {
    applyLanguage(getLang());
  });
})();
