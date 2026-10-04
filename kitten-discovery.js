/* Progressive catalogue tools; saved preferences and public listing IDs stay in this browser. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.init(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var KEY = 'fuluck-kitten-discovery-v1';
  var CHOICES = { budget: ['', '200000', '250000', '300000'], sex: ['', 'male', 'female'], age: ['', 'under6', '6to11', '12plus'], entry: ['all', 'siberian', 'golden', 'adultmix'], status: ['available', 'all'] };
  var COPY = {
    ja: { refreshed: '掲載情報を更新しました。選択内容を確認して、比較を開き直してください。', more: '条件を追加・お気に入り', budget: '本体価格の上限', any: '指定なし', sex: '性別', male: '男の子', female: '女の子', age: '月齢', under6: '6か月未満', '6to11': '6〜11か月', '12plus': '12か月以上', favorites: 'お気に入りのみ', save: '♡ 保存', saved: '♥ 保存済み', compare: '比較に追加', selected: '比較から外す', open: '選んだ子を比較', clear: '条件をリセット', close: '閉じる', count: '匹を表示', local: '保存はこのブラウザ内のみ。価格・販売状況は詳細ページでご確認ください。', limit: '比較は3匹までです。先に選択を解除してください。', hint: '2〜3匹を選ぶと比較できます。', detail: '詳細を見る', unknown: '記載なし', number: '個体番号', birth: '生年月日', price: '本体価格', status: '販売状況', empty: '条件に合う子猫がいません。条件を変更してお探しください。' },
    en: { refreshed: 'Listings were updated. Review your selections and reopen the comparison.', more: 'More filters & favorites', budget: 'Maximum kitten price', any: 'Any', sex: 'Sex', male: 'Male', female: 'Female', age: 'Age', under6: 'Under 6 months', '6to11': '6–11 months', '12plus': '12 months or older', favorites: 'Favorites only', save: '♡ Save', saved: '♥ Saved', compare: 'Add to comparison', selected: 'Remove from comparison', open: 'Compare selected kittens', clear: 'Reset filters', close: 'Close', count: 'shown', local: 'Saved only in this browser. Confirm price and availability on each detail page.', limit: 'Compare up to 3 kittens. Remove one before adding another.', hint: 'Select 2–3 kittens to compare.', detail: 'View details', unknown: 'Not listed', number: 'Listing ID', birth: 'Date of birth', price: 'Kitten price', status: 'Availability', empty: 'No kittens match these filters. Try changing your selections.' },
    zh: { refreshed: '猫咪资料已刷新，请确认所选猫咪后重新打开对比。', more: '更多筛选与收藏', budget: '猫咪本体价格上限', any: '不限', sex: '性别', male: '男孩', female: '女孩', age: '月龄', under6: '不足6个月', '6to11': '6–11个月', '12plus': '12个月及以上', favorites: '只看收藏', save: '♡ 收藏', saved: '♥ 已收藏', compare: '加入对比', selected: '移出对比', open: '对比选中的猫咪', clear: '重置筛选', close: '关闭', count: '只符合条件', local: '收藏仅保存在此浏览器。价格与在售情况请以详情页为准。', limit: '最多对比3只，请先移出一只再添加。', hint: '选择2–3只猫咪后即可对比。', detail: '查看详情', unknown: '未列明', number: '猫咪编号', birth: '出生日期', price: '猫咪本体价格', status: '在售情况', empty: '没有符合条件的猫咪，请调整筛选条件。' }
  };
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
    var state = read(storage), restoring = false, copy, tools, count, compareButton, note, dialog, lastFocus;
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
      var shown = 0;
      grid.querySelectorAll('.kitten-card').forEach(function (card) {
        var data = record(card), visible = matches(data, state);
        card.hidden = !visible;
        var wrapper = card.parentElement;
        if (wrapper.classList.contains('kit-discovery-item')) wrapper.hidden = !visible;
        if (visible) shown++;
      });
      var empty = section.querySelector('[data-kitten-filter-empty]');
      if (empty) { empty.hidden = shown > 0; empty.textContent = copy.empty; }
      count.textContent = shown + ' ' + copy.count;
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
          if (state.compare.length >= 3 && state.compare.indexOf(data.id) < 0) { note.textContent = copy.limit; return; }
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
      grid.querySelectorAll('.kitten-card').forEach(function (card) {
        var data = record(card), wrapper = card.parentElement;
        present.push(data.id);
        if (!wrapper.classList.contains('kit-discovery-item')) { wrapper = el('div', 'kit-discovery-item'); grid.insertBefore(wrapper, card); wrapper.appendChild(card); }
        paintActions(wrapper, data);
      });
      state.compare = state.compare.filter(function (id) { return present.indexOf(id) >= 0; });
      apply();
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
        row.appendChild(item);
      });
      dialog.appendChild(row); dialog.appendChild(el('p', 'kit-discovery-note', copy.local));
      lastFocus = doc.activeElement; dialog.showModal(); close.focus();
    }
    function renderTools() {
      copy = COPY[currentLang()];
      if (tools) tools.remove();
      tools = el('details', 'kit-discovery-tools');
      tools.open = !!(state.budget || state.sex || state.age || state.favoritesOnly);
      tools.appendChild(el('summary', '', copy.more));
      var fields = el('div', 'kit-discovery-fields');
      ['budget', 'sex', 'age'].forEach(function (key) {
        var label = el('label', '', copy[key]), select = el('select'); select.name = 'kitten-' + key;
        CHOICES[key].forEach(function (value) { var option = el('option', '', !value ? copy.any : key === 'budget' ? '¥' + Number(value).toLocaleString('ja-JP') : copy[value]); option.value = value; select.appendChild(option); });
        select.value = state[key]; select.addEventListener('change', function () { state[key] = select.value; apply(); }); label.appendChild(select); fields.appendChild(label);
      });
      var only = el('label', 'kit-discovery-checkbox'), checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = state.favoritesOnly;
      checkbox.addEventListener('change', function () { state.favoritesOnly = checkbox.checked; apply(); }); only.appendChild(checkbox); only.appendChild(doc.createTextNode(copy.favorites)); fields.appendChild(only);
      fields.appendChild(button(copy.clear, function () { var favorites = state.favorites, selected = state.compare; state = normalize({ favorites: favorites, compare: selected }); restore(); renderTools(); enhance(); tools.querySelector('summary').focus(); }));
      tools.appendChild(fields); tools.appendChild(el('p', 'kit-discovery-note', copy.local)); filters.appendChild(tools);
      var oldBar = section.querySelector('.kit-discovery-bar'); if (oldBar) oldBar.remove();
      var bar = el('div', 'kit-discovery-bar'); count = el('p'); count.setAttribute('role', 'status');
      compareButton = button(copy.open, openComparison); note = el('p', 'kit-discovery-note', copy.hint); note.setAttribute('role', 'status');
      bar.appendChild(count); if (typeof dialog.showModal === 'function') { bar.appendChild(compareButton); bar.appendChild(note); } filters.after(bar);
    }
    function restore() {
      restoring = true;
      var desiredEntry = state.entry, desiredStatus = state.status;
      ['entry', 'status'].forEach(function (key) {
        var target = key === 'entry' ? desiredEntry : desiredStatus;
        var chosen = filters.querySelector('[data-' + key + '-filter="' + target + '"]'); if (chosen) chosen.click();
      }); restoring = false;
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
  return { normalize: normalize, read: read, write: write, ageMonths: ageMonths, sexOf: sexOf, matches: matches, toggleCompare: toggleCompare, init: init };
});
