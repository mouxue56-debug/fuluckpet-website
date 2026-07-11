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

  function renderFaq(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    var fragment = document.createDocumentFragment();
    items.forEach(function(item, i) {
      item = item && typeof item === 'object' ? item : {};
      var q = txt(item.question);
      var a = txt(item.answer);
      var faqItem = document.createElement('div');
      faqItem.className = 'faq-item';
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'faq-q';
      button.setAttribute('data-i18n', 'faq.dyn_q' + i);
      button.textContent = q;
      var panel = document.createElement('div');
      panel.className = 'faq-a';
      panel.id = 'home-faq-a-' + i;
      panel.setAttribute('role', 'region');
      var answer = document.createElement('p');
      answer.setAttribute('data-i18n', 'faq.dyn_a' + i);
      answer.textContent = a;
      appendTrustLinks(answer, item);
      panel.appendChild(answer);
      button.setAttribute('aria-controls', panel.id);
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', function() {
        var item = this.parentElement;
        var isOpen = item.classList.contains('active');
        container.querySelectorAll('.faq-item').forEach(function(fi) { fi.classList.remove('active'); });
        container.querySelectorAll('.faq-q').forEach(function(b) { b.setAttribute('aria-expanded', 'false'); });
        if (!isOpen) { item.classList.add('active'); this.setAttribute('aria-expanded', 'true'); }
      });
      faqItem.appendChild(button);
      faqItem.appendChild(panel);
      fragment.appendChild(faqItem);
    });
    container.textContent = '';
    container.appendChild(fragment);
    window.faqDynamicData = items;
  }

  fetch(API + '/api/faq')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (Array.isArray(data) && data.length > 0) {
        var trust = trustCopy();
        if (trust) renderFaq(trust.applyTrustOverrides(data));
      }
    })
    .catch(function() {
      // API failed — keep static HTML fallback
    });

  // Re-render on language change
  window.addEventListener('langChanged', function() {
    if (Array.isArray(window.faqDynamicData)) renderFaq(window.faqDynamicData);
  });
})();
