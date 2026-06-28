// admin-diary-editor.js — Rich-text diary editor controller for admin/diary-editor.html
// Depends on: api-client.js (FuluckAPI), admin-images.js loaded BEFORE this file (admLang, t)
// Standalone admin page: handles its own login + lang toggle (does NOT load admin-core.js).

(function() {
  'use strict';

  // ===== State =====
  var articles = [];          // full list from /api/admin/diary
  var currentSlug = null;     // slug of diary post being edited (null = new)
  var currentArticle = null;  // local working copy (may include unsaved changes)
  var currentLang = 'ja';     // active language tab (ja/en/zh)
  var lastRange = null;       // saved Range for restoring caret after toolbar action
  var sourceMode = false;     // true = HTML <textarea> view; false = WYSIWYG
  var dirty = false;
  var catData = { kittens: [], parents: [] };
  var selectedKittens = new Set();
  var selectedParents = new Set();
  var savedKittenSnapshots = [];

  // ===== Helpers =====
  function $(id) { return document.getElementById(id); }
  function tt(ja, zh) { return (typeof t === 'function') ? t(ja, zh) : (window.admLang === 'zh' ? zh : ja); }
  function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function slugify(s) {
    if (!s) return '';
    return String(s)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9一-鿿぀-ヿ\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
  }

  function nowIso() { return new Date().toISOString(); }
  function nowDate() { return new Date().toISOString().slice(0, 10); }

  function showToast(msg, type) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast ' + (type || '') + ' show';
    setTimeout(function() { el.classList.remove('show'); }, 3000);
  }

  function setDirty(flag) {
    dirty = !!flag;
    var ind = $('dirtyIndicator');
    if (ind) ind.style.visibility = dirty ? 'visible' : 'hidden';
  }

  // ===== Login =====
  function doLogin() {
    var pw = $('loginPassword').value;
    if (!pw) return;
    fetch('https://fuluck-api.mouxue56.workers.dev/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d && d.success) {
          sessionStorage.setItem('fuluck-admin-auth', '1');
          sessionStorage.setItem('fuluck-admin-pwd', pw);
          $('loginScreen').style.display = 'none';
          $('editorLayout').classList.add('active');
          init();
        } else {
          $('loginError').style.display = 'block';
        }
      })
      .catch(function() { $('loginError').style.display = 'block'; });
  }

  // The api-client.js getSessionPass() helper isn't loaded here, so define a fallback
  // that the FuluckAPI module's typeof check will find.
  window.getSessionPass = window.getSessionPass || function() {
    return sessionStorage.getItem('fuluck-admin-pwd') || '';
  };

  // ===== Diary list =====
  function loadArticles() {
    if (typeof FuluckAPI === 'undefined') return Promise.resolve([]);
    return FuluckAPI.get('/api/admin/diary').then(function(items) {
      articles = items || [];
      renderArticleList();
      return articles;
    }).catch(function(err) {
      showToast('Error: ' + err.message, 'error');
      return [];
    });
  }

  function renderArticleList() {
    var list = $('articleList');
    if (!list) return;
    var q = ($('articleSearch').value || '').toLowerCase().trim();
    var filtered = articles.filter(function(a) {
      if (!q) return true;
      var hay = (a.slug || '') + ' ' + (a.title && a.title.ja || '') + ' ' + (a.title && a.title.zh || '');
      return hay.toLowerCase().indexOf(q) >= 0;
    });
    if (filtered.length === 0) {
      list.innerHTML = '<div class="empty-list">' + tt('日記がありません', '暂无日记') + '</div>';
      return;
    }
    // Newest first
    filtered.sort(function(a, b) {
      return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
    });
    list.innerHTML = filtered.map(function(a) {
      var title = (a.title && (a.title.ja || a.title.zh || a.title.en)) || a.slug || tt('(無題)', '(无标题)');
      var when = (a.date || a.updatedAt || a.createdAt || '').slice(0, 10);
      var metaParts = [a.slug || ''];
      if (a.stage) metaParts.push(a.stage);
      if (a.cats && a.cats.group) metaParts.push(a.cats.group);
      var pubDot = a.published
        ? '<span class="pub-dot pub-on" title="' + tt('公開中', '已发布') + '"></span>'
        : '<span class="pub-dot pub-off" title="' + tt('下書き', '草稿') + '"></span>';
      var active = (a.slug === currentSlug) ? ' active' : '';
      return '<div class="article-item' + active + '" data-slug="' + escAttr(a.slug) + '">'
        + pubDot
        + '<div class="article-meta">'
        +   '<div class="article-title">' + escHtml(title) + '</div>'
        +   '<div class="article-sub">' + escHtml(metaParts.filter(Boolean).join(' · ')) + (when ? ' · ' + escHtml(when) : '') + '</div>'
        + '</div>'
        + '</div>';
    }).join('');
    list.querySelectorAll('.article-item').forEach(function(el) {
      el.addEventListener('click', function() {
        if (dirty && !confirm(tt('未保存の変更があります。破棄しますか？', '有未保存的更改，确定丢弃吗？'))) return;
        loadArticleIntoEditor(el.dataset.slug);
      });
    });
  }

  function newArticle() {
    if (dirty && !confirm(tt('未保存の変更があります。破棄しますか？', '有未保存的更改，确定丢弃吗？'))) return;
    currentSlug = null;
    currentArticle = {
      slug: '',
      title: { ja: '', en: '', zh: '' },
      excerpt: { ja: '', en: '', zh: '' },
      body: { ja: '', en: '', zh: '' },
      coverImage: '',
      litter: '',
      stage: '',
      date: nowDate(),
      cats: { kittens: [], parents: [], group: '' },
      published: false,
      publishedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    fillFormFromArticle();
    renderArticleList();
    setDirty(false);
    $('titleInput').focus();
  }

  function loadArticleIntoEditor(slug) {
    var a = articles.find(function(x) { return x.slug === slug; });
    if (!a) return;
    currentSlug = slug;
    // Deep-ish copy so cancel doesn't mutate the list
    currentArticle = JSON.parse(JSON.stringify(a));
    if (!currentArticle.title) currentArticle.title = { ja: '', en: '', zh: '' };
    if (!currentArticle.excerpt) currentArticle.excerpt = { ja: '', en: '', zh: '' };
    if (!currentArticle.body) currentArticle.body = currentArticle.content || { ja: '', en: '', zh: '' };
    if (!currentArticle.cats) currentArticle.cats = { kittens: [], parents: [], group: '' };
    if (!Array.isArray(currentArticle.cats.kittens)) currentArticle.cats.kittens = [];
    if (!Array.isArray(currentArticle.cats.parents)) currentArticle.cats.parents = [];
    fillFormFromArticle();
    renderArticleList();
    setDirty(false);
  }

  // ===== Form <-> data binding =====
  function fillFormFromArticle() {
    var a = currentArticle;
    if (!a) return;
    $('slugInput').value = a.slug || '';
    $('titleInput').value = (a.title && a.title[currentLang]) || '';
    $('excerptInput').value = (a.excerpt && a.excerpt[currentLang]) || '';
    $('coverImage').value = a.coverImage || '';
    $('coverPreview').innerHTML = a.coverImage
      ? '<img src="' + escAttr(a.coverImage) + '" alt="cover">'
      : '<span class="cover-placeholder">' + tt('カバー画像なし', '暂无封面') + '</span>';
    var group = (a.cats && a.cats.group) || a.litter || '';
    ensureLitterOption(group);
    $('litterSelect').value = group;
    $('stageInput').value = a.stage || '';
    $('dateInput').value = a.date ? a.date.slice(0, 10) : '';
    $('publishedCheckbox').checked = !!a.published;
    $('publishedAt').value = a.publishedAt ? a.publishedAt.slice(0, 10) : '';
    setCatSelectionsFromArticle(a);
    setEditorContent(a.body && a.body[currentLang] || '');
    renderCatPicker();
    document.querySelectorAll('.lang-tab').forEach(function(b) {
      b.classList.toggle('active', b.dataset.lang === currentLang);
    });
    var hint = $('langHint');
    if (hint) hint.textContent = tt(
      'すべての言語が同じ slug を共有します（' + currentLang.toUpperCase() + ' 編集中）',
      '所有语言共享同一 slug（正在编辑 ' + currentLang.toUpperCase() + '）'
    );
  }

  function captureFormIntoArticle() {
    if (!currentArticle) return;
    var a = currentArticle;
    if (!a.title) a.title = { ja: '', en: '', zh: '' };
    if (!a.excerpt) a.excerpt = { ja: '', en: '', zh: '' };
    if (!a.body) a.body = { ja: '', en: '', zh: '' };
    a.slug = ($('slugInput').value || '').trim();
    a.title[currentLang] = $('titleInput').value;
    a.excerpt[currentLang] = $('excerptInput').value;
    a.coverImage = ($('coverImage').value || '').trim();
    a.litter = ($('litterSelect').value || '').trim();
    a.stage = ($('stageInput').value || '').trim();
    a.date = ($('dateInput').value || '').trim();
    a.cats = buildCatsPayload(a.litter);
    a.published = $('publishedCheckbox').checked;
    var pa = $('publishedAt').value;
    a.publishedAt = pa ? new Date(pa + 'T00:00:00Z').toISOString() : (a.published ? (a.publishedAt || nowIso()) : null);
    a.updatedAt = nowIso();
    if (!a.createdAt) a.createdAt = a.updatedAt;
    a.body[currentLang] = getEditorContent();
  }

  // ===== Live cat data / diary picker =====
  function normalizeApiList(data, key) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data[key])) return data[key];
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  }

  function getCoverPhoto(item) {
    if (!item) return '';
    if (item.coverPhoto) return item.coverPhoto;
    var photos = Array.isArray(item.photos) ? item.photos : [];
    if (!photos.length) return '';
    var idx = item.coverIndex || 0;
    return photos[Math.min(idx, photos.length - 1)] || '';
  }

  function kittenKey(k) {
    return String((k && (k.breederId || k.id)) || '');
  }

  function parentKey(p) {
    return String((p && (p.id || p.name)) || '');
  }

  function kittenName(k) {
    return [k.name, k.gender, k.breed, k.color].filter(Boolean).join(' ').trim() || k.breederId || k.id || '';
  }

  function kittenSnapshot(k) {
    var key = kittenKey(k);
    return {
      breederId: k.breederId || k.id || key,
      name: kittenName(k),
      photo: getCoverPhoto(k),
    };
  }

  function statusInfo(status) {
    if (status === 'available') return { cls: 'available', label: tt('在売', '在售') };
    if (status === 'reserved') return { cls: 'reserved', label: tt('商談中', '洽谈中') };
    if (status === 'sold') return { cls: 'sold', label: tt('卒業', '毕业') };
    return { cls: 'sold', label: status || tt('未設定', '未设置') };
  }

  function setCatSelectionsFromArticle(a) {
    var cats = a && a.cats ? a.cats : {};
    selectedKittens = new Set();
    selectedParents = new Set();
    savedKittenSnapshots = [];

    (cats.parents || []).forEach(function(id) {
      if (id && typeof id === 'object') id = id.id || id.name;
      if (id) selectedParents.add(String(id));
    });

    (cats.kittens || []).forEach(function(k) {
      if (!k) return;
      if (typeof k === 'string') {
        selectedKittens.add(k);
        savedKittenSnapshots.push({ breederId: k, name: '', photo: '' });
      } else {
        var key = k.breederId || k.id || k.name;
        if (key) {
          selectedKittens.add(String(key));
          savedKittenSnapshots.push({
            breederId: k.breederId || k.id || String(key),
            name: k.name || '',
            photo: k.photo || k.coverImage || '',
          });
        }
      }
    });
  }

  function savedSnapshotByKey(key) {
    return savedKittenSnapshots.find(function(k) {
      return String(k.breederId || k.id || k.name || '') === String(key);
    });
  }

  function buildCatsPayload(group) {
    var liveByKey = {};
    catData.kittens.forEach(function(k) {
      var key = kittenKey(k);
      if (key) liveByKey[key] = k;
    });

    var kittens = Array.from(selectedKittens).map(function(key) {
      if (liveByKey[key]) return kittenSnapshot(liveByKey[key]);
      var saved = savedSnapshotByKey(key);
      return saved || { breederId: key, name: '', photo: '' };
    }).filter(function(k) { return !!(k && k.breederId); });

    return {
      kittens: kittens,
      parents: Array.from(selectedParents),
      group: group || '',
    };
  }

  function distinctGroups() {
    var seen = {};
    catData.kittens.concat(catData.parents).forEach(function(item) {
      var group = item && item.group ? String(item.group).trim() : '';
      if (group) seen[group] = true;
    });
    return Object.keys(seen).sort();
  }

  function ensureLitterOption(group) {
    var select = $('litterSelect');
    if (!select || !group) return;
    var exists = Array.from(select.options).some(function(opt) { return opt.value === group; });
    if (!exists) {
      var opt = document.createElement('option');
      opt.value = group;
      opt.textContent = group;
      select.appendChild(opt);
    }
  }

  function renderLitterOptions() {
    var select = $('litterSelect');
    if (!select) return;
    var current = select.value || (currentArticle && currentArticle.cats && currentArticle.cats.group) || (currentArticle && currentArticle.litter) || '';
    var options = ['<option value="">' + tt('-- 選択 --', '-- 选择 --') + '</option>'];
    distinctGroups().forEach(function(group) {
      options.push('<option value="' + escAttr(group) + '">' + escHtml(group) + '</option>');
    });
    select.innerHTML = options.join('');
    ensureLitterOption(current);
    select.value = current;
  }

  function loadCatData() {
    if (typeof FuluckAPI === 'undefined') return Promise.resolve(catData);
    return Promise.all([
      FuluckAPI.get('/api/kittens').catch(function() { return []; }),
      FuluckAPI.get('/api/parents').catch(function() { return []; }),
    ]).then(function(results) {
      catData.kittens = normalizeApiList(results[0], 'kittens');
      catData.parents = normalizeApiList(results[1], 'parents');
      renderLitterOptions();
      renderCatPicker();
      return catData;
    });
  }

  function matchesQuery(item, q, label) {
    if (!q) return true;
    var hay = [
      label,
      item.id,
      item.breederId,
      item.name,
      item.breed,
      item.color,
      item.gender,
      item.role,
      item.group,
      item.status,
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function renderParentRow(p) {
    var id = parentKey(p);
    var label = p.name || id || tt('(名前なし)', '(无名)');
    var sub = [p.role, p.breed, p.color, p.group].filter(Boolean).join(' · ');
    var photo = getCoverPhoto(p);
    return '<label class="cat-row">'
      + '<input type="checkbox" data-cat-type="parent" data-cat-id="' + escAttr(id) + '"' + (selectedParents.has(id) ? ' checked' : '') + '>'
      + (photo ? '<img class="cat-thumb" src="' + escAttr(photo) + '" alt="">' : '<span class="cat-thumb empty">No image</span>')
      + '<span class="cat-main">'
      +   '<span class="cat-name">' + escHtml(label) + '</span>'
      +   '<span class="cat-sub">' + escHtml(sub) + '</span>'
      + '</span>'
      + '<span></span>'
      + '</label>';
  }

  function renderKittenRow(k) {
    var id = kittenKey(k);
    var label = [k.breederId || k.id, k.breed, k.color].filter(Boolean).join(' · ') || tt('(IDなし)', '(无ID)');
    var sub = [k.gender, k.birthday, k.group].filter(Boolean).join(' · ');
    var photo = getCoverPhoto(k);
    var status = statusInfo(k.status);
    return '<label class="cat-row">'
      + '<input type="checkbox" data-cat-type="kitten" data-cat-id="' + escAttr(id) + '"' + (selectedKittens.has(id) ? ' checked' : '') + '>'
      + (photo ? '<img class="cat-thumb" src="' + escAttr(photo) + '" alt="">' : '<span class="cat-thumb empty">No image</span>')
      + '<span class="cat-main">'
      +   '<span class="cat-name">' + escHtml(label) + '</span>'
      +   '<span class="cat-sub">' + escHtml(sub) + '</span>'
      + '</span>'
      + '<span class="cat-badge ' + status.cls + '">' + escHtml(status.label) + '</span>'
      + '</label>';
  }

  function renderCatPicker() {
    var parentList = $('parentPickerList');
    var kittenList = $('kittenPickerList');
    if (!parentList || !kittenList) return;
    var q = (($('catSearch') && $('catSearch').value) || '').toLowerCase().trim();
    var parents = catData.parents.filter(function(p) { return matchesQuery(p, q, p.name || ''); });
    var kittens = catData.kittens.filter(function(k) {
      return matchesQuery(k, q, [k.breederId, k.breed, k.color].filter(Boolean).join(' '));
    });

    parentList.innerHTML = parents.length
      ? parents.map(renderParentRow).join('')
      : '<div class="cat-empty">' + tt('親猫が見つかりません', '没有找到亲猫') + '</div>';
    kittenList.innerHTML = kittens.length
      ? kittens.map(renderKittenRow).join('')
      : '<div class="cat-empty">' + tt('子猫が見つかりません', '没有找到子猫') + '</div>';

    var summary = $('selectedCatsSummary');
    if (summary) {
      summary.textContent = tt(
        '選択中：親猫 ' + selectedParents.size + ' / 子猫 ' + selectedKittens.size,
        '已选择：亲猫 ' + selectedParents.size + ' / 子猫 ' + selectedKittens.size
      );
    }
  }

  function selectCurrentLitterCats() {
    var group = ($('litterSelect').value || '').trim();
    if (!group) {
      showToast(tt('先に窝を選択してください', '请先选择窝'), 'error');
      return;
    }
    catData.parents.forEach(function(p) {
      if (String(p.group || '') === group) {
        var id = parentKey(p);
        if (id) selectedParents.add(id);
      }
    });
    catData.kittens.forEach(function(k) {
      if (String(k.group || '') === group) {
        var id = kittenKey(k);
        if (id) selectedKittens.add(id);
      }
    });
    renderCatPicker();
    setDirty(true);
  }

  // ===== Rich-text editor =====
  function editor() { return $('rtEditor'); }
  function sourceArea() { return $('sourceArea'); }

  function getEditorContent() {
    if (sourceMode) return sourceArea().value;
    return editor().innerHTML;
  }

  function setEditorContent(html) {
    editor().innerHTML = html || '';
    if (sourceMode) sourceArea().value = html || '';
  }

  function focusEditor() {
    if (sourceMode) { sourceArea().focus(); return; }
    editor().focus();
  }

  function saveSelection() {
    var sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      var r = sel.getRangeAt(0);
      // Only save if selection is inside the editor
      if (editor().contains(r.commonAncestorContainer)) {
        lastRange = r.cloneRange();
      }
    }
  }

  function restoreSelection() {
    if (!lastRange) return false;
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(lastRange);
    return true;
  }

  function execCmd(cmd, value) {
    focusEditor();
    if (!sourceMode) {
      restoreSelection();
      document.execCommand(cmd, false, value || null);
      saveSelection();
      setDirty(true);
    }
  }

  function insertHtmlAtCursor(html) {
    focusEditor();
    if (sourceMode) {
      // Append to source area
      var ta = sourceArea();
      var pos = ta.selectionStart;
      ta.value = ta.value.slice(0, pos) + html + ta.value.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = pos + html.length;
      setDirty(true);
      return;
    }
    restoreSelection();
    var sel = window.getSelection();
    if (sel.rangeCount === 0) {
      // Append to editor end
      editor().insertAdjacentHTML('beforeend', html);
    } else {
      var range = sel.getRangeAt(0);
      range.deleteContents();
      var frag = range.createContextualFragment(html);
      var lastNode = frag.lastChild;
      range.insertNode(frag);
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.setEndAfter(lastNode);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    saveSelection();
    setDirty(true);
  }

  function toggleSource() {
    if (sourceMode) {
      // source -> wysiwyg
      editor().innerHTML = sourceArea().value;
      editor().style.display = '';
      sourceArea().style.display = 'none';
      sourceMode = false;
      $('btnSource').classList.remove('active');
    } else {
      sourceArea().value = editor().innerHTML;
      editor().style.display = 'none';
      sourceArea().style.display = '';
      sourceMode = true;
      $('btnSource').classList.add('active');
    }
  }

  // ===== Image upload =====
  function uploadOne(file, onProgress) {
    return FuluckAPI.uploadFile(file).then(function(res) {
      if (onProgress) onProgress(res);
      return res; // { url, key }
    });
  }

  function uploadFilesAndInsert(fileList) {
    var files = Array.from(fileList).filter(function(f) {
      return /^image\//.test(f.type);
    });
    if (files.length === 0) {
      showToast(tt('画像ファイルを選択してください', '请选择图片文件'), 'error');
      return;
    }
    var total = files.length;
    var done = 0;
    var progressEl = $('uploadProgress');
    progressEl.style.display = 'block';
    progressEl.textContent = tt('アップロード中...', '上传中...') + ' 0/' + total;

    saveSelection(); // remember caret before upload

    var promises = files.map(function(f) {
      return uploadOne(f).then(function(res) {
        done += 1;
        progressEl.textContent = tt('アップロード中...', '上传中...') + ' ' + done + '/' + total;
        // Insert at saved cursor (each insert advances the saved range too)
        insertHtmlAtCursor('<img src="' + escAttr(res.url) + '" alt="" loading="lazy">');
        return res;
      }).catch(function(err) {
        done += 1;
        progressEl.textContent = tt('アップロード中...', '上传中...') + ' ' + done + '/' + total;
        showToast(tt('画像アップロード失敗: ', '图片上传失败：') + (err.message || err), 'error');
        return null;
      });
    });

    Promise.all(promises).then(function() {
      progressEl.textContent = tt('完了：', '完成：') + done + '/' + total;
      setTimeout(function() { progressEl.style.display = 'none'; }, 2000);
    });
  }

  function uploadCoverImage(file) {
    if (!/^image\//.test(file.type)) {
      showToast(tt('画像ファイルを選択してください', '请选择图片文件'), 'error');
      return;
    }
    showToast(tt('カバー画像をアップロード中...', '正在上传封面...'), 'success');
    uploadOne(file).then(function(res) {
      $('coverImage').value = res.url;
      $('coverPreview').innerHTML = '<img src="' + escAttr(res.url) + '" alt="cover">';
      setDirty(true);
    }).catch(function(err) {
      showToast('Error: ' + (err.message || err), 'error');
    });
  }

  // ===== Save / Delete / Preview =====
  function saveArticle() {
    captureFormIntoArticle();
    var a = currentArticle;
    if (!a.slug) a.slug = slugify(a.title.ja || a.title.zh || a.title.en);
    if (!a.slug) {
      showToast(tt('タイトル または slug を入力してください', '请输入标题或 slug'), 'error');
      return;
    }
    if (!(a.title.ja || a.title.zh || a.title.en)) {
      showToast(tt('タイトルを入力してください', '请输入标题'), 'error');
      return;
    }
    if (!a.id) a.id = 'diary-' + a.slug;
    FuluckAPI.post('/api/admin/diary', a).then(function(saved) {
      currentSlug = (saved && saved.slug) || a.slug;
      currentArticle = saved || a;
      setDirty(false);
      showToast(tt('保存しました', '已保存'), 'success');
      return loadArticles();
    }).catch(function(err) {
      showToast('Save error: ' + (err.message || err), 'error');
    });
  }

  function deleteArticle() {
    if (!currentSlug) {
      showToast(tt('まず日記を選択してください', '请先选择日记'), 'error');
      return;
    }
    if (!confirm(tt('この日記を削除しますか？', '确定删除这篇日记吗？'))) return;
    FuluckAPI.post('/api/admin/diary/delete', { slug: currentSlug }).then(function() {
      showToast(tt('削除しました', '已删除'), 'success');
      currentSlug = null;
      currentArticle = null;
      newArticle();
      loadArticles();
    }).catch(function(err) {
      showToast('Delete error: ' + (err.message || err), 'error');
    });
  }

  function previewArticle() {
    captureFormIntoArticle();
    var a = currentArticle;
    if (!a.slug && !(a.title && (a.title.ja || a.title.zh || a.title.en))) {
      showToast(tt('slug かタイトルを入力してください', '请输入 slug 或标题'), 'error');
      return;
    }
    var lang = currentLang;
    var title = (a.title && a.title[lang]) || '';
    var body = (a.body && a.body[lang]) || '';
    var cover = a.coverImage || '';
    var excerpt = (a.excerpt && a.excerpt[lang]) || '';
    // Render in-tab using the same Ice Cream palette as blog.html
    var w = window.open('', '_blank');
    if (!w) { showToast(tt('ポップアップがブロックされました', '弹窗被拦截了'), 'error'); return; }
    var html = '<!DOCTYPE html><html lang="' + lang + '"><head><meta charset="UTF-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1.0">'
      + '<title>' + escHtml(title || tt('プレビュー', '预览')) + ' | ' + tt('プレビュー', '预览') + '</title>'
      + '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">'
      + '<style>'
      + '  body{font-family:"Inter","Noto Sans JP",sans-serif;background:#FFFCF0;color:#5A7A7A;margin:0;line-height:1.85;}'
      + '  .preview-banner{background:#F6E05E;color:#744210;text-align:center;padding:8px;font-size:13px;font-weight:600;}'
      + '  .wrap{max-width:720px;margin:0 auto;padding:32px 24px;}'
      + '  h1{font-size:32px;font-weight:700;color:#5A7A7A;margin:24px 0 16px;line-height:1.3;}'
      + '  .excerpt{font-size:16px;color:#90A8A8;font-style:italic;margin-bottom:32px;}'
      + '  .cover{width:100%;height:auto;border-radius:16px;margin-bottom:24px;}'
      + '  .body{font-size:16px;}'
      + '  .body h2{font-size:24px;margin:32px 0 14px;color:#5A7A7A;}'
      + '  .body h3{font-size:20px;margin:24px 0 12px;color:#5A7A7A;}'
      + '  .body p{margin:0 0 16px;}'
      + '  .body img{max-width:100%;height:auto;border-radius:12px;margin:16px 0;}'
      + '  .body blockquote{border-left:3px solid #7DD3C0;padding:6px 16px;background:#F0FFFA;margin:16px 0;border-radius:0 8px 8px 0;}'
      + '  .body a{color:#5BC4A8;}'
      + '  .body ul,.body ol{margin:16px 0 16px 28px;}'
      + '  .body iframe{max-width:100%;}'
      + '  .meta{font-size:12px;color:#90A8A8;margin-bottom:24px;}'
      + '</style></head><body>'
      + '<div class="preview-banner">' + tt('プレビューモード — 公開されていません', '预览模式 — 未发布') + '</div>'
      + '<div class="wrap">'
      + '<div class="meta">slug: <code>' + escHtml(a.slug || '(未設定)') + '</code> · '
      + tt('言語', '语言') + ': ' + lang.toUpperCase() + ' · '
      + (a.date ? escHtml(a.date) + ' · ' : '')
      + (a.stage ? escHtml(a.stage) + ' · ' : '')
      + (a.published ? tt('公開', '已发布') : tt('下書き', '草稿'))
      + '</div>'
      + (cover ? '<img class="cover" src="' + escAttr(cover) + '">' : '')
      + '<h1>' + escHtml(title) + '</h1>'
      + (excerpt ? '<div class="excerpt">' + escHtml(excerpt) + '</div>' : '')
      + '<div class="body">' + body + '</div>'
      + '</div></body></html>';
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ===== Toolbar wiring =====
  function youtubeEmbed(url) {
    var m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    var id = m ? m[1] : null;
    if (!id) return null;
    return '<div class="yt-embed" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:16px 0;">'
      + '<iframe src="https://www.youtube.com/embed/' + id + '" frameborder="0" allowfullscreen '
      + 'style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe></div>';
  }

  function bindToolbar() {
    var map = {
      btnBold: function() { execCmd('bold'); },
      btnItalic: function() { execCmd('italic'); },
      btnUnderline: function() { execCmd('underline'); },
      btnH2: function() { execCmd('formatBlock', 'H2'); },
      btnH3: function() { execCmd('formatBlock', 'H3'); },
      btnP: function() { execCmd('formatBlock', 'P'); },
      btnQuote: function() { execCmd('formatBlock', 'BLOCKQUOTE'); },
      btnUL: function() { execCmd('insertUnorderedList'); },
      btnOL: function() { execCmd('insertOrderedList'); },
      btnLink: function() {
        var url = prompt(tt('リンクURLを入力', '请输入链接 URL'), 'https://');
        if (url) execCmd('createLink', url);
      },
      btnYT: function() {
        var url = prompt(tt('YouTube URLを入力', '请输入 YouTube URL'), 'https://www.youtube.com/watch?v=');
        if (!url) return;
        var html = youtubeEmbed(url);
        if (!html) { showToast(tt('YouTube URLを認識できません', '无法识别 YouTube URL'), 'error'); return; }
        insertHtmlAtCursor(html);
      },
      btnImage: function() { $('imagePicker').click(); },
      btnSource: function() { toggleSource(); },
      btnUndo: function() { execCmd('undo'); },
      btnRedo: function() { execCmd('redo'); },
    };
    Object.keys(map).forEach(function(id) {
      var el = $(id);
      if (el) {
        el.addEventListener('mousedown', function(e) { e.preventDefault(); saveSelection(); });
        el.addEventListener('click', function(e) { e.preventDefault(); map[id](); });
      }
    });
  }

  // ===== Drag & drop =====
  function bindDropZone() {
    var dz = $('dropZone');
    if (!dz) return;
    ['dragenter', 'dragover'].forEach(function(ev) {
      dz.addEventListener(ev, function(e) { e.preventDefault(); e.stopPropagation(); dz.classList.add('drag-over'); });
    });
    ['dragleave', 'drop'].forEach(function(ev) {
      dz.addEventListener(ev, function(e) { e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag-over'); });
    });
    dz.addEventListener('drop', function(e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) uploadFilesAndInsert(files);
    });

    // Also accept drops directly into the editor
    var ed = editor();
    if (ed) {
      ['dragover'].forEach(function(ev) {
        ed.addEventListener(ev, function(e) { if (e.dataTransfer && e.dataTransfer.types.indexOf('Files') >= 0) { e.preventDefault(); } });
      });
      ed.addEventListener('drop', function(e) {
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) {
          e.preventDefault();
          // Position caret where dropped
          var range = document.caretRangeFromPoint
            ? document.caretRangeFromPoint(e.clientX, e.clientY)
            : null;
          if (range) {
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            saveSelection();
          }
          uploadFilesAndInsert(files);
        }
      });
    }
  }

  function bindFilePickers() {
    $('imagePicker').addEventListener('change', function(e) {
      if (e.target.files && e.target.files.length) uploadFilesAndInsert(e.target.files);
      e.target.value = '';
    });
    $('coverPicker').addEventListener('change', function(e) {
      if (e.target.files && e.target.files[0]) uploadCoverImage(e.target.files[0]);
      e.target.value = '';
    });
    $('coverPreview').addEventListener('click', function() { $('coverPicker').click(); });
  }

  function bindLangTabs() {
    document.querySelectorAll('.lang-tab').forEach(function(b) {
      b.addEventListener('click', function() {
        if (b.dataset.lang === currentLang) return;
        // Capture current language first
        captureFormIntoArticle();
        currentLang = b.dataset.lang;
        fillFormFromArticle();
      });
    });
  }

  function bindAutoSlug() {
    var slugManual = false;
    $('slugInput').addEventListener('input', function() { slugManual = true; setDirty(true); });
    $('titleInput').addEventListener('input', function() {
      if (!slugManual && (!currentArticle.slug || currentArticle.slug === '')) {
        $('slugInput').value = slugify($('titleInput').value);
      }
      setDirty(true);
    });
    $('publishedCheckbox').addEventListener('change', function() {
      if ($('publishedCheckbox').checked && !$('publishedAt').value) {
        $('publishedAt').value = nowDate();
      }
      setDirty(true);
    });
    ['excerptInput', 'publishedAt', 'coverImage', 'stageInput', 'dateInput'].forEach(function(id) {
      var el = $(id);
      if (el) el.addEventListener('input', function() { setDirty(true); });
    });
    $('litterSelect').addEventListener('change', function() {
      renderCatPicker();
      setDirty(true);
    });
    editor().addEventListener('input', function() { setDirty(true); saveSelection(); });
    editor().addEventListener('keyup', saveSelection);
    editor().addEventListener('mouseup', saveSelection);
    sourceArea().addEventListener('input', function() { setDirty(true); });
  }

  function bindCatPicker() {
    var lists = [$('parentPickerList'), $('kittenPickerList')];
    lists.forEach(function(list) {
      if (!list) return;
      list.addEventListener('change', function(e) {
        var input = e.target;
        if (!input || input.type !== 'checkbox') return;
        var id = input.dataset.catId;
        if (!id) return;
        if (input.dataset.catType === 'parent') {
          if (input.checked) selectedParents.add(id);
          else selectedParents.delete(id);
        } else if (input.dataset.catType === 'kitten') {
          if (input.checked) selectedKittens.add(id);
          else selectedKittens.delete(id);
        }
        renderCatPicker();
        setDirty(true);
      });
    });
    $('catSearch').addEventListener('input', renderCatPicker);
    $('btnSelectLitterCats').addEventListener('click', selectCurrentLitterCats);
  }

  function bindActions() {
    $('btnNew').addEventListener('click', newArticle);
    $('btnSave').addEventListener('click', saveArticle);
    $('btnDelete').addEventListener('click', deleteArticle);
    $('btnPreview').addEventListener('click', previewArticle);
    $('articleSearch').addEventListener('input', renderArticleList);
    $('btnReload').addEventListener('click', function() {
      loadCatData().then(loadArticles);
    });
    $('btnLangToggle').addEventListener('click', function() {
      window.admLang = (window.admLang === 'zh') ? 'ja' : 'zh';
      localStorage.setItem('fuluck-admin-lang', window.admLang);
      applyStaticLabels();
      renderLitterOptions();
      renderCatPicker();
      renderArticleList();
      fillFormFromArticle();
    });
    $('btnLogout').addEventListener('click', function() {
      sessionStorage.removeItem('fuluck-admin-auth');
      sessionStorage.removeItem('fuluck-admin-pwd');
      location.reload();
    });

    // Cmd/Ctrl+S to save
    document.addEventListener('keydown', function(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveArticle(); }
    });

    // Warn on close with unsaved changes
    window.addEventListener('beforeunload', function(e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; return ''; }
    });
  }

  function applyStaticLabels() {
    // Toggles all data-adm-ja/zh labels into the active language
    var lang = window.admLang === 'zh' ? 'zh' : 'ja';
    document.querySelectorAll('[data-adm-ja]').forEach(function(el) {
      var v = el.getAttribute('data-adm-' + lang);
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll('[data-adm-ja-attr-placeholder]').forEach(function(el) {
      var v = el.getAttribute('data-adm-' + lang + '-attr-placeholder');
      if (v != null) el.setAttribute('placeholder', v);
    });
    var btn = $('btnLangToggle');
    if (btn) btn.textContent = (lang === 'ja') ? '🌐 中文' : '🌐 日本語';
  }

  // ===== Init =====
  function init() {
    window.admLang = localStorage.getItem('fuluck-admin-lang') || 'ja';
    applyStaticLabels();
    bindToolbar();
    bindDropZone();
    bindFilePickers();
    bindLangTabs();
    bindAutoSlug();
    bindCatPicker();
    bindActions();
    loadCatData().then(function() {
      return loadArticles();
    }).then(function() {
      // Auto-load first article or start fresh
      var qs = new URLSearchParams(location.search);
      var slugFromUrl = qs.get('slug');
      if (slugFromUrl && articles.some(function(a) { return a.slug === slugFromUrl; })) {
        loadArticleIntoEditor(slugFromUrl);
      } else if (articles.length > 0) {
        loadArticleIntoEditor(articles[0].slug);
      } else {
        newArticle();
      }
    });
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', function() {
    var loginBtn = $('loginBtn');
    if (loginBtn) {
      loginBtn.addEventListener('click', doLogin);
      $('loginPassword').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') doLogin();
      });
    }
    if (sessionStorage.getItem('fuluck-admin-auth') === '1') {
      $('loginScreen').style.display = 'none';
      $('editorLayout').classList.add('active');
      init();
    }
  });
})();
