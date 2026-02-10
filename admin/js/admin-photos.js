// admin-photos.js — Photo gallery modal
// Depends on: admin-core.js (data, saveData, etc.), admin-images.js (t, admLang)

function openPhotoModal(type, id) {
  document.getElementById('photo_type').value = type;
  document.getElementById('photo_id').value = id;
  document.getElementById('newPhotoUrl').value = '';

  var item;
  if (type === 'kitten') item = data.kittens.find(function(x) { return x.id === id; });
  else item = data.parents.find(function(x) { return x.id === id; });

  renderGalleryGrid(item);
  openModal('photoModal');

  loadDrivePhotosForItem(type, item);
}

function renderGalleryGrid(item) {
  var grid = document.getElementById('galleryGrid');
  if (!item || !item.photos || item.photos.length === 0) {
    grid.innerHTML = '<div class="gallery-empty">📷 ' + t('写真がありません','没有照片') + '<br><small>' + t('下のフォームからURLを追加してください','请在下方表单添加URL') + '</small></div>';
    return;
  }
  var coverIdx = item.coverIndex || 0;
  grid.innerHTML = item.photos.map(function(url, i) {
    var isCover = i === coverIdx;
    return '<div class="gallery-item' + (isCover ? ' cover' : '') + '">' +
      '<img src="' + url + '" alt="写真 ' + (i+1) + '">' +
      (isCover ? '<span class="gallery-label">' + t('カバー','封面') + '</span>' : '') +
      '<button class="gallery-delete" onclick="deleteGalleryPhoto(' + i + ')" title="' + t('削除','删除') + '">✕</button>' +
      (!isCover ? '<button class="gallery-cover-btn" onclick="setGalleryCover(' + i + ')">★ ' + t('カバーに設定','设为封面') + '</button>' : '') +
    '</div>';
  }).join('');
}

function addGalleryPhoto() {
  var url = document.getElementById('newPhotoUrl').value.trim();
  if (!url) { showToast(t('URLを入力してください','请输入URL'), 'error'); return; }

  var type = document.getElementById('photo_type').value;
  var id = document.getElementById('photo_id').value;
  var item;
  if (type === 'kitten') item = data.kittens.find(function(x) { return x.id === id; });
  else item = data.parents.find(function(x) { return x.id === id; });

  if (!item) return;
  if (!item.photos) item.photos = [];
  item.photos.push(url);
  if (item.photos.length === 1) item.coverIndex = 0;

  saveData(data);
  renderGalleryGrid(item);
  renderAll();
  document.getElementById('newPhotoUrl').value = '';
  addLog(t((type === 'kitten' ? '子猫 ' + item.breederId : '親猫 ' + item.name) + ' に写真を追加しました', (type === 'kitten' ? '给子猫 ' + item.breederId : '给种猫 ' + item.name) + ' 添加了照片'));
  showToast(t('写真を追加しました','已添加照片'), 'success');
}

function deleteGalleryPhoto(index) {
  var type = document.getElementById('photo_type').value;
  var id = document.getElementById('photo_id').value;
  var item;
  if (type === 'kitten') item = data.kittens.find(function(x) { return x.id === id; });
  else item = data.parents.find(function(x) { return x.id === id; });

  if (!item || !item.photos) return;
  if (!confirm(t('この写真を削除しますか？','确定删除这张照片？'))) return;

  item.photos.splice(index, 1);
  if (item.coverIndex >= item.photos.length) item.coverIndex = Math.max(0, item.photos.length - 1);

  saveData(data);
  renderGalleryGrid(item);
  renderAll();
  addLog(t((type === 'kitten' ? '子猫 ' + item.breederId : '親猫 ' + item.name) + ' の写真を削除しました', (type === 'kitten' ? '删除了子猫 ' + item.breederId : '删除了种猫 ' + item.name) + ' 的照片'));
  showToast(t('写真を削除しました','已删除照片'), 'success');
}

function setGalleryCover(index) {
  var type = document.getElementById('photo_type').value;
  var id = document.getElementById('photo_id').value;
  var item;
  if (type === 'kitten') item = data.kittens.find(function(x) { return x.id === id; });
  else item = data.parents.find(function(x) { return x.id === id; });

  if (!item) return;
  item.coverIndex = index;

  saveData(data);
  renderGalleryGrid(item);
  renderAll();
  addLog(t((type === 'kitten' ? '子猫 ' + item.breederId : '親猫 ' + item.name) + ' のカバー写真を変更しました', (type === 'kitten' ? '更改了子猫 ' + item.breederId : '更改了种猫 ' + item.name) + ' 的封面照片'));
  showToast(t('カバー写真を変更しました','已更改封面照片'), 'success');
}
