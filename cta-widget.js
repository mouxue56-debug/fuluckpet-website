// cta-widget.js — Fixed bottom CTA bar for sub-pages
// Shows available kitten count + LINE consultation button
// Loaded on: blog.html, faq.html, guide/*.html
(function() {
  var API = window.FULUCK_API_BASE || 'https://fuluck-api.mouxue56.workers.dev';
  var LINE_URL = 'https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true';
  var LINE_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596a.626.626 0 0 1-.199.031c-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.271.173-.508.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>';

  // Skip pages that don't need the widget
  var path = location.pathname;
  if (path === '/' || path === '/index.html' || path.indexOf('/admin') === 0) return;

  var kittenCount = 0;
  var widget = null;
  var visible = false;

  function getLang() {
    try { return localStorage.getItem('fuluckpet-lang') || 'ja'; } catch(e) { return 'ja'; }
  }

  var T = {
    ja: { available: '子猫募集中', count: '{n}匹', view: '子猫を見る', line: 'LINEで相談' },
    en: { available: 'Kittens Available', count: '{n}', view: 'View Kittens', line: 'LINE Chat' },
    zh: { available: '幼猫接受预约', count: '{n}只', view: '查看幼猫', line: 'LINE咨询' }
  };

  function t(key) {
    var lang = getLang();
    return (T[lang] || T.ja)[key] || T.ja[key];
  }

  function render() {
    if (!widget) {
      widget = document.createElement('div');
      widget.className = 'cta-widget';
      document.body.appendChild(widget);
    }

    var countText = kittenCount > 0 ? t('count').replace('{n}', kittenCount) : '';
    var availText = t('available') + (countText ? ' ' + countText : '');

    widget.innerHTML =
      '<div class="cta-widget-inner">' +
        '<a href="/kittens.html" class="cta-widget-kittens">' +
          '<span class="cta-widget-paw">🐱</span>' +
          '<span>' + availText + '</span>' +
        '</a>' +
        '<a href="' + LINE_URL + '" target="_blank" rel="noopener noreferrer" class="cta-widget-line">' +
          LINE_SVG + ' ' + t('line') +
        '</a>' +
      '</div>';
  }

  // Show/hide based on scroll position
  function checkScroll() {
    var scrollY = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight;
    var winHeight = window.innerHeight;
    var footerBuffer = 200;
    var shouldShow = scrollY > 300 && scrollY < docHeight - winHeight - footerBuffer;

    if (shouldShow && !visible) {
      visible = true;
      if (widget) widget.classList.add('visible');
    } else if (!shouldShow && visible) {
      visible = false;
      if (widget) widget.classList.remove('visible');
    }
  }

  // Fetch kitten count
  fetch(API + '/api/kittens')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      kittenCount = (data || []).filter(function(k) { return k.status === 'available'; }).length;
      render();
      checkScroll();
    })
    .catch(function() {
      kittenCount = 0;
      render();
      checkScroll();
    });

  window.addEventListener('scroll', checkScroll, { passive: true });
  window.addEventListener('langChanged', function() { render(); });
})();
