/* Keep supporting illustrations outside translated article bodies. */
(function () {
  'use strict';
  function updateGuideLanguage() {
    var lang = document.documentElement.lang;
    if (lang !== 'en' && lang !== 'zh') lang = 'ja';
    document.querySelectorAll('[data-guide-ja]').forEach(function (element) {
      var value = element.getAttribute('data-guide-' + lang) || element.getAttribute('data-guide-ja');
      if (element.tagName === 'IMG') element.setAttribute('alt', value);
      else element.textContent = value;
    });
  }
  window.addEventListener('langChanged', updateGuideLanguage);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateGuideLanguage);
  else updateGuideLanguage();
})();
