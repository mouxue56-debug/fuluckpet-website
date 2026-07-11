// admin-render.js — renderAll, syncFromAPI, dashboard, kittens/parents/reviews CRUD
// Depends on: admin-images.js (t, admLang), admin-core.js (data, saveData, etc.)

function adminRenderText(value) {
  return value === null || value === undefined ? '' : String(value);
}

function adminRenderClear(node) {
  if (!node) return;
  node.textContent = '';
  if (typeof node.replaceChildren === 'function') node.replaceChildren();
}

function adminRenderStyle(node, styles) {
  Object.keys(styles || {}).forEach(function(property) {
    node.style[property] = styles[property];
  });
  return node;
}

function adminRenderElement(tagName, text, className, styles) {
  var node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = adminRenderText(text);
  return adminRenderStyle(node, styles);
}

function adminRenderCell(text, styles) {
  return adminRenderElement('td', text, '', styles);
}

function adminRenderButton(label, className, handler, styles) {
  var button = adminRenderElement('button', label, className, styles);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}

function adminRenderSafePhotoUrl(value) {
  var url = adminRenderText(value).trim();
  if (/^https:\/\/[^\s\u0000-\u001f\u007f]+$/i.test(url)) return url;
  if (/^\/(?!\/)/.test(url) && !/[\\\u0000-\u001f\u007f]/.test(url)) return url;
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(url)) return url;
  return '';
}

function adminRenderPhotoCell(type, id, cover, fallbackEmoji) {
  var cell = document.createElement('td');
  cell.className = 'thumb-cell';
  var safeCover = adminRenderSafePhotoUrl(cover);
  var preview;
  if (safeCover) {
    preview = document.createElement('img');
    preview.src = safeCover;
    preview.alt = t('写真', '照片');
    preview.className = 'thumb-img';
    preview.title = t('クリックで写真管理', '点击管理照片');
  } else {
    preview = adminRenderElement('div', fallbackEmoji, 'thumb-placeholder', { cursor: 'pointer' });
    preview.title = t('クリックで写真追加', '点击添加照片');
  }
  preview.addEventListener('click', function() { openPhotoModal(type, id); });
  cell.appendChild(preview);
  return cell;
}

function adminRenderPopulateParentSelect(selectId, parents, selectedName) {
  var select = document.getElementById(selectId);
  adminRenderClear(select);
  var empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '-- 選択 --';
  select.appendChild(empty);
  (Array.isArray(parents) ? parents : []).forEach(function(parent) {
    var name = adminRenderText(parent && parent.name);
    var option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    option.selected = !!selectedName && selectedName === name;
    select.appendChild(option);
  });
  select.value = selectedName || '';
}

function renderAll() {
  data = getData();
  renderDashboard();
  renderKittens();
  renderParents();
  renderReviews();
  loadImageConfig();
  applyAdminLang();
}

function syncFromAPI() {
  if (remoteSyncPending && remoteSyncPromise) return remoteSyncPromise;
  remoteSyncPending = true;

  var syncIndicator = document.getElementById('syncStatus');
  if (syncIndicator) {
    syncIndicator.textContent = t('☁️ 読み込み中...','☁️ 加载中...');
    syncIndicator.className = 'sync-status syncing';
  }

  // Drain every save that was queued before this refresh request. New saves are
  // rejected by remoteSyncPending, preventing a GET from racing a KV replace.
  remoteSyncPromise = saveQueue.then(function() {
    remoteDataReady = false;
    remoteDataSnapshot = null;
    if (typeof FuluckAPI === 'undefined' || typeof FuluckAPI.get !== 'function') {
      throw new Error('Remote sync API is unavailable.');
    }
    return Promise.all([
      FuluckAPI.get('/api/admin/kittens'),
      FuluckAPI.get('/api/parents'),
      FuluckAPI.get('/api/reviews')
    ]);
  }).then(function(results) {
    if (!results.every(Array.isArray)) {
      throw new Error('Remote sync returned an invalid collection payload.');
    }

    // Empty arrays are authoritative too. Never preserve stale local rows merely
    // because a legitimate remote collection currently has no records.
    data = migrateData({
      kittens: JSON.parse(JSON.stringify(results[0])),
      parents: JSON.parse(JSON.stringify(results[1])),
      reviews: JSON.parse(JSON.stringify(results[2]))
    });
    remoteDataSnapshot = cloneAdminCollections(data);
    remoteDataReady = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    renderDashboard();
    renderKittens();
    renderParents();
    renderReviews();

    if (syncIndicator) {
      syncIndicator.textContent = t('☁️ 同期済み','☁️ 已同步');
      syncIndicator.className = 'sync-status synced';
      setTimeout(function() { syncIndicator.className = 'sync-status'; }, 3000);
    }
    hideRetrySyncButton();
    remoteSyncPending = false;
    remoteSyncPromise = null;
    return true;
  }).catch(function(err) {
    remoteDataReady = false;
    remoteDataSnapshot = null;
    remoteSyncPending = false;
    remoteSyncPromise = null;
    console.error('Remote data load failed:', err);
    if (syncIndicator) {
      syncIndicator.textContent = t('⚠️ 読込失敗・保存ロック中','⚠️ 加载失败・保存已锁定');
      syncIndicator.className = 'sync-status sync-error';
    }
    return false;
  });
  return remoteSyncPromise;
}

// Dashboard
function renderDashboard() {
  var k = Array.isArray(data.kittens) ? data.kittens : [];
  var avail = k.filter(function(x) { return x.status === 'available'; }).length;
  var reserved = k.filter(function(x) { return x.status === 'reserved'; }).length;
  var sold = k.filter(function(x) { return x.status === 'sold'; }).length;
  document.getElementById('statKittens').textContent = k.length;
  document.getElementById('statParents').textContent = data.parents.length;
  document.getElementById('statReviews').textContent = data.reviews.length;
  document.getElementById('statAvailable').textContent = avail;

  var summary = document.getElementById('dashboardSummary');
  adminRenderClear(summary);
  var summaryGrid = adminRenderElement('div', undefined, '', {
    display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px'
  });
  [
    { count: avail, label: t('販売中','在售'), background: '#C6F6D5', color: '#22543D' },
    { count: reserved, label: t('商談中','洽谈中'), background: '#FEFCBF', color: '#744210' },
    { count: sold, label: t('ご家族決定','已找到家庭'), background: '#FED7E2', color: '#702459' }
  ].forEach(function(item) {
    var card = adminRenderElement('div', undefined, '', {
      textAlign: 'center', padding: '20px', background: item.background, borderRadius: '8px'
    });
    card.appendChild(adminRenderElement('div', item.count, '', { fontSize: '24px', fontWeight: '700', color: item.color }));
    card.appendChild(adminRenderElement('div', item.label, '', { fontSize: '12px', color: item.color }));
    summaryGrid.appendChild(card);
  });
  summary.appendChild(summaryGrid);

  try {
    var logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    var changeLog = document.getElementById('changeLog');
    adminRenderClear(changeLog);
    if (Array.isArray(logs) && logs.length) {
      logs.slice(0, 10).forEach(function(log) {
        var row = adminRenderElement('div', undefined, '', {
          padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '13px'
        });
        row.appendChild(adminRenderElement('span', log && log.time, '', {
          color: 'var(--text-light)', marginRight: '12px'
        }));
        row.appendChild(document.createTextNode ? document.createTextNode(adminRenderText(log && log.msg)) : adminRenderElement('span', log && log.msg));
        changeLog.appendChild(row);
      });
    } else {
      changeLog.appendChild(adminRenderElement('p', t('まだ変更履歴はありません','暂无修改记录'), '', {
        color: 'var(--text-light)', fontSize: '13px'
      }));
    }
  } catch(e) {}
}

// Kittens CRUD
function renderKittens(filter) {
  filter = filter || document.getElementById('kittenFilterStatus').value;
  var items = filter === 'all' ? data.kittens : data.kittens.filter(function(k) { return k.status === filter; });
  var totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (kittenPage > totalPages) kittenPage = totalPages;
  var start = (kittenPage - 1) * PAGE_SIZE;
  var pageItems = items.slice(start, start + PAGE_SIZE);

  var tbody = document.getElementById('kittensTableBody');
  adminRenderClear(tbody);
  pageItems.forEach(function(k) {
    if (!k || typeof k !== 'object') return;
    var cover = getCoverPhoto(k);
    var photoCount = Array.isArray(k.photos) ? k.photos.length : 0;
    var statusClass = k.status === 'available' ? 'badge-available' : k.status === 'reserved' ? 'badge-reserved' : 'badge-sold';
    var statusText = k.status === 'available' ? t('販売中','在售') : k.status === 'reserved' ? t('商談中','洽谈中') : t('ご家族決定','已找到家庭');
    var genderDisplay = k.gender === '♂' ? t('♂ 男の子','♂ 公') : t('♀ 女の子','♀ 母');
    var birthday = adminRenderText(k.birthday);
    var birthdayDisplay = birthday ? birthday.replace('-', '年') + '月' : '--';
    var numericPrice = Number(k.price);
    var row = document.createElement('tr');
    row.appendChild(adminRenderPhotoCell('kitten', k.id, cover, '🐱'));
    row.appendChild(adminRenderCell(k.breederId || '--'));
    row.appendChild(adminRenderCell(k.breed));
    row.appendChild(adminRenderCell(genderDisplay));
    row.appendChild(adminRenderCell(k.color, { maxWidth: '150px' }));
    row.appendChild(adminRenderCell(birthdayDisplay));
    row.appendChild(adminRenderCell('¥' + (Number.isFinite(numericPrice) ? numericPrice : 0).toLocaleString('ja-JP')));

    var statusCell = document.createElement('td');
    statusCell.appendChild(adminRenderElement('span', statusText, 'status-badge ' + statusClass));
    if (k.isNew) statusCell.appendChild(adminRenderElement('span', ' NEW', '', {
      background: 'var(--mint)', color: 'white', fontSize: '10px', padding: '1px 6px', borderRadius: '4px'
    }));
    row.appendChild(statusCell);
    row.appendChild(adminRenderCell((k.papa || '--') + ' / ' + (k.mama || '--'), { fontSize: '12px', whiteSpace: 'nowrap' }));

    var actionsCell = document.createElement('td');
    var actions = adminRenderElement('div', undefined, 'action-btns');
    actions.appendChild(adminRenderButton(t('写真','照片') + (photoCount > 0 ? '(' + photoCount + ')' : ''), 'action-btn photo', function() {
      openPhotoModal('kitten', k.id);
    }));
    if (k.video) {
      var videoBadge = adminRenderElement('span', '▶YT', '', { color: '#c4302b', fontSize: '11px', fontWeight: '600' });
      videoBadge.title = t('YouTube動画あり','有YouTube视频');
      actions.appendChild(videoBadge);
    }
    actions.appendChild(adminRenderButton(t('編集','编辑'), 'action-btn edit', function() { editKitten(k.id); }));
    actions.appendChild(adminRenderButton(t('削除','删除'), 'action-btn delete', function() { deleteKitten(k.id); }));
    actionsCell.appendChild(actions);

    var quick = adminRenderElement('div', undefined, 'quick-actions', { marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' });
    var quickStyle = { fontSize: '10px', padding: '2px 6px', color: '#fff' };
    if (k.status !== 'sold') quick.appendChild(adminRenderButton(t('売約済','已售'), 'action-btn', function() { quickSetStatus(k.id, 'sold'); }, Object.assign({}, quickStyle, { background: '#FC8181' })));
    if (k.status !== 'reserved') quick.appendChild(adminRenderButton(t('商談','洽谈'), 'action-btn', function() { quickSetStatus(k.id, 'reserved'); }, Object.assign({}, quickStyle, { background: '#F6AD55' })));
    if (k.status !== 'available') quick.appendChild(adminRenderButton(t('販売中','在售'), 'action-btn', function() { quickSetStatus(k.id, 'available'); }, Object.assign({}, quickStyle, { background: '#68D391' })));
    quick.appendChild(adminRenderButton(t('価格変更','改价'), 'action-btn', function() { quickEditPrice(k.id); }, Object.assign({}, quickStyle, { background: 'var(--mint)' })));
    actionsCell.appendChild(quick);
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });

  renderPagination('kittenPagination', kittenPage, totalPages, function(p) { kittenPage = p; renderKittens(filter); });
}

document.getElementById('kittenFilterStatus').addEventListener('change', function() { kittenPage = 1; renderKittens(this.value); });

// Quick action: change kitten status without opening full form
function quickSetStatus(id, newStatus) {
  var kitten = data.kittens.find(function(k) { return k.id === id; });
  if (!kitten) return;
  var statusLabels = { available: t('販売中','在售'), reserved: t('商談中','洽谈中'), sold: t('ご家族決定','已售') };
  kitten.status = newStatus;
  addLog(t('子猫 ' + kitten.breederId + ' を「' + statusLabels[newStatus] + '」に変更しました','子猫 ' + kitten.breederId + ' 状态改为「' + statusLabels[newStatus] + '」'));
  saveAndPublishFromUI(data);
  renderAll();
}

// Quick action: edit kitten price inline
function quickEditPrice(id) {
  var kitten = data.kittens.find(function(k) { return k.id === id; });
  if (!kitten) return;
  var newPrice = prompt(t('新しい価格（税込）を入力してください：','请输入新价格（含税）：'), kitten.price);
  if (newPrice === null) return;
  newPrice = parseInt(newPrice);
  if (isNaN(newPrice) || newPrice <= 0) { showToast(t('正しい金額を入力してください','请输入正确金额'), 'error'); return; }
  kitten.price = newPrice;
  addLog(t('子猫 ' + kitten.breederId + ' の価格を ¥' + newPrice.toLocaleString() + ' に変更しました','子猫 ' + kitten.breederId + ' 价格改为 ¥' + newPrice.toLocaleString()));
  saveAndPublishFromUI(data);
  renderAll();
}

function openKittenForm(kitten) {
  document.getElementById('kittenEditId').value = kitten ? kitten.id : '';
  document.getElementById('kittenFormTitle').textContent = kitten ? t('子猫の編集','编辑子猫') : t('子猫の追加','添加子猫');
  document.getElementById('kf_breederId').value = kitten ? kitten.breederId : '';
  document.getElementById('kf_breed').value = kitten ? kitten.breed : 'サイベリアン';
  document.getElementById('kf_gender').value = kitten ? kitten.gender : '♂';
  document.getElementById('kf_color').value = kitten ? kitten.color : '';
  document.getElementById('kf_birthday').value = kitten ? kitten.birthday : '';
  document.getElementById('kf_price').value = kitten ? kitten.price : '';
  document.getElementById('kf_status').value = kitten ? kitten.status : 'available';
  document.getElementById('kf_isNew').value = kitten ? String(kitten.isNew) : 'true';
  document.getElementById('kf_note').value = kitten ? (kitten.note||'') : '';
  document.getElementById('kf_video').value = kitten ? (kitten.video||'') : '';

  var papas = data.parents.filter(function(p) { return p.gender === '♂'; });
  var mamas = data.parents.filter(function(p) { return p.gender === '♀'; });
  adminRenderPopulateParentSelect('kf_papa', papas, kitten && kitten.papa);
  adminRenderPopulateParentSelect('kf_mama', mamas, kitten && kitten.mama);

  openModal('kittenFormModal');
}

function editKitten(id) {
  var kitten = data.kittens.find(function(k) { return k.id === id; });
  if (kitten) openKittenForm(kitten);
}

function saveKitten() {
  var editId = document.getElementById('kittenEditId').value;
  var obj = {
    breederId: document.getElementById('kf_breederId').value.trim(),
    breed: document.getElementById('kf_breed').value,
    gender: document.getElementById('kf_gender').value,
    color: document.getElementById('kf_color').value.trim(),
    birthday: document.getElementById('kf_birthday').value,
    price: parseInt(document.getElementById('kf_price').value) || 0,
    status: document.getElementById('kf_status').value,
    isNew: document.getElementById('kf_isNew').value === 'true',
    papa: document.getElementById('kf_papa').value,
    mama: document.getElementById('kf_mama').value,
    note: document.getElementById('kf_note').value.trim(),
    video: document.getElementById('kf_video').value.trim(),
  };

  if (!obj.breederId && !obj.color) { showToast(t('ブリーダーIDまたはカラーを入力してください','请输入繁殖者ID或毛色'), 'error'); return; }

  if (editId) {
    var idx = data.kittens.findIndex(function(k) { return k.id === editId; });
    if (idx >= 0) { Object.assign(data.kittens[idx], obj); addLog(t('子猫 ' + obj.breederId + ' を編集しました','编辑了子猫 ' + obj.breederId)); }
  } else {
    obj.id = 'k' + Date.now();
    obj.group = '';
    obj.photos = [];
    obj.coverIndex = 0;
    if (!obj.video) obj.video = '';
    data.kittens.push(obj);
    addLog(t('子猫 ' + obj.breederId + ' を追加しました','添加了子猫 ' + obj.breederId));
  }
  saveAndPublishFromUI(data);
  closeModal('kittenFormModal');
  renderAll();
}

function deleteKitten(id) {
  var k = data.kittens.find(function(x) { return x.id === id; });
  if (!k) return;
  if (!confirm(t('子猫 ' + k.breederId + ' を削除しますか？','确定删除子猫 ' + k.breederId + '？'))) return;
  data.kittens = data.kittens.filter(function(x) { return x.id !== id; });
  saveAndPublishFromUI(data, function() {
    addLog(t('子猫 ' + k.breederId + ' を削除しました','删除了子猫 ' + k.breederId));
    showToast(t('削除しました','已删除'), 'success');
  });
  renderAll();
}

// Parents CRUD
function renderParents(filter) {
  filter = filter || document.getElementById('parentFilterBreed').value;
  var items = data.parents;
  if (filter === 'siberian') items = items.filter(function(p) { return p.breed === 'サイベリアン'; });
  else if (filter === 'british') items = items.filter(function(p) { return adminRenderText(p && p.breed).indexOf('ブリティッシュ') >= 0; });
  else if (filter === 'ragdoll') items = items.filter(function(p) { return p.breed === 'ラグドール'; });

  var totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (parentPage > totalPages) parentPage = totalPages;
  var start = (parentPage - 1) * PAGE_SIZE;
  var pageItems = items.slice(start, start + PAGE_SIZE);

  var tbody = document.getElementById('parentsTableBody');
  adminRenderClear(tbody);
  pageItems.forEach(function(p) {
    if (!p || typeof p !== 'object') return;
    var cover = getCoverPhoto(p);
    var photoCount = Array.isArray(p.photos) ? p.photos.length : 0;
    var roleClass = p.role === 'パパ猫' ? 'badge-available' : 'badge-reserved';
    var row = document.createElement('tr');
    row.appendChild(adminRenderPhotoCell('parent', p.id, cover, '🐈'));
    var nameCell = document.createElement('td');
    nameCell.appendChild(adminRenderElement('strong', p.name));
    row.appendChild(nameCell);
    row.appendChild(adminRenderCell(p.breed));
    row.appendChild(adminRenderCell(p.gender));
    row.appendChild(adminRenderCell(p.color));
    row.appendChild(adminRenderCell(p.age));
    var roleCell = document.createElement('td');
    roleCell.appendChild(adminRenderElement('span', p.role, 'status-badge ' + roleClass));
    row.appendChild(roleCell);
    var testedCell = document.createElement('td');
    testedCell.appendChild(adminRenderElement('span', p.tested ? '✓ ' + t('検査済','已检测') : t('未検査','未检测'), '', {
      color: p.tested ? 'var(--success)' : 'var(--text-light)', fontWeight: p.tested ? '600' : ''
    }));
    row.appendChild(testedCell);
    var actionsCell = document.createElement('td');
    var actions = adminRenderElement('div', undefined, 'action-btns');
    actions.appendChild(adminRenderButton(t('写真','照片') + (photoCount > 0 ? '(' + photoCount + ')' : ''), 'action-btn photo', function() { openPhotoModal('parent', p.id); }));
    actions.appendChild(adminRenderButton(t('編集','编辑'), 'action-btn edit', function() { editParent(p.id); }));
    actions.appendChild(adminRenderButton(t('削除','删除'), 'action-btn delete', function() { deleteParent(p.id); }));
    actionsCell.appendChild(actions);
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });

  renderPagination('parentPagination', parentPage, totalPages, function(p) { parentPage = p; renderParents(filter); });
}

document.getElementById('parentFilterBreed').addEventListener('change', function() { parentPage = 1; renderParents(this.value); });

function openParentForm(parent) {
  document.getElementById('parentEditId').value = parent ? parent.id : '';
  document.getElementById('parentFormTitle').textContent = parent ? t('親猫の編集','编辑种猫') : t('親猫の追加','添加种猫');
  document.getElementById('pf_name').value = parent ? parent.name : '';
  document.getElementById('pf_breed').value = parent ? parent.breed : 'サイベリアン';
  document.getElementById('pf_gender').value = parent ? parent.gender : '♂';
  document.getElementById('pf_color').value = parent ? parent.color : '';
  document.getElementById('pf_age').value = parent ? parent.age : '';
  document.getElementById('pf_role').value = parent ? parent.role : 'パパ猫';
  document.getElementById('pf_tested').value = parent ? String(parent.tested) : 'true';
  document.getElementById('pf_group').value = parent ? parent.group : 'c995680';
  openModal('parentFormModal');
}

function editParent(id) {
  var parent = data.parents.find(function(p) { return p.id === id; });
  if (parent) openParentForm(parent);
}

function saveParent() {
  var editId = document.getElementById('parentEditId').value;
  var obj = {
    name: document.getElementById('pf_name').value.trim(),
    breed: document.getElementById('pf_breed').value,
    gender: document.getElementById('pf_gender').value,
    color: document.getElementById('pf_color').value.trim(),
    age: document.getElementById('pf_age').value.trim(),
    role: document.getElementById('pf_role').value,
    tested: document.getElementById('pf_tested').value === 'true',
    group: document.getElementById('pf_group').value,
  };
  if (!obj.name) { showToast(t('名前を入力してください','请输入名字'), 'error'); return; }

  if (editId) {
    var idx = data.parents.findIndex(function(p) { return p.id === editId; });
    if (idx >= 0) { Object.assign(data.parents[idx], obj); addLog(t('親猫 ' + obj.name + ' を編集しました','编辑了种猫 ' + obj.name)); }
  } else {
    obj.id = 'p' + Date.now();
    obj.photos = [];
    obj.coverIndex = 0;
    data.parents.push(obj);
    addLog(t('親猫 ' + obj.name + ' を追加しました','添加了种猫 ' + obj.name));
  }
  saveAndPublishFromUI(data);
  closeModal('parentFormModal');
  renderAll();
}

function deleteParent(id) {
  var p = data.parents.find(function(x) { return x.id === id; });
  if (!p) return;
  if (!confirm(t('親猫 ' + p.name + ' を削除しますか？','确定删除种猫 ' + p.name + '？'))) return;
  data.parents = data.parents.filter(function(x) { return x.id !== id; });
  saveAndPublishFromUI(data, function() {
    addLog(t('親猫 ' + p.name + ' を削除しました','删除了种猫 ' + p.name));
    showToast(t('削除しました','已删除'), 'success');
  });
  renderAll();
}

// Reviews CRUD
function renderReviews() {
  var tbody = document.getElementById('reviewsTableBody');
  adminRenderClear(tbody);
  (Array.isArray(data.reviews) ? data.reviews : []).forEach(function(r) {
    if (!r || typeof r !== 'object') return;
    var body = adminRenderText(r.body);
    var excerpt = body.length > 50 ? body.substring(0, 50) + '...' : body;
    var row = document.createElement('tr');
    var authorCell = document.createElement('td');
    authorCell.appendChild(adminRenderElement('strong', r.author));
    row.appendChild(authorCell);
    row.appendChild(adminRenderCell(r.region));
    row.appendChild(adminRenderCell(r.date));
    row.appendChild(adminRenderCell(excerpt, { maxWidth: '300px' }));
    var actionsCell = document.createElement('td');
    var actions = adminRenderElement('div', undefined, 'action-btns');
    actions.appendChild(adminRenderButton(t('編集','编辑'), 'action-btn edit', function() { editReview(r.id); }));
    actions.appendChild(adminRenderButton(t('削除','删除'), 'action-btn delete', function() { deleteReview(r.id); }));
    actionsCell.appendChild(actions);
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });
}

function openReviewForm(review) {
  document.getElementById('reviewEditId').value = review ? review.id : '';
  document.getElementById('reviewFormTitle').textContent = review ? t('レビューの編集','编辑评价') : t('レビューの追加','添加评价');
  document.getElementById('rf_author').value = review ? review.author : '';
  document.getElementById('rf_region').value = review ? review.region : '';
  document.getElementById('rf_date').value = review ? review.date : '';
  document.getElementById('rf_body').value = review ? review.body : '';
  openModal('reviewFormModal');
}

function editReview(id) {
  var review = data.reviews.find(function(r) { return r.id === id; });
  if (review) openReviewForm(review);
}

function saveReview() {
  var editId = document.getElementById('reviewEditId').value;
  var obj = {
    author: document.getElementById('rf_author').value.trim(),
    region: document.getElementById('rf_region').value.trim(),
    date: document.getElementById('rf_date').value.trim(),
    body: document.getElementById('rf_body').value.trim(),
  };
  if (!obj.author || !obj.body) { showToast(t('お名前と本文を入力してください','请输入姓名和正文'), 'error'); return; }

  if (editId) {
    var idx = data.reviews.findIndex(function(r) { return r.id === editId; });
    if (idx >= 0) { Object.assign(data.reviews[idx], obj); addLog(t('レビュー ' + obj.author + ' を編集しました','编辑了评价 ' + obj.author)); }
  } else {
    obj.id = 'r' + Date.now();
    data.reviews.push(obj);
    addLog(t('レビュー ' + obj.author + ' を追加しました','添加了评价 ' + obj.author));
  }
  saveAndPublishFromUI(data);
  closeModal('reviewFormModal');
  renderAll();
}

function deleteReview(id) {
  var r = data.reviews.find(function(x) { return x.id === id; });
  if (!r) return;
  if (!confirm(t('レビュー ' + r.author + ' を削除しますか？','确定删除评价 ' + r.author + '？'))) return;
  data.reviews = data.reviews.filter(function(x) { return x.id !== id; });
  saveAndPublishFromUI(data, function() {
    addLog(t('レビュー ' + r.author + ' を削除しました','删除了评价 ' + r.author));
    showToast(t('削除しました','已删除'), 'success');
  });
  renderAll();
}
