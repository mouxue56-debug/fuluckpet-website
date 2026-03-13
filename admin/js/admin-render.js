// admin-render.js — renderAll, syncFromAPI, dashboard, kittens/parents/reviews CRUD
// Depends on: admin-images.js (t, admLang), admin-core.js (data, saveData, etc.)

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
  if (typeof FuluckAPI === 'undefined') return;

  var syncIndicator = document.getElementById('syncStatus');
  if (syncIndicator) {
    syncIndicator.textContent = t('☁️ 読み込み中...','☁️ 加载中...');
    syncIndicator.className = 'sync-status syncing';
  }

  Promise.all([
    FuluckAPI.get('/api/kittens').catch(function() { return null; }),
    FuluckAPI.get('/api/parents').catch(function() { return null; }),
    FuluckAPI.get('/api/reviews').catch(function() { return null; })
  ]).then(function(results) {
    var kv_kittens = results[0];
    var kv_parents = results[1];
    var kv_reviews = results[2];
    var changed = false;

    // Smart merge: API is source of truth, but preserve local-only fields
    if (kv_kittens && kv_kittens.length > 0) {
      data.kittens = kv_kittens;
      changed = true;
    }
    if (kv_parents && kv_parents.length > 0) {
      data.parents = kv_parents;
      changed = true;
    }
    if (kv_reviews && kv_reviews.length > 0) {
      data.reviews = kv_reviews;
      changed = true;
    }

    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      renderDashboard();
      renderKittens();
      renderParents();
      renderReviews();
    }

    if (syncIndicator) {
      syncIndicator.textContent = t('☁️ 同期済み','☁️ 已同步');
      syncIndicator.className = 'sync-status synced';
      setTimeout(function() { syncIndicator.className = 'sync-status'; }, 3000);
    }
  }).catch(function() {
    if (syncIndicator) {
      syncIndicator.textContent = t('⚠️ オフラインモード','⚠️ 离线模式');
      syncIndicator.className = 'sync-status sync-error';
    }
  });
}

// Dashboard
function renderDashboard() {
  var k = data.kittens;
  var avail = k.filter(function(x) { return x.status === 'available'; }).length;
  var reserved = k.filter(function(x) { return x.status === 'reserved'; }).length;
  var sold = k.filter(function(x) { return x.status === 'sold'; }).length;
  document.getElementById('statKittens').textContent = k.length;
  document.getElementById('statParents').textContent = data.parents.length;
  document.getElementById('statReviews').textContent = data.reviews.length;
  document.getElementById('statAvailable').textContent = avail;

  document.getElementById('dashboardSummary').innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">' +
    '<div style="text-align:center;padding:20px;background:#C6F6D5;border-radius:8px;"><div style="font-size:24px;font-weight:700;color:#22543D;">' + avail + '</div><div style="font-size:12px;color:#22543D;">' + t('販売中','在售') + '</div></div>' +
    '<div style="text-align:center;padding:20px;background:#FEFCBF;border-radius:8px;"><div style="font-size:24px;font-weight:700;color:#744210;">' + reserved + '</div><div style="font-size:12px;color:#744210;">' + t('商談中','洽谈中') + '</div></div>' +
    '<div style="text-align:center;padding:20px;background:#FED7E2;border-radius:8px;"><div style="font-size:24px;font-weight:700;color:#702459;">' + sold + '</div><div style="font-size:12px;color:#702459;">' + t('ご家族決定','已找到家庭') + '</div></div>' +
    '</div>';

  try {
    var logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    document.getElementById('changeLog').innerHTML = logs.length ? logs.slice(0, 10).map(function(l) {
      return '<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;"><span style="color:var(--text-light);margin-right:12px;">' + l.time + '</span>' + l.msg + '</div>';
    }).join('') : '<p style="color:var(--text-light);font-size:13px">' + t('まだ変更履歴はありません','暂无修改记录') + '</p>';
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
  tbody.innerHTML = pageItems.map(function(k) {
    var cover = getCoverPhoto(k);
    var photoCount = (k.photos || []).length;
    var statusClass = k.status === 'available' ? 'badge-available' : k.status === 'reserved' ? 'badge-reserved' : 'badge-sold';
    var statusText = k.status === 'available' ? t('販売中','在售') : k.status === 'reserved' ? t('商談中','洽谈中') : t('ご家族決定','已找到家庭');
    var genderDisplay = k.gender === '♂' ? t('♂ 男の子','♂ 公') : t('♀ 女の子','♀ 母');
    var birthdayDisplay = k.birthday ? k.birthday.replace('-', '年') + '月' : '--';
    return '<tr>' +
      '<td class="thumb-cell">' + (cover ? '<img src="' + cover + '" class="thumb-img" onclick="openPhotoModal(\'kitten\',\'' + k.id + '\')" title="クリックで写真管理">' : '<div class="thumb-placeholder" onclick="openPhotoModal(\'kitten\',\'' + k.id + '\')" style="cursor:pointer;" title="クリックで写真追加">🐱</div>') + '</td>' +
      '<td>' + (k.breederId || '--') + '</td>' +
      '<td>' + k.breed + '</td>' +
      '<td>' + genderDisplay + '</td>' +
      '<td style="max-width:150px;">' + k.color + '</td>' +
      '<td>' + birthdayDisplay + '</td>' +
      '<td>¥' + (k.price||0).toLocaleString() + '</td>' +
      '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span>' + (k.isNew ? ' <span style="background:var(--mint);color:white;font-size:10px;padding:1px 6px;border-radius:4px;">NEW</span>' : '') + '</td>' +
      '<td style="font-size:12px;white-space:nowrap;">' + (k.papa||'--') + ' / ' + (k.mama||'--') + '</td>' +
      '<td><div class="action-btns">' +
        '<button class="action-btn photo" onclick="openPhotoModal(\'kitten\',\'' + k.id + '\')">' + t('写真','照片') + (photoCount > 0 ? '(' + photoCount + ')' : '') + '</button>' +
        (k.video ? '<span style="color:#c4302b;font-size:11px;font-weight:600;" title="' + t('YouTube動画あり','有YouTube视频') + '">▶YT</span>' : '') +
        '<button class="action-btn edit" onclick="editKitten(\'' + k.id + '\')">' + t('編集','编辑') + '</button>' +
        '<button class="action-btn delete" onclick="deleteKitten(\'' + k.id + '\')">' + t('削除','删除') + '</button>' +
      '</div>' +
      '<div class="quick-actions" style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">' +
        (k.status !== 'sold' ? '<button class="action-btn" style="font-size:10px;padding:2px 6px;background:#FC8181;color:#fff;" onclick="quickSetStatus(\'' + k.id + '\',\'sold\')">' + t('売約済','已售') + '</button>' : '') +
        (k.status !== 'reserved' ? '<button class="action-btn" style="font-size:10px;padding:2px 6px;background:#F6AD55;color:#fff;" onclick="quickSetStatus(\'' + k.id + '\',\'reserved\')">' + t('商談','洽谈') + '</button>' : '') +
        (k.status !== 'available' ? '<button class="action-btn" style="font-size:10px;padding:2px 6px;background:#68D391;color:#fff;" onclick="quickSetStatus(\'' + k.id + '\',\'available\')">' + t('販売中','在售') + '</button>' : '') +
        '<button class="action-btn" style="font-size:10px;padding:2px 6px;background:var(--mint);color:#fff;" onclick="quickEditPrice(\'' + k.id + '\')">' + t('価格変更','改价') + '</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');

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
  saveAndPublish(data);
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
  saveAndPublish(data);
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
  document.getElementById('kf_papa').innerHTML = '<option value="">-- 選択 --</option>' + papas.map(function(p) { return '<option value="' + p.name + '"' + (kitten && kitten.papa === p.name ? ' selected' : '') + '>' + p.name + '</option>'; }).join('');
  document.getElementById('kf_mama').innerHTML = '<option value="">-- 選択 --</option>' + mamas.map(function(p) { return '<option value="' + p.name + '"' + (kitten && kitten.mama === p.name ? ' selected' : '') + '>' + p.name + '</option>'; }).join('');

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
  saveAndPublish(data);
  closeModal('kittenFormModal');
  renderAll();
}

function deleteKitten(id) {
  var k = data.kittens.find(function(x) { return x.id === id; });
  if (!k) return;
  if (!confirm(t('子猫 ' + k.breederId + ' を削除しますか？','确定删除子猫 ' + k.breederId + '？'))) return;
  data.kittens = data.kittens.filter(function(x) { return x.id !== id; });
  saveAndPublish(data);
  addLog(t('子猫 ' + k.breederId + ' を削除しました','删除了子猫 ' + k.breederId));
  renderAll();
  showToast(t('削除しました','已删除'), 'success');
}

// Parents CRUD
function renderParents(filter) {
  filter = filter || document.getElementById('parentFilterBreed').value;
  var items = data.parents;
  if (filter === 'siberian') items = items.filter(function(p) { return p.breed === 'サイベリアン'; });
  else if (filter === 'british') items = items.filter(function(p) { return p.breed.indexOf('ブリティッシュ') >= 0; });
  else if (filter === 'ragdoll') items = items.filter(function(p) { return p.breed === 'ラグドール'; });

  var totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (parentPage > totalPages) parentPage = totalPages;
  var start = (parentPage - 1) * PAGE_SIZE;
  var pageItems = items.slice(start, start + PAGE_SIZE);

  var tbody = document.getElementById('parentsTableBody');
  tbody.innerHTML = pageItems.map(function(p) {
    var cover = getCoverPhoto(p);
    var photoCount = (p.photos || []).length;
    var roleClass = p.role === 'パパ猫' ? 'badge-available' : 'badge-reserved';
    return '<tr>' +
      '<td class="thumb-cell">' + (cover ? '<img src="' + cover + '" class="thumb-img" onclick="openPhotoModal(\'parent\',\'' + p.id + '\')" title="クリックで写真管理">' : '<div class="thumb-placeholder" onclick="openPhotoModal(\'parent\',\'' + p.id + '\')" style="cursor:pointer;">🐈</div>') + '</td>' +
      '<td><strong>' + p.name + '</strong></td>' +
      '<td>' + p.breed + '</td>' +
      '<td>' + p.gender + '</td>' +
      '<td>' + p.color + '</td>' +
      '<td>' + p.age + '</td>' +
      '<td><span class="status-badge ' + roleClass + '">' + p.role + '</span></td>' +
      '<td>' + (p.tested ? '<span style="color:var(--success);font-weight:600;">✓ ' + t('検査済','已检测') + '</span>' : '<span style="color:var(--text-light);">' + t('未検査','未检测') + '</span>') + '</td>' +
      '<td><div class="action-btns">' +
        '<button class="action-btn photo" onclick="openPhotoModal(\'parent\',\'' + p.id + '\')">' + t('写真','照片') + (photoCount > 0 ? '(' + photoCount + ')' : '') + '</button>' +
        '<button class="action-btn edit" onclick="editParent(\'' + p.id + '\')">' + t('編集','编辑') + '</button>' +
        '<button class="action-btn delete" onclick="deleteParent(\'' + p.id + '\')">' + t('削除','删除') + '</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');

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
  saveAndPublish(data);
  closeModal('parentFormModal');
  renderAll();
}

function deleteParent(id) {
  var p = data.parents.find(function(x) { return x.id === id; });
  if (!p) return;
  if (!confirm(t('親猫 ' + p.name + ' を削除しますか？','确定删除种猫 ' + p.name + '？'))) return;
  data.parents = data.parents.filter(function(x) { return x.id !== id; });
  saveAndPublish(data);
  addLog(t('親猫 ' + p.name + ' を削除しました','删除了种猫 ' + p.name));
  renderAll();
  showToast(t('削除しました','已删除'), 'success');
}

// Reviews CRUD
function renderReviews() {
  var tbody = document.getElementById('reviewsTableBody');
  tbody.innerHTML = data.reviews.map(function(r) {
    var excerpt = r.body.length > 50 ? r.body.substring(0, 50) + '...' : r.body;
    return '<tr>' +
      '<td><strong>' + r.author + '</strong></td>' +
      '<td>' + r.region + '</td>' +
      '<td>' + r.date + '</td>' +
      '<td style="max-width:300px;">' + excerpt + '</td>' +
      '<td><div class="action-btns">' +
        '<button class="action-btn edit" onclick="editReview(\'' + r.id + '\')">' + t('編集','编辑') + '</button>' +
        '<button class="action-btn delete" onclick="deleteReview(\'' + r.id + '\')">' + t('削除','删除') + '</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
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
  saveAndPublish(data);
  closeModal('reviewFormModal');
  renderAll();
}

function deleteReview(id) {
  var r = data.reviews.find(function(x) { return x.id === id; });
  if (!r) return;
  if (!confirm(t('レビュー ' + r.author + ' を削除しますか？','确定删除评价 ' + r.author + '？'))) return;
  data.reviews = data.reviews.filter(function(x) { return x.id !== id; });
  saveAndPublish(data);
  addLog(t('レビュー ' + r.author + ' を削除しました','删除了评价 ' + r.author));
  renderAll();
  showToast(t('削除しました','已删除'), 'success');
}
