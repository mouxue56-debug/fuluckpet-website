// admin-small-animals.js — fail-closed small-animal catalogue management
// Depends on: api-client.js (FuluckAPI), admin-core.js (modal/toast/log), admin-images.js (t)

var smallAnimals = [];
var smallAnimalsRemoteReady = false;
var smallAnimalMutationInFlight = false;
var smallAnimalLoadInFlight = false;
var smallAnimalLoadPromise = null;

function cloneSmallAnimalValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function isSmallAnimalRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateSmallAnimalCollection(items) {
  if (!Array.isArray(items)) return false;
  var seen = Object.create(null);
  return items.every(function(item) {
    if (!isSmallAnimalRecord(item)) return false;
    var breederId = typeof item.breederId === 'string' ? item.breederId.trim() : '';
    if (!breederId || seen[breederId] || item.species !== 'rabbit') return false;
    seen[breederId] = true;
    if ('papa' in item || 'mama' in item) return false;
    if (item.photos !== undefined && (!Array.isArray(item.photos) || !item.photos.every(function(url) { return typeof url === 'string'; }))) return false;
    return true;
  });
}

function smallAnimalText(value) {
  return value === null || value === undefined ? '' : String(value);
}

function escapeSmallAnimalLogText(value) {
  return smallAnimalText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeSmallAnimalPhotoUrl(value) {
  var url = smallAnimalText(value).trim();
  return /^https:\/\//i.test(url) || /^\/(?!\/)/.test(url);
}

function clearSmallAnimalNode(node) {
  if (!node) return;
  node.textContent = '';
  if (typeof node.replaceChildren === 'function') node.replaceChildren();
}

function smallAnimalCell(value, styles) {
  var cell = document.createElement('td');
  cell.textContent = smallAnimalText(value);
  Object.keys(styles || {}).forEach(function(property) { cell.style[property] = styles[property]; });
  return cell;
}

function smallAnimalButton(label, className, handler) {
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'action-btn ' + className;
  button.textContent = label;
  button.disabled = smallAnimalMutationInFlight || !smallAnimalsRemoteReady;
  button.addEventListener('click', handler);
  return button;
}

function smallAnimalStatusText(status) {
  if (status === 'available') return t('販売中', '在售');
  if (status === 'reserved') return t('商談中', '洽谈中');
  if (status === 'sold') return t('ご家族決定', '已找到家庭');
  return smallAnimalText(status) || '--';
}

function setSmallAnimalLoadStatus(message, failed) {
  var status = document.getElementById('smallAnimalLoadStatus');
  if (status) {
    status.textContent = message;
    status.style.color = failed ? 'var(--danger-dark)' : 'var(--text-light)';
  }
  var retry = document.getElementById('smallAnimalRetryBtn');
  if (retry) retry.style.display = failed ? 'inline-flex' : 'none';
}

function updateSmallAnimalControls() {
  var locked = !smallAnimalsRemoteReady || smallAnimalMutationInFlight || smallAnimalLoadInFlight;
  ['smallAnimalAddBtn', 'smallAnimalSaveBtn'].forEach(function(id) {
    var control = document.getElementById(id);
    if (control) control.disabled = locked;
  });
}

function renderSmallAnimals() {
  var tbody = document.getElementById('smallAnimalsTableBody');
  if (!tbody) return;
  clearSmallAnimalNode(tbody);

  if (!smallAnimalsRemoteReady) {
    var lockedRow = document.createElement('tr');
    var lockedCell = smallAnimalCell(
      smallAnimalLoadInFlight ? t('クラウドから読み込み中…', '正在从云端加载…') : t('読込に失敗したため編集をロックしています', '加载失败，编辑已锁定'),
      { textAlign: 'center', color: 'var(--text-light)', padding: '24px' }
    );
    lockedCell.colSpan = 8;
    lockedRow.appendChild(lockedCell);
    tbody.appendChild(lockedRow);
    updateSmallAnimalControls();
    return;
  }

  if (smallAnimals.length === 0) {
    var emptyRow = document.createElement('tr');
    var emptyCell = smallAnimalCell(t('小動物データはまだありません', '暂无小动物数据'), {
      textAlign: 'center', color: 'var(--text-light)', padding: '24px'
    });
    emptyCell.colSpan = 8;
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
    updateSmallAnimalControls();
    return;
  }

  smallAnimals.forEach(function(animal) {
    var breederId = animal.breederId;
    var row = document.createElement('tr');
    var photoCell = document.createElement('td');
    photoCell.className = 'thumb-cell';
    var photos = Array.isArray(animal.photos) ? animal.photos : [];
    var coverIndex = Number.isInteger(Number(animal.coverIndex)) ? Number(animal.coverIndex) : 0;
    var cover = photos[coverIndex] || photos[0] || '';
    if (isSafeSmallAnimalPhotoUrl(cover)) {
      var image = document.createElement('img');
      image.className = 'thumb-img';
      image.src = cover;
      image.alt = t('小動物の写真', '小动物照片');
      image.addEventListener('click', function() { openSmallAnimalPhotoModal(breederId); });
      photoCell.appendChild(image);
    } else {
      var placeholder = document.createElement('div');
      placeholder.className = 'thumb-placeholder';
      placeholder.textContent = '🐇';
      photoCell.appendChild(placeholder);
    }
    row.appendChild(photoCell);
    row.appendChild(smallAnimalCell(breederId || '--'));
    row.appendChild(smallAnimalCell([animal.species === 'rabbit' ? t('ウサギ', '兔') : animal.species, animal.breed].filter(Boolean).join(' / ') || '--'));
    row.appendChild(smallAnimalCell([animal.gender, animal.color].filter(Boolean).join(' / ') || '--'));
    row.appendChild(smallAnimalCell(animal.birthday || '--'));
    var numericPrice = Number(animal.price);
    row.appendChild(smallAnimalCell(animal.price !== '' && Number.isSafeInteger(numericPrice) && numericPrice > 0 ? '¥' + numericPrice.toLocaleString('ja-JP') : '--'));

    var statusCell = document.createElement('td');
    var badge = document.createElement('span');
    badge.className = 'status-badge ' + (animal.status === 'available' ? 'badge-available' : animal.status === 'reserved' ? 'badge-reserved' : 'badge-sold');
    badge.textContent = smallAnimalStatusText(animal.status);
    statusCell.appendChild(badge);
    if (animal.isNew) {
      var newBadge = document.createElement('span');
      newBadge.textContent = ' NEW';
      newBadge.style.color = 'var(--mint-dark)';
      statusCell.appendChild(newBadge);
    }
    row.appendChild(statusCell);

    var actionsCell = document.createElement('td');
    var actions = document.createElement('div');
    actions.className = 'action-btns';
    actions.appendChild(smallAnimalButton(t('写真', '照片') + (photos.length ? ' (' + photos.length + ')' : ''), 'photo', function() {
      openSmallAnimalPhotoModal(breederId);
    }));
    actions.appendChild(smallAnimalButton(t('編集', '编辑'), 'edit', function() {
      editSmallAnimal(breederId);
    }));
    actions.appendChild(smallAnimalButton(t('削除', '删除'), 'delete', function() {
      deleteSmallAnimal(breederId);
    }));
    actionsCell.appendChild(actions);
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });
  updateSmallAnimalControls();
}

function loadSmallAnimals() {
  if (smallAnimalMutationInFlight) {
    showToast(t('保存処理が完了してから再読込してください', '请等待保存完成后再加载'), 'error');
    return Promise.resolve(false);
  }
  if (smallAnimalLoadInFlight && smallAnimalLoadPromise) return smallAnimalLoadPromise;
  if (typeof FuluckAPI === 'undefined' || typeof FuluckAPI.get !== 'function') {
    smallAnimalsRemoteReady = false;
    setSmallAnimalLoadStatus(t('APIを利用できないため編集をロックしています', 'API不可用，编辑已锁定'), true);
    renderSmallAnimals();
    return Promise.resolve(false);
  }

  smallAnimalsRemoteReady = false;
  smallAnimalLoadInFlight = true;
  setSmallAnimalLoadStatus(t('クラウドから読み込み中…', '正在从云端加载…'), false);
  renderSmallAnimals();

  smallAnimalLoadPromise = Promise.resolve().then(function() {
    return FuluckAPI.get('/api/admin/small-animals');
  }).then(function(items) {
    if (!validateSmallAnimalCollection(items)) throw new Error('Invalid small-animal collection');
    smallAnimals = cloneSmallAnimalValue(items);
    smallAnimalsRemoteReady = true;
    setSmallAnimalLoadStatus(t('クラウド同期済み', '云端同步完成'), false);
    return true;
  }).catch(function(err) {
    smallAnimalsRemoteReady = false;
    console.error('Small-animal load failed:', err);
    setSmallAnimalLoadStatus(t('読込失敗・編集ロック中', '加载失败・编辑已锁定'), true);
    showToast(t('小動物データを読み込めなかったため編集を停止しました', '小动物数据加载失败，已停止编辑'), 'error');
    return false;
  }).finally(function() {
    smallAnimalLoadInFlight = false;
    smallAnimalLoadPromise = null;
    renderSmallAnimals();
  });
  return smallAnimalLoadPromise;
}

function smallAnimalRequireReady() {
  if (smallAnimalsRemoteReady && !smallAnimalLoadInFlight) return true;
  showToast(t('小動物のクラウド読込が完了するまで操作できません', '小动物云端加载完成前无法操作'), 'error');
  return false;
}

function smallAnimalBeginMutation() {
  if (!smallAnimalRequireReady()) return false;
  if (smallAnimalMutationInFlight) {
    showToast(t('保存処理が完了するまでお待ちください', '请等待保存完成'), 'error');
    return false;
  }
  smallAnimalMutationInFlight = true;
  updateSmallAnimalControls();
  renderSmallAnimals();
  return true;
}

function smallAnimalEndMutation() {
  smallAnimalMutationInFlight = false;
  renderSmallAnimals();
}

function lockSmallAnimalsAfterWriteFailure() {
  // A rejected request can be a response failure after KV already accepted the
  // write. Preserve the last rendered snapshot, but never allow another write
  // until an authenticated full read proves the current remote collection.
  smallAnimalsRemoteReady = false;
  setSmallAnimalLoadStatus(t('保存結果を確認できません・再読込が必要です', '无法确认保存结果・需要重新加载'), true);
}

function parseSmallAnimalPhotoLines(raw) {
  var photos = smallAnimalText(raw).split(/\r?\n/).map(function(line) { return line.trim(); }).filter(Boolean);
  if (!photos.every(isSafeSmallAnimalPhotoUrl)) throw new Error(t('写真URLは https:// または / で始めてください', '照片URL必须以 https:// 或 / 开头'));
  return photos;
}

function readSmallAnimalForm() {
  var breederId = document.getElementById('sa_breederId').value.trim();
  var species = document.getElementById('sa_species').value;
  if (!breederId) throw new Error(t('ブリーダーIDを入力してください', '请输入繁殖者ID'));
  if (breederId === 'bulk') throw new Error(t('bulk は予約済みIDのため使用できません', 'bulk 是保留ID，不能使用'));
  if (species !== 'rabbit') throw new Error(t('現在登録できる種別はウサギのみです', '目前只能登记兔子'));
  var status = document.getElementById('sa_status').value;
  if (['available', 'reserved', 'sold'].indexOf(status) < 0) throw new Error(t('ステータスが正しくありません', '状态无效'));
  var priceRaw = document.getElementById('sa_price').value.trim();
  var price = priceRaw === '' ? '' : Number(priceRaw);
  if (price !== '' && (!Number.isSafeInteger(price) || price <= 0)) throw new Error(t('価格は1円以上の整数で入力してください', '价格请输入大于0的整数'));
  var photos = parseSmallAnimalPhotoLines(document.getElementById('sa_photos').value);
  var coverNumber = parseInt(document.getElementById('sa_coverIndex').value, 10);
  if (!Number.isFinite(coverNumber) || coverNumber < 1) coverNumber = 1;
  var coverIndex = photos.length ? Math.min(coverNumber - 1, photos.length - 1) : 0;
  return {
    breederId: breederId,
    species: 'rabbit',
    breed: document.getElementById('sa_breed').value.trim(),
    color: document.getElementById('sa_color').value.trim(),
    gender: document.getElementById('sa_gender').value,
    price: price,
    status: status,
    birthday: document.getElementById('sa_birthday').value,
    photos: photos,
    coverIndex: coverIndex,
    video: document.getElementById('sa_video').value.trim(),
    note: document.getElementById('sa_note').value.trim(),
    isNew: document.getElementById('sa_isNew').value === 'true'
  };
}

function openSmallAnimalForm(animal) {
  if (!smallAnimalRequireReady() || smallAnimalMutationInFlight) return false;
  document.getElementById('smallAnimalEditId').value = animal ? animal.breederId : '';
  document.getElementById('smallAnimalFormTitle').textContent = animal ? t('小動物の編集', '编辑小动物') : t('小動物の追加', '添加小动物');
  document.getElementById('sa_breederId').value = animal ? animal.breederId : '';
  document.getElementById('sa_breederId').disabled = !!animal;
  document.getElementById('sa_species').value = 'rabbit';
  document.getElementById('sa_breed').value = animal ? smallAnimalText(animal.breed) : '';
  document.getElementById('sa_color').value = animal ? smallAnimalText(animal.color) : '';
  document.getElementById('sa_gender').value = animal ? smallAnimalText(animal.gender || 'unknown') : 'unknown';
  document.getElementById('sa_price').value = animal && animal.price !== undefined ? smallAnimalText(animal.price) : '';
  document.getElementById('sa_status').value = animal ? smallAnimalText(animal.status || 'available') : 'available';
  document.getElementById('sa_birthday').value = animal ? smallAnimalText(animal.birthday) : '';
  document.getElementById('sa_photos').value = animal && Array.isArray(animal.photos) ? animal.photos.join('\n') : '';
  document.getElementById('sa_coverIndex').value = animal && Array.isArray(animal.photos) && animal.photos.length ? String((Number(animal.coverIndex) || 0) + 1) : '1';
  document.getElementById('sa_video').value = animal ? smallAnimalText(animal.video) : '';
  document.getElementById('sa_note').value = animal ? smallAnimalText(animal.note) : '';
  document.getElementById('sa_isNew').value = animal ? String(animal.isNew === true) : 'true';
  openModal('smallAnimalFormModal');
  return true;
}

function editSmallAnimal(breederId) {
  var animal = smallAnimals.find(function(item) { return item.breederId === breederId; });
  return animal ? openSmallAnimalForm(animal) : false;
}

function saveSmallAnimal() {
  if (!smallAnimalRequireReady()) return Promise.resolve(false);
  var editId = document.getElementById('smallAnimalEditId').value;
  var payload;
  try {
    payload = readSmallAnimalForm();
  } catch (err) {
    showToast(err.message, 'error');
    return Promise.resolve(false);
  }
  var editIndex = editId ? smallAnimals.findIndex(function(item) { return item.breederId === editId; }) : -1;
  if (editId && editIndex < 0) {
    showToast(t('編集対象が見つかりません', '找不到编辑对象'), 'error');
    return Promise.resolve(false);
  }
  if (editId && payload.breederId !== editId) {
    showToast(t('ブリーダーIDは変更できません', '繁殖者ID不可修改'), 'error');
    return Promise.resolve(false);
  }
  if (!smallAnimalBeginMutation()) return Promise.resolve(false);

  return Promise.resolve().then(function() {
    return editId
      ? FuluckAPI.put('/api/admin/small-animals/' + encodeURIComponent(editId), payload)
      : FuluckAPI.post('/api/admin/small-animals', payload);
  }).then(function(saved) {
    if (!isSmallAnimalRecord(saved)) throw new Error('Invalid small-animal response');
    var candidate = editId ? Object.assign({}, smallAnimals[editIndex], payload, saved, { breederId: editId }) : saved;
    if (!validateSmallAnimalCollection([candidate])) throw new Error('Invalid small-animal response');
    candidate = cloneSmallAnimalValue(candidate);
    if (editId) {
      smallAnimals = smallAnimals.map(function(item, index) { return index === editIndex ? candidate : item; });
    } else {
      if (smallAnimals.some(function(item) { return item.breederId.trim() === candidate.breederId.trim(); })) throw new Error('Duplicate breederId response');
      smallAnimals = smallAnimals.concat([candidate]);
    }
    closeModal('smallAnimalFormModal');
    showToast(t('小動物データを保存しました', '已保存小动物数据'), 'success');
    var safeLogId = escapeSmallAnimalLogText(candidate.breederId);
    addLog(t('小動物 ' + safeLogId + ' を保存しました', '保存了小动物 ' + safeLogId));
    return true;
  }).catch(function(err) {
    lockSmallAnimalsAfterWriteFailure();
    showToast(t('保存失敗: ', '保存失败: ') + err.message, 'error');
    return false;
  }).finally(smallAnimalEndMutation);
}

function deleteSmallAnimal(breederId) {
  if (!smallAnimalRequireReady()) return Promise.resolve(false);
  var animal = smallAnimals.find(function(item) { return item.breederId === breederId; });
  if (!animal) return Promise.resolve(false);
  if (!confirm(t('小動物 ' + breederId + ' を削除しますか？', '确定删除小动物 ' + breederId + '？'))) return Promise.resolve(false);
  if (!smallAnimalBeginMutation()) return Promise.resolve(false);
  return Promise.resolve().then(function() {
    return FuluckAPI.del('/api/admin/small-animals/' + encodeURIComponent(breederId));
  }).then(function(response) {
    if (response && response.success === false) throw new Error('Delete rejected');
    smallAnimals = smallAnimals.filter(function(item) { return item.breederId !== breederId; });
    showToast(t('削除しました', '已删除'), 'success');
    var safeLogId = escapeSmallAnimalLogText(breederId);
    addLog(t('小動物 ' + safeLogId + ' を削除しました', '删除了小动物 ' + safeLogId));
    return true;
  }).catch(function(err) {
    lockSmallAnimalsAfterWriteFailure();
    showToast(t('削除失敗: ', '删除失败: ') + err.message, 'error');
    return false;
  }).finally(smallAnimalEndMutation);
}

function renderSmallAnimalGalleryGrid(animal) {
  var grid = document.getElementById('galleryGrid');
  if (!grid) return;
  clearSmallAnimalNode(grid);
  var photos = animal && Array.isArray(animal.photos) ? animal.photos : [];
  if (!photos.length) {
    var empty = document.createElement('div');
    empty.className = 'gallery-empty';
    empty.textContent = t('📷 写真がありません。下から追加してください', '📷 暂无照片，请从下方添加');
    grid.appendChild(empty);
    return;
  }
  var coverIndex = Number(animal.coverIndex) || 0;
  photos.forEach(function(url, index) {
    var item = document.createElement('div');
    item.className = 'gallery-item' + (index === coverIndex ? ' cover' : '');
    if (isSafeSmallAnimalPhotoUrl(url)) {
      var image = document.createElement('img');
      image.src = url;
      image.alt = t('写真 ', '照片 ') + (index + 1);
      item.appendChild(image);
    } else {
      var invalid = document.createElement('div');
      invalid.className = 'gallery-empty';
      invalid.textContent = t('安全でないURL', '不安全的URL');
      item.appendChild(invalid);
    }
    if (index === coverIndex) {
      var label = document.createElement('span');
      label.className = 'gallery-label';
      label.textContent = t('カバー', '封面');
      item.appendChild(label);
    }
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'gallery-delete';
    remove.textContent = '✕';
    remove.addEventListener('click', function() { smallAnimalDeleteGalleryPhoto(index); });
    item.appendChild(remove);
    if (index !== coverIndex) {
      var cover = document.createElement('button');
      cover.type = 'button';
      cover.className = 'gallery-cover-btn';
      cover.textContent = '★ ' + t('カバーに設定', '设为封面');
      cover.addEventListener('click', function() { smallAnimalSetGalleryCover(index); });
      item.appendChild(cover);
    }
    grid.appendChild(item);
  });
}

function openSmallAnimalPhotoModal(breederId) {
  if (!smallAnimalRequireReady() || smallAnimalMutationInFlight) return false;
  var animal = smallAnimals.find(function(item) { return item.breederId === breederId; });
  if (!animal) return false;
  document.getElementById('photo_type').value = 'small-animal';
  document.getElementById('photo_id').value = breederId;
  document.getElementById('newPhotoUrl').value = '';
  var driveSection = document.getElementById('drivePhotoSection');
  if (driveSection) driveSection.style.display = 'none';
  renderSmallAnimalGalleryGrid(animal);
  openModal('photoModal');
  return true;
}

function currentSmallAnimalPhotoItem() {
  var type = document.getElementById('photo_type').value;
  var breederId = document.getElementById('photo_id').value;
  if (type !== 'small-animal') return null;
  return smallAnimals.find(function(item) { return item.breederId === breederId; }) || null;
}

function saveSmallAnimalPhotos(animal, photos, coverIndex) {
  if (!smallAnimalBeginMutation()) return Promise.resolve(false);
  var patch = { photos: photos.slice(), coverIndex: coverIndex };
  return Promise.resolve().then(function() {
    return FuluckAPI.put('/api/admin/small-animals/' + encodeURIComponent(animal.breederId), patch);
  }).then(function(saved) {
    if (!isSmallAnimalRecord(saved)) throw new Error('Invalid small-animal response');
    var candidate = Object.assign({}, animal, patch, saved, { breederId: animal.breederId });
    if (!validateSmallAnimalCollection([candidate])) throw new Error('Invalid small-animal response');
    candidate = cloneSmallAnimalValue(candidate);
    smallAnimals = smallAnimals.map(function(item) { return item.breederId === animal.breederId ? candidate : item; });
    renderSmallAnimalGalleryGrid(candidate);
    return true;
  }).catch(function(err) {
    lockSmallAnimalsAfterWriteFailure();
    showToast(t('写真の保存失敗: ', '照片保存失败: ') + err.message, 'error');
    return false;
  }).finally(smallAnimalEndMutation);
}

function smallAnimalAddGalleryPhoto() {
  if (!smallAnimalRequireReady()) return Promise.resolve(false);
  var animal = currentSmallAnimalPhotoItem();
  if (!animal) return Promise.resolve(false);
  var url = document.getElementById('newPhotoUrl').value.trim();
  if (!url || !isSafeSmallAnimalPhotoUrl(url)) {
    showToast(t('安全な写真URLを入力してください', '请输入安全的照片URL'), 'error');
    return Promise.resolve(false);
  }
  var photos = (Array.isArray(animal.photos) ? animal.photos : []).concat([url]);
  return saveSmallAnimalPhotos(animal, photos, photos.length === 1 ? 0 : Number(animal.coverIndex) || 0).then(function(ok) {
    if (ok) document.getElementById('newPhotoUrl').value = '';
    return ok;
  });
}

function smallAnimalDeleteGalleryPhoto(index) {
  if (!smallAnimalRequireReady()) return Promise.resolve(false);
  var animal = currentSmallAnimalPhotoItem();
  if (!animal || !Array.isArray(animal.photos) || index < 0 || index >= animal.photos.length) return Promise.resolve(false);
  if (!confirm(t('この写真を削除しますか？', '确定删除这张照片？'))) return Promise.resolve(false);
  var photos = animal.photos.slice();
  photos.splice(index, 1);
  var oldCover = Number(animal.coverIndex) || 0;
  var coverIndex = oldCover > index ? oldCover - 1 : oldCover === index ? 0 : oldCover;
  if (coverIndex >= photos.length) coverIndex = Math.max(0, photos.length - 1);
  return saveSmallAnimalPhotos(animal, photos, coverIndex);
}

function smallAnimalSetGalleryCover(index) {
  if (!smallAnimalRequireReady()) return Promise.resolve(false);
  var animal = currentSmallAnimalPhotoItem();
  if (!animal || !Array.isArray(animal.photos) || index < 0 || index >= animal.photos.length) return Promise.resolve(false);
  return saveSmallAnimalPhotos(animal, animal.photos.slice(), index);
}

function isOwnedSmallAnimalUploadKey(key) {
  return typeof key === 'string' && /^small-animals\/[0-9]+-[0-9a-f]{8}\.(?:jpg|jpeg|png|webp|gif|mp4)$/.test(key);
}

function cleanupNewSmallAnimalUploads(keys) {
  if (!keys.length) return Promise.resolve(false);
  if (typeof FuluckAPI === 'undefined' || typeof FuluckAPI.deleteUpload !== 'function') {
    return Promise.resolve(true);
  }
  var cleanupFailed = false;
  return Promise.all(keys.map(function(key) {
    return Promise.resolve().then(function() {
      return FuluckAPI.deleteUpload(key);
    }).catch(function() {
      cleanupFailed = true;
    });
  })).then(function() { return cleanupFailed; });
}

function smallAnimalUploadPhotosFromDevice() {
  if (!smallAnimalRequireReady()) return Promise.resolve(false);
  var animal = currentSmallAnimalPhotoItem();
  var fileInput = document.getElementById('photoUploadInput');
  var files = fileInput && fileInput.files ? Array.prototype.slice.call(fileInput.files) : [];
  if (!animal || files.length === 0) {
    showToast(t('写真を選択してください', '请选择照片'), 'error');
    return Promise.resolve(false);
  }
  if (typeof FuluckAPI === 'undefined' || typeof FuluckAPI.uploadFile !== 'function') {
    showToast(t('アップロード機能が利用できません', '上传功能不可用'), 'error');
    return Promise.resolve(false);
  }
  if (!smallAnimalBeginMutation()) return Promise.resolve(false);

  var button = document.getElementById('uploadPhotoBtn');
  var originalHtml = button ? button.innerHTML : '';
  if (button) {
    button.disabled = true;
    button.textContent = t('アップロード中…', '上传中…');
  }
  var uploadedUrls = [];
  var uploadedKeys = [];
  var chain = Promise.resolve();
  files.forEach(function(file) {
    chain = chain.then(function() {
      return FuluckAPI.uploadFile(file, { prefix: 'small-animals' }).then(function(result) {
        if (result && isOwnedSmallAnimalUploadKey(result.key)) uploadedKeys.push(result.key);
        if (!result || !isSafeSmallAnimalPhotoUrl(result.url)) throw new Error('Invalid upload response');
        uploadedUrls.push(result.url);
      });
    });
  });

  return chain.then(function() {
    var photos = (Array.isArray(animal.photos) ? animal.photos : []).concat(uploadedUrls);
    var patch = { photos: photos, coverIndex: photos.length === uploadedUrls.length ? 0 : Number(animal.coverIndex) || 0 };
    return FuluckAPI.put('/api/admin/small-animals/' + encodeURIComponent(animal.breederId), patch).then(function(saved) {
      if (!isSmallAnimalRecord(saved)) throw new Error('Invalid small-animal response');
      var candidate = Object.assign({}, animal, patch, saved, { breederId: animal.breederId });
      if (!validateSmallAnimalCollection([candidate])) throw new Error('Invalid small-animal response');
      candidate = cloneSmallAnimalValue(candidate);
      smallAnimals = smallAnimals.map(function(item) { return item.breederId === animal.breederId ? candidate : item; });
      renderSmallAnimalGalleryGrid(candidate);
      fileInput.value = '';
      showToast(t(uploadedUrls.length + '枚アップロードしました', uploadedUrls.length + '张上传完成'), 'success');
      return true;
    });
  }).catch(function(err) {
    return cleanupNewSmallAnimalUploads(uploadedKeys).then(function(cleanupFailed) {
      lockSmallAnimalsAfterWriteFailure();
      var cleanupWarning = cleanupFailed
        ? t('（新規アップロードの自動削除にも失敗しました）', '（新上传文件的自动清理也失败了）')
        : '';
      showToast(t('アップロード失敗: ', '上传失败: ') + err.message + cleanupWarning, 'error');
      return false;
    });
  }).finally(function() {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
    smallAnimalEndMutation();
  });
}

if (typeof pageTitles !== 'undefined') pageTitles['small-animals'] = '小動物管理';
if (typeof pageTitlesZh !== 'undefined') pageTitlesZh['small-animals'] = '小动物管理';

(function wireSmallAnimalAdmin() {
  if (typeof document === 'undefined') return;
  var nav = typeof document.querySelector === 'function' ? document.querySelector('[data-page="small-animals"]') : null;
  if (nav) {
    nav.addEventListener('click', function() {
      var title = document.getElementById('pageTitle');
      if (title) title.textContent = t('小動物管理', '小动物管理');
      var globalAdd = document.getElementById('addNewBtn');
      if (globalAdd) {
        globalAdd.style.display = 'inline-flex';
      }
      loadSmallAnimals();
    });
  }
  var globalAdd = document.getElementById('addNewBtn');
  if (globalAdd) {
    globalAdd.addEventListener('click', function() {
      var active = typeof document.querySelector === 'function' ? document.querySelector('.nav-item.active') : null;
      if (active && active.dataset && active.dataset.page === 'small-animals') openSmallAnimalForm();
    });
  }
  renderSmallAnimals();
}());
