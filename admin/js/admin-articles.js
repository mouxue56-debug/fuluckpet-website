// admin-articles.js — Article/knowledge base management in admin panel
// Depends on: admin-core.js (FuluckAPI, showToast, etc.), admin-images.js (t, admLang)

var articlesData = [];
var articlesRemoteReady = false;
var articlesMutationInFlight = false;

var ARTICLE_CATEGORIES = {
  health: { ja: '健康管理', zh: '健康管理' },
  nutrition: { ja: '飲食栄養', zh: '饮食营养' },
  grooming: { ja: '日常ケア', zh: '日常护理' },
  behavior: { ja: '行動訓練', zh: '行为训练' },
  breed: { ja: '猫種知識', zh: '品种知识' },
  kitten: { ja: '子猫育て', zh: '幼猫养育' },
  senior: { ja: 'シニア猫', zh: '老年猫护理' },
  lifestyle: { ja: '猫ライフ', zh: '猫咪生活' }
};

function articlesRequireRemoteReady() {
  if (articlesRemoteReady) return true;
  showToast(t('記事のクラウド同期が完了するまで操作できません','文章云端同步完成前无法操作'), 'error');
  return false;
}

function articlesBeginMutation() {
  if (articlesMutationInFlight) {
    showToast(t('記事の保存処理が完了するまでお待ちください','请等待文章保存完成'), 'error');
    return false;
  }
  articlesMutationInFlight = true;
  return true;
}

function loadArticlesData() {
  articlesRemoteReady = false;
  if (typeof FuluckAPI === 'undefined' || typeof FuluckAPI.get !== 'function') {
    return Promise.resolve(false);
  }
  return FuluckAPI.get('/api/admin/articles').then(function(items) {
    if (!Array.isArray(items)) throw new Error('Invalid article collection');
    articlesData = items;
    articlesRemoteReady = true;
    renderArticlesTable();
    return true;
  }).catch(function() {
    articlesRemoteReady = false;
    renderArticlesTable();
    showToast(t('記事の読み込みに失敗しました。編集はロックされています','文章加载失败，编辑已锁定'), 'error');
    return false;
  });
}

function articleText(value) {
  return value == null ? '' : String(value);
}

function articleTableCell(text, styles) {
  var cell = document.createElement('td');
  cell.textContent = articleText(text);
  Object.keys(styles || {}).forEach(function(property) {
    cell.style[property] = styles[property];
  });
  return cell;
}

function articleActionButton(label, actionClass, handler) {
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'action-btn ' + actionClass;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function articleSafeCoverUrl(value) {
  var url = articleText(value).trim();
  if (/^https:\/\/[^\s\u0000-\u001f\u007f]+$/i.test(url)) return url;
  if (/^\/(?!\/)/.test(url) && !/[\\\u0000-\u001f\u007f]/.test(url)) return url;
  return '';
}

function articleCoverCell(value) {
  var cell = document.createElement('td');
  var safeUrl = articleSafeCoverUrl(value);
  var preview;
  if (safeUrl) {
    preview = document.createElement('img');
    preview.src = safeUrl;
    preview.alt = '';
    preview.className = 'thumb-img';
    preview.style.width = '40px';
    preview.style.height = '40px';
  } else {
    preview = document.createElement('div');
    preview.className = 'thumb-placeholder';
    preview.textContent = '📝';
    preview.style.width = '40px';
    preview.style.height = '40px';
  }
  cell.appendChild(preview);
  return cell;
}

function renderArticlesTable() {
  var tbody = document.getElementById('articlesTableBody');
  if (!tbody) return;
  tbody.textContent = '';
  if (!Array.isArray(articlesData) || articlesData.length === 0) {
    var emptyRow = document.createElement('tr');
    var emptyCell = articleTableCell(t('記事データがありません','暂无文章数据'), {
      textAlign: 'center',
      color: 'var(--text-light)',
      padding: '24px'
    });
    emptyCell.colSpan = 5;
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
    return;
  }
  articlesData.filter(function(article) {
    return article && typeof article === 'object';
  }).forEach(function(article) {
    var title = articleText(article.title ? (article.title.ja || article.title.en || article.title.zh || '') : '');
    var category = articleText(article.category || '');
    var categoryRecord = Object.prototype.hasOwnProperty.call(ARTICLE_CATEGORIES, category)
      ? ARTICLE_CATEGORIES[category]
      : null;
    var categoryLabel = categoryRecord
      ? (admLang === 'zh' ? categoryRecord.zh : categoryRecord.ja)
      : category;
    var row = document.createElement('tr');
    row.appendChild(articleCoverCell(article.coverImage));
    row.appendChild(articleTableCell(title.length > 40 ? title.substring(0, 40) + '...' : title, { maxWidth: '300px' }));
    row.appendChild(articleTableCell(categoryLabel));
    row.appendChild(articleTableCell(article.published ? '✅' : '⬜', { textAlign: 'center' }));

    var actionsCell = document.createElement('td');
    var actions = document.createElement('div');
    actions.className = 'action-btns';
    actions.appendChild(articleActionButton(t('編集','编辑'), 'edit', function() {
      editArticle(article.id);
    }));
    actions.appendChild(articleActionButton(t('削除','删除'), 'delete', function() {
      deleteArticle(article.id);
    }));
    actionsCell.appendChild(actions);
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });
}

function openArticleForm(article) {
  document.getElementById('articleEditId').value = article ? article.id : '';
  document.getElementById('articleFormTitle').textContent = article ? t('記事の編集','编辑文章') : t('記事の追加','添加文章');
  document.getElementById('art_slug').value = article ? (article.slug || '') : '';
  document.getElementById('art_category').value = article ? (article.category || 'health') : 'health';
  document.getElementById('art_title_ja').value = article && article.title ? (article.title.ja || '') : '';
  document.getElementById('art_title_en').value = article && article.title ? (article.title.en || '') : '';
  document.getElementById('art_title_zh').value = article && article.title ? (article.title.zh || '') : '';
  document.getElementById('art_excerpt_ja').value = article && article.excerpt ? (article.excerpt.ja || '') : '';
  document.getElementById('art_content_ja').value = article && article.content ? (article.content.ja || '') : '';
  document.getElementById('art_cover').value = article ? (article.coverImage || '') : '';
  document.getElementById('art_published').value = article ? String(article.published !== false) : 'true';
  openModal('articleFormModal');
}

function editArticle(id) {
  var article = articlesData.find(function(item) { return item.id === id; });
  if (article) openArticleForm(article);
}

function articleServerRecord(value, expectedId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (typeof value.id !== 'string' || !value.id.trim()) return false;
  if (expectedId !== undefined && value.id !== expectedId) return false;
  if (!value.title || typeof value.title !== 'object' || Array.isArray(value.title)) return false;
  return true;
}

function saveArticle() {
  if (!articlesRequireRemoteReady()) return Promise.resolve(false);
  var editId = document.getElementById('articleEditId').value;
  var obj = {
    slug: document.getElementById('art_slug').value.trim(),
    category: document.getElementById('art_category').value,
    title: {
      ja: document.getElementById('art_title_ja').value.trim(),
      en: document.getElementById('art_title_en').value.trim(),
      zh: document.getElementById('art_title_zh').value.trim()
    },
    excerpt: { ja: document.getElementById('art_excerpt_ja').value.trim(), en: '', zh: '' },
    content: { ja: document.getElementById('art_content_ja').value.trim(), en: '', zh: '' },
    coverImage: document.getElementById('art_cover').value.trim(),
    published: document.getElementById('art_published').value === 'true',
    tags: []
  };

  if (!obj.slug || !obj.title.ja) {
    showToast(t('Slugとタイトル（日本語）を入力してください','请输入Slug和标题（日语）'), 'error');
    return Promise.resolve(false);
  }

  var index = -1;
  if (editId) {
    index = articlesData.findIndex(function(article) { return article.id === editId; });
    if (index < 0) {
      showToast(t('編集対象の記事が見つかりません','找不到要编辑的文章'), 'error');
      return Promise.resolve(false);
    }
    var existing = articlesData[index];
    obj.excerpt.en = existing.excerpt ? articleText(existing.excerpt.en) : '';
    obj.excerpt.zh = existing.excerpt ? articleText(existing.excerpt.zh) : '';
    obj.content.en = existing.content ? articleText(existing.content.en) : '';
    obj.content.zh = existing.content ? articleText(existing.content.zh) : '';
    delete obj.tags;
  }
  if (!articlesBeginMutation()) return Promise.resolve(false);

  return Promise.resolve().then(function() {
    return editId
      ? FuluckAPI.put('/api/admin/articles/' + encodeURIComponent(editId), obj)
      : FuluckAPI.post('/api/admin/articles', obj);
  }).then(function(saved) {
    if (!articleServerRecord(saved, editId || undefined)) throw new Error('Invalid article response');
    if (!editId && articlesData.some(function(article) { return article.id === saved.id; })) {
      throw new Error('Duplicate article response');
    }
    if (editId) {
      articlesData = articlesData.map(function(article, itemIndex) {
        return itemIndex === index ? saved : article;
      });
    } else {
      articlesData = articlesData.concat([saved]);
    }
    closeModal('articleFormModal');
    renderArticlesTable();
    showToast(t('保存しました','已保存'), 'success');
    addLog(t('記事を更新しました','更新了文章'));
    return true;
  }).catch(function(err) {
    articlesRemoteReady = false;
    showToast('Error: ' + err.message, 'error');
    return false;
  }).finally(function() {
    articlesMutationInFlight = false;
  });
}

function deleteArticle(id) {
  if (!articlesRequireRemoteReady()) return Promise.resolve(false);
  var article = articlesData.find(function(item) { return item.id === id; });
  if (!article) return Promise.resolve(false);
  var title = articleText(article.title ? (article.title.ja || '') : '');
  if (!confirm(t('記事「' + title + '」を削除しますか？','确定删除文章「' + title + '」？'))) return Promise.resolve(false);
  if (!articlesBeginMutation()) return Promise.resolve(false);
  return Promise.resolve().then(function() {
    return FuluckAPI.del('/api/admin/articles/' + encodeURIComponent(id));
  }).then(function(result) {
    if (!result || typeof result !== 'object' || result.success !== true) throw new Error('Invalid article delete response');
    articlesData = articlesData.filter(function(item) { return item.id !== id; });
    renderArticlesTable();
    showToast(t('削除しました','已删除'), 'success');
    addLog(t('記事を削除しました','删除了文章'));
    return true;
  }).catch(function(err) {
    articlesRemoteReady = false;
    showToast('Error: ' + err.message, 'error');
    return false;
  }).finally(function() {
    articlesMutationInFlight = false;
  });
}
