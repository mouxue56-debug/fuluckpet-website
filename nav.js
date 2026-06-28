(function () {
  'use strict';

  var LINE_URL = 'https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true';
  var LANGS = ['ja', 'en', 'zh'];
  var CLOSE_LABEL = {
    ja: 'メニューを閉じる',
    en: 'Close menu',
    zh: '关闭菜单'
  };

  var NAV_GROUPS = [
    {
      id: 'kittens',
      labelKey: 'nav.group.kittens',
      icon: 'paw-print',
      items: [
        { href: '/kittens.html', key: 'nav.kittens', icon: 'cat', match: ['/kittens.html', '/kittens/'] },
        { href: '/diary/', key: 'nav.diary', icon: 'camera', featured: true, match: ['/diary/'] },
        { href: '/gallery.html', key: 'nav.gallery', icon: 'image', match: ['/gallery.html'] }
      ]
    },
    {
      id: 'breed',
      labelKey: 'nav.group.breed',
      icon: 'snowflake',
      items: [
        { href: '/siberian.html', key: 'nav.siberian', icon: 'sparkles', match: ['/siberian.html'] },
        { href: '/parents.html', key: 'nav.parents', icon: 'users', match: ['/parents.html'] },
        { href: '/siberian-allergy.html', key: 'nav.allergy', icon: 'leaf', match: ['/siberian-allergy.html'] }
      ]
    },
    {
      id: 'adoption',
      labelKey: 'nav.group.adoption',
      icon: 'hand-heart',
      items: [
        { href: '/booking.html', key: 'nav.booking', icon: 'calendar-check', match: ['/booking.html'] },
        { href: '/guide/', key: 'nav.guide', icon: 'book-open', match: ['/guide/'] },
        { href: '/waitlist.html', key: 'nav.waitlist', icon: 'clipboard-list', match: ['/waitlist.html'] },
        { href: '/siberian-breeder-osaka.html', key: 'nav.osakaAdoption', icon: 'map-pin', match: ['/siberian-breeder-osaka.html'] },
        { href: '/faq.html', key: 'nav.faq', icon: 'circle-help', match: ['/faq.html'] }
      ]
    },
    {
      id: 'cattery',
      labelKey: 'nav.group.cattery',
      icon: 'building-2',
      items: [
        { href: '/about.html', key: 'nav.about', icon: 'house', match: ['/about.html'] },
        { href: '/about.html#awards', key: 'nav.aboutPage', icon: 'trophy', match: ['/about.html#awards'] },
        { href: '/reviews.html', key: 'nav.reviews', icon: 'star', match: ['/reviews.html'] },
        { href: '/blog.html', key: 'nav.blog', icon: 'library', match: ['/blog.html', '/blog/'] },
        { href: 'https://catnamegive.mouxue56.workers.dev', key: 'nav.naming', icon: 'square-pen', external: true }
      ]
    }
  ];

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function normalizePath(path) {
    path = path || '/';
    path = path.replace(/^\/(en|zh)(?=\/)/, '');
    path = path.replace(/\/index\.html$/, '/');
    if (!path) path = '/';
    return path;
  }

  function currentLang() {
    var path = window.location.pathname || '/';
    if (path.indexOf('/en/') === 0) return 'en';
    if (path.indexOf('/zh/') === 0) return 'zh';

    var params = new URLSearchParams(window.location.search || '');
    var urlLang = params.get('lang');
    if (LANGS.indexOf(urlLang) !== -1) return urlLang;

    try {
      var saved = localStorage.getItem('fuluckpet-lang');
      if (LANGS.indexOf(saved) !== -1) return saved;
    } catch (e) {}

    var htmlLang = document.documentElement.getAttribute('lang');
    return LANGS.indexOf(htmlLang) !== -1 ? htmlLang : 'ja';
  }

  function currentRoute() {
    return {
      path: normalizePath(window.location.pathname || '/'),
      hash: window.location.hash || ''
    };
  }

  function isMatch(pattern, route, allowHashless) {
    var hashIndex = pattern.indexOf('#');
    var path = hashIndex === -1 ? pattern : pattern.slice(0, hashIndex);
    var hash = hashIndex === -1 ? '' : pattern.slice(hashIndex);
    path = normalizePath(path);

    if (hash) return route.path === path && route.hash === hash;
    if (!allowHashless && route.hash) return false;
    if (path.charAt(path.length - 1) === '/') return route.path.indexOf(path) === 0;
    return route.path === path;
  }

  function itemIsCurrent(item, route) {
    if (item.external) return false;
    var matches = item.match || [item.href];
    for (var i = 0; i < matches.length; i += 1) {
      if (isMatch(matches[i], route, false)) return true;
    }
    return false;
  }

  function itemInGroup(item, route) {
    if (item.external) return false;
    var matches = item.match || [item.href];
    for (var i = 0; i < matches.length; i += 1) {
      if (isMatch(matches[i], route, true)) return true;
    }
    return false;
  }

  function groupIsActive(group, route) {
    return group.items.some(function (item) {
      return itemInGroup(item, route);
    });
  }

  function langSwitchMarkup(extraClass) {
    return (
      '<div class="lang-switch ' + (extraClass || '') + '" role="group" aria-label="言語切替 / Language">' +
        '<button class="lang-btn" aria-pressed="false" data-lang="ja" type="button">JP</button>' +
        '<button class="lang-btn" aria-pressed="false" data-lang="en" type="button">EN</button>' +
        '<button class="lang-btn" aria-pressed="false" data-lang="zh" type="button">中</button>' +
      '</div>'
    );
  }

  function icon(name) {
    return '<i class="ico ico-' + name + '" aria-hidden="true"></i>';
  }

  function newBadge() {
    return '<span class="nav-new-badge" data-i18n="nav.new">新着</span>';
  }

  function renderDesktopNav(route) {
    var groups = NAV_GROUPS.map(function (group) {
      var active = groupIsActive(group, route);
      var items = group.items.map(function (item) {
        var current = itemIsCurrent(item, route);
        return (
          '<a class="nav-dropdown-link' + (item.featured ? ' is-featured' : '') + (current ? ' is-current' : '') + '"' +
            ' href="' + item.href + '"' +
            (item.external ? ' target="_blank" rel="noopener"' : '') +
            (current ? ' aria-current="page"' : '') + '>' +
            icon(item.icon) +
            '<span data-i18n="' + item.key + '"></span>' +
            (item.featured ? newBadge() : '') +
          '</a>'
        );
      }).join('');

      return (
        '<div class="nav-group' + (active ? ' is-active' : '') + '" data-nav-group="' + group.id + '">' +
          '<button class="nav-group-toggle" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="nav-panel-' + group.id + '">' +
            icon(group.icon) +
            '<span data-i18n="' + group.labelKey + '"></span>' +
            '<span class="nav-caret" aria-hidden="true"></span>' +
          '</button>' +
          '<div class="nav-dropdown-panel" id="nav-panel-' + group.id + '" role="menu">' + items + '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="nav-menu-groups" aria-label="Main navigation">' + groups + '</div>' +
      '<div class="nav-actions">' +
        langSwitchMarkup('nav-lang') +
        '<a class="nav-action-btn" href="' + LINE_URL + '" target="_blank" rel="noopener" data-cta="line">' +
          icon('message-circle') +
          '<span data-i18n="cta.line"></span>' +
        '</a>' +
        '<a class="nav-action-btn is-primary" href="/booking.html" data-cta="booking">' +
          icon('calendar-check') +
          '<span data-i18n="visit.bookBtn"></span>' +
        '</a>' +
      '</div>'
    );
  }

  function renderMobileNav(route) {
    var sections = NAV_GROUPS.map(function (group) {
      var active = groupIsActive(group, route);
      var items = group.items.map(function (item) {
        var current = itemIsCurrent(item, route);
        return (
          '<a class="mobile-nav-link nav-mobile-link' + (item.featured ? ' is-featured' : '') + (current ? ' is-current' : '') + '"' +
            ' href="' + item.href + '"' +
            (item.external ? ' target="_blank" rel="noopener"' : '') +
            (current ? ' aria-current="page"' : '') + '>' +
            icon(item.icon) +
            '<span data-i18n="' + item.key + '"></span>' +
            (item.featured ? newBadge() : '') +
          '</a>'
        );
      }).join('');

      return (
        '<section class="nav-mobile-section' + (active ? ' is-active' : '') + '">' +
          '<h2 class="nav-mobile-heading">' + icon(group.icon) + '<span data-i18n="' + group.labelKey + '"></span></h2>' +
          '<div class="nav-mobile-list">' + items + '</div>' +
        '</section>'
      );
    }).join('');

    return (
      '<div class="nav-mobile-shell">' +
        '<div class="nav-mobile-top">' +
          langSwitchMarkup('mobile-lang') +
          '<button class="nav-mobile-close" type="button" aria-label="' + CLOSE_LABEL.ja + '">' +
            '<span aria-hidden="true">&times;</span><span class="sr-only" data-i18n="nav.close"></span>' +
          '</button>' +
        '</div>' +
        '<div class="nav-mobile-ctas">' +
          '<a class="nav-mobile-cta is-line" href="' + LINE_URL + '" target="_blank" rel="noopener" data-cta="line">' +
            icon('message-circle') +
            '<span data-i18n="cta.line"></span>' +
          '</a>' +
          '<a class="nav-mobile-cta is-booking" href="/booking.html" data-cta="booking">' +
            icon('calendar-check') +
            '<span data-i18n="visit.bookBtn"></span>' +
          '</a>' +
        '</div>' +
        '<nav class="nav-mobile-sections" aria-label="Mobile navigation">' + sections + '</nav>' +
      '</div>'
    );
  }

  function syncLangButtons(lang) {
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      var on = btn.getAttribute('data-lang') === lang;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    document.querySelectorAll('.nav-mobile-close').forEach(function (btn) {
      btn.setAttribute('aria-label', CLOSE_LABEL[lang] || CLOSE_LABEL.ja);
    });
  }

  function applyCurrentLanguage() {
    var lang = currentLang();
    syncLangButtons(lang);
    if (typeof window.setLanguage === 'function') {
      window.setLanguage(lang);
    }
  }

  function handleLanguageClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest('.lang-btn[data-lang]') : null;
    if (!btn) return;

    var target = btn.getAttribute('data-lang');
    if (LANGS.indexOf(target) === -1) return;

    var path = window.location.pathname || '/';
    var pathLang = path.indexOf('/en/') === 0 ? 'en' : (path.indexOf('/zh/') === 0 ? 'zh' : null);
    if (pathLang) {
      var rootPath = path.substring(3) || '/';
      window.location.href = (target === 'ja' ? '' : '/' + target) + rootPath;
      return;
    }

    if (typeof window.setLanguage === 'function') {
      window.setLanguage(target);
    } else {
      try {
        localStorage.setItem('fuluckpet-lang', target);
      } catch (err) {}
      document.documentElement.lang = target;
      syncLangButtons(target);
    }
  }

  function setDesktopGroupOpen(groupEl, open) {
    var btn = groupEl.querySelector('.nav-group-toggle');
    groupEl.classList.toggle('is-open', open);
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function closeDesktopGroups(root) {
    root.querySelectorAll('.nav-group.is-open').forEach(function (groupEl) {
      setDesktopGroupOpen(groupEl, false);
    });
  }

  function bindDesktop(nav) {
    var groups = nav.querySelectorAll('.nav-group');

    groups.forEach(function (groupEl) {
      var btn = groupEl.querySelector('.nav-group-toggle');
      var panel = groupEl.querySelector('.nav-dropdown-panel');
      if (!btn || !panel) return;

      groupEl.addEventListener('mouseenter', function () {
        setDesktopGroupOpen(groupEl, true);
      });

      groupEl.addEventListener('mouseleave', function () {
        setDesktopGroupOpen(groupEl, false);
      });

      groupEl.addEventListener('focusin', function () {
        setDesktopGroupOpen(groupEl, true);
      });

      groupEl.addEventListener('focusout', function () {
        window.setTimeout(function () {
          if (!groupEl.contains(document.activeElement)) {
            setDesktopGroupOpen(groupEl, false);
          }
        }, 0);
      });

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var open = !groupEl.classList.contains('is-open');
        closeDesktopGroups(nav);
        setDesktopGroupOpen(groupEl, open);
      });

      btn.addEventListener('keydown', function (e) {
        var firstLink = panel.querySelector('a');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setDesktopGroupOpen(groupEl, true);
          if (firstLink) firstLink.focus();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDesktopGroupOpen(groupEl, false);
          btn.focus();
        }
      });

      panel.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setDesktopGroupOpen(groupEl, false);
          btn.focus();
        }
      });
    });

    document.addEventListener('click', function (e) {
      if (!nav.contains(e.target)) closeDesktopGroups(nav);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDesktopGroups(nav);
    });
  }

  function syncMobileOpenState(mobileNav) {
    var open = mobileNav.classList.contains('active');
    document.body.classList.toggle('mobile-nav-open', open);
  }

  function setMobileOpen(mobileNav, open) {
    var hamburger = document.getElementById('hamburger');
    var navFab = document.getElementById('mobileNavFab');

    mobileNav.classList.toggle('active', open);
    if (hamburger) {
      hamburger.classList.toggle('active', open);
      hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (navFab) {
      navFab.classList.toggle('active', open);
      navFab.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    document.body.style.overflow = open ? 'hidden' : '';
    syncMobileOpenState(mobileNav);
  }

  function bindMobile(mobileNav) {
    var closeBtn = mobileNav.querySelector('.nav-mobile-close');

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        setMobileOpen(mobileNav, false);
      });
    }

    mobileNav.addEventListener('click', function (e) {
      var link = e.target && e.target.closest ? e.target.closest('a.mobile-nav-link, a.nav-mobile-cta') : null;
      if (link) setMobileOpen(mobileNav, false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileNav.classList.contains('active')) {
        setMobileOpen(mobileNav, false);
      }
    });

    if ('MutationObserver' in window) {
      var observer = new MutationObserver(function () {
        syncMobileOpenState(mobileNav);
      });
      observer.observe(mobileNav, { attributes: true, attributeFilter: ['class'] });
    }

    syncMobileOpenState(mobileNav);
  }

  function initNav() {
    var nav = document.querySelector('.nav');
    var mobileNav = document.querySelector('.mobile-nav');
    if (!nav || !mobileNav || !document.body) return;

    var originalNav = nav.innerHTML;
    var originalMobile = mobileNav.innerHTML;

    try {
      var route = currentRoute();
      nav.innerHTML = renderDesktopNav(route);
      mobileNav.innerHTML = renderMobileNav(route);

      document.body.classList.add('nav-enhanced');
      bindDesktop(nav);
      bindMobile(mobileNav);

      document.addEventListener('click', handleLanguageClick);
      window.addEventListener('langChanged', function (e) {
        syncLangButtons(e && e.detail && e.detail.lang ? e.detail.lang : currentLang());
      });

      applyCurrentLanguage();
      window.setTimeout(applyCurrentLanguage, 0);
      window.setTimeout(applyCurrentLanguage, 180);
    } catch (err) {
      nav.innerHTML = originalNav;
      mobileNav.innerHTML = originalMobile;
      document.body.classList.remove('nav-enhanced', 'mobile-nav-open');
      if (window.console && typeof window.console.warn === 'function') {
        window.console.warn('[fuluck-nav] restored static fallback', err);
      }
    }
  }

  try {
    ready(initNav);
  } catch (err) {
    if (window.console && typeof window.console.warn === 'function') {
      window.console.warn('[fuluck-nav] static fallback kept', err);
    }
  }
})();
