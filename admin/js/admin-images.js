// admin-images.js — Bilingual system + Image management
// Must load BEFORE admin-core.js (t() and admLang used everywhere)

var admLang = localStorage.getItem('fuluck-admin-lang') || 'ja';
var imgLang = admLang;

var IMAGE_FIELDS = [
  { id:'img-hero-main',   label:{ja:'Hero メイン写真',      zh:'首页主图'},          page:'index.html',    tag:'hero-main',  size:'800×600px' },
  { id:'img-gallery-1',   label:{ja:'卒業猫プレビュー ①',  zh:'毕业猫预览 ①'},     page:'index.html',    tag:'gallery-1',  size:'400×400px' },
  { id:'img-gallery-2',   label:{ja:'卒業猫プレビュー ②',  zh:'毕业猫预览 ②'},     page:'index.html',    tag:'gallery-2',  size:'400×400px' },
  { id:'img-gallery-3',   label:{ja:'卒業猫プレビュー ③',  zh:'毕业猫预览 ③'},     page:'index.html',    tag:'gallery-3',  size:'400×400px' },
  { id:'img-gallery-4',   label:{ja:'卒業猫プレビュー ④',  zh:'毕业猫预览 ④'},     page:'index.html',    tag:'gallery-4',  size:'400×400px' },
  { id:'img-insta-1',     label:{ja:'Instagram ①',          zh:'Instagram ①'},       page:'index.html',    tag:'insta-1',    size:'400×400px' },
  { id:'img-insta-2',     label:{ja:'Instagram ②',          zh:'Instagram ②'},       page:'index.html',    tag:'insta-2',    size:'400×400px' },
  { id:'img-insta-3',     label:{ja:'Instagram ③',          zh:'Instagram ③'},       page:'index.html',    tag:'insta-3',    size:'400×400px' },
  { id:'img-insta-4',     label:{ja:'Instagram ④',          zh:'Instagram ④'},       page:'index.html',    tag:'insta-4',    size:'400×400px' },
  { id:'img-sib-main',    label:{ja:'サイベリアン メイン',   zh:'西伯利亚猫主图'},    page:'siberian.html', tag:'sib-main',   size:'600×800px' },
  { id:'img-sib-group',   label:{ja:'サイベリアン 集合写真', zh:'西伯利亚猫合照'},    page:'siberian.html', tag:'sib-group',  size:'800×450px' },
  { id:'img-review-1',    label:{ja:'レビュー①（羅方遠）',  zh:'评价截图①（罗方远）'},page:'reviews.html', tag:'review-1',   size:'390×844px' },
  { id:'img-review-2',    label:{ja:'レビュー②（刘暁棉）',  zh:'评价截图②（刘晓棉）'},page:'reviews.html', tag:'review-2',   size:'390×844px' },
  { id:'img-award-1',     label:{ja:'受賞バッジ①',          zh:'获奖徽章①'},         page:'about.html',    tag:'award-1',    size:'300×200px' },
  { id:'img-award-2',     label:{ja:'受賞バッジ②',          zh:'获奖徽章②'},         page:'about.html',    tag:'award-2',    size:'300×200px' },
  { id:'img-award-3',     label:{ja:'評価バッジ',            zh:'评分徽章'},           page:'about.html',    tag:'award-3',    size:'300×200px' },
  { id:'img-genetic',     label:{ja:'遺伝子検査証明',        zh:'基因检测证明'},       page:'about.html',    tag:'genetic',    size:'800×450px' },
  { id:'img-ogp',         label:{ja:'OGP画像',               zh:'OGP图片'},            page:'全ページ',      tag:'ogp',        size:'1200×630px' }
];

function toggleAdminLang() {
  admLang = admLang === 'ja' ? 'zh' : 'ja';
  imgLang = admLang;
  localStorage.setItem('fuluck-admin-lang', admLang);
  applyAdminLang();
  showToast(admLang === 'zh' ? '已切换到中文' : '日本語に切り替えました', 'success');
}

function toggleImgLang() { toggleAdminLang(); }

function toggleLoginLang() {
  admLang = admLang === 'ja' ? 'zh' : 'ja';
  imgLang = admLang;
  localStorage.setItem('fuluck-admin-lang', admLang);
  var t = document.getElementById('loginTitle');
  var s = document.getElementById('loginSub');
  var b = document.getElementById('loginBtn');
  var e = document.getElementById('loginError');
  if (t) t.textContent = admLang === 'zh' ? '福楽猫舍 管理后台' : '福楽キャッテリー 管理画面';
  if (s) s.textContent = admLang === 'zh' ? '请输入密码登录' : 'パスワードを入力してログインしてください';
  if (b) b.textContent = admLang === 'zh' ? '登录' : 'ログイン';
  if (e) e.textContent = admLang === 'zh' ? '密码不正确' : 'パスワードが正しくありません';
  var pwd = document.getElementById('loginPassword');
  if (pwd) pwd.placeholder = admLang === 'zh' ? '密码' : 'パスワード';
}

function applyAdminLang() {
  document.querySelectorAll('[data-adm-ja]').forEach(function(el) {
    var newText = admLang === 'zh' ? el.getAttribute('data-adm-zh') : el.getAttribute('data-adm-ja');
    if (!newText) return;
    if ((el.innerHTML||'').indexOf('<') >= 0 && (el.getAttribute('data-adm-zh')||'').indexOf('<') >= 0) {
      el.innerHTML = newText;
    } else {
      el.textContent = newText;
    }
  });
  document.querySelectorAll('[data-img-ja]').forEach(function(el) {
    var t = admLang === 'zh' ? el.getAttribute('data-img-zh') : el.getAttribute('data-img-ja');
    if ((el.innerHTML||'').indexOf('<') >= 0 && (t||'').indexOf('<') >= 0) {
      el.innerHTML = t;
    } else {
      el.textContent = t;
    }
  });
  var adminBtn = document.getElementById('adminLangBtn');
  if (adminBtn) adminBtn.innerHTML = admLang === 'ja' ? '🌐 切换中文' : '🌐 日本語に切替';
  var imgBtn = document.getElementById('imgLangToggle');
  if (imgBtn) imgBtn.innerHTML = admLang === 'ja' ? '🌐 切换中文' : '🌐 日本語に切替';
  updatePageTitleLang();
}

function applyImgLang() { applyAdminLang(); }

function t(ja, zh) { return admLang === 'zh' ? zh : ja; }

var pageTitlesZh = {
  dashboard:'仪表盘', kittens:'子猫管理', parents:'种猫管理',
  reviews:'客户评价', faq:'FAQ管理', articles:'知识库',
  images:'图片管理', export:'HTML导出', data:'数据管理',
  guide:'操作指南', settings:'修改密码'
};

function updatePageTitleLang() {
  var active = document.querySelector('.nav-item.active');
  var page = active ? active.dataset.page : 'dashboard';
  var title = admLang === 'zh' ? (pageTitlesZh[page] || '') : (pageTitles[page] || '');
  document.getElementById('pageTitle').textContent = title;
}

function handleImgUpload(fileInput, targetInputId) {
  var file = fileInput.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast(imgLang === 'zh' ? '请选择图片文件' : '画像ファイルを選択してください', 'error');
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    var targetInput = document.getElementById(targetInputId);
    if (targetInput) {
      targetInput.value = e.target.result;
      var row = targetInput.closest('.img-manager-row');
      var existingHint = row.querySelector('.upload-filename');
      if (existingHint) existingHint.remove();
      var hint = document.createElement('small');
      hint.className = 'upload-filename';
      hint.style.cssText = 'color:var(--mint-dark);display:block;margin-top:4px;font-size:11px;';
      hint.textContent = '📎 ' + file.name + ' (' + (file.size / 1024).toFixed(0) + 'KB)';
      row.appendChild(hint);
      // Update inline preview immediately
      updatePreviewFor(targetInputId);
    }
    showToast('📎 ' + file.name, 'success');
  };
  reader.readAsDataURL(file);
  fileInput.value = '';
}

function loadImageConfig() {
  try {
    var saved = JSON.parse(localStorage.getItem(IMAGE_KEY) || '{}');
    IMAGE_FIELDS.forEach(function(f) {
      var el = document.getElementById(f.id);
      if (el && saved[f.tag]) el.value = saved[f.tag];
    });
    var instaUrlEl = document.getElementById('img-insta-url');
    if (instaUrlEl && saved['insta-url']) instaUrlEl.value = saved['insta-url'];
  } catch(e) {}
  updateAllPreviews();
  applyImgLang();
}

function safeAdminImagePreviewUrl(value) {
  var url = String(value || '').trim();
  if (/^https:\/\/[^\s"'<>\\\u0000-\u001f\u007f]+$/i.test(url)) return url;
  if (/^\/(?!\/)[^\s"'<>\\\u0000-\u001f\u007f]+$/.test(url)) return url;
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(url)) return url;
  return '';
}

function updatePreviewFor(fieldId) {
  var inputEl = document.getElementById(fieldId);
  if (!inputEl) return;
  var previewId = 'preview-' + fieldId.replace('img-', '');
  var preview = document.getElementById(previewId);

  // Auto-create preview div if it doesn't exist
  if (!preview) {
    var inputGroup = inputEl.closest('.img-input-group');
    if (!inputGroup) return;
    preview = document.createElement('div');
    preview.className = 'img-preview';
    preview.id = previewId;
    inputGroup.appendChild(preview);
  }

  var rawUrl = inputEl.value.trim();
  var url = safeAdminImagePreviewUrl(rawUrl);
  preview.textContent = '';
  if (!rawUrl) return;

  if (!url) {
    var invalid = document.createElement('span');
    invalid.style.cssText = 'color:var(--danger-dark);font-size:11px;';
    invalid.textContent = '🖼 ' + t('安全な画像URLを入力してください','请输入安全的图片URL');
    preview.appendChild(invalid);
    return;
  }

  var image = document.createElement('img');
  image.src = url;
  image.alt = '';
  image.style.cssText = 'max-width:120px;max-height:80px;border-radius:6px;border:1px solid #e0e0e0;object-fit:cover;';
  var failure = document.createElement('span');
  failure.style.cssText = 'display:none;color:var(--text-light);font-size:11px;';
  failure.textContent = '🖼 ' + t('読み込み失敗','加载失败');
  image.addEventListener('error', function() {
    image.style.display = 'none';
    failure.style.display = 'inline';
  });
  preview.appendChild(image);
  preview.appendChild(failure);

  if (url.indexOf('data:') === 0) {
    var uploadHint = document.createElement('div');
    uploadHint.style.cssText = 'font-size:10px;color:var(--mint-dark);margin-top:2px;';
    uploadHint.textContent = t('📤 保存時にクラウドへ自動アップロード','📤 保存时将自动上传到云端');
    preview.appendChild(uploadHint);
  }
}

function updateAllPreviews() {
  IMAGE_FIELDS.forEach(function(f) {
    updatePreviewFor(f.id);
  });
}

document.addEventListener('DOMContentLoaded', function() {
  // Add input listener to ALL image fields for live preview
  IMAGE_FIELDS.forEach(function(f) {
    var el = document.getElementById(f.id);
    if (el) el.addEventListener('input', function() { updatePreviewFor(f.id); });
  });
});

// Convert a data URI to a File object for upload
function dataUriToFile(dataUri, filename) {
  var parts = dataUri.split(',');
  var mime = parts[0].match(/:(.*?);/)[1];
  var bstr = atob(parts[1]);
  var n = bstr.length;
  var u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  var ext = mime.split('/')[1] || 'png';
  if (ext === 'jpeg') ext = 'jpg';
  return new File([u8arr], (filename || 'image') + '.' + ext, { type: mime });
}

function saveImageConfig() {
  var config = {};
  var count = 0;
  IMAGE_FIELDS.forEach(function(f) {
    var el = document.getElementById(f.id);
    if (el && el.value.trim()) {
      var val = el.value.trim();
      config[f.tag] = val;
      count++;
    }
  });
  var instaUrl = document.getElementById('img-insta-url');
  if (instaUrl && instaUrl.value.trim()) config['insta-url'] = instaUrl.value.trim();
  localStorage.setItem(IMAGE_KEY, JSON.stringify(config));

  // Upload any base64 images to R2 first, then sync all to settings API
  if (typeof FuluckAPI !== 'undefined' && typeof FuluckAPI.uploadFile === 'function') {
    var base64Keys = Object.keys(config).filter(function(key) {
      return config[key].indexOf('data:') === 0;
    });

    if (base64Keys.length > 0) {
      showToast(t(
        base64Keys.length + '枚の画像をクラウドにアップロード中…',
        '正在上传 ' + base64Keys.length + ' 张图片到云端…'
      ), 'success');

      var uploads = base64Keys.map(function(key) {
        var file = dataUriToFile(config[key], key);
        return FuluckAPI.uploadFile(file).then(function(result) {
          // Replace base64 with the R2 public URL
          config[key] = result.url;
          // Update the input field and preview
          var field = IMAGE_FIELDS.filter(function(f) { return f.tag === key; })[0];
          if (field) {
            var el = document.getElementById(field.id);
            if (el) {
              el.value = result.url;
              updatePreviewFor(field.id);
            }
          }
          return { key: key, url: result.url };
        });
      });

      Promise.all(uploads).then(function(results) {
        // Update localStorage with R2 URLs (no more base64)
        localStorage.setItem(IMAGE_KEY, JSON.stringify(config));
        // Now sync all to settings API (all URLs, no base64)
        syncToSettingsAPI(config, count, results.length);
      }).catch(function(err) {
        showToast(t(
          'アップロード失敗: ' + err.message,
          '上传失败: ' + err.message
        ), 'error');
        // Still sync non-base64 values
        syncToSettingsAPI(config, count, 0);
      });
    } else {
      // No base64 values — sync directly
      syncToSettingsAPI(config, count, 0);
    }
  } else {
    showToast(t('画像設定を保存しました','图片设置已保存') + '（' + count + t('件','张') + '）', 'success');
  }
  addLog(t('画像設定を保存しました（' + count + '件）','图片设置已保存（' + count + '张）'));
}

function syncToSettingsAPI(config, count, uploadedCount) {
  // Filter out any remaining base64 (shouldn't happen, but safety)
  var apiConfig = {};
  Object.keys(config).forEach(function(key) {
    if (config[key].indexOf('data:') !== 0) apiConfig[key] = config[key];
  });
  FuluckAPI.put('/api/admin/settings', { images: apiConfig })
    .then(function() {
      var msg = uploadedCount > 0
        ? t(uploadedCount + '枚をR2にアップロード＆クラウド同期完了','已上传 ' + uploadedCount + ' 张到R2并同步到云端')
        : t('画像設定を保存＆クラウド同期しました','图片设置已保存并同步到云端');
      showToast(msg + '（' + count + t('件','张') + '）', 'success');
    })
    .catch(function() {
      showToast(t('ローカル保存済み（クラウド同期失敗）','已本地保存（云端同步失败）'), 'error');
    });
}

function generateImageHTML() {
  var lines = [];
  lines.push('<!-- ====================================== -->');
  lines.push('<!-- 画像管理 - 自動生成コード -->');
  lines.push('<!-- 生成日: ' + new Date().toLocaleString('ja-JP') + ' -->');
  lines.push('<!-- ====================================== -->');
  lines.push('');

  var instaUrl = (document.getElementById('img-insta-url') || {}).value || 'https://www.instagram.com/fuluckpet/';

  var pages = {};
  IMAGE_FIELDS.forEach(function(f) {
    var el = document.getElementById(f.id);
    var val = el ? el.value.trim() : '';
    if (!val) return;
    if (val.indexOf('data:') === 0) {
      lines.push('<!-- ⚠ ' + f.label[imgLang] + ': base64 — ' + t('先に「保存」でR2にアップロードしてください','请先点击「保存」上传到R2') + ' -->');
      return;
    }
    if (!pages[f.page]) pages[f.page] = [];
    pages[f.page].push({ label:f.label[imgLang], tag:f.tag, url:val });
  });

  Object.keys(pages).forEach(function(page) {
    lines.push('<!-- === ' + page + ' === -->');
    pages[page].forEach(function(item) {
      var alt = item.label + ' - 福楽キャッテリー';
      var loading = (item.tag === 'hero-main' || item.tag === 'sib-main') ? 'eager' : 'lazy';

      if (item.tag === 'ogp') {
        lines.push('<!-- OGP meta tag: -->');
        lines.push('<meta property="og:image" content="' + item.url + '">');
      } else if (item.tag.indexOf('insta') === 0) {
        lines.push('<!-- ' + item.label + ' -->');
        lines.push('<div class="insta-item"><a href="' + instaUrl + '" target="_blank" rel="noopener"><img src="' + item.url + '" alt="Instagram - 福楽キャッテリー" loading="lazy" style="width:100%;height:100%;object-fit:cover;"></a></div>');
      } else if (item.tag.indexOf('gallery') === 0) {
        lines.push('<!-- ' + item.label + ' -->');
        lines.push('<div class="gallery-item"><img src="' + item.url + '" alt="卒業猫 サイベリアン" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius);"></div>');
      } else if (item.tag.indexOf('review') === 0) {
        lines.push('<!-- ' + item.label + ' -->');
        lines.push('<img src="' + item.url + '" alt="みんなの子猫ブリーダー 口コミ" loading="lazy" style="width:100%;border-radius:var(--radius);box-shadow:var(--shadow-card);">');
      } else if (item.tag.indexOf('award') === 0 || item.tag === 'genetic') {
        lines.push('<!-- ' + item.label + ' -->');
        lines.push('<img src="' + item.url + '" alt="' + alt + '" loading="lazy" style="max-width:100%;border-radius:var(--radius);">');
      } else {
        lines.push('<!-- ' + item.label + ' -->');
        lines.push('<img src="' + item.url + '" alt="' + alt + '" loading="' + loading + '" style="width:100%;height:auto;object-fit:cover;border-radius:var(--radius-lg);">');
      }
      lines.push('');
    });
  });

  var output = lines.join('\n');
  document.getElementById('imageCodeContent').textContent = output;
  document.getElementById('imageCodeOutput').style.display = 'block';
  showToast(imgLang === 'zh' ? 'HTML代码已生成' : 'HTMLコードを生成しました', 'success');
}

function previewAllImages() {
  var grid = document.getElementById('imagePreviewGrid');
  grid.innerHTML = '';
  var count = 0;

  IMAGE_FIELDS.forEach(function(f) {
    var el = document.getElementById(f.id);
    var val = el ? el.value.trim() : '';
    if (!val) return;
    count++;

    var card = document.createElement('div');
    card.className = 'preview-card';

    var img = document.createElement('img');
    img.src = val;
    img.alt = f.label[imgLang];
    img.onerror = function() {
      this.style.display = 'none';
      var errDiv = this.nextElementSibling;
      if (errDiv) { errDiv.className = 'preview-status ng'; errDiv.textContent = '❌ ' + (imgLang === 'zh' ? '加载失败' : '読み込み失敗'); }
    };
    img.onload = function() {
      var okDiv = this.nextElementSibling;
      if (okDiv) { okDiv.className = 'preview-status ok'; okDiv.textContent = '✅ ' + this.naturalWidth + '×' + this.naturalHeight + ' (' + (imgLang === 'zh' ? '推荐' : '推奨') + ' ' + f.size + ')'; }
    };

    var status = document.createElement('div');
    status.className = 'preview-status';
    status.textContent = imgLang === 'zh' ? '加载中…' : '読み込み中…';

    var label = document.createElement('div');
    label.className = 'preview-label';
    label.textContent = f.label[imgLang];

    card.appendChild(img);
    card.appendChild(status);
    card.appendChild(label);
    grid.appendChild(card);
  });

  document.getElementById('imagePreviewArea').style.display = count > 0 ? 'block' : 'none';
  if (count === 0) {
    showToast(imgLang === 'zh' ? '没有输入图片URL' : '画像URLが入力されていません', 'error');
  } else {
    showToast(count + (imgLang === 'zh' ? ' 张图片预览中…' : '件の画像をプレビュー中…'), 'success');
  }
}

function copyImageCode() {
  var code = document.getElementById('imageCodeContent').textContent;
  if (!code) { showToast(imgLang === 'zh' ? '请先生成代码' : 'まずコードを生成してください', 'error'); return; }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(function() {
      showToast(imgLang === 'zh' ? '已复制' : 'コピーしました', 'success');
    });
  } else {
    var ta = document.createElement('textarea');
    ta.value = code;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(imgLang === 'zh' ? '已复制' : 'コピーしました', 'success');
  }
}
