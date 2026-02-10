// admin-articles.js — Article/knowledge base management in admin panel
// Depends on: admin-core.js (FuluckAPI, showToast, etc.), admin-images.js (t, admLang)

var articlesData = [];

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

function loadArticlesData() {
  if (typeof FuluckAPI === 'undefined') return;
  FuluckAPI.get('/api/articles').then(function(items) {
    articlesData = items || [];
    renderArticlesTable();
  }).catch(function() {
    // Try admin endpoint (includes unpublished)
    FuluckAPI.get('/api/admin/articles').then(function(items) {
      articlesData = items || [];
      renderArticlesTable();
    }).catch(function() {
      articlesData = [];
      renderArticlesTable();
    });
  });
}

function renderArticlesTable() {
  var tbody = document.getElementById('articlesTableBody');
  if (!tbody) return;
  if (articlesData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:24px;">' + t('記事データがありません','暂无文章数据') + '</td></tr>';
    return;
  }
  tbody.innerHTML = articlesData.map(function(a) {
    var title = a.title ? (a.title.ja || a.title.en || '') : '';
    var cat = a.category || '';
    var catLabel = ARTICLE_CATEGORIES[cat] ? (admLang === 'zh' ? ARTICLE_CATEGORIES[cat].zh : ARTICLE_CATEGORIES[cat].ja) : cat;
    var pubIcon = a.published ? '✅' : '⬜';
    var coverThumb = a.coverImage ? '<img src="' + a.coverImage + '" class="thumb-img" style="width:40px;height:40px;">' : '<div class="thumb-placeholder" style="width:40px;height:40px;">📝</div>';
    return '<tr>' +
      '<td>' + coverThumb + '</td>' +
      '<td style="max-width:300px;">' + (title.length > 40 ? title.substring(0, 40) + '...' : title) + '</td>' +
      '<td>' + catLabel + '</td>' +
      '<td style="text-align:center;">' + pubIcon + '</td>' +
      '<td><div class="action-btns">' +
        '<button class="action-btn edit" onclick="editArticle(\'' + a.id + '\')">' + t('編集','编辑') + '</button>' +
        '<button class="action-btn delete" onclick="deleteArticle(\'' + a.id + '\')">' + t('削除','删除') + '</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
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
  var article = articlesData.find(function(a) { return a.id === id; });
  if (article) openArticleForm(article);
}

function saveArticle() {
  var editId = document.getElementById('articleEditId').value;
  var obj = {
    slug: document.getElementById('art_slug').value.trim(),
    category: document.getElementById('art_category').value,
    title: { ja: document.getElementById('art_title_ja').value.trim(), en: document.getElementById('art_title_en').value.trim(), zh: document.getElementById('art_title_zh').value.trim() },
    excerpt: { ja: document.getElementById('art_excerpt_ja').value.trim(), en: '', zh: '' },
    content: { ja: document.getElementById('art_content_ja').value.trim(), en: '', zh: '' },
    coverImage: document.getElementById('art_cover').value.trim(),
    published: document.getElementById('art_published').value === 'true',
    tags: []
  };

  if (!obj.slug || !obj.title.ja) { showToast(t('Slugとタイトル（日本語）を入力してください','请输入Slug和标题（日语）'), 'error'); return; }

  if (editId) {
    var idx = articlesData.findIndex(function(a) { return a.id === editId; });
    if (idx >= 0) {
      obj.id = editId;
      obj.createdAt = articlesData[idx].createdAt;
      obj.publishedAt = articlesData[idx].publishedAt;
      obj.updatedAt = new Date().toISOString();
      if (obj.published && !obj.publishedAt) obj.publishedAt = obj.updatedAt;
      articlesData[idx] = obj;
    }
  } else {
    obj.id = 'art_' + Date.now();
    obj.createdAt = new Date().toISOString();
    if (obj.published) obj.publishedAt = obj.createdAt;
    articlesData.push(obj);
  }

  FuluckAPI.bulkImport('articles', articlesData).then(function() {
    closeModal('articleFormModal');
    renderArticlesTable();
    showToast(t('保存しました','已保存'), 'success');
    addLog(t('記事を更新しました','更新了文章'));
  }).catch(function(err) {
    showToast('Error: ' + err.message, 'error');
  });
}

function deleteArticle(id) {
  var a = articlesData.find(function(x) { return x.id === id; });
  if (!a) return;
  var title = a.title ? (a.title.ja || '') : '';
  if (!confirm(t('記事「' + title + '」を削除しますか？','确定删除文章「' + title + '」？'))) return;
  articlesData = articlesData.filter(function(x) { return x.id !== id; });
  FuluckAPI.bulkImport('articles', articlesData).then(function() {
    renderArticlesTable();
    showToast(t('削除しました','已删除'), 'success');
    addLog(t('記事を削除しました','删除了文章'));
  }).catch(function(err) {
    showToast('Error: ' + err.message, 'error');
  });
}
