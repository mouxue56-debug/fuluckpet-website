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
  updateHeroPreview();
  applyImgLang();
}

function updateHeroPreview() {
  var preview = document.getElementById('preview-hero-main');
  if (!preview) return;
  var url = document.getElementById('img-hero-main').value.trim();
  if (url) {
    preview.innerHTML = '<img src="' + url + '" onerror="this.parentNode.innerHTML=\'<span class=img-preview-empty>🖼</span>\'">';
  } else {
    preview.innerHTML = '<span class="img-preview-empty">🖼</span>';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  var heroInput = document.getElementById('img-hero-main');
  if (heroInput) heroInput.addEventListener('input', updateHeroPreview);
});

function saveImageConfig() {
  var config = {};
  var count = 0;
  IMAGE_FIELDS.forEach(function(f) {
    var el = document.getElementById(f.id);
    if (el && el.value.trim()) {
      config[f.tag] = el.value.trim();
      count++;
    }
  });
  var instaUrl = document.getElementById('img-insta-url');
  if (instaUrl && instaUrl.value.trim()) config['insta-url'] = instaUrl.value.trim();
  localStorage.setItem(IMAGE_KEY, JSON.stringify(config));
  addLog(imgLang === 'zh' ? '图片设置已保存（' + count + '张）' : '画像設定を保存しました（' + count + '件）');
  showToast(imgLang === 'zh' ? '已保存 ' + count + ' 张图片设置' : '画像設定を保存しました（' + count + '件）', 'success');
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
      lines.push('<!-- ⚠ ' + f.label[imgLang] + ': base64 image - please save as file to images/ folder first -->');
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
