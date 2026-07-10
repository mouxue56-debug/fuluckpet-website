// admin-photos.js — Photo gallery modal
// Depends on: admin-core.js (data, saveData, etc.), admin-images.js (t, admLang)

function adminPhotoText(value) {
  return value === null || value === undefined ? '' : String(value);
}

function adminPhotoSafeUrl(value) {
  var url = adminPhotoText(value).trim();
  if (/^https:\/\/[^\s\u0000-\u001f\u007f]+$/i.test(url)) return url;
  if (/^\/(?!\/)/.test(url) && !/[\\\u0000-\u001f\u007f]/.test(url)) return url;
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(url)) return url;
  return '';
}

function clearAdminPhotoNode(node) {
  if (!node) return;
  node.textContent = '';
  if (typeof node.replaceChildren === 'function') node.replaceChildren();
}

function adminPhotoButton(label, className, handler) {
  var button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function openPhotoModal(type, id) {
  if (type === 'small-animal' && typeof openSmallAnimalPhotoModal === 'function') {
    return openSmallAnimalPhotoModal(id);
  }
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
  clearAdminPhotoNode(grid);
  if (!item || !item.photos || item.photos.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'gallery-empty';
    var emptyTitle = document.createElement('span');
    emptyTitle.textContent = '📷 ' + t('写真がありません','没有照片');
    empty.appendChild(emptyTitle);
    empty.appendChild(document.createElement('br'));
    var emptyHint = document.createElement('small');
    emptyHint.textContent = t('下のフォームからURLを追加してください','请在下方表单添加URL');
    empty.appendChild(emptyHint);
    grid.appendChild(empty);
    return;
  }
  var coverIdx = item.coverIndex || 0;
  item.photos.forEach(function(url, i) {
    var isCover = i === coverIdx;
    var card = document.createElement('div');
    card.className = 'gallery-item' + (isCover ? ' cover' : '');
    var safeUrl = adminPhotoSafeUrl(url);
    if (safeUrl) {
      var image = document.createElement('img');
      image.src = safeUrl;
      image.alt = t('写真 ', '照片 ') + (i + 1);
      card.appendChild(image);
    } else {
      var unsafe = document.createElement('div');
      unsafe.className = 'gallery-empty';
      unsafe.textContent = t('安全でない画像URL', '不安全的图片URL');
      card.appendChild(unsafe);
    }
    if (isCover) {
      var label = document.createElement('span');
      label.className = 'gallery-label';
      label.textContent = t('カバー','封面');
      card.appendChild(label);
    }
    var deleteButton = adminPhotoButton('✕', 'gallery-delete', function() { deleteGalleryPhoto(i); });
    deleteButton.title = t('削除','删除');
    card.appendChild(deleteButton);
    if (!isCover) {
      card.appendChild(adminPhotoButton('★ ' + t('カバーに設定','设为封面'), 'gallery-cover-btn', function() { setGalleryCover(i); }));
    }
    grid.appendChild(card);
  });
}

function addGalleryPhoto() {
  var type = document.getElementById('photo_type').value;
  if (type === 'small-animal' && typeof smallAnimalAddGalleryPhoto === 'function') {
    return smallAnimalAddGalleryPhoto();
  }
  var url = document.getElementById('newPhotoUrl').value.trim();
  if (!url) { showToast(t('URLを入力してください','请输入URL'), 'error'); return; }
  var safeUrl = adminPhotoSafeUrl(url);
  if (!safeUrl) { showToast(t('HTTPSまたはサイト内の画像URLを入力してください','请输入HTTPS或站内图片URL'), 'error'); return; }

  var id = document.getElementById('photo_id').value;
  var item;
  if (type === 'kitten') item = data.kittens.find(function(x) { return x.id === id; });
  else item = data.parents.find(function(x) { return x.id === id; });

  if (!item) return;
  if (!item.photos) item.photos = [];
  item.photos.push(safeUrl);
  if (item.photos.length === 1) item.coverIndex = 0;

  saveAndPublishFromUI(data);
  renderGalleryGrid(item);
  renderAll();
  document.getElementById('newPhotoUrl').value = '';
  addLog(t((type === 'kitten' ? '子猫 ' + item.breederId : '親猫 ' + item.name) + ' に写真を追加しました', (type === 'kitten' ? '给子猫 ' + item.breederId : '给种猫 ' + item.name) + ' 添加了照片'));
}

function deleteGalleryPhoto(index) {
  var type = document.getElementById('photo_type').value;
  if (type === 'small-animal' && typeof smallAnimalDeleteGalleryPhoto === 'function') {
    return smallAnimalDeleteGalleryPhoto(index);
  }
  var id = document.getElementById('photo_id').value;
  var item;
  if (type === 'kitten') item = data.kittens.find(function(x) { return x.id === id; });
  else item = data.parents.find(function(x) { return x.id === id; });

  if (!item || !item.photos) return;
  if (!confirm(t('この写真を削除しますか？','确定删除这张照片？'))) return;

  item.photos.splice(index, 1);
  if (item.coverIndex >= item.photos.length) item.coverIndex = Math.max(0, item.photos.length - 1);

  saveAndPublishFromUI(data);
  renderGalleryGrid(item);
  renderAll();
  addLog(t((type === 'kitten' ? '子猫 ' + item.breederId : '親猫 ' + item.name) + ' の写真を削除しました', (type === 'kitten' ? '删除了子猫 ' + item.breederId : '删除了种猫 ' + item.name) + ' 的照片'));
}

// Upload photos directly from device camera/gallery
function uploadPhotosFromDevice() {
  var type = document.getElementById('photo_type').value;
  if (type === 'small-animal' && typeof smallAnimalUploadPhotosFromDevice === 'function') {
    return smallAnimalUploadPhotosFromDevice();
  }
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
            var safeUploadedUrl = adminPhotoSafeUrl(res.url);
            if (!safeUploadedUrl) throw new Error(t('アップロード先URLが安全ではありません','上传返回了不安全的图片URL'));
            item.photos.push(safeUploadedUrl);
            if (item.photos.length === 1) item.coverIndex = 0;
          }
        });
      });
    })(files[i]);
  }

  chain.then(function() {
    saveAndPublishFromUI(data);
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
  if (type === 'small-animal' && typeof smallAnimalSetGalleryCover === 'function') {
    return smallAnimalSetGalleryCover(index);
  }
  var id = document.getElementById('photo_id').value;
  var item;
  if (type === 'kitten') item = data.kittens.find(function(x) { return x.id === id; });
  else item = data.parents.find(function(x) { return x.id === id; });

  if (!item) return;
  item.coverIndex = index;

  saveAndPublishFromUI(data);
  renderGalleryGrid(item);
  renderAll();
  addLog(t((type === 'kitten' ? '子猫 ' + item.breederId : '親猫 ' + item.name) + ' のカバー写真を変更しました', (type === 'kitten' ? '更改了子猫 ' + item.breederId : '更改了种猫 ' + item.name) + ' 的封面照片'));
}
