// faq-page-loader.js — Loads FAQ from API and renders the standalone FAQ page
// Used by faq.html (NOT index.html — index keeps static FAQs for SEO)
(function() {
  var API = 'https://fuluck-api.mouxue56.workers.dev';
  var listContainer = document.getElementById('faqList');
  var filterContainer = document.getElementById('faqFilters');
  if (!listContainer) return;

  var allFaq = [];
  var currentFilter = 'all';

  var CATEGORIES = {
    general:  { ja:'一般',    en:'General',  zh:'一般',  icon:'ico-message-circle' },
    purchase: { ja:'ご購入',  en:'Purchase', zh:'购买',  icon:'ico-shopping-cart' },
    care:     { ja:'お世話',  en:'Care',     zh:'护理',  icon:'ico-paw-print' },
    health:   { ja:'健康',    en:'Health',   zh:'健康',  icon:'ico-pill' }
  };

  function getLang() {
    try { return localStorage.getItem('fuluckpet-lang') || 'ja'; } catch(e) { return 'ja'; }
  }

  function txt(obj) {
    if (!obj) return '';
    var lang = getLang();
    return obj[lang] || obj.ja || obj.en || '';
  }

  function trustCopy() {
    return window.FaqTrustCopy && typeof window.FaqTrustCopy.applyTrustOverrides === 'function'
      ? window.FaqTrustCopy
      : null;
  }

  function appendTrustLinks(answer, item) {
    var trust = trustCopy();
    if (!trust || typeof trust.linksFor !== 'function') return;
    var links = trust.linksFor(item.id, getLang());
    if (!links.length) return;
    var actions = document.createElement('span');
    actions.className = 'faq-trust-links';
    links.forEach(function(link) {
      var anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.textContent = link.label;
      if (/^https:\/\//.test(link.href)) {
        anchor.target = '_blank';
        anchor.rel = 'noopener';
      }
      actions.appendChild(anchor);
    });
    answer.appendChild(actions);
  }

  function isKnownCategory(key) {
    return Object.prototype.hasOwnProperty.call(CATEGORIES, key);
  }

  function catLabel(key) {
    var c = isKnownCategory(key) ? CATEGORIES[key] : null;
    return c ? txt(c) : String(key || '');
  }

  function createIcon(iconClass) {
    var icon = document.createElement('i');
    icon.className = 'ico ' + iconClass;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  function countByCat(cat) {
    if (cat === 'all') return allFaq.length;
    return allFaq.filter(function(f) { return f.category === cat; }).length;
  }

  function renderFilters() {
    if (!filterContainer) return;
    var cats = Object.create(null);
    allFaq.forEach(function(f) { if (f.category) cats[f.category] = true; });
    var lang = getLang();
    var allLabel = lang === 'zh' ? '全部' : lang === 'en' ? 'All' : 'すべて';
    filterContainer.textContent = '';

    function appendFilter(category, label, iconClass) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'faq-filter-btn' + (currentFilter === category ? ' active' : '');
      button.dataset.cat = category;
      var iconWrap = document.createElement('span');
      iconWrap.className = 'filter-icon';
      iconWrap.appendChild(createIcon(iconClass));
      button.appendChild(iconWrap);
      button.appendChild(document.createTextNode(label));
      var count = document.createElement('span');
      count.className = 'faq-filter-count';
      count.textContent = countByCat(category);
      button.appendChild(count);
      button.addEventListener('click', function() {
        currentFilter = this.dataset.cat;
        filterContainer.querySelectorAll('.faq-filter-btn').forEach(function(item) { item.classList.remove('active'); });
        this.classList.add('active');
        renderList();
      });
      filterContainer.appendChild(button);
    }

    appendFilter('all', allLabel, 'ico-clipboard-list');

    Object.keys(CATEGORIES).forEach(function(c) {
      if (cats[c]) {
        appendFilter(c, catLabel(c), CATEGORIES[c].icon);
      }
    });
  }

  function renderEmpty(message, iconClass) {
    listContainer.textContent = '';
    var empty = document.createElement('div');
    empty.className = 'faq-empty';
    var iconWrap = document.createElement('div');
    iconWrap.className = 'faq-empty-icon';
    iconWrap.appendChild(createIcon(iconClass));
    var text = document.createElement('p');
    text.textContent = message;
    empty.appendChild(iconWrap);
    empty.appendChild(text);
    listContainer.appendChild(empty);
  }

  function createFaqItem(item, index) {
    item = item && typeof item === 'object' ? item : {};
    var faqItem = document.createElement('div');
    faqItem.className = 'faq-item';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'faq-q';
    button.textContent = txt(item.question);
    button.setAttribute('aria-expanded', 'false');
    var panel = document.createElement('div');
    panel.className = 'faq-a';
    panel.id = 'faq-a-' + index;
    panel.setAttribute('role', 'region');
    button.setAttribute('aria-controls', panel.id);
    var answer = document.createElement('p');
    answer.textContent = txt(item.answer);
    appendTrustLinks(answer, item);
    panel.appendChild(answer);
    button.addEventListener('click', function() {
      var isActive = faqItem.classList.contains('active');
      listContainer.querySelectorAll('.faq-item').forEach(function(row) { row.classList.remove('active'); });
      listContainer.querySelectorAll('.faq-q').forEach(function(question) { question.setAttribute('aria-expanded', 'false'); });
      if (!isActive) {
        faqItem.classList.add('active');
        button.setAttribute('aria-expanded', 'true');
      }
    });
    faqItem.appendChild(button);
    faqItem.appendChild(panel);
    return faqItem;
  }

  function renderList() {
    var items = currentFilter === 'all'
      ? allFaq
      : allFaq.filter(function(f) { return f.category === currentFilter; });

    if (items.length === 0) {
      var lang = getLang();
      var msg = lang === 'zh' ? '暂无FAQ' : lang === 'en' ? 'No FAQs yet' : 'まだFAQがありません';
      renderEmpty(msg, 'ico-search');
      return;
    }

    var fragment = document.createDocumentFragment();
    var itemIndex = 0;

    // 'all' view: group by category with the designed .faq-cat-label dividers.
    // (The static HTML ships these labels for SEO/no-JS, but this re-render used to
    // drop them — visitors never saw the grouped layout. Keep flat when filtered.)
    if (currentFilter === 'all') {
      Object.keys(CATEGORIES).forEach(function(c) {
        var inCat = items.filter(function(f) { return f.category === c; });
        if (inCat.length) {
          var categoryLabel = document.createElement('div');
          categoryLabel.className = 'faq-cat-label cat-' + c;
          categoryLabel.appendChild(createIcon(CATEGORIES[c].icon));
          categoryLabel.appendChild(document.createTextNode(' ' + catLabel(c)));
          fragment.appendChild(categoryLabel);
          inCat.forEach(function(item) {
            fragment.appendChild(createFaqItem(item, itemIndex++));
          });
        }
      });
      var uncat = items.filter(function(f) { return !isKnownCategory(f.category); });
      uncat.forEach(function(item) {
        fragment.appendChild(createFaqItem(item, itemIndex++));
      });
    } else {
      items.forEach(function(item) {
        fragment.appendChild(createFaqItem(item, itemIndex++));
      });
    }
    listContainer.textContent = '';
    listContainer.appendChild(fragment);
  }

  // Init
  fetch(API + '/api/faq')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!Array.isArray(data)) throw new Error('Invalid FAQ collection');
      var trust = trustCopy();
      if (!trust) return;
      allFaq = trust.applyTrustOverrides(data).filter(function(item) { return item && typeof item === 'object'; });
      renderFilters();
      renderList();
    })
    .catch(function() {
      var lang = getLang();
      var msg = lang === 'zh' ? '加载失败，请稍后重试' : lang === 'en' ? 'Failed to load. Please try again.' : '読み込みに失敗しました。再度お試しください。';
      renderEmpty(msg, 'ico-triangle-alert');
    });

  // Re-render on language change
  window.addEventListener('langChanged', function() {
    if (allFaq.length > 0) {
      renderFilters();
      renderList();
    }
  });
})();
