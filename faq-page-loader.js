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
    general:  { ja:'一般',    en:'General',  zh:'一般',  icon:'💬' },
    purchase: { ja:'ご購入',  en:'Purchase', zh:'购买',  icon:'🛒' },
    care:     { ja:'お世話',  en:'Care',     zh:'护理',  icon:'🐾' },
    health:   { ja:'健康',    en:'Health',   zh:'健康',  icon:'💊' }
  };

  function getLang() {
    try { return localStorage.getItem('fuluckpet-lang') || 'ja'; } catch(e) { return 'ja'; }
  }

  function txt(obj) {
    if (!obj) return '';
    var lang = getLang();
    return obj[lang] || obj.ja || obj.en || '';
  }

  function catLabel(key) {
    var c = CATEGORIES[key];
    return c ? txt(c) : key;
  }

  function catIcon(key) {
    var c = CATEGORIES[key];
    return c ? c.icon : '';
  }

  function countByCat(cat) {
    if (cat === 'all') return allFaq.length;
    return allFaq.filter(function(f) { return f.category === cat; }).length;
  }

  function renderFilters() {
    if (!filterContainer) return;
    var cats = {};
    allFaq.forEach(function(f) { if (f.category) cats[f.category] = true; });
    var lang = getLang();
    var allLabel = lang === 'zh' ? '全部' : lang === 'en' ? 'All' : 'すべて';

    var html = '<button class="faq-filter-btn active" data-cat="all">' +
      '<span class="filter-icon">📋</span>' + allLabel +
      '<span class="faq-filter-count">' + countByCat('all') + '</span>' +
      '</button>';

    Object.keys(CATEGORIES).forEach(function(c) {
      if (cats[c]) {
        html += '<button class="faq-filter-btn" data-cat="' + c + '">' +
          '<span class="filter-icon">' + catIcon(c) + '</span>' + catLabel(c) +
          '<span class="faq-filter-count">' + countByCat(c) + '</span>' +
          '</button>';
      }
    });

    filterContainer.innerHTML = html;
    filterContainer.querySelectorAll('.faq-filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        currentFilter = this.dataset.cat;
        filterContainer.querySelectorAll('.faq-filter-btn').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
        renderList();
      });
    });
  }

  function renderList() {
    var items = currentFilter === 'all'
      ? allFaq
      : allFaq.filter(function(f) { return f.category === currentFilter; });

    if (items.length === 0) {
      var lang = getLang();
      var msg = lang === 'zh' ? '暂无FAQ' : lang === 'en' ? 'No FAQs yet' : 'まだFAQがありません';
      listContainer.innerHTML = '<div class="faq-empty"><div class="faq-empty-icon">🔍</div><p>' + msg + '</p></div>';
      return;
    }

    listContainer.innerHTML = items.map(function(item) {
      var q = txt(item.question);
      var a = txt(item.answer);
      return '<div class="faq-item">' +
        '<button class="faq-q">' + q + '</button>' +
        '<div class="faq-a"><p>' + a + '</p></div>' +
        '</div>';
    }).join('\n');

    // Bind accordion click handlers
    listContainer.querySelectorAll('.faq-q').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var item = this.parentElement;
        var isActive = item.classList.contains('active');
        listContainer.querySelectorAll('.faq-item').forEach(function(fi) { fi.classList.remove('active'); });
        if (!isActive) item.classList.add('active');
      });
    });
  }

  // Init
  fetch(API + '/api/faq')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      allFaq = data || [];
      renderFilters();
      renderList();
    })
    .catch(function() {
      var lang = getLang();
      var msg = lang === 'zh' ? '加载失败，请稍后重试' : lang === 'en' ? 'Failed to load. Please try again.' : '読み込みに失敗しました。再度お試しください。';
      listContainer.innerHTML = '<div class="faq-empty"><div class="faq-empty-icon">⚠️</div><p>' + msg + '</p></div>';
    });

  // Re-render on language change
  window.addEventListener('langChanged', function() {
    if (allFaq.length > 0) {
      renderFilters();
      renderList();
    }
  });
})();
