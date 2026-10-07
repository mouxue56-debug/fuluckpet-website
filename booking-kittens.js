/* Select published available kittens; retain the existing booking API string field. */
(function () {
  'use strict';
  var field = document.getElementById('bk-kitten'), host = document.getElementById('booking-kitten-options');
  if (!field || !host) return;
  var selected = [], kittens = [], loaded = false;
  var COPY = {
    ja: {loading:'販売中の子猫を確認しています…', hint:'気になる子を3匹まで選べます。決まっていない場合は、選ばずにご相談いただけます。', limit:'選べるのは3匹までです。入れ替える場合は、選択済みの子を外してください。', error:'子猫一覧を読み込めませんでした。再読み込みするか、ご相談内容に掲載番号をご記入ください。', empty:'現在、販売中の子猫は掲載されていません。ご希望をご相談内容にお書きください。', clear:'選択をクリア', retry:'再読み込み', male:'男の子', female:'女の子', stale:'指定された子は現在販売中ではないため、選択されていません。ご相談内容にご記入ください。'},
    en: {loading:'Checking available kittens…', hint:'Choose up to 3 kittens. You can also continue without choosing.', limit:'Choose up to 3. Deselect one to choose another.', error:'Unable to load kittens. Retry or enter a listing ID in your message.', empty:'No available kittens are currently listed. Tell us your preferences in your message.', clear:'Clear selection', retry:'Retry', male:'Male', female:'Female', stale:'A requested kitten is no longer available and was not selected. Please mention it in your message.'},
    zh: {loading:'正在确认在售猫咪…', hint:'最多选择3只。还没决定也可以不选，直接咨询。', limit:'最多选择3只；如需更换，请先取消已选猫咪。', error:'暂时无法加载猫咪，请重试，或在咨询内容中填写猫咪编号。', empty:'目前没有在售猫咪，请在咨询内容里填写您的偏好。', clear:'清空选择', retry:'重新加载', male:'男孩', female:'女孩', stale:'链接中的猫咪目前不在售，因此未选中；可在咨询内容中备注。'}
  };
  function lang() { var value = document.documentElement.lang.split('-')[0]; return COPY[value] ? value : 'ja'; }
  function node(tag, text) { var e = document.createElement(tag); if (text !== undefined) e.textContent = text; return e; }
  function sync() {
    field.value = selected.join(', ');
    host.querySelectorAll('input[type="checkbox"]').forEach(function(input) { input.checked = selected.indexOf(input.value) >= 0; input.disabled = selected.length >= 3 && !input.checked; });
    host.querySelector('[data-selection-count]').textContent = selected.length + ' / 3';
    field.dispatchEvent(new Event('input', {bubbles:true}));
  }
  function render() {
    if (!loaded) return;
    var t = COPY[lang()]; host.replaceChildren();
    var title = document.getElementById('booking-kitten-label'); if (title) title.textContent = {ja:'気になる子猫（3匹まで）',en:'Kittens you are interested in (up to 3)',zh:'感兴趣的猫咪（最多3只）'}[lang()];
    var hint = node('p', t.hint); host.appendChild(hint);
    var count = node('p'); count.dataset.selectionCount = ''; count.setAttribute('role', 'status'); host.appendChild(count);
    var grid = node('div'); grid.className = 'booking-kitten-grid';
    kittens.forEach(function(k) {
      var label = node('label'); label.className = 'booking-kitten-choice';
      var input = node('input'); input.type = 'checkbox'; input.value = k.breederId;
      input.addEventListener('change', function() {
        if (input.checked && selected.length < 3) selected.push(k.breederId);
        else selected = selected.filter(function(id) { return id !== k.breederId; });
        sync();
      });
      label.appendChild(input);
      var photo = Array.isArray(k.photos) && (k.photos[k.coverIndex || 0] || k.photos[0]);
      if (typeof photo === 'string' && (/^https:\/\//.test(photo) || /^\/(?!\/)/.test(photo))) { var image = node('img'); image.src = photo; image.alt = ''; image.loading = 'lazy'; label.appendChild(image); }
      var name = node('span', k.breederId + ' · ' + (k.gender === '♂' ? t.male : k.gender === '♀' ? t.female : ''));
      var catalog = window.FULUCK_CATALOG_I18N; var breed = catalog && catalog.breeds && catalog.breeds[lang()] && catalog.breeds[lang()][k.breed] || k.breed;
      name.appendChild(node('small', breed + (k.birthday ? ' · ' + k.birthday : ''))); label.appendChild(name); grid.appendChild(label);
    });
    host.appendChild(grid);
    if (!kittens.length) host.appendChild(node('p', t.empty));
    var clear = node('button', t.clear); clear.type = 'button'; clear.className = 'kit-discovery-button'; clear.addEventListener('click', function() { selected = []; sync(); }); host.appendChild(clear);
    sync();
  }
  function load() {
    host.textContent = COPY[lang()].loading;
    fetch('https://fuluck-api.mouxue56.workers.dev/api/kittens').then(function(response) { if (!response.ok) throw new Error('catalog'); return response.json(); }).then(function(rows) {
      if (!Array.isArray(rows)) throw new Error('shape');
      var all = window.FuluckKittenCatalog ? window.FuluckKittenCatalog.orderKittens(rows) : rows;
      kittens = all.filter(function(k) { return k && k.status === 'available' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(k.breederId); });
      var requested = (field.value || new URLSearchParams(location.search).get('kitten') || '').split(/[,\s]+/).filter(Boolean);
      selected = requested.filter(function(id, i, list) { return list.indexOf(id) === i && kittens.some(function(k) { return k.breederId === id; }); }).slice(0,3);
      loaded = true; render();
      if (requested.some(function(id) { return selected.indexOf(id) < 0; })) host.appendChild(node('p', COPY[lang()].stale));
    }).catch(function() {
      field.value = ''; host.textContent = COPY[lang()].error;
      var retry = node('button', COPY[lang()].retry); retry.type = 'button'; retry.addEventListener('click', load); host.appendChild(retry);
    });
  }
  field.type = 'hidden'; load(); window.addEventListener('langChanged', render);
})();
