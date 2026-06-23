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

  // Check URL for slug parameter — redirect to static page if found
  function getSlugFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get('slug');
  }

  // Redirect old ?slug= URLs to static /blog/{slug}.html pages
  var slugParam = getSlugFromUrl();
  if (slugParam) {
    window.location.replace('/blog/' + encodeURIComponent(slugParam) + '.html');
    return;
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
      return '<a href="/blog/' + encodeURIComponent(a.slug) + '.html" class="blog-card">' +
        (cover ? '<div class="blog-card-img"><img src="' + cover + '" alt="' + title + '" loading="lazy"></div>' : '<div class="blog-card-img blog-card-noimg"><i class="ico ico-square-pen" aria-hidden="true"></i></div>') +
        '<div class="blog-card-body">' +
          '<span class="blog-card-cat">' + catLabel(a.category) + '</span>' +
          '<h3 class="blog-card-title">' + title + '</h3>' +
          (excerpt ? '<p class="blog-card-excerpt">' + excerpt + '</p>' : '') +
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
    var brandName = getLang() === 'zh' ? '福楽猫舍' : getLang() === 'en' ? 'Fuluck Cattery' : '福楽キャッテリー';
    document.title = title + ' | ' + brandName;

    detailContainer.innerHTML =
      '<a href="blog.html" class="blog-back">&larr; ' + (getLang() === 'zh' ? '返回列表' : getLang() === 'en' ? 'Back to list' : '一覧に戻る') + '</a>' +
      (cover ? '<img src="' + cover + '" alt="' + title + '" class="blog-detail-cover">' : '') +
      '<div class="blog-detail-meta">' +
        '<span class="blog-card-cat">' + catLabel(article.category) + '</span>' +
      '</div>' +
      '<h1 class="blog-detail-title">' + title + '</h1>' +
      '<div class="blog-detail-content">' + content + '</div>';
  }

  // Inject one BlogPosting JSON-LD per article so AI/search crawlers see structured
  // metadata even though the listing is a JS-rendered SPA. Idempotent: replaces a
  // previously-injected block on each call.
  function injectArticleSchema(articles) {
    var head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;
    // Remove any prior injected schemas
    var prior = head.querySelectorAll('script[data-schema="blog-articles"]');
    prior.forEach(function(s) { s.remove(); });
    if (!articles || articles.length === 0) return;
    var graph = articles.map(function(a) {
      var slug = a.slug || a.id || '';
      var title = txt(a.title) || a.slug || '';
      var excerpt = txt(a.excerpt) || '';
      var pub = a.publishedAt || a.published_at || a.createdAt || a.created_at || null;
      var mod = a.updatedAt || a.updated_at || pub;
      return {
        "@type": "BlogPosting",
        "@id": "https://fuluckpet.com/blog/" + encodeURIComponent(slug) + ".html",
        "headline": title,
        "description": excerpt,
        "datePublished": pub,
        "dateModified": mod,
        "author": { "@type": "Person", "name": "羅方遠", "url": "https://fuluckpet.com/about.html" },
        "publisher": {
          "@type": "Organization",
          "name": "福楽キャッテリー",
          "url": "https://fuluckpet.com/",
          "logo": { "@type": "ImageObject", "url": "https://fuluckpet.com/images/ogp.jpg" }
        },
        "image": a.coverImage || "https://fuluckpet.com/images/ogp.jpg",
        "mainEntityOfPage": "https://fuluckpet.com/blog/" + encodeURIComponent(slug) + ".html",
        "url": "https://fuluckpet.com/blog/" + encodeURIComponent(slug) + ".html",
        "keywords": (a.tags && a.tags.length ? a.tags.join(", ") : (a.category || ""))
      };
    });
    var payload = { "@context": "https://schema.org", "@graph": graph };
    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.setAttribute('data-schema', 'blog-articles');
    s.textContent = JSON.stringify(payload);
    head.appendChild(s);
  }

  // Init — fetch articles for filter/language features (static HTML provides SEO fallback)
  fetch(API + '/api/articles')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      allArticles = data || [];
      renderFilters();
      renderList();
      try { injectArticleSchema(allArticles); } catch(e) { /* non-fatal */ }
    })
    .catch(function() {
      // Static cards remain visible as fallback — only show error if no static cards
      if (!listContainer.querySelector('.blog-card')) {
        var errMsg = getLang() === 'zh' ? '文章加载失败' : getLang() === 'en' ? 'Failed to load articles' : '記事の読み込みに失敗しました';
        listContainer.innerHTML = '<div class="blog-empty">' + errMsg + '</div>';
      }
    });

  window.addEventListener('langChanged', function() {
    if (allArticles.length > 0) {
      renderFilters();
      renderList();
    }
  });
})();
