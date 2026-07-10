// admin-drive.js — Drive photos panel
// Depends on: admin-core.js (DRIVE_API, getSessionPass, showToast), admin-images.js (admLang)

var DRIVE_KITTENS_FOLDER = '1bQKvwvfa3jHIuKGzR9nvvZIKB6z5-kF4';
var DRIVE_PARENTS_FOLDER = '1GlqXIGEEzupIQ0WHmN4tOvlvCPE7uNuX';
var driveSubfoldersCache = {};
// Tracks which Drive image URLs are currently checked in the photo modal.
var driveImportSelected = {};

function loadDrivePhotosForItem(type, item) {
  var section = document.getElementById('drivePhotoSection');
  var grid = document.getElementById('drivePhotoGrid');
  var status = document.getElementById('drivePhotoStatus');
  if (!section || !grid || !item) { section && (section.style.display = 'none'); return; }

  var folderName = '';
  var parentFolderId = '';
  if (type === 'kitten') {
    folderName = item.breederId || '';
    parentFolderId = DRIVE_KITTENS_FOLDER;
  } else {
    folderName = item.name || '';
    parentFolderId = DRIVE_PARENTS_FOLDER;
  }

  if (!folderName || !parentFolderId) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  // Reset selection state every time the modal opens; hide any leftover import bar.
  driveImportSelected = {};
  removeDriveImportBar();
  grid.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-light);">⏳ ' + (admLang === 'zh' ? '加载Drive照片...' : 'Drive写真を読み込み中...') + '</div>';
  status.textContent = '';

  var cacheKey = 'sub_' + parentFolderId;
  var p = driveSubfoldersCache[cacheKey]
    ? Promise.resolve(driveSubfoldersCache[cacheKey])
    : fetch(DRIVE_API + '/api/drive/folders/' + parentFolderId).then(function(r) { return r.json(); }).then(function(folders) { driveSubfoldersCache[cacheKey] = folders; return folders; });

  p.then(function(folders) {
    if (!Array.isArray(folders)) { throw new Error('Invalid response'); }
    var match = folders.find(function(f) { return f.name === folderName; });
    if (!match) {
      section.style.display = 'block';
      grid.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);background:var(--bg);border-radius:8px;">📁 ' + (admLang === 'zh' ? 'Drive中未找到文件夹「' + folderName + '」' : 'Driveにフォルダ「' + folderName + '」が見つかりません') + '<br><small style="margin-top:4px;display:block;">' + (admLang === 'zh' ? '请在Google Drive的对应目录下创建此文件夹' : 'Google Driveの該当フォルダの下にこのフォルダを作成してください') + '</small></div>';
      status.textContent = '❌ ' + (admLang === 'zh' ? '未关联' : '未連携');
      status.style.color = 'var(--danger-dark)';
      return;
    }

    return fetch(DRIVE_API + '/api/drive/images/' + match.id).then(function(r) { return r.json(); }).then(function(images) {
      if (!Array.isArray(images) || images.length === 0) {
        grid.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);background:var(--bg);border-radius:8px;">📷 ' + (admLang === 'zh' ? '文件夹存在但没有照片' : 'フォルダはありますが写真がありません') + '</div>';
        status.textContent = '⬜ 0 ' + (admLang === 'zh' ? '张' : '枚');
        status.style.color = 'var(--text-light)';
        return;
      }

      status.textContent = '✅ ' + images.length + (admLang === 'zh' ? ' 张照片' : ' 枚');
      status.style.color = 'var(--mint-dark)';

      grid.innerHTML = images.map(function(img, idx) {
        var imgUrl = DRIVE_API + '/api/drive/img/' + img.id;
        // Skip URLs already in the album so staff can't double-import.
        var alreadyImported = (item.photos || []).indexOf(imgUrl) >= 0;
        var safeUrl = imgUrl.replace(/"/g, '&quot;');
        return '<div style="position:relative;border-radius:8px;overflow:hidden;aspect-ratio:1;background:var(--bg);border:' + (idx === 0 ? '3px solid var(--mint)' : '1px solid var(--border)') + ';">' +
          '<img src="' + imgUrl + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">' +
          // Checkbox overlay (top-left). Disabled if already imported.
          '<label style="position:absolute;top:6px;left:6px;background:rgba(255,255,255,0.92);border-radius:6px;padding:3px 6px;display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;font-family:inherit;">' +
            '<input type="checkbox" class="drive-import-check" data-url="' + safeUrl + '" onchange="toggleDriveImportSelection(this)"' + (alreadyImported ? ' disabled' : '') + ' style="cursor:pointer;margin:0;">' +
            (alreadyImported ? '<span style="color:var(--mint-dark);">✓</span>' : '<span>' + (admLang === 'zh' ? '选' : '選') + '</span>') +
          '</label>' +
          '<div style="position:absolute;bottom:0;left:0;right:0;padding:4px 6px;background:linear-gradient(transparent,' + (idx === 0 ? 'rgba(125,211,192,0.85)' : 'rgba(0,0,0,0.55)') + ');color:white;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            (idx === 0 ? '📌 ' : '') + img.name +
          '</div>' +
        '</div>';
      }).join('');

      // Inject the import-bar below the grid (only when there is at least one importable image).
      renderDriveImportBar(images.length);
    });
  }).catch(function(e) {
    grid.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger-dark);">❌ ' + e.message + '</div>';
    status.textContent = '❌ Error';
    status.style.color = 'var(--danger-dark)';
  });
}

function loadDriveStatus() {
  var area = document.getElementById('driveStatusArea');
  var btn = document.getElementById('driveRefreshBtn');
  if (!area) return;
  btn && (btn.disabled = true);
  area.innerHTML = '<div class="settings-card" style="text-align:center;padding:32px;"><p style="font-size:24px;">⏳</p><p>' + (admLang === 'zh' ? '加载中...' : '読み込み中...') + '</p></div>';

  var pass = getSessionPass();
  fetch(DRIVE_API + '/api/admin/drive/status', { headers: { 'Authorization': 'Bearer ' + pass } })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) { area.innerHTML = '<div class="settings-card" style="color:var(--danger-dark);padding:24px;">❌ ' + data.error + '</div>'; return; }
      var html = '';
      var categoryLabels = { kittens: '🐱 ' + (admLang === 'zh' ? '子猫 (kittens)' : '子猫 (kittens)'), parents: '🐈 ' + (admLang === 'zh' ? '种猫 (parents)' : '親猫 (parents)'), gallery: '📸 ' + (admLang === 'zh' ? '毕业猫 (gallery)' : '卒業猫 (gallery)') };
      Object.keys(data).forEach(function(cat) {
        var info = data[cat];
        var subs = info.subfolders || [];
        html += '<div class="data-table" style="margin-bottom:16px;">';
        html += '<div class="table-header"><h3 class="table-title">' + (categoryLabels[cat] || cat) + ' <span style="font-weight:400;font-size:13px;color:var(--text-light);">— ' + subs.length + (admLang === 'zh' ? ' 个文件夹' : ' フォルダ') + '</span></h3></div>';
        if (subs.length === 0) {
          html += '<div style="padding:24px;color:var(--text-light);text-align:center;">' + (admLang === 'zh' ? '暂无文件夹' : 'フォルダなし') + '</div>';
        } else {
          html += '<div style="padding:8px 16px;">';
          subs.forEach(function(sub) {
            var hasImages = sub.imageCount > 0;
            var statusIcon = hasImages ? '✅' : '⬜';
            html += '<div style="display:flex;align-items:center;gap:12px;padding:12px 8px;border-bottom:1px solid var(--border);flex-wrap:wrap;">';
            html += '<span style="font-size:16px;">' + statusIcon + '</span>';
            html += '<span style="font-weight:600;min-width:140px;">' + sub.name + '</span>';
            html += '<span style="font-size:13px;color:' + (hasImages ? 'var(--mint-dark)' : 'var(--text-light)') + ';font-weight:600;">' + sub.imageCount + (admLang === 'zh' ? ' 张照片' : ' 枚') + '</span>';
            if (hasImages) {
              html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-left:auto;">';
              sub.images.forEach(function(img, idx) {
                html += '<span style="font-size:11px;background:' + (idx === 0 ? 'var(--mint-light)' : 'var(--bg-light)') + ';padding:2px 8px;border-radius:4px;color:' + (idx === 0 ? 'var(--mint-dark)' : 'var(--text-light)') + ';" title="' + (idx === 0 ? (admLang === 'zh' ? '封面图' : 'カバー写真') : '') + '">' + (idx === 0 ? '📌 ' : '') + img.name + '</span>';
              });
              html += '</div>';
            }
            html += '</div>';
          });
          html += '</div>';
        }
        html += '</div>';
      });
      area.innerHTML = html;
    })
    .catch(function(e) {
      area.innerHTML = '<div class="settings-card" style="color:var(--danger-dark);padding:24px;">❌ ' + (admLang === 'zh' ? '连接失败: ' : '接続エラー: ') + e.message + '</div>';
    })
    .finally(function() { btn && (btn.disabled = false); });
}

// ----- Drive → album import (selection + button) -----

function toggleDriveImportSelection(cb) {
  var url = cb.getAttribute('data-url');
  if (!url) return;
  if (cb.checked) {
    driveImportSelected[url] = true;
  } else {
    delete driveImportSelected[url];
  }
  // Update button label/count.
  var btn = document.getElementById('drivePhotoImportBtn');
  if (btn) {
    var count = Object.keys(driveImportSelected).length;
    btn.disabled = count === 0;
    btn.innerHTML = count === 0
      ? '📥 ' + (admLang === 'zh' ? '导入到相册' : '選択した写真をアルバムに追加')
      : '📥 ' + (admLang === 'zh' ? ('导入到相册（' + count + '）') : ('選択した写真をアルバムに追加（' + count + '）'));
  }
}

function renderDriveImportBar(imageCount) {
  removeDriveImportBar();
  var section = document.getElementById('drivePhotoSection');
  var grid = document.getElementById('drivePhotoGrid');
  if (!section || !grid || imageCount <= 0) return;
  var bar = document.createElement('div');
  bar.id = 'drivePhotoImportBar';
  bar.style.cssText = 'margin-top:12px;display:flex;justify-content:flex-end;';
  bar.innerHTML = '<button id="drivePhotoImportBtn" disabled onclick="importSelectedDrivePhotos()" class="btn-save" style="padding:10px 18px;font-size:13px;font-weight:600;">' +
    '📥 ' + (admLang === 'zh' ? '导入到相册' : '選択した写真をアルバムに追加') +
    '</button>';
  // Insert immediately after the grid so it sits "below" the photos.
  grid.parentNode.insertBefore(bar, grid.nextSibling);
}

function removeDriveImportBar() {
  var existing = document.getElementById('drivePhotoImportBar');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
}

function importSelectedDrivePhotos() {
  var urls = Object.keys(driveImportSelected);
  if (urls.length === 0) return;

  var type = document.getElementById('photo_type').value;
  var id = document.getElementById('photo_id').value;
  var item;
  if (type === 'kitten') item = data.kittens.find(function(x) { return x.id === id; });
  else item = data.parents.find(function(x) { return x.id === id; });
  if (!item) return;

  // Mirror addGalleryPhoto in admin-photos.js: ensure photos[] exists,
  // push each URL (skip duplicates), init coverIndex when this is the first photo.
  if (!item.photos) item.photos = [];
  var added = 0;
  urls.forEach(function(url) {
    if (item.photos.indexOf(url) >= 0) return;
    item.photos.push(url);
    added++;
  });
  if (added > 0 && item.photos.length === added) item.coverIndex = 0;

  // Disable the button while saving.
  var btn = document.getElementById('drivePhotoImportBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + (admLang === 'zh' ? '导入中...' : '取り込み中...'); }

  saveAndPublishFromUI(data);

  // Re-render the manual gallery + master grid; clear selection + uncheck checkboxes.
  if (typeof renderGalleryGrid === 'function') renderGalleryGrid(item);
  if (typeof renderAll === 'function') renderAll();
  driveImportSelected = {};
  document.querySelectorAll('.drive-import-check').forEach(function(cb) { if (!cb.disabled) cb.checked = false; });

  // Re-load Drive section so already-imported items become disabled checkboxes.
  loadDrivePhotosForItem(type, item);

  showToast(
    (admLang === 'zh' ? ('已导入 ' + added + ' 张照片到相册') : (added + ' 枚をアルバムに取り込みました')),
    'success'
  );
  addLog(t(
    (type === 'kitten' ? '子猫 ' + item.breederId : '親猫 ' + item.name) + ' に Drive から ' + added + ' 枚を取り込みました',
    (type === 'kitten' ? '给子猫 ' + item.breederId : '给种猫 ' + item.name) + ' 从 Drive 导入了 ' + added + ' 张照片'
  ));
}

function clearDriveCache() {
  if (!confirm(admLang === 'zh' ? '确定要清除Drive缓存吗？\n清除后照片会在下次访问时重新从Drive加载。' : 'Driveキャッシュをクリアしますか？\nクリア後、次回アクセス時にDriveから再読み込みされます。')) return;
  var btn = document.getElementById('driveCacheClearBtn');
  btn && (btn.disabled = true);
  var pass = getSessionPass();
  fetch(DRIVE_API + '/api/admin/drive/refresh', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + pass, 'Content-Type': 'application/json' }
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.success) {
        showToast((admLang === 'zh' ? '缓存已清除 (' + d.cleared + ' 条)' : 'キャッシュクリア完了 (' + d.cleared + ' 件)'), 'success');
        loadDriveStatus();
      } else {
        showToast('❌ ' + (d.error || 'Error'), 'error');
      }
    })
    .catch(function(e) { showToast('❌ ' + e.message, 'error'); })
    .finally(function() { btn && (btn.disabled = false); });
}
