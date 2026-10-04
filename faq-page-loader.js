// faq-page-loader.js — Loads FAQ from API and renders the standalone FAQ page
// Used by faq.html (NOT index.html — index keeps static FAQs for SEO)
(function() {
  var API = 'https://fuluck-api.mouxue56.workers.dev';
  var listContainer = document.getElementById('faqList');
  var filterContainer = document.getElementById('faqFilters');
  if (!listContainer) return;

  var allFaq = [];
  var currentFilter = 'all';
  var searchInput = document.getElementById('faqSearch');
  var searchStatus = document.getElementById('faqSearchStatus');

  var CATEGORIES = {
    general:  { ja:'一般',    en:'General',  zh:'一般',  icon:'ico-message-circle' },
    purchase: { ja:'ご購入',  en:'Purchase', zh:'购买',  icon:'ico-shopping-cart' },
    care:     { ja:'お世話',  en:'Care',     zh:'护理',  icon:'ico-paw-print' },
    health:   { ja:'健康',    en:'Health',   zh:'健康',  icon:'ico-pill' }
  };

  function getLang() {
    // The document follows the selected route/language even when storage is blocked.
    var pageLang = document.documentElement && document.documentElement.lang;
    if (pageLang === 'en' || pageLang === 'zh' || pageLang === 'ja') return pageLang;
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
      button.setAttribute('aria-pressed', String(currentFilter === category));
      if (isKnownCategory(category)) {
        var image = document.createElement('img');
        image.className = 'faq-topic-image';
        image.src = '/images/faq-scenes/v1/' + category + '.webp';
        image.alt = '';
        image.width = 160;
        image.height = 120;
        image.decoding = 'async';
        button.appendChild(image);
      } else {
        var iconWrap = document.createElement('span');
        iconWrap.className = 'filter-icon';
        iconWrap.appendChild(createIcon(iconClass));
        button.appendChild(iconWrap);
      }
      var labelText = document.createElement('span');
      labelText.className = 'faq-filter-label';
      labelText.textContent = label;
      button.appendChild(labelText);
      var count = document.createElement('span');
      count.className = 'faq-filter-count';
      count.textContent = countByCat(category);
      button.appendChild(count);
      button.addEventListener('click', function() {
        currentFilter = this.dataset.cat;
        filterContainer.querySelectorAll('.faq-filter-btn').forEach(function(item) {
          item.classList.remove('active');
          item.setAttribute('aria-pressed', 'false');
        });
        this.classList.add('active');
        this.setAttribute('aria-pressed', 'true');
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
    button.id = 'faq-q-' + index;
    button.dataset.faqBound = 'true';
    button.textContent = txt(item.question);
    button.setAttribute('aria-expanded', 'false');
    var panel = document.createElement('div');
    panel.className = 'faq-a';
    panel.id = 'faq-a-' + index;
    panel.hidden = true;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', button.id);
    button.setAttribute('aria-controls', panel.id);
    var answer = document.createElement('p');
    answer.textContent = txt(item.answer);
    appendTrustLinks(answer, item);
    panel.appendChild(answer);
    button.addEventListener('click', function() {
      var isActive = faqItem.classList.contains('active');
      listContainer.querySelectorAll('.faq-item').forEach(function(row) { row.classList.remove('active'); });
      listContainer.querySelectorAll('.faq-q').forEach(function(question) { question.setAttribute('aria-expanded', 'false'); });
      listContainer.querySelectorAll('.faq-a').forEach(function(answerPanel) { answerPanel.hidden = true; });
      if (!isActive) {
        faqItem.classList.add('active');
        button.setAttribute('aria-expanded', 'true');
        panel.hidden = false;
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
    var query = searchInput ? searchInput.value : '';
    if (window.FuluckPageExperience) items = window.FuluckPageExperience.filterFaq(allFaq, currentFilter, query, getLang());
    if (searchStatus) searchStatus.textContent = getLang() === 'en' ? items.length + ' questions' : getLang() === 'zh' ? items.length + ' 个问题' : items.length + '件の質問';

    if (items.length === 0) {
      var lang = getLang();
      var msg = lang === 'zh' ? '暂无FAQ' : lang === 'en' ? 'No FAQs yet' : 'まだFAQがありません';
      if (query.trim()) msg = lang === 'zh' ? '没有找到匹配问题，请换个关键词或分类。' : lang === 'en' ? 'No matching questions. Try another keyword or category.' : '該当する質問がありません。キーワードや分類を変えてお試しください。';
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

  // Keep the checked-in questions usable while the API loads or is unavailable.
  // Read approved translation strings verbatim; never infer FAQ facts from images.
  function readStaticFaq() {
    var items = [];
    listContainer.querySelectorAll('.faq-item').forEach(function(row) {
      var id = row.getAttribute('data-faq-id');
      var question = row.querySelector('.faq-q');
      var answer = row.querySelector('.faq-a');
      var paragraph = answer && answer.querySelector('p');
      if (!id || !question || !paragraph) return;
      var item = { id: id, category: row.getAttribute('data-category'), question: {}, answer: {} };
      ['ja', 'en', 'zh'].forEach(function(lang) {
        var dictionary = typeof translations !== 'undefined' && translations[lang];
        if (dictionary && dictionary['faqPage.q.' + id] && dictionary['faqPage.a.' + id]) {
          item.question[lang] = dictionary['faqPage.q.' + id];
          item.answer[lang] = dictionary['faqPage.a.' + id];
        } else if (lang === getLang()) {
          item.question[lang] = question.textContent;
          item.answer[lang] = paragraph.textContent;
        }
      });
      items.push(item);
    });
    return items;
  }

  // Init
  allFaq = readStaticFaq();
  if (allFaq.length) {
    var initialTrust = trustCopy();
    if (initialTrust) allFaq = initialTrust.applyTrustOverrides(allFaq);
    renderFilters();
    renderList();
  }
  if (searchInput) searchInput.addEventListener('input', renderList);
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
      if (allFaq.length) return;
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
