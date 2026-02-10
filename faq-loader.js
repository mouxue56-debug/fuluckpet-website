// faq-loader.js — Dynamic FAQ loading from Worker API
// Loads FAQ items from /api/faq and replaces the static FAQ list in index.html
// Keeps static HTML as fallback (SEO + offline)

(function() {
  var API = 'https://fuluck-api.mouxue56.workers.dev';
  var container = document.querySelector('.faq-list');
  if (!container) return;

  function getLang() {
    try { return localStorage.getItem('fuluckpet-lang') || 'ja'; } catch(e) { return 'ja'; }
  }

  function txt(obj) {
    if (!obj) return '';
    var lang = getLang();
    return obj[lang] || obj.ja || obj.en || '';
  }

  function renderFaq(items) {
    if (!items || items.length === 0) return;
    container.innerHTML = items.map(function(item, i) {
      var q = txt(item.question);
      var a = txt(item.answer);
      return '<div class="faq-item">' +
        '<button class="faq-q" data-i18n="faq.dyn_q' + i + '">' + q + '</button>' +
        '<div class="faq-a"><p data-i18n="faq.dyn_a' + i + '">' + a + '</p></div>' +
        '</div>';
    }).join('\n');

    // Re-attach accordion click handlers
    container.querySelectorAll('.faq-q').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var item = this.parentElement;
        var isOpen = item.classList.contains('open');
        container.querySelectorAll('.faq-item').forEach(function(fi) { fi.classList.remove('open'); });
        if (!isOpen) item.classList.add('open');
      });
    });

    // Register dynamic translations for language switching
    if (typeof window.faqDynamicData !== 'undefined') return;
    window.faqDynamicData = items;
  }

  fetch(API + '/api/faq')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (Array.isArray(data) && data.length > 0) {
        renderFaq(data);
      }
    })
    .catch(function() {
      // API failed — keep static HTML fallback
    });

  // Re-render on language change
  window.addEventListener('langChanged', function() {
    if (window.faqDynamicData) renderFaq(window.faqDynamicData);
  });
})();
