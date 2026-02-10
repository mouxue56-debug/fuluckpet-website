// blog-loader.js — Loads articles from API and renders blog page
(function() {
  var API = 'https://fuluck-api.mouxue56.workers.dev';
  var listContainer = document.getElementById('blogList');
  var detailContainer = document.getElementById('blogDetail');
  var filterContainer = document.getElementById('blogFilters');
  if (!listContainer) return;

  var allArticles = [];
  var currentFilter = 'all';

  var CATEGORIES = {
    health:    { ja:'健康管理',   en:'Health',     zh:'健康管理' },
    nutrition: { ja:'飲食栄養',   en:'Nutrition',  zh:'饮食营养' },
    grooming:  { ja:'日常ケア',   en:'Grooming',   zh:'日常护理' },
    behavior:  { ja:'行動訓練',   en:'Behavior',   zh:'行为训练' },
    breed:     { ja:'猫種知識',   en:'Breeds',     zh:'品种知识' },
    kitten:    { ja:'子猫育て',   en:'Kittens',    zh:'幼猫养育' },
    senior:    { ja:'シニア猫',   en:'Seniors',    zh:'老年猫护理' },
    lifestyle: { ja:'猫ライフ',   en:'Lifestyle',  zh:'猫咪生活' }
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

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getFullYear() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0');
  }

  // Check URL for slug parameter
  function getSlugFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get('slug');
  }

  function renderFilters() {
    if (!filterContainer) return;
    var cats = {};
    allArticles.forEach(function(a) { if (a.category) cats[a.category] = true; });
    var lang = getLang();
    var allLabel = lang === 'zh' ? '全部' : lang === 'en' ? 'All' : 'すべて';
    var html = '<button class="blog-filter-btn active" data-cat="all">' + allLabel + '</button>';
    Object.keys(cats).forEach(function(c) {
      html += '<button class="blog-filter-btn" data-cat="' + c + '">' + catLabel(c) + '</button>';
    });
    filterContainer.innerHTML = html;
    filterContainer.querySelectorAll('.blog-filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        currentFilter = this.dataset.cat;
        filterContainer.querySelectorAll('.blog-filter-btn').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
        renderList();
      });
    });
  }

  function renderList() {
    var items = currentFilter === 'all' ? allArticles : allArticles.filter(function(a) { return a.category === currentFilter; });
    if (items.length === 0) {
      var lang = getLang();
      listContainer.innerHTML = '<div class="blog-empty">' + (lang === 'zh' ? '暂无文章' : lang === 'en' ? 'No articles yet' : 'まだ記事がありません') + '</div>';
      return;
    }
    listContainer.innerHTML = items.map(function(a) {
      var title = txt(a.title);
      var excerpt = txt(a.excerpt);
      var cover = a.coverImage || '';
      return '<a href="blog.html?slug=' + encodeURIComponent(a.slug) + '" class="blog-card">' +
        (cover ? '<div class="blog-card-img"><img src="' + cover + '" alt="' + title + '" loading="lazy"></div>' : '<div class="blog-card-img blog-card-noimg">📝</div>') +
        '<div class="blog-card-body">' +
          '<span class="blog-card-cat">' + catLabel(a.category) + '</span>' +
          '<h3 class="blog-card-title">' + title + '</h3>' +
          (excerpt ? '<p class="blog-card-excerpt">' + excerpt + '</p>' : '') +
          '<time class="blog-card-date">' + formatDate(a.publishedAt) + '</time>' +
        '</div>' +
      '</a>';
    }).join('');
  }

  function renderDetail(article) {
    if (!detailContainer) return;
    var title = txt(article.title);
    var content = txt(article.content);
    var cover = article.coverImage || '';
    listContainer.style.display = 'none';
    if (filterContainer) filterContainer.style.display = 'none';
    detailContainer.style.display = 'block';
    document.title = title + ' | 福楽キャッテリー';

    detailContainer.innerHTML =
      '<a href="blog.html" class="blog-back">&larr; ' + (getLang() === 'zh' ? '返回列表' : getLang() === 'en' ? 'Back to list' : '一覧に戻る') + '</a>' +
      (cover ? '<img src="' + cover + '" alt="' + title + '" class="blog-detail-cover">' : '') +
      '<div class="blog-detail-meta">' +
        '<span class="blog-card-cat">' + catLabel(article.category) + '</span>' +
        '<time>' + formatDate(article.publishedAt) + '</time>' +
      '</div>' +
      '<h1 class="blog-detail-title">' + title + '</h1>' +
      '<div class="blog-detail-content">' + content + '</div>';
  }

  // Init
  fetch(API + '/api/articles')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      allArticles = data || [];
      var slug = getSlugFromUrl();
      if (slug) {
        var article = allArticles.find(function(a) { return a.slug === slug; });
        if (article) {
          renderDetail(article);
          return;
        }
      }
      renderFilters();
      renderList();
    })
    .catch(function() {
      listContainer.innerHTML = '<div class="blog-empty">Failed to load articles</div>';
    });

  window.addEventListener('langChanged', function() {
    if (allArticles.length > 0) {
      var slug = getSlugFromUrl();
      if (slug) {
        var article = allArticles.find(function(a) { return a.slug === slug; });
        if (article) { renderDetail(article); return; }
      }
      renderFilters();
      renderList();
    }
  });
})();
