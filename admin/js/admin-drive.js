// admin-drive.js — Drive photos panel
// Depends on: admin-core.js (DRIVE_API, getSessionPass, showToast), admin-images.js (admLang)

var DRIVE_KITTENS_FOLDER = '1bQKvwvfa3jHIuKGzR9nvvZIKB6z5-kF4';
var DRIVE_PARENTS_FOLDER = '1GlqXIGEEzupIQ0WHmN4tOvlvCPE7uNuX';
var driveSubfoldersCache = {};
// Tracks which Drive image URLs are currently checked in the photo modal.
var driveImportSelected = {};

function driveAdminText(value) {
  return value === null || value === undefined ? '' : String(value);
}

function clearDriveAdminNode(node) {
  if (!node) return;
  node.textContent = '';
  if (typeof node.replaceChildren === 'function') node.replaceChildren();
}

function driveAdminNode(tagName, text, className, styles) {
  var node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = driveAdminText(text);
  Object.keys(styles || {}).forEach(function(property) { node.style[property] = styles[property]; });
  return node;
}

function driveAdminMessage(text, options) {
  options = options || {};
  return driveAdminNode('div', text, options.className || '', {
    textAlign: 'center',
    padding: options.padding || '20px',
    color: options.color || 'var(--text-light)',
    background: options.background || '',
    borderRadius: options.borderRadius || ''
  });
}

function driveAdminJson(response) {
  if (!response || typeof response.json !== 'function') throw new Error('Invalid Drive response');
  if (response.ok === false) throw new Error('Drive request failed');
  return response.json();
}

function driveAdminPathSegment(value) {
  return encodeURIComponent(driveAdminText(value));
}

function loadDrivePhotosForItem(type, item) {
  var section = document.getElementById('drivePhotoSection');
  var grid = document.getElementById('drivePhotoGrid');
  var status = document.getElementById('drivePhotoStatus');
  if (!section || !grid || !item) { section && (section.style.display = 'none'); return Promise.resolve(false); }

  var folderName = '';
  var parentFolderId = '';
  if (type === 'kitten') {
    folderName = driveAdminText(item.breederId).trim();
    parentFolderId = DRIVE_KITTENS_FOLDER;
  } else {
    folderName = driveAdminText(item.name).trim();
    parentFolderId = DRIVE_PARENTS_FOLDER;
  }

  if (!folderName || !parentFolderId) {
    section.style.display = 'none';
    return Promise.resolve(false);
  }

  section.style.display = 'block';
  // Reset selection state every time the modal opens; hide any leftover import bar.
  driveImportSelected = {};
  removeDriveImportBar();
  clearDriveAdminNode(grid);
  grid.appendChild(driveAdminMessage('⏳ ' + (admLang === 'zh' ? '加载Drive照片...' : 'Drive写真を読み込み中...'), { padding: '24px' }));
  status.textContent = '';

  var cacheKey = 'sub_' + parentFolderId;
  var p = driveSubfoldersCache[cacheKey]
    ? Promise.resolve(driveSubfoldersCache[cacheKey])
    : fetch(DRIVE_API + '/api/drive/folders/' + driveAdminPathSegment(parentFolderId)).then(driveAdminJson).then(function(folders) { driveSubfoldersCache[cacheKey] = folders; return folders; });

  return p.then(function(folders) {
    if (!Array.isArray(folders)) { throw new Error('Invalid response'); }
    var match = folders.find(function(f) { return f && driveAdminText(f.name) === folderName; });
    if (!match) {
      section.style.display = 'block';
      clearDriveAdminNode(grid);
      var missing = driveAdminMessage(
        '📁 ' + (admLang === 'zh' ? 'Drive中未找到文件夹「' + folderName + '」' : 'Driveにフォルダ「' + folderName + '」が見つかりません'),
        { background: 'var(--bg)', borderRadius: '8px' }
      );
      missing.appendChild(driveAdminNode('small', admLang === 'zh' ? '请在Google Drive的对应目录下创建此文件夹' : 'Google Driveの該当フォルダの下にこのフォルダを作成してください', '', {
        marginTop: '4px', display: 'block'
      }));
      grid.appendChild(missing);
      status.textContent = '❌ ' + (admLang === 'zh' ? '未关联' : '未連携');
      status.style.color = 'var(--danger-dark)';
      return false;
    }

    var folderId = driveAdminText(match.id).trim();
    if (!folderId) throw new Error('Invalid Drive folder id');

    return fetch(DRIVE_API + '/api/drive/images/' + driveAdminPathSegment(folderId)).then(driveAdminJson).then(function(images) {
      if (!Array.isArray(images) || images.length === 0) {
        clearDriveAdminNode(grid);
        grid.appendChild(driveAdminMessage('📷 ' + (admLang === 'zh' ? '文件夹存在但没有照片' : 'フォルダはありますが写真がありません'), {
          background: 'var(--bg)', borderRadius: '8px'
        }));
        status.textContent = '⬜ 0 ' + (admLang === 'zh' ? '张' : '枚');
        status.style.color = 'var(--text-light)';
        return false;
      }

      var validImages = images.filter(function(image) {
        return image && typeof image === 'object' && driveAdminText(image.id).trim();
      });
      status.textContent = '✅ ' + validImages.length + (admLang === 'zh' ? ' 张照片' : ' 枚');
      status.style.color = 'var(--mint-dark)';
      clearDriveAdminNode(grid);
      validImages.forEach(function(img, idx) {
        var imgUrl = DRIVE_API + '/api/drive/img/' + driveAdminPathSegment(img.id);
        // Skip URLs already in the album so staff can't double-import.
        var alreadyImported = (item.photos || []).indexOf(imgUrl) >= 0;
        var card = driveAdminNode('div', undefined, '', {
          position: 'relative', borderRadius: '8px', overflow: 'hidden', aspectRatio: '1',
          background: 'var(--bg)', border: idx === 0 ? '3px solid var(--mint)' : '1px solid var(--border)'
        });
        var image = driveAdminNode('img', undefined, '', { width: '100%', height: '100%', objectFit: 'cover' });
        image.src = imgUrl;
        image.alt = '';
        image.loading = 'lazy';
        card.appendChild(image);

        var label = driveAdminNode('label', undefined, '', {
          position: 'absolute', top: '6px', left: '6px', background: 'rgba(255,255,255,0.92)',
          borderRadius: '6px', padding: '3px 6px', display: 'inline-flex', alignItems: 'center',
          gap: '4px', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit'
        });
        var checkbox = driveAdminNode('input', undefined, 'drive-import-check', { cursor: 'pointer', margin: '0' });
        checkbox.type = 'checkbox';
        checkbox.disabled = alreadyImported;
        checkbox.setAttribute('data-url', imgUrl);
        checkbox.addEventListener('change', function() { toggleDriveImportSelection(checkbox); });
        label.appendChild(checkbox);
        label.appendChild(driveAdminNode('span', alreadyImported ? '✓' : (admLang === 'zh' ? '选' : '選'), '', {
          color: alreadyImported ? 'var(--mint-dark)' : ''
        }));
        card.appendChild(label);

        card.appendChild(driveAdminNode('div', (idx === 0 ? '📌 ' : '') + driveAdminText(img.name), '', {
          position: 'absolute', bottom: '0', left: '0', right: '0', padding: '4px 6px',
          background: 'linear-gradient(transparent,' + (idx === 0 ? 'rgba(125,211,192,0.85)' : 'rgba(0,0,0,0.55)') + ')',
          color: 'white', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }));
        grid.appendChild(card);
      });

      // Inject the import-bar below the grid (only when there is at least one importable image).
      renderDriveImportBar(validImages.length);
      return true;
    });
  }).catch(function(e) {
    clearDriveAdminNode(grid);
    grid.appendChild(driveAdminMessage('❌ ' + driveAdminText(e && e.message), { color: 'var(--danger-dark)' }));
    status.textContent = '❌ Error';
    status.style.color = 'var(--danger-dark)';
    return false;
  });
}

function loadDriveStatus() {
  var area = document.getElementById('driveStatusArea');
  var btn = document.getElementById('driveRefreshBtn');
  if (!area) return Promise.resolve(false);
  btn && (btn.disabled = true);
  clearDriveAdminNode(area);
  var loading = driveAdminNode('div', undefined, 'settings-card', { textAlign: 'center', padding: '32px' });
  loading.appendChild(driveAdminNode('p', '⏳', '', { fontSize: '24px' }));
  loading.appendChild(driveAdminNode('p', admLang === 'zh' ? '加载中...' : '読み込み中...'));
  area.appendChild(loading);

  var pass = getSessionPass();
  return fetch(DRIVE_API + '/api/admin/drive/status', { headers: { 'Authorization': 'Bearer ' + pass } })
    .then(driveAdminJson)
    .then(function(data) {
      clearDriveAdminNode(area);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid Drive status response');
      if (data.error) {
        area.appendChild(driveAdminNode('div', '❌ ' + driveAdminText(data.error), 'settings-card', { color: 'var(--danger-dark)', padding: '24px' }));
        return false;
      }
      var categoryLabels = { kittens: '🐱 ' + (admLang === 'zh' ? '子猫 (kittens)' : '子猫 (kittens)'), parents: '🐈 ' + (admLang === 'zh' ? '种猫 (parents)' : '親猫 (parents)'), gallery: '📸 ' + (admLang === 'zh' ? '毕业猫 (gallery)' : '卒業猫 (gallery)') };
      Object.keys(data).forEach(function(cat) {
        var info = data[cat] && typeof data[cat] === 'object' ? data[cat] : {};
        var subs = Array.isArray(info.subfolders) ? info.subfolders : [];
        var category = driveAdminNode('div', undefined, 'data-table', { marginBottom: '16px' });
        var header = driveAdminNode('div', undefined, 'table-header');
        var title = driveAdminNode('h3', categoryLabels[cat] || cat, 'table-title');
        title.appendChild(driveAdminNode('span', ' — ' + subs.length + (admLang === 'zh' ? ' 个文件夹' : ' フォルダ'), '', {
          fontWeight: '400', fontSize: '13px', color: 'var(--text-light)'
        }));
        header.appendChild(title);
        category.appendChild(header);
        if (subs.length === 0) {
          category.appendChild(driveAdminNode('div', admLang === 'zh' ? '暂无文件夹' : 'フォルダなし', '', {
            padding: '24px', color: 'var(--text-light)', textAlign: 'center'
          }));
        } else {
          var list = driveAdminNode('div', undefined, '', { padding: '8px 16px' });
          subs.forEach(function(sub) {
            if (!sub || typeof sub !== 'object') return;
            var imageCount = Number(sub.imageCount);
            imageCount = Number.isFinite(imageCount) && imageCount > 0 ? Math.floor(imageCount) : 0;
            var hasImages = imageCount > 0;
            var statusIcon = hasImages ? '✅' : '⬜';
            var row = driveAdminNode('div', undefined, '', {
              display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 8px',
              borderBottom: '1px solid var(--border)', flexWrap: 'wrap'
            });
            row.appendChild(driveAdminNode('span', statusIcon, '', { fontSize: '16px' }));
            row.appendChild(driveAdminNode('span', sub.name, '', { fontWeight: '600', minWidth: '140px' }));
            row.appendChild(driveAdminNode('span', imageCount + (admLang === 'zh' ? ' 张照片' : ' 枚'), '', {
              fontSize: '13px', color: hasImages ? 'var(--mint-dark)' : 'var(--text-light)', fontWeight: '600'
            }));
            if (hasImages) {
              var images = driveAdminNode('div', undefined, '', { display: 'flex', gap: '4px', flexWrap: 'wrap', marginLeft: 'auto' });
              (Array.isArray(sub.images) ? sub.images : []).forEach(function(img, idx) {
                var chip = driveAdminNode('span', (idx === 0 ? '📌 ' : '') + driveAdminText(img && img.name), '', {
                  fontSize: '11px', background: idx === 0 ? 'var(--mint-light)' : 'var(--bg-light)',
                  padding: '2px 8px', borderRadius: '4px', color: idx === 0 ? 'var(--mint-dark)' : 'var(--text-light)'
                });
                chip.title = idx === 0 ? (admLang === 'zh' ? '封面图' : 'カバー写真') : '';
                images.appendChild(chip);
              });
              row.appendChild(images);
            }
            list.appendChild(row);
          });
          category.appendChild(list);
        }
        area.appendChild(category);
      });
      return true;
    })
    .catch(function(e) {
      clearDriveAdminNode(area);
      area.appendChild(driveAdminNode('div', '❌ ' + (admLang === 'zh' ? '连接失败: ' : '接続エラー: ') + driveAdminText(e && e.message), 'settings-card', {
        color: 'var(--danger-dark)', padding: '24px'
      }));
      return false;
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
    btn.textContent = count === 0
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
  var button = driveAdminNode('button', '📥 ' + (admLang === 'zh' ? '导入到相册' : '選択した写真をアルバムに追加'), 'btn-save', {
    padding: '10px 18px', fontSize: '13px', fontWeight: '600'
  });
  button.id = 'drivePhotoImportBtn';
  button.type = 'button';
  button.disabled = true;
  button.addEventListener('click', importSelectedDrivePhotos);
  bar.appendChild(button);
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
