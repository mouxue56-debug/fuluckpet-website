// blog-listing-i18n-apply.js — Translates blog.html listing page cards on language switch
// Requires: blog-listing-i18n.js loaded first (provides window._blogListingI18n)
(function() {
  var originals = typeof WeakMap === 'function' ? new WeakMap() : null;
  var BLOG_SIBLING_PATHS = {
    '/blog/breeder-visit-flow-osaka.html': true,
    '/blog/choose-healthy-kitten-checklist.html': true,
    '/blog/siberian-coat-color-guide.html': true,
    '/blog/siberian-kitten-feeding-guide.html': true,
    '/blog/siberian-vs-bsh-vs-ragdoll.html': true
  };
  var JA_CAT_MAP = {
    '猫種知識': 'breed', '品種紹介': 'breed',
    '健康管理': 'health', '健康・医療': 'health',
    '飲食栄養': 'nutrition', '食事・栄養': 'nutrition',
    '日常ケア': 'grooming',
    '行動・しつけ': 'behavior', '行動訓練': 'behavior',
    '子猫育て': 'kitten', '子猫': 'kitten',
    'ブリーダー選び': 'breeder', 'ブリーダー': 'breeder',
    'アレルギー': 'allergy',
    '猫ライフ': 'lifestyle', 'シニア猫': 'senior'
  };
  var NEUTRAL_CAT = { en: 'Article', zh: '文章' };
  var CAT_COUNTS = {};
  document.querySelectorAll('.blog-cat-tag').forEach(function(tag) {
    var text = tag.textContent;
    var match = text.match(/[（(](\d+)[）)]/);
    if (match) {
      var jaName = text.replace(/[（(]\d+[）)]/, '').trim();
      var key = JA_CAT_MAP[jaName];
      if (key) CAT_COUNTS[key] = match[1];
    }
  });

  var activeLanguage = null;

  function getData() {
    return window._blogListingI18n;
  }

  function isLang(lang) {
    return lang === 'ja' || lang === 'en' || lang === 'zh';
  }

  function readDocLang() {
    try {
      var root = document.documentElement;
      var htmlLang = ((root && (root.lang || (root.getAttribute && root.getAttribute('lang')))) || '').toLowerCase();
      if (isLang(htmlLang)) return htmlLang;
    } catch (e) {}
    return '';
  }

  function readUrlLang() {
    try {
      var urlLang = new URLSearchParams(window.location.search || '').get('lang');
      if (isLang(urlLang)) return urlLang;
    } catch (e) {}
    return '';
  }

  function readStoredLang() {
    try {
      var store = (window && window.localStorage) || (typeof localStorage !== 'undefined' ? localStorage : null);
      var saved = store && store.getItem('fuluckpet-lang');
      if (isLang(saved)) return saved;
    } catch (e) {}
    return '';
  }

  function commitLang(lang) {
    if (isLang(lang)) activeLanguage = lang;
    return activeLanguage;
  }

  function getLang(detailLang) {
    if (isLang(detailLang)) return commitLang(detailLang);
    if (isLang(activeLanguage)) return activeLanguage;
    return readUrlLang() || readStoredLang() || readDocLang() || 'ja';
  }

  function remember(el, fields) {
    if (!el) return null;
    if (originals) {
      if (!originals.has(el)) originals.set(el, fields);
      return originals.get(el);
    }
    if (!el._fuluckListingOrig) el._fuluckListingOrig = fields;
    return el._fuluckListingOrig;
  }

  function recalled(el) {
    if (!el) return null;
    if (originals && originals.has(el)) return originals.get(el);
    return el._fuluckListingOrig || null;
  }

  function inSearchResults(card) {
    if (!card) return false;
    if (card.closest) return !!card.closest('#blogSearchResults');
    var node = card;
    while (node) {
      if (node.id === 'blogSearchResults') return true;
      node = node.parentNode;
    }
    return false;
  }

  function listingCards() {
    return Array.prototype.filter.call(document.querySelectorAll('.blog-card'), function(card) {
      return !inSearchResults(card);
    });
  }

  function parseHref(href) {
    try {
      return new URL(href, 'https://fuluckpet.com');
    } catch (e) {
      return null;
    }
  }

  function isOnsiteRelative(href) {
    return typeof href === 'string' && href.charAt(0) === '/' && href.charAt(1) !== '/';
  }

  function rootBlogPath(pathname) {
    return String(pathname || '').replace(/^\/(en|zh)(?=\/)/, '');
  }

  function isCanonicalBlogPath(pathname) {
    return /^\/blog\/[a-z0-9-]+\.html$/.test(pathname);
  }

  function localizeBlogHref(href, lang) {
    if (!isOnsiteRelative(href)) return href;
    var parsed = parseHref(href);
    if (!parsed || parsed.origin !== 'https://fuluckpet.com') return href;
    var path = rootBlogPath(parsed.pathname);
    if (!isCanonicalBlogPath(path)) return href;
    var params = parsed.searchParams;
    var dest = path;
    if (lang === 'en' || lang === 'zh') {
      if (BLOG_SIBLING_PATHS[path]) {
        dest = '/' + lang + path;
        params.delete('lang');
      } else {
        params.set('lang', lang);
      }
    } else {
      params.delete('lang');
    }
    var search = params.toString();
    return dest + (search ? '?' + search : '') + (parsed.hash || '');
  }

  function cardSlugFromHref(href) {
    if (!isOnsiteRelative(href)) return '';
    var parsed = parseHref(href);
    if (!parsed) return '';
    var path = rootBlogPath(parsed.pathname);
    var match = path.match(/^\/blog\/([a-z0-9-]+)\.html$/);
    return match ? match[1] : '';
  }

  function setButtonLabel(el, text) {
    if (!el) return;
    var icon = el.querySelector ? el.querySelector('svg, .ico') : null;
    var textNode = null;
    if (el.childNodes) {
      Array.prototype.forEach.call(el.childNodes, function(node) {
        if (!textNode && node.nodeType === 3 && String(node.textContent || '').trim()) textNode = node;
      });
    }
    if (textNode) {
      var lead = /^\s/.test(textNode.textContent);
      var trail = /\s$/.test(textNode.textContent);
      textNode.textContent = (lead ? ' ' : '') + text + (trail ? ' ' : '');
    } else if (icon && el.appendChild) {
      el.appendChild(document.createTextNode(' ' + text));
    } else {
      el.textContent = text;
    }
  }

  function kittensRootHref(href) {
    if (!href) return '';
    var parsed = parseHref(href);
    if (!parsed || parsed.origin !== 'https://fuluckpet.com') return '';
    if (rootBlogPath(parsed.pathname) !== '/kittens.html') return '';
    return '/kittens.html' + (parsed.search || '') + (parsed.hash || '');
  }

  function localizeKittensHref(href, lang) {
    var root = kittensRootHref(href);
    if (!root) return href;
    if (lang === 'en' || lang === 'zh') return '/' + lang + root;
    return root;
  }

  function snapshotCard(card) {
    var titleEl = card.querySelector('.blog-card-title');
    var descEl = card.querySelector('.blog-card-desc');
    var catEl = card.querySelector('.blog-card-cat');
    return remember(card, {
      title: titleEl ? titleEl.textContent : '',
      desc: descEl ? descEl.textContent : '',
      cat: catEl ? catEl.textContent : '',
      href: card.getAttribute('href') || ''
    });
  }

  function applyLanguage(lang) {
    var data = getData();
    if (!data) return;
    if (lang !== 'en' && lang !== 'zh' && lang !== 'ja') lang = 'ja';

    var heroH1 = document.querySelector('.blog-hero h1');
    var heroP = document.querySelector('.blog-hero p');
    if (heroH1) remember(heroH1, { html: heroH1.innerHTML });
    if (heroP) remember(heroP, { html: heroP.innerHTML });

    document.querySelectorAll('.blog-cat-tag').forEach(function(tag) {
      remember(tag, { text: tag.textContent, href: tag.getAttribute('href') || '' });
    });
    document.querySelectorAll('.blog-cat-heading').forEach(function(heading) {
      remember(heading, { text: heading.textContent });
    });

    var ctaHeading = document.querySelector('.blog-bottom-cta h2');
    var ctaDesc = document.querySelector('.blog-bottom-cta p');
    if (ctaHeading) remember(ctaHeading, { text: ctaHeading.textContent });
    if (ctaDesc) remember(ctaDesc, { text: ctaDesc.textContent });
    document.querySelectorAll('.blog-bottom-cta a').forEach(function(link) {
      var href = link.getAttribute('href') || '';
      remember(link, { html: link.innerHTML, href: kittensRootHref(href) || href });
    });

    listingCards().forEach(function(card) { snapshotCard(card); });

    if (lang === 'ja') {
      restoreJA();
      return;
    }

    if (data.hero && data.hero[lang]) {
      if (heroH1 && data.hero[lang].title) heroH1.textContent = data.hero[lang].title;
      if (heroP && data.hero[lang].subtitle) heroP.textContent = data.hero[lang].subtitle;
    }

    document.querySelectorAll('.blog-cat-tag').forEach(function(tag) {
      var href = tag.getAttribute('href') || '';
      var catKey = href.replace('#', '');
      if (data.categories[catKey] && data.categories[catKey][lang]) {
        var count = CAT_COUNTS[catKey] || '';
        tag.textContent = data.categories[catKey][lang] + (count ? '（' + count + '）' : '');
      }
    });

    document.querySelectorAll('.blog-cat-heading').forEach(function(heading) {
      var catKey = heading.id;
      if (data.categories[catKey] && data.categories[catKey][lang]) {
        heading.textContent = data.categories[catKey][lang];
      }
    });

    listingCards().forEach(function(card) {
      var orig = recalled(card) || snapshotCard(card);
      var slug = cardSlugFromHref(orig.href);
      var article = data.articles && data.articles[slug];
      var titleEl = card.querySelector('.blog-card-title');
      var descEl = card.querySelector('.blog-card-desc');
      var catEl = card.querySelector('.blog-card-cat');
      if (article && article[lang]) {
        if (titleEl && article[lang].title) titleEl.textContent = article[lang].title;
        if (descEl && article[lang].excerpt) descEl.textContent = article[lang].excerpt;
      } else {
        if (titleEl) titleEl.textContent = orig.title;
        if (descEl) descEl.textContent = orig.desc;
      }
      if (catEl) {
        var catKey = JA_CAT_MAP[orig.cat];
        if (catKey && data.categories[catKey] && data.categories[catKey][lang]) {
          catEl.textContent = data.categories[catKey][lang];
        } else if (!orig.cat || orig.cat === '記事') {
          catEl.textContent = NEUTRAL_CAT[lang] || NEUTRAL_CAT.en;
        } else {
          catEl.textContent = orig.cat;
        }
      }
      card.setAttribute('href', localizeBlogHref(orig.href, lang));
    });

    if (data.cta && data.cta[lang]) {
      if (ctaHeading && data.cta[lang].heading) ctaHeading.textContent = data.cta[lang].heading;
      if (ctaDesc && data.cta[lang].desc) ctaDesc.textContent = data.cta[lang].desc;
      document.querySelectorAll('.blog-bottom-cta a').forEach(function(link) {
        var orig = recalled(link);
        var origHref = orig ? orig.href : (link.getAttribute('href') || '');
        if (kittensRootHref(origHref) || kittensRootHref(link.getAttribute('href') || '')) {
          if (data.cta[lang].kittensBtn) setButtonLabel(link, data.cta[lang].kittensBtn);
          link.setAttribute('href', localizeKittensHref(origHref || link.getAttribute('href'), lang));
        } else if (data.cta[lang].lineBtn) {
          setButtonLabel(link, data.cta[lang].lineBtn);
        }
      });
    }
  }

  function restoreJA() {
    var heroH1 = document.querySelector('.blog-hero h1');
    var heroP = document.querySelector('.blog-hero p');
    var heroOrig = recalled(heroH1);
    var heroPOrig = recalled(heroP);
    if (heroH1 && heroOrig && heroOrig.html != null) heroH1.innerHTML = heroOrig.html;
    if (heroP && heroPOrig && heroPOrig.html != null) heroP.innerHTML = heroPOrig.html;

    document.querySelectorAll('.blog-cat-tag').forEach(function(tag) {
      var orig = recalled(tag);
      if (orig && orig.text != null) tag.textContent = orig.text;
    });
    document.querySelectorAll('.blog-cat-heading').forEach(function(heading) {
      var orig = recalled(heading);
      if (orig && orig.text != null) heading.textContent = orig.text;
    });

    listingCards().forEach(function(card) {
      var orig = recalled(card);
      if (!orig) return;
      var titleEl = card.querySelector('.blog-card-title');
      var descEl = card.querySelector('.blog-card-desc');
      var catEl = card.querySelector('.blog-card-cat');
      if (titleEl) titleEl.textContent = orig.title;
      if (descEl) descEl.textContent = orig.desc;
      if (catEl) catEl.textContent = orig.cat;
      card.setAttribute('href', orig.href);
    });

    var ctaHeading = document.querySelector('.blog-bottom-cta h2');
    var ctaDesc = document.querySelector('.blog-bottom-cta p');
    var ctaHOrig = recalled(ctaHeading);
    var ctaPOrig = recalled(ctaDesc);
    if (ctaHeading && ctaHOrig && ctaHOrig.text != null) ctaHeading.textContent = ctaHOrig.text;
    if (ctaDesc && ctaPOrig && ctaPOrig.text != null) ctaDesc.textContent = ctaPOrig.text;
    document.querySelectorAll('.blog-bottom-cta a').forEach(function(link) {
      var orig = recalled(link);
      if (!orig) return;
      if (orig.html != null) link.innerHTML = orig.html;
      if (orig.href != null) link.setAttribute('href', orig.href);
    });
  }

  window.addEventListener('langChanged', function(event) {
    var fromEvent = event && event.detail && event.detail.lang;
    commitLang(isLang(fromEvent) ? fromEvent : readDocLang());
    applyLanguage(getLang());
  });

  var initLang = getLang();
  if (initLang !== 'ja') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { applyLanguage(getLang()); });
    } else {
      applyLanguage(initLang);
    }
  }
})();
