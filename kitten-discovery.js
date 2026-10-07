/* Progressive catalogue tools; saved preferences and public listing IDs stay in this browser. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.init(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var KEY = 'fuluck-kitten-discovery-v1';
  var CHOICES = { budget: ['', '200000', '250000', '300000'], sex: ['', 'male', 'female'], age: ['', 'under6', '6to11', '12plus'], entry: ['all', 'siberian', 'golden', 'adultmix'], status: ['available', 'all', 'reserved', 'sold'], sort: ['default', 'price-asc', 'price-desc', 'newest'] };
  var COPY = {
    ja: { refreshed: '掲載情報を更新しました。選択内容を確認して、比較を開き直してください。', more: '条件を追加・お気に入り', budget: '本体価格の上限', any: '指定なし', sex: '性別', male: '男の子', female: '女の子', age: '月齢', under6: '6か月未満', '6to11': '6〜11か月', '12plus': '12か月以上', favorites: 'お気に入りのみ', save: '♡ 保存', saved: '♥ 保存済み', compare: '比較に追加', selected: '比較から外す', open: '選んだ子を比較', clear: '条件をリセット', close: '閉じる', count: '匹を表示', local: '保存はこのブラウザ内のみ。価格・販売状況は詳細ページでご確認ください。', limit: '比較は3匹までです。先に選択を解除してください。', hint: '2〜3匹を選ぶと比較できます。', detail: '詳細を見る', unknown: '記載なし', number: '個体番号', birth: '生年月日', price: '本体価格', status: '販売状況', empty: '条件に合う子猫がいません。条件を変更してお探しください。' },
    en: { refreshed: 'Listings were updated. Review your selections and reopen the comparison.', more: 'More filters & favorites', budget: 'Maximum kitten price', any: 'Any', sex: 'Sex', male: 'Male', female: 'Female', age: 'Age', under6: 'Under 6 months', '6to11': '6–11 months', '12plus': '12 months or older', favorites: 'Favorites only', save: '♡ Save', saved: '♥ Saved', compare: 'Add to comparison', selected: 'Remove from comparison', open: 'Compare selected kittens', clear: 'Reset filters', close: 'Close', count: 'shown', local: 'Saved only in this browser. Confirm price and availability on each detail page.', limit: 'Compare up to 3 kittens. Remove one before adding another.', hint: 'Select 2–3 kittens to compare.', detail: 'View details', unknown: 'Not listed', number: 'Listing ID', birth: 'Date of birth', price: 'Kitten price', status: 'Availability', empty: 'No kittens match these filters. Try changing your selections.' },
    zh: { refreshed: '猫咪资料已刷新，请确认所选猫咪后重新打开对比。', more: '更多筛选与收藏', budget: '猫咪本体价格上限', any: '不限', sex: '性别', male: '男孩', female: '女孩', age: '月龄', under6: '不足6个月', '6to11': '6–11个月', '12plus': '12个月及以上', favorites: '只看收藏', save: '♡ 收藏', saved: '♥ 已收藏', compare: '加入对比', selected: '移出对比', open: '对比选中的猫咪', clear: '重置筛选', close: '关闭', count: '只符合条件', local: '收藏仅保存在此浏览器。价格与在售情况请以详情页为准。', limit: '最多对比3只，请先移出一只再添加。', hint: '选择2–3只猫咪后即可对比。', detail: '查看详情', unknown: '未列明', number: '猫咪编号', birth: '出生日期', price: '猫咪本体价格', status: '在售情况', empty: '没有符合条件的猫咪，请调整筛选条件。' }
  };
  var EXTRA = {
    ja: {entry:'猫のタイプ', siberian:'サイベリアン', golden:'ブリティッシュ ゴールデン', adultmix:'成猫・ミックス', sort:'並び替え', default:'おすすめ順', 'price-asc':'価格が安い順', 'price-desc':'価格が高い順', newest:'誕生日が新しい順', clearCompare:'比較をすべてクリア', remove:'外す', replace:'入れ替える子を選択', prev:'前の9匹', next:'次の9匹', available:'販売中', reserved:'商談中・ご予約済', sold:'ご家族決定', all:'すべて', full:'すべての子猫を見る', book:'選んだ子の見学を相談'},
    en: {entry:'Kitten category', siberian:'Siberian', golden:'Golden British', adultmix:'Adult cats & mixes', sort:'Sort by', default:'Recommended', 'price-asc':'Price: low to high', 'price-desc':'Price: high to low', newest:'Youngest first', clearCompare:'Clear comparison', remove:'Remove', replace:'Choose a kitten to replace', prev:'Previous 9', next:'Next 9', available:'Available', reserved:'Reserved', sold:'Family found', all:'All', full:'Browse all kittens', book:'Arrange a visit for these kittens'},
    zh: {entry:'猫咪类型', siberian:'西伯利亚猫', golden:'英系金渐层', adultmix:'成猫与混血猫', sort:'排序', default:'推荐顺序', 'price-asc':'价格从低到高', 'price-desc':'价格从高到低', newest:'出生日期从新到旧', clearCompare:'清空全部对比', remove:'移除', replace:'选择要替换的猫咪', prev:'上一页9只', next:'下一页9只', available:'在售', reserved:'洽谈中・已预订', sold:'已找到家', all:'全部', full:'查看全部猫咪', book:'预约看选中的猫咪'}
  };
  Object.keys(COPY).forEach(function(lang) { Object.assign(COPY[lang], EXTRA[lang]); });
  function replaceCompare(list, oldId, newId) { return ids(list.map(function(id) { return id === oldId ? newId : id; }), 3); }
  function ids(value, max) { return Array.isArray(value) ? value.filter(function (id, i, all) { return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id) && all.indexOf(id) === i; }).slice(0, max) : []; }
  function normalize(value) {
    value = value && typeof value === 'object' ? value : {};
    var state = { favorites: ids(value.favorites, 200), compare: ids(value.compare, 3), favoritesOnly: value.favoritesOnly === true };
    Object.keys(CHOICES).forEach(function (key) { state[key] = CHOICES[key].indexOf(value[key]) >= 0 ? value[key] : CHOICES[key][0]; });
    return state;
  }
  function read(storage) { try { return normalize(JSON.parse(storage.getItem(KEY))); } catch (_) { return normalize(); } }
  function write(storage, state) { try { storage.setItem(KEY, JSON.stringify(normalize(state))); } catch (_) { /* Private browsing / full storage: tools still work for this visit. */ } }
  function ageMonths(birthday, now) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday || '')) return null;
    var bits = birthday.split('-').map(Number), birth = new Date(bits[0], bits[1] - 1, bits[2]);
    if (birth.getFullYear() !== bits[0] || birth.getMonth() !== bits[1] - 1 || birth.getDate() !== bits[2] || birth > now) return null;
    return (now.getFullYear() - bits[0]) * 12 + now.getMonth() - (bits[1] - 1) - (now.getDate() < bits[2] ? 1 : 0);
  }
  function sexOf(text) {
    var first = String(text || '').trim().split(/\s*[・·]\s*/)[0];
    if (/^(?:♂\s*)?(?:男の子|男孩|Male)$/i.test(first)) return 'male';
    if (/^(?:♀\s*)?(?:女の子|女孩|Female)$/i.test(first)) return 'female';
    return '';
  }
  function matches(record, state, now) {
    if (state.entry !== 'all' && record.entry && record.entry !== state.entry) return false;
    if (state.status !== 'all' && record.status !== state.status) return false;
    if (state.favoritesOnly && state.favorites.indexOf(record.id) < 0) return false;
    if (state.sex && record.sex !== state.sex) return false;
    if (state.budget && (!/^[1-9]\d*$/.test(String(record.price || '')) || Number(record.price) > Number(state.budget))) return false;
    var age = ageMonths(record.birthday, now || new Date());
    if (state.age && (age === null || (state.age === 'under6' && age >= 6) || (state.age === '6to11' && (age < 6 || age >= 12)) || (state.age === '12plus' && age < 12))) return false;
    return true;
  }
  function toggleCompare(list, id) { if (list.indexOf(id) >= 0) return list.filter(function (item) { return item !== id; }); return list.length < 3 ? ids(list.concat(id), 3) : list.slice(); }
  function init(win) {
    var doc = win.document, filters = doc.querySelector('[data-kitten-filters]');
    if (!filters || filters.dataset.discoveryReady) return;
    var section = filters.closest('.section'), grid = section && section.querySelector('.kittens-grid');
    if (!grid) return;
    filters.dataset.discoveryReady = 'true';
    var storage; try { storage = win.localStorage; } catch (_) { storage = null; }
    var state = read(storage), restoring = false, copy, tools, count, compareButton, note, dialog, lastFocus, tray, pager, page = 0;
    var pageSize = Number(grid.dataset.pageSize) || Infinity;
    function el(tag, className, text) { var node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
    function button(text, action) { var node = el('button', 'kit-discovery-button', text); node.type = 'button'; node.addEventListener('click', action); return node; }
    function currentLang() { var lang = doc.documentElement.lang.split('-')[0]; return COPY[lang] ? lang : 'ja'; }
    function persist() { if (!restoring) write(storage, state); }
    function record(card) {
      return { id: card.dataset.breederId, entry: card.dataset.entryGroup, status: card.dataset.status, price: card.dataset.price, birthday: card.dataset.birthday, sex: sexOf((card.querySelector('.kit-meta') || {}).textContent) };
    }
    function apply() {
      var entry = filters.querySelector('[data-entry-filter][aria-pressed="true"]'), status = filters.querySelector('[data-status-filter][aria-pressed="true"]');
      if (entry) state.entry = entry.dataset.entryFilter;
      if (status) state.status = status.dataset.statusFilter;
      var cards = Array.from(grid.querySelectorAll('.kitten-card'));
      var ordered = cards.slice();
      if (state.sort !== 'default') ordered.sort(function(a, b) {
        var av = record(a), bv = record(b);
        if (state.sort === 'newest') return (bv.birthday || '').localeCompare(av.birthday || '');
        var ap = Number(av.price) || Infinity, bp = Number(bv.price) || Infinity;
        if (!Number.isFinite(ap) || !Number.isFinite(bp)) return ap === bp ? 0 : ap === Infinity ? 1 : -1;
        return state.sort === 'price-asc' ? ap - bp : bp - ap;
      });
      else ordered.sort(function(a, b) { return Number(a.dataset.discoveryOrder) - Number(b.dataset.discoveryOrder); });
      if (ordered.some(function(card, i) { return card !== cards[i]; })) ordered.forEach(function(card) { grid.appendChild(card.parentElement.classList.contains('kit-discovery-item') ? card.parentElement : card); });
      var filtered = ordered.filter(function(card) { return matches(record(card), state); });
      var shown = filtered.length, pages = Number.isFinite(pageSize) ? Math.max(1, Math.ceil(shown / pageSize)) : 1;
      page = Math.min(page, pages - 1);
      ordered.forEach(function(card) {
        var i = filtered.indexOf(card), visible = i >= 0 && (!Number.isFinite(pageSize) || (i >= page * pageSize && i < (page + 1) * pageSize));
        card.hidden = !visible;
        if (card.parentElement.classList.contains('kit-discovery-item')) card.parentElement.hidden = !visible;
      });
      if (pager) {
        pager.replaceChildren(); pager.hidden = pages <= 1;
        var prev = button(copy.prev, function() { page--; apply(); filters.scrollIntoView({block:'start'}); }); prev.disabled = page === 0;
        var next = button(copy.next, function() { page++; apply(); filters.scrollIntoView({block:'start'}); }); next.disabled = page + 1 === pages;
        pager.appendChild(prev); pager.appendChild(el('span', '', (page + 1) + ' / ' + pages)); pager.appendChild(next);
      }
      var empty = section.querySelector('[data-kitten-filter-empty]');
      if (empty) { empty.hidden = shown > 0; empty.textContent = copy.empty; }
      count.textContent = shown + ' ' + copy.count + (pages > 1 ? ' · ' + (page * pageSize + 1) + '–' + Math.min(shown, (page + 1) * pageSize) : '');
      paintTray();
      compareButton.textContent = copy.open + ' (' + state.compare.length + '/3)';
      compareButton.disabled = state.compare.length < 2;
      persist();
    }
    function paintActions(wrapper, data) {
      var actions = wrapper.querySelector('.kit-discovery-actions');
      if (actions) actions.remove();
      if (!ids([data.id], 1).length) return;
      actions = el('div', 'kit-discovery-actions');
      var save = button(state.favorites.indexOf(data.id) >= 0 ? copy.saved : copy.save, function () {
        var i = state.favorites.indexOf(data.id);
        if (i >= 0) state.favorites.splice(i, 1); else state.favorites = ids(state.favorites.concat(data.id), 200);
        paintActions(wrapper, data); apply();
        if (wrapper.hidden) tools.querySelector('summary').focus(); else wrapper.querySelector('button').focus();
      });
      save.setAttribute('aria-pressed', state.favorites.indexOf(data.id) >= 0 ? 'true' : 'false');
      save.setAttribute('aria-label', save.textContent + ' · ' + data.id);
      actions.appendChild(save);
      if (typeof doc.createElement('dialog').showModal === 'function') {
        var compare = button(state.compare.indexOf(data.id) >= 0 ? copy.selected : copy.compare, function () {
          if (state.compare.length >= 3 && state.compare.indexOf(data.id) < 0) { openReplacement(data.id); return; }
          state.compare = toggleCompare(state.compare, data.id); note.textContent = copy.hint;
          paintActions(wrapper, data); apply(); wrapper.querySelectorAll('button')[1].focus();
        });
        compare.setAttribute('aria-pressed', state.compare.indexOf(data.id) >= 0 ? 'true' : 'false');
        compare.setAttribute('aria-label', compare.textContent + ' · ' + data.id);
        actions.appendChild(compare);
      }
      wrapper.appendChild(actions);
    }
    function enhance() {
      var present = [];
      grid.querySelectorAll('.kitten-card').forEach(function (card, index) {
        if (!card.dataset.discoveryOrder) card.dataset.discoveryOrder = String(index + 1);
        var data = record(card), wrapper = card.parentElement;
        present.push(data.id);
        if (!wrapper.classList.contains('kit-discovery-item')) { wrapper = el('div', 'kit-discovery-item'); grid.insertBefore(wrapper, card); wrapper.appendChild(card); }
        paintActions(wrapper, data);
      });
      state.compare = state.compare.filter(function (id) { return present.indexOf(id) >= 0; });
      apply();
    }
    function repaint() { grid.querySelectorAll('.kitten-card').forEach(function(card) { paintActions(card.parentElement, record(card)); }); apply(); }
    function paintTray() {
      if (!tray) return;
      tray.replaceChildren();
      state.compare.forEach(function(id) {
        var card = Array.from(grid.querySelectorAll('.kitten-card')).find(function(card) { return card.dataset.breederId === id; });
        var chip = el('div', 'kit-compare-chip'), image = card && card.querySelector('img');
        if (image) { var photo = image.cloneNode(false); photo.removeAttribute('style'); chip.appendChild(photo); }
        chip.appendChild(el('span', '', id));
        chip.appendChild(button(copy.remove, function() { state.compare = state.compare.filter(function(item) { return item !== id; }); repaint(); compareButton.focus(); })); tray.appendChild(chip);
      });
      if (state.compare.length) tray.appendChild(button(copy.clearCompare, function() { state.compare = []; repaint(); compareButton.focus(); }));
    }
    function openReplacement(newId) {
      dialog.replaceChildren();
      var heading = el('h2', '', copy.replace); heading.id = 'kit-comparison-title'; dialog.appendChild(heading);
      state.compare.forEach(function(id) { dialog.appendChild(button(id + ' → ' + newId, function() { state.compare = replaceCompare(state.compare, id, newId); closeDialog(); repaint(); })); });
      dialog.appendChild(button(copy.close, closeDialog)); lastFocus = doc.activeElement; dialog.showModal();
    }
    function closeDialog() { dialog.close(); if (lastFocus && lastFocus.isConnected) lastFocus.focus(); }
    function openComparison() {
      if (state.compare.length < 2) return;
      dialog.replaceChildren();
      var close = button(copy.close, closeDialog); close.autofocus = true;
      dialog.appendChild(close);
      var heading = el('h2', '', copy.open); heading.id = 'kit-comparison-title'; dialog.appendChild(heading);
      var row = el('div', 'kit-comparison-grid');
      state.compare.forEach(function (id) {
        var card = Array.from(grid.querySelectorAll('.kitten-card')).find(function (node) { return node.dataset.breederId === id; });
        if (!card) return;
        var item = el('article', 'kit-comparison-card'), image = card.querySelector('img');
        if (image) { var photo = image.cloneNode(false); ['style', 'width', 'height', 'fetchpriority'].forEach(function (attribute) { photo.removeAttribute(attribute); }); photo.loading = 'lazy'; item.appendChild(photo); }
        item.appendChild(el('h3', '', (card.querySelector('h3') || {}).textContent || copy.unknown));
        item.appendChild(el('p', '', copy.number + ': ' + id));
        var rows = [[copy.sex, copy[record(card).sex] || copy.unknown], [copy.birth, (card.querySelectorAll('.kit-meta')[1] || {}).textContent], [copy.price, (card.querySelector('.kit-price') || {}).textContent], [copy.status, (card.querySelector('.kit-status') || {}).textContent]];
        var list = el('dl'); rows.forEach(function (pair) { list.appendChild(el('dt', '', pair[0])); list.appendChild(el('dd', '', pair[1] || copy.unknown)); }); item.appendChild(list);
        var href = card.getAttribute('href');
        if (href && /^\/(?:en\/|zh\/)?kittens\/[A-Za-z0-9_-]+\.html$/.test(href)) { var link = el('a', 'kit-discovery-button', copy.detail); link.href = href; item.appendChild(link); }
        item.appendChild(button(copy.remove, function() { state.compare = state.compare.filter(function(value) { return value !== id; }); closeDialog(); repaint(); if (state.compare.length >= 2) openComparison(); }));
        row.appendChild(item);
      });
      dialog.appendChild(row); dialog.appendChild(el('p', 'kit-discovery-note', copy.local));
      var book = el('a', 'kit-discovery-button', copy.book); book.href = '/booking.html?kitten=' + encodeURIComponent(state.compare.join(',')); dialog.appendChild(book);
      lastFocus = doc.activeElement; dialog.showModal(); close.focus();
    }
    function renderTools() {
      copy = COPY[currentLang()];
      if (tools) tools.remove();
      tools = el('details', 'kit-discovery-tools');
      tools.open = true;
      tools.appendChild(el('summary', '', copy.more));
      var fields = el('div', 'kit-discovery-fields');
      (filters.dataset.homeCatalog !== undefined ? ['entry', 'budget', 'sex', 'age', 'sort'] : ['budget', 'sex', 'age', 'sort']).forEach(function (key) {
        var label = el('label', '', copy[key]), select = el('select'); select.name = 'kitten-' + key;
        CHOICES[key].forEach(function (value) { var option = el('option', '', !value ? copy.any : key === 'budget' ? '¥' + Number(value).toLocaleString('ja-JP') : copy[value]); option.value = value; select.appendChild(option); });
        select.value = state[key]; select.addEventListener('change', function () { state[key] = select.value; page = 0; apply(); }); label.appendChild(select); fields.appendChild(label);
      });
      var only = el('label', 'kit-discovery-checkbox'), checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = state.favoritesOnly;
      checkbox.addEventListener('change', function () { state.favoritesOnly = checkbox.checked; apply(); }); only.appendChild(checkbox); only.appendChild(doc.createTextNode(copy.favorites)); fields.appendChild(only);
      fields.appendChild(button(copy.clear, function () { var favorites = state.favorites, selected = state.compare; state = normalize({ favorites: favorites, compare: selected }); restore(); renderTools(); enhance(); tools.querySelector('summary').focus(); }));
      tools.appendChild(fields); tools.appendChild(el('p', 'kit-discovery-note', copy.local)); filters.appendChild(tools);
      var oldBar = section.querySelector('.kit-discovery-bar'); if (oldBar) oldBar.remove();
      var bar = el('div', 'kit-discovery-bar'); count = el('p'); count.setAttribute('role', 'status');
      compareButton = button(copy.open, openComparison); note = el('p', 'kit-discovery-note', copy.hint); note.setAttribute('role', 'status');
      bar.appendChild(count); if (typeof dialog.showModal === 'function') { bar.appendChild(compareButton); bar.appendChild(note); } filters.after(bar);
      tray = el('div', 'kit-compare-tray'); bar.appendChild(tray);
      if (!pager) { pager = el('nav', 'kit-catalog-pager'); pager.setAttribute('aria-label', 'Kitten pages'); grid.after(pager); }
    }
    function restore() {
      restoring = true;
      var desiredEntry = state.entry, desiredStatus = state.status;
      ['entry', 'status'].forEach(function (key) {
        var target = key === 'entry' ? desiredEntry : desiredStatus;
        var chosen = filters.querySelector('[data-' + key + '-filter="' + target + '"]'); if (chosen) chosen.click();
      }); restoring = false;
    }
    if (filters.hasAttribute ? filters.hasAttribute('data-home-catalog') : filters.dataset.homeCatalog !== undefined) {
      filters.addEventListener('click', function(event) {
        var chosen = event.target.closest('[data-status-filter]'); if (!chosen) return;
        filters.querySelectorAll('[data-status-filter]').forEach(function(node) { node.setAttribute('aria-pressed', node === chosen ? 'true' : 'false'); });
        page = 0; apply();
      });
    }
    dialog = el('dialog', 'kit-comparison-dialog'); dialog.setAttribute('aria-labelledby', 'kit-comparison-title');
    dialog.addEventListener('close', function () { if (lastFocus && lastFocus.isConnected) lastFocus.focus(); }); doc.body.appendChild(dialog);
    renderTools(); restore(); enhance();
    win.addEventListener('kittenFiltersApplied', apply);
    function refreshCatalog() {
      var wasOpen = dialog.open;
      if (wasOpen) closeDialog();
      enhance();
      if (wasOpen) note.textContent = copy.refreshed;
    }
    win.addEventListener('cardsLoaded', refreshCatalog);
    win.addEventListener('pageshow', function () { enhance(); });
    win.addEventListener('langChanged', function () { if (dialog.open) dialog.close(); renderTools(); enhance(); });
  }
  return { normalize: normalize, read: read, write: write, ageMonths: ageMonths, sexOf: sexOf, matches: matches, toggleCompare: toggleCompare, replaceCompare: replaceCompare, init: init };
});
