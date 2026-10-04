(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.FuluckPageExperience = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', api.init);
    else api.init();
  }
})(typeof window !== 'undefined' ? window : this, function() {
  function language(value) { return value === 'en' || value === 'zh' ? value : 'ja'; }
  function currentLanguage() { return language((document.documentElement.lang || 'ja').slice(0,2)); }
  function normalized(value) { return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim(); }
  function localized(value, lang) { return typeof value === 'string' ? value : value && (value[lang] || value.ja || value.en) || ''; }
  function filterFaq(items, category, query, lang) {
    var terms = normalized(query).split(' ').filter(Boolean);
    return (Array.isArray(items) ? items : []).filter(function(item) {
      if (!item || (category !== 'all' && item.category !== category)) return false;
      var text = normalized(localized(item.question, language(lang)) + ' ' + localized(item.answer, language(lang)));
      return terms.every(function(term) { return text.includes(term); });
    });
  }
  function safePhoto(value) {
    if (typeof value !== 'string' || !value || /[\u0000-\u0020<>"'`\\]/.test(value)) return '';
    try {
      var url = new URL(value, 'https://fuluckpet.com');
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch (_) { return ''; }
  }
  function kittenContext(items, id) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id || '')) return null;
    var item = (Array.isArray(items) ? items : []).find(function(row) { return row && (row.breederId || row.id) === id; });
    if (!item) return null;
    var photos = Array.isArray(item.photos) ? item.photos : [];
    return {id:id, photo:safePhoto(photos[item.coverIndex || 0] || photos[0])};
  }
  function waitlistTemplate(lang) {
    return {
      ja:'ウェイトリストへの登録を希望します。\n希望の毛色：\n希望の性別（未定でも可）：\nお迎え希望時期：\nご相談したいこと：',
      en:'I would like to join the kitten waitlist.\nPreferred coat color:\nPreferred sex (undecided is fine):\nPreferred timing:\nQuestions:',
      zh:'您好，我想登记幼猫候补名单。\n希望的毛色：\n希望的性别（可未定）：\n计划接猫时间：\n其他想咨询的问题：'
    }[language(lang)];
  }
  function localHref(path, lang) {
    lang = language(lang);
    if (lang === 'ja') return path;
    var hasSibling = /^\/(?:kittens(?:\.html|\/)|guide\/|blog\/|waitlist\.html|siberian-breeder-osaka\.html)/.test(path);
    return hasSibling ? '/' + lang + path : path + (path.includes('?') ? '&' : '?') + 'lang=' + lang;
  }
  function applyLanguage() {
    var lang = currentLanguage();
    document.querySelectorAll('[data-experience-ja]').forEach(function(el) {
      var text = el.getAttribute('data-experience-' + lang) || el.getAttribute('data-experience-ja');
      if (el.tagName === 'IMG') el.alt = text;
      else if (el.tagName === 'INPUT') el.placeholder = text;
      else el.textContent = text;
    });
    document.querySelectorAll('[data-experience-path]').forEach(function(el) { el.href = localHref(el.getAttribute('data-experience-path'),lang); });
    var template = document.getElementById('waitlistTemplate');
    if (template) template.value = waitlistTemplate(lang);
  }
  function setupWaitlist() {
    var button = document.getElementById('copyWaitlist');
    if (!button) return;
    button.addEventListener('click', async function() {
      var field = document.getElementById('waitlistTemplate');
      var status = document.getElementById('waitlistCopyStatus');
      var lang = currentLanguage();
      try {
        await navigator.clipboard.writeText(field.value);
        status.textContent = {ja:'コピーしました。LINEのトーク画面に貼り付けてください。',en:'Copied. Paste it into your LINE conversation.',zh:'已复制，请粘贴到 LINE 对话中。'}[lang];
      } catch (_) {
        field.focus(); field.select();
        status.textContent = {ja:'文章を選択しました。コピーしてLINEに貼り付けてください。',en:'Text selected. Copy it and paste into LINE.',zh:'文字已选中，请手动复制后粘贴到 LINE。'}[lang];
      }
    });
  }
  function setupBooking() {
    var box = document.getElementById('bookingKittenContext');
    if (!box) return;
    var id = new URLSearchParams(location.search).get('kitten') || '';
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id)) return;
    // Fetch public display data only. Never show disputed price/sex or rewrite the form.
    fetch((window.FULUCK_API_BASE || 'https://fuluck-api.mouxue56.workers.dev') + '/api/kittens')
      .then(function(response) { if (!response.ok) throw new Error('Unavailable'); return response.json(); })
      .then(function(items) {
        var context = kittenContext(items,id);
        if (!context) return;
        box.querySelector('[data-kitten-id]').textContent = context.id;
        var photo = box.querySelector('img');
        if (context.photo) { photo.src = context.photo; photo.alt = context.id; photo.hidden = false; photo.addEventListener('error', function(){ photo.hidden = true; },{once:true}); }
        box.hidden = false;
      }).catch(function() { /* The original editable kitten field remains usable. */ });
  }
  function setupParents() {
    var bar = document.getElementById('parentFilters');
    if (!bar) return;
    var buttons = bar.querySelectorAll('button');
    var selected = 'all';
    var grids = Array.from(document.querySelectorAll('.parents-grid'));
    function applyFilter() {
      var cards = Array.from(document.querySelectorAll('.parent-card'));
      cards.forEach(function(card) { card.hidden = selected !== 'all' && card.dataset.gender !== selected; });
      Array.from(new Set(grids.map(function(grid){return grid.closest('section');}).filter(Boolean))).forEach(function(section) {
        section.hidden = !Array.from(section.querySelectorAll('.parent-card')).some(function(card) { return !card.hidden; });
      });
    }
    buttons.forEach(function(button) {
      button.addEventListener('click', function() {
        // The catalogue can replace its cards after language or API updates.
        selected = button.dataset.parentFilter;
        buttons.forEach(function(item) { item.setAttribute('aria-pressed',String(item === button)); });
        applyFilter();
      });
    });
    if (typeof MutationObserver !== 'undefined') {
      var observer = new MutationObserver(applyFilter);
      grids.forEach(function(grid) { observer.observe(grid,{childList:true}); });
    }
  }
  function init() {
    applyLanguage(); setupWaitlist(); setupBooking(); setupParents();
    window.addEventListener('langChanged',applyLanguage);
  }
  return {filterFaq:filterFaq, kittenContext:kittenContext, waitlistTemplate:waitlistTemplate, localHref:localHref, init:init};
});
