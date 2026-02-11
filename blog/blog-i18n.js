// blog-i18n.js — Language switching for static blog article pages
(function() {
  // Support both old (.blog-detail-*) and current (.blog-article) HTML structures
  var titleEl = document.querySelector('.blog-detail-title') || document.querySelector('.blog-article h1');
  var contentEl = document.querySelector('.blog-detail-content');
  var excerptEl = document.querySelector('.blog-detail-excerpt');

  // For current blog structure: wrap content between h1 and blog-cta-box/blog-related
  if (!contentEl && titleEl) {
    var article = document.querySelector('.blog-article');
    if (article) {
      // Create a wrapper around the main content (between h1 and CTA/related sections)
      var wrapper = document.createElement('div');
      wrapper.className = 'blog-detail-content';
      var sibling = titleEl.nextElementSibling;
      var toWrap = [];
      while (sibling) {
        if (sibling.classList.contains('blog-cta-box') ||
            sibling.classList.contains('blog-related') ||
            sibling.classList.contains('blog-nav-bottom')) break;
        toWrap.push(sibling);
        sibling = sibling.nextElementSibling;
      }
      if (toWrap.length > 0) {
        titleEl.parentNode.insertBefore(wrapper, toWrap[0]);
        toWrap.forEach(function(el) { wrapper.appendChild(el); });
        contentEl = wrapper;
      }
    }
  }

  if (!titleEl || !contentEl) return;

  var origTitle = titleEl.innerHTML;
  var origContent = contentEl.innerHTML;
  var origExcerpt = excerptEl ? excerptEl.innerHTML : '';

  function getLang() {
    try { return localStorage.getItem('fuluckpet-lang') || 'ja'; } catch(e) { return 'ja'; }
  }

  function apply() {
    var lang = getLang();
    var data = window._blogArticleI18n;
    if (!data || lang === 'ja') {
      titleEl.innerHTML = origTitle;
      contentEl.innerHTML = origContent;
      if (excerptEl) excerptEl.innerHTML = origExcerpt;
      return;
    }
    if (data[lang]) {
      if (data[lang].title) titleEl.innerHTML = data[lang].title;
      if (data[lang].content) contentEl.innerHTML = data[lang].content;
      if (data[lang].excerpt && excerptEl) excerptEl.innerHTML = data[lang].excerpt;
    }
  }

  window.addEventListener('langChanged', apply);
  if (getLang() !== 'ja') apply();
})();
