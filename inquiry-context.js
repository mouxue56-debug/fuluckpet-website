/** Contextual LINE drafts. Opening a draft never sends a message. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root || !root.document) return;
  root.FuluckInquiry = api;
  var document = root.document;
  function updateLink(link) {
    var context = api.context(root.location.pathname, document.documentElement.lang);
    if (!context || !api.isChatLink(link.getAttribute('href'))) return;
    var next = api.draft(context.id, context.lang);
    if (link.getAttribute('href') !== next) link.setAttribute('href', next);
  }
  function refresh() {
    document.querySelectorAll('a[href]').forEach(updateLink);
  }
  function init() {
    if (!api.context(root.location.pathname, document.documentElement.lang)) return;
    refresh();
    root.addEventListener('langChanged', refresh);
    // The shared navigation, footer and chat widget may arrive after DOMContentLoaded.
    if (root.MutationObserver) new root.MutationObserver(refresh).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['href']
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  function language(value) { return /^(en|zh)(-|$)/i.test(value || '') ? value.slice(0, 2).toLowerCase() : 'ja'; }
  function validId(value) { return /^\d{4}-\d{5}$/.test(value || '') ? value : ''; }
  function context(path, lang) {
    var match = (path || '').match(/^\/(?:en\/|zh\/)?kittens\/(\d{4}-\d{5})\.html$/);
    return match ? { id: match[1], lang: language(lang) } : null;
  }
  function isChatLink(href) {
    try {
      var url = new URL(href);
      if (url.protocol !== 'https:' || url.username || url.password) return false;
      return (url.hostname === 'page.line.me' && /^\/@?915hnnlk\/?$/.test(url.pathname) && !url.searchParams.has('call')) ||
        (url.hostname === 'line.me' && /^\/R\/oaMessage\/(?:%40|@)915hnnlk\/?$/i.test(url.pathname));
    } catch (_) { return false; }
  }
  function draft(id, lang) {
    if (!validId(id)) return '';
    lang = language(lang);
    var url = 'https://fuluckpet.com/' + (lang === 'ja' ? '' : lang + '/') + 'kittens/' + id + '.html';
    var intro = {
      ja: 'こちらの子猫について相談したいです。\n子猫番号：',
      en: 'I would like to ask about this kitten.\nKitten ID: ',
      zh: '您好，我想咨询这只猫咪。\n猫咪编号：'
    };
    return 'https://line.me/R/oaMessage/%40915hnnlk/?' + encodeURIComponent(intro[lang] + id + '\n' + url);
  }
  return { context: context, draft: draft, isChatLink: isChatLink, validId: validId, language: language };
});
