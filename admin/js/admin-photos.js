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

  saveAndPublish(data);
  renderGalleryGrid(item);
  renderAll();
  document.getElementById('newPhotoUrl').value = '';
  addLog(t((type === 'kitten' ? '子猫 ' + item.breederId : '親猫 ' + item.name) + ' に写真を追加しました', (type === 'kitten' ? '给子猫 ' + item.breederId : '给种猫 ' + item.name) + ' 添加了照片'));
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

  saveAndPublish(data);
  renderGalleryGrid(item);
  renderAll();
  addLog(t((type === 'kitten' ? '子猫 ' + item.breederId : '親猫 ' + item.name) + ' の写真を削除しました', (type === 'kitten' ? '删除了子猫 ' + item.breederId : '删除了种猫 ' + item.name) + ' 的照片'));
}

// Upload photos directly from device camera/gallery
function uploadPhotosFromDevice() {
  var fileInput = document.getElementById('photoUploadInput');
  var files = fileInput.files;
  if (!files || files.length === 0) {
    showToast(t('写真を選択してください','请选择照片'), 'error');
    return;
  }
  if (typeof FuluckAPI === 'undefined' || typeof FuluckAPI.uploadFile !== 'function') {
    showToast(t('アップロード機能が利用できません','上传功能不可用'), 'error');
    return;
  }

  var type = document.getElementById('photo_type').value;
  var id = document.getElementById('photo_id').value;
  var item;
  if (type === 'kitten') item = data.kittens.find(function(x) { return x.id === id; });
  else item = data.parents.find(function(x) { return x.id === id; });
  if (!item) return;
  if (!item.photos) item.photos = [];

  var btn = document.getElementById('uploadPhotoBtn');
  var origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = t('⏳ アップロード中... (0/' + files.length + ')','⏳ 上传中... (0/' + files.length + ')');

  var uploaded = 0;
  var total = files.length;
  var chain = Promise.resolve();

  for (var i = 0; i < total; i++) {
    (function(file) {
      chain = chain.then(function() {
        return FuluckAPI.uploadFile(file).then(function(res) {
          uploaded++;
          btn.innerHTML = t('⏳ アップロード中... (' + uploaded + '/' + total + ')','⏳ 上传中... (' + uploaded + '/' + total + ')');
          if (res && res.url) {
            item.photos.push(res.url);
            if (item.photos.length === 1) item.coverIndex = 0;
          }
        });
      });
    })(files[i]);
  }

  chain.then(function() {
    saveAndPublish(data);
    renderGalleryGrid(item);
    renderAll();
    fileInput.value = '';
    btn.disabled = false;
    btn.innerHTML = origHTML;
    addLog(t(
      (type === 'kitten' ? '子猫 ' + item.breederId : '親猫 ' + item.name) + ' に ' + uploaded + ' 枚の写真をアップロードしました',
      (type === 'kitten' ? '给子猫 ' + item.breederId : '给种猫 ' + item.name) + ' 上传了 ' + uploaded + ' 张照片'
    ));
    showToast(t(uploaded + '枚アップロード完了！', uploaded + '张上传完成！'), 'success');
  }).catch(function(err) {
    btn.disabled = false;
    btn.innerHTML = origHTML;
    showToast(t('アップロード失敗: ','上传失败: ') + err.message, 'error');
  });
}

function setGalleryCover(index) {
  var type = document.getElementById('photo_type').value;
  var id = document.getElementById('photo_id').value;
  var item;
  if (type === 'kitten') item = data.kittens.find(function(x) { return x.id === id; });
  else item = data.parents.find(function(x) { return x.id === id; });

  if (!item) return;
  item.coverIndex = index;

  saveAndPublish(data);
  renderGalleryGrid(item);
  renderAll();
  addLog(t((type === 'kitten' ? '子猫 ' + item.breederId : '親猫 ' + item.name) + ' のカバー写真を変更しました', (type === 'kitten' ? '更改了子猫 ' + item.breederId : '更改了种猫 ' + item.name) + ' 的封面照片'));
}
