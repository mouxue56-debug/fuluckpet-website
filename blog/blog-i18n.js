// blog-i18n.js — Language switching for static blog article pages
(function() {
  var titleEl = document.querySelector('.blog-detail-title');
  var contentEl = document.querySelector('.blog-detail-content');
  var excerptEl = document.querySelector('.blog-detail-excerpt');
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
