// admin-faq.js — FAQ management in admin panel
// Depends on: admin-core.js (FuluckAPI, showToast, etc.), admin-images.js (t, admLang)

var faqData = [];
var faqRemoteReady = false;
var faqMutationInFlight = false;

function faqRequireRemoteReady() {
  if (faqRemoteReady) return true;
  showToast(t('FAQのクラウド同期が完了するまで操作できません','FAQ云端同步完成前无法操作'), 'error');
  return false;
}

function faqBeginMutation() {
  if (faqMutationInFlight) {
    showToast(t('FAQの保存処理が完了するまでお待ちください','请等待FAQ保存完成'), 'error');
    return false;
  }
  faqMutationInFlight = true;
  return true;
}

function loadFaqData() {
  faqRemoteReady = false;
  if (typeof FuluckAPI === 'undefined' || typeof FuluckAPI.get !== 'function') {
    return Promise.resolve(false);
  }
  return FuluckAPI.get('/api/admin/faq').then(function(items) {
    if (!Array.isArray(items)) throw new Error('Invalid FAQ collection');
    faqData = items;
    faqRemoteReady = true;
    renderFaqTable();
    return true;
  }).catch(function() {
    faqRemoteReady = false;
    renderFaqTable();
    showToast(t('FAQの読み込みに失敗しました。編集はロックされています','FAQ加载失败，编辑已锁定'), 'error');
    return false;
  });
}

function faqText(value) {
  return value == null ? '' : String(value);
}

function faqTableCell(text, styles) {
  var cell = document.createElement('td');
  cell.textContent = faqText(text);
  Object.keys(styles || {}).forEach(function(property) {
    cell.style[property] = styles[property];
  });
  return cell;
}

function faqActionButton(label, actionClass, handler) {
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'action-btn ' + actionClass;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function renderFaqTable() {
  var tbody = document.getElementById('faqTableBody');
  if (!tbody) return;
  tbody.textContent = '';
  if (faqData.length === 0) {
    var emptyRow = document.createElement('tr');
    var emptyCell = faqTableCell(t('FAQデータがありません','暂无FAQ数据'), {
      textAlign: 'center',
      color: 'var(--text-light)',
      padding: '24px'
    });
    emptyCell.colSpan = 5;
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
    return;
  }
  var sorted = faqData.filter(function(f) {
    return f && typeof f === 'object';
  }).sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
  sorted.forEach(function(f) {
    var q = faqText(f.question ? (f.question.ja || f.question.zh || '') : '');
    var cat = faqText(f.category || 'general');
    var pubIcon = f.published ? '✅' : '⬜';
    var row = document.createElement('tr');
    row.appendChild(faqTableCell(f.order || 0, { textAlign: 'center' }));
    row.appendChild(faqTableCell(q.length > 40 ? q.substring(0, 40) + '...' : q, { maxWidth: '300px' }));
    row.appendChild(faqTableCell(cat));
    row.appendChild(faqTableCell(pubIcon, { textAlign: 'center' }));

    var actionsCell = document.createElement('td');
    var actions = document.createElement('div');
    actions.className = 'action-btns';
    actions.appendChild(faqActionButton(t('編集','编辑'), 'edit', function() {
      editFaq(f.id);
    }));
    actions.appendChild(faqActionButton(t('削除','删除'), 'delete', function() {
      deleteFaq(f.id);
    }));
    actionsCell.appendChild(actions);
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });
}

function openFaqForm(faq) {
  document.getElementById('faqEditId').value = faq ? faq.id : '';
  document.getElementById('faqFormTitle').textContent = faq ? t('FAQの編集','编辑FAQ') : t('FAQの追加','添加FAQ');
  document.getElementById('faq_q_ja').value = faq && faq.question ? (faq.question.ja || '') : '';
  document.getElementById('faq_q_en').value = faq && faq.question ? (faq.question.en || '') : '';
  document.getElementById('faq_q_zh').value = faq && faq.question ? (faq.question.zh || '') : '';
  document.getElementById('faq_a_ja').value = faq && faq.answer ? (faq.answer.ja || '') : '';
  document.getElementById('faq_a_en').value = faq && faq.answer ? (faq.answer.en || '') : '';
  document.getElementById('faq_a_zh').value = faq && faq.answer ? (faq.answer.zh || '') : '';
  document.getElementById('faq_category').value = faq ? (faq.category || 'general') : 'general';
  document.getElementById('faq_order').value = faq ? (faq.order || 0) : (faqData.length + 1);
  document.getElementById('faq_published').value = faq ? String(faq.published !== false) : 'true';
  openModal('faqFormModal');
}

function editFaq(id) {
  var faq = faqData.find(function(f) { return f.id === id; });
  if (faq) openFaqForm(faq);
}

function saveFaq() {
  if (!faqRequireRemoteReady()) return Promise.resolve(false);
  var editId = document.getElementById('faqEditId').value;
  var obj = {
    question: {
      ja: document.getElementById('faq_q_ja').value.trim(),
      en: document.getElementById('faq_q_en').value.trim(),
      zh: document.getElementById('faq_q_zh').value.trim()
    },
    answer: {
      ja: document.getElementById('faq_a_ja').value.trim(),
      en: document.getElementById('faq_a_en').value.trim(),
      zh: document.getElementById('faq_a_zh').value.trim()
    },
    category: document.getElementById('faq_category').value,
    order: parseInt(document.getElementById('faq_order').value) || 0,
    published: document.getElementById('faq_published').value === 'true'
  };

  if (!obj.question.ja) {
    showToast(t('質問（日本語）を入力してください','请输入问题（日语）'), 'error');
    return Promise.resolve(false);
  }

  var idx = -1;
  if (editId) {
    idx = faqData.findIndex(function(f) { return f.id === editId; });
    if (idx < 0) {
      showToast(t('編集対象のFAQが見つかりません','找不到要编辑的FAQ'), 'error');
      return Promise.resolve(false);
    }
  }
  if (!faqBeginMutation()) return Promise.resolve(false);

  return Promise.resolve().then(function() {
    return editId
      ? FuluckAPI.put('/api/admin/faq/' + encodeURIComponent(editId), obj)
      : FuluckAPI.post('/api/admin/faq', obj);
  }).then(function(saved) {
    if (!saved || typeof saved !== 'object' || !saved.id) throw new Error('Invalid FAQ response');
    if (editId) {
      var updated = Object.assign({}, faqData[idx], obj, saved, { id: editId });
      faqData = faqData.map(function(item, itemIndex) { return itemIndex === idx ? updated : item; });
    } else {
      faqData = faqData.concat([saved]);
    }
    closeModal('faqFormModal');
    renderFaqTable();
    showToast(t('保存しました','已保存'), 'success');
    addLog(t('FAQ を更新しました','更新了FAQ'));
    return true;
  }).catch(function(err) {
    showToast('Error: ' + err.message, 'error');
    return false;
  }).finally(function() {
    faqMutationInFlight = false;
  });
}

function deleteFaq(id) {
  if (!faqRequireRemoteReady()) return Promise.resolve(false);
  var f = faqData.find(function(x) { return x.id === id; });
  if (!f) return Promise.resolve(false);
  var q = f.question ? (f.question.ja || '') : '';
  if (!confirm(t('FAQ「' + q + '」を削除しますか？','确定删除FAQ「' + q + '」？'))) return Promise.resolve(false);
  if (!faqBeginMutation()) return Promise.resolve(false);
  return Promise.resolve().then(function() {
    return FuluckAPI.del('/api/admin/faq/' + encodeURIComponent(id));
  }).then(function() {
    faqData = faqData.filter(function(x) { return x.id !== id; });
    renderFaqTable();
    showToast(t('削除しました','已删除'), 'success');
    addLog(t('FAQ を削除しました','删除了FAQ'));
    return true;
  }).catch(function(err) {
    showToast('Error: ' + err.message, 'error');
    return false;
  }).finally(function() {
    faqMutationInFlight = false;
  });
}

function seedDefaultFaq() {
  if (!faqRequireRemoteReady()) return Promise.resolve(false);
  if (!confirm(t('デフォルトの6件のFAQを読み込みますか？\n（既存データは上書きされます）','要加载默认的6条FAQ吗？\n（将覆盖现有数据）'))) return Promise.resolve(false);
  var defaults = [
    { id:'faq_1', order:1, category:'general', published:true,
      question:{ ja:'猫アレルギーですが、サイベリアンなら大丈夫ですか？', en:'I have cat allergies. Will a Siberian be okay?', zh:'我有猫过敏，西伯利亚猫可以吗？' },
      answer:{ ja:'サイベリアンはアレルゲン（Fel d1）の分泌量が他の猫種より少ないとされていますが、個人差があります。ご心配な方には見学時にアレルギーの相性チェックのお時間を長めにお取りすることが可能です。お気軽にLINEでご相談ください。', en:'Siberians are known to produce less allergen (Fel d1) than other breeds, but individual reactions vary. We can arrange extra time during visits for allergy compatibility checks. Please contact us via LINE.', zh:'西伯利亚猫的过敏原（Fel d1）分泌量比其他猫种少，但因人而异。如果您担心，我们可以在参观时安排更长的过敏相容性检查时间。请随时通过LINE咨询。' } },
    { id:'faq_2', order:2, category:'purchase', published:true,
      question:{ ja:'見学は予約制ですか？', en:'Are visits by appointment only?', zh:'参观需要预约吗？' },
      answer:{ ja:'はい、完全予約制となっております。LINEまたはお電話にて前日までにご予約ください。対面見学のほか、LINEビデオ通話での見学も承っております。', en:'Yes, all visits are by appointment only. Please book at least one day in advance via LINE or phone. We also offer LINE video call visits.', zh:'是的，完全预约制。请至少提前一天通过LINE或电话预约。除了面对面参观，我们也提供LINE视频通话参观。' } },
    { id:'faq_3', order:3, category:'purchase', published:true,
      question:{ ja:'遠方に住んでいますが、お迎えは可能ですか？', en:'I live far away. Can I still adopt?', zh:'我住得很远，可以接猫吗？' },
      answer:{ ja:'はい、全国へのお届けに対応しております。空輸・陸送のほか、直接お迎えに来ていただくことも可能です。詳しくはお問い合わせください。', en:'Yes, we deliver nationwide via air or ground transport. You can also pick up in person. Please contact us for details.', zh:'是的，我们提供全国送猫服务，包括空运和陆运。您也可以亲自来接。详情请咨询。' } },
    { id:'faq_4', order:4, category:'purchase', published:true,
      question:{ ja:'子猫の価格帯を教えてください。', en:'What is the price range for kittens?', zh:'小猫的价格范围是多少？' },
      answer:{ ja:'猫種・血統・カラーにより異なりますが、概ね16万円～29万円（税込）となっております。※時期や個体により変動する場合がございます。詳しくは子猫一覧ページをご確認いただくか、お問い合わせください。', en:'Prices vary by breed, pedigree, and color, generally ranging from ¥160,000 to ¥290,000 (tax included). Please check our kitten listing page or contact us for details.', zh:'价格因品种、血统和毛色而异，大约在16万～29万日元（含税）之间。详情请查看小猫列表页面或咨询我们。' } },
    { id:'faq_5', order:5, category:'care', published:true,
      question:{ ja:'お迎え後のサポートはありますか？', en:'Is there support after adoption?', zh:'接猫后有售后支持吗？' },
      answer:{ ja:'はい、お迎え後もLINEにていつでもご相談いただけます。食事・健康管理・しつけなど、何でもお気軽にご連絡ください。末永くサポートいたします。', en:'Yes, you can contact us anytime via LINE after adoption for advice on diet, health care, training, and more. We provide lifelong support.', zh:'是的，接猫后您可以随时通过LINE联系我们，咨询饮食、健康管理、训练等问题。我们提供终身售后支持。' } },
    { id:'faq_6', order:6, category:'general', published:true,
      question:{ ja:'サイベリアン以外の猫種も扱っていますか？', en:'Do you have breeds other than Siberian?', zh:'除了西伯利亚猫还有其他品种吗？' },
      answer:{ ja:'はい、サイベリアンを中心に、ブリティッシュショートヘア・ブリティッシュロングヘア・ラグドールも取り扱っております。ご希望の猫種がございましたらお問い合わせください。', en:'Yes, in addition to Siberians, we also breed British Shorthairs, British Longhairs, and Ragdolls. Please contact us if you have a specific breed in mind.', zh:'是的，除了西伯利亚猫，我们还繁育英国短毛猫、英国长毛猫和布偶猫。如果您有特定品种需求，请联系我们。' } }
  ];
  if (!faqBeginMutation()) return Promise.resolve(false);
  return Promise.resolve().then(function() {
    return FuluckAPI.bulkImport('faq', defaults);
  }).then(function() {
    faqData = defaults;
    renderFaqTable();
    showToast(t('デフォルトFAQを読み込みました','已加载默认FAQ'), 'success');
    addLog(t('デフォルトFAQ 6件を読み込みました','加载了6条默认FAQ'));
    return true;
  }).catch(function(err) {
    showToast('Error: ' + err.message, 'error');
    return false;
  }).finally(function() {
    faqMutationInFlight = false;
  });
}
