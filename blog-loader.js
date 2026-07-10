// blog-loader.js — Loads articles from API and renders the legacy dynamic blog list.
// Static HTML remains the SEO/offline fallback and is replaced only by a validated response.
(function() {
  var API = 'https://fuluck-api.mouxue56.workers.dev';
  var listContainer = document.getElementById('blogList');
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

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function safeString(value, maxLength) {
    if (typeof value !== 'string') return '';
    var limit = maxLength || 10000;
    return value.length <= limit ? value : value.slice(0, limit);
  }

  function safeSlug(value) {
    value = safeString(value, 128);
    return /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(value) ? value : '';
  }

  function safeMediaUrl(value) {
    value = safeString(value, 2048);
    if (!value || /[\u0000-\u0020"'<>`\\]/.test(value)) return '';
    try {
      if (value.charAt(0) === '/' && value.slice(0, 2) !== '//') {
        var local = new URL(value, 'https://fuluckpet.com');
        return local.pathname + local.search;
      }
      var parsed = new URL(value);
      return parsed.protocol === 'https:' ? parsed.href : '';
    } catch (e) {
      return '';
    }
  }

  function txt(obj) {
    if (!isRecord(obj)) return '';
    var lang = getLang();
    return safeString(obj[lang]) || safeString(obj.ja) || safeString(obj.en) || '';
  }

  function catLabel(key) {
    key = safeString(key, 80);
    var c = Object.prototype.hasOwnProperty.call(CATEGORIES, key) ? CATEGORIES[key] : null;
    return c ? txt(c) : key;
  }

  function validateArticles(data) {
    if (!Array.isArray(data) || !data.every(isRecord)) {
      throw new Error('blog-loader: API payload must be an array of objects');
    }
    if (!data.every(function(article) { return !!safeSlug(article.slug); })) {
      throw new Error('blog-loader: every article requires a safe slug');
    }
    return data;
  }

  function getSlugFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get('slug');
  }

  // Legacy query links are redirected only when the value is one safe filename segment.
  var slugParam = getSlugFromUrl();
  if (slugParam) {
    var redirectSlug = safeSlug(slugParam);
    if (redirectSlug) window.location.replace('/blog/' + redirectSlug + '.html');
    return;
  }

  function createElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function buildFilterButtons() {
    var cats = Object.create(null);
    allArticles.forEach(function(article) {
      var category = safeString(article.category, 80);
      if (category) cats[category] = true;
    });
    var lang = getLang();
    var allLabel = lang === 'zh' ? '全部' : lang === 'en' ? 'All' : 'すべて';
    var categories = ['all'].concat(Object.keys(cats));
    return categories.map(function(category) {
      var button = createElement('button', 'blog-filter-btn' + (category === currentFilter ? ' active' : ''), category === 'all' ? allLabel : catLabel(category));
      button.type = 'button';
      button.dataset.cat = category;
      button.addEventListener('click', function() {
        currentFilter = this.dataset.cat;
        renderFilters();
        renderList();
      });
      return button;
    });
  }

  function buildArticleCard(article) {
    var slug = safeSlug(article.slug);
    var title = txt(article.title);
    var excerpt = txt(article.excerpt);
    var cover = safeMediaUrl(article.coverImage);
    var link = createElement('a', 'blog-card');
    link.href = '/blog/' + slug + '.html';

    var imageBox = createElement('div', 'blog-card-img' + (cover ? '' : ' blog-card-noimg'));
    if (cover) {
      var image = createElement('img');
      image.src = cover;
      image.alt = title;
      image.loading = 'lazy';
      imageBox.appendChild(image);
    } else {
      var icon = createElement('i', 'ico ico-square-pen');
      icon.setAttribute('aria-hidden', 'true');
      imageBox.appendChild(icon);
    }
    link.appendChild(imageBox);

    var body = createElement('div', 'blog-card-body');
    body.appendChild(createElement('span', 'blog-card-cat', catLabel(article.category)));
    body.appendChild(createElement('h3', 'blog-card-title', title));
    if (excerpt) body.appendChild(createElement('p', 'blog-card-excerpt', excerpt));
    link.appendChild(body);
    return link;
  }

  function buildListNodes() {
    var items = currentFilter === 'all' ? allArticles : allArticles.filter(function(article) {
      return safeString(article.category, 80) === currentFilter;
    });
    if (items.length === 0) {
      var lang = getLang();
      var message = lang === 'zh' ? '暂无文章' : lang === 'en' ? 'No articles yet' : 'まだ記事がありません';
      return [createElement('div', 'blog-empty', message)];
    }
    return items.map(buildArticleCard);
  }

  function renderFilters() {
    if (!filterContainer) return;
    filterContainer.replaceChildren.apply(filterContainer, buildFilterButtons());
  }

  function renderList() {
    listContainer.replaceChildren.apply(listContainer, buildListNodes());
  }

  // Article bodies live only in generated /blog/{slug}.html files. The former dynamic
  // detail renderer was never called and was removed so rich API HTML has no client sink.

  // Inject one BlogPosting JSON-LD per validated article. textContent avoids HTML parsing.
  function injectArticleSchema(articles) {
    var head = document.head || document.getElementsByTagName('head')[0];
    if (!head || articles.length === 0) return;
    var graph = articles.map(function(article) {
      var slug = safeSlug(article.slug);
      var title = txt(article.title) || slug;
      var excerpt = txt(article.excerpt);
      var pub = safeString(article.publishedAt || article.published_at || article.createdAt || article.created_at, 64) || null;
      var mod = safeString(article.updatedAt || article.updated_at, 64) || pub;
      var pageUrl = 'https://fuluckpet.com/blog/' + slug + '.html';
      var tags = Array.isArray(article.tags) ? article.tags.map(function(tag) { return safeString(tag, 100); }).filter(Boolean) : [];
      return {
        '@type': 'BlogPosting',
        '@id': pageUrl,
        'headline': title,
        'description': excerpt,
        'datePublished': pub,
        'dateModified': mod,
        'author': { '@type': 'Person', 'name': '羅方遠', 'url': 'https://fuluckpet.com/about.html' },
        'publisher': {
          '@type': 'Organization',
          'name': '福楽キャッテリー',
          'url': 'https://fuluckpet.com/',
          'logo': { '@type': 'ImageObject', 'url': 'https://fuluckpet.com/images/ogp.jpg' }
        },
        'image': safeMediaUrl(article.coverImage) || 'https://fuluckpet.com/images/ogp.jpg',
        'mainEntityOfPage': pageUrl,
        'url': pageUrl,
        'keywords': tags.length ? tags.join(', ') : safeString(article.category, 80)
      };
    });
    var payload = { '@context': 'https://schema.org', '@graph': graph };
    var schema = document.createElement('script');
    schema.type = 'application/ld+json';
    schema.setAttribute('data-schema', 'blog-articles');
    schema.textContent = JSON.stringify(payload);

    var prior = head.querySelectorAll('script[data-schema="blog-articles"]');
    prior.forEach(function(item) { item.remove(); });
    head.appendChild(schema);
  }

  fetch(API + '/api/articles')
    .then(function(response) {
      if (!response || response.ok !== true) throw new Error('blog-loader: API returned a non-success response');
      return response.json();
    })
    .then(validateArticles)
    .then(function(data) {
      if (data.length === 0) return;
      allArticles = data;
      renderFilters();
      renderList();
      try { injectArticleSchema(allArticles); } catch(e) { /* non-fatal structured data */ }
    })
    .catch(function() {
      // Static cards remain visible as fallback. A DOM-built error is used only when
      // the page shipped without any fallback cards.
      if (!listContainer.querySelector('.blog-card')) {
        var lang = getLang();
        var errMsg = lang === 'zh' ? '文章加载失败' : lang === 'en' ? 'Failed to load articles' : '記事の読み込みに失敗しました';
        listContainer.replaceChildren(createElement('div', 'blog-empty', errMsg));
      }
    });

  window.addEventListener('langChanged', function() {
    if (allArticles.length > 0) {
      renderFilters();
      renderList();
    }
  });
})();
