// admin-drive.js — Drive photos panel
// Depends on: admin-core.js (DRIVE_API, getSessionPass, showToast), admin-images.js (admLang)

var DRIVE_KITTENS_FOLDER = '1bQKvwvfa3jHIuKGzR9nvvZIKB6z5-kF4';
var DRIVE_PARENTS_FOLDER = '1GlqXIGEEzupIQ0WHmN4tOvlvCPE7uNuX';
var driveSubfoldersCache = {};

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
        return '<div style="position:relative;border-radius:8px;overflow:hidden;aspect-ratio:1;background:var(--bg);border:' + (idx === 0 ? '3px solid var(--mint)' : '1px solid var(--border)') + ';">' +
          '<img src="' + imgUrl + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">' +
          '<div style="position:absolute;bottom:0;left:0;right:0;padding:4px 6px;background:linear-gradient(transparent,' + (idx === 0 ? 'rgba(125,211,192,0.85)' : 'rgba(0,0,0,0.55)') + ');color:white;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            (idx === 0 ? '📌 ' : '') + img.name +
          '</div>' +
        '</div>';
      }).join('');
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
