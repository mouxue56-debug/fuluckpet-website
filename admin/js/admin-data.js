// admin-data.js — Data export/import/reset/migration
// Depends on: admin-core.js (data, saveData, migrateData, etc.), admin-images.js (t)

function exportJSON() {
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'fuluck-admin-data-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  addLog(t('データをJSONエクスポートしました','已导出JSON数据'));
  showToast(t('エクスポートしました','已导出'), 'success');
}

function importAdminData(imported) {
  var valid = imported && SYNC_COLLECTIONS.every(function(type) {
    return Array.isArray(imported[type]);
  });
  if (!valid) return Promise.reject(new Error('Invalid admin import collections.'));
  if (!remoteDataReady || !remoteDataSnapshot) {
    return Promise.reject(new Error('Remote data is not ready; import is locked.'));
  }

  imported = migrateData(cloneAdminCollections(imported));
  var operation = saveData(imported);
  // saveData captured this exact payload in local storage before returning. Keep
  // the same working copy active even if KV is temporarily unavailable so the
  // manual retry cannot converge remote data while leaving a stale UI behind.
  data = imported;
  renderAll();
  return operation;
}

document.getElementById('importFileInput').addEventListener('change', function(e) {
  if (!e.target.files.length) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var imported = JSON.parse(ev.target.result);
      if (!SYNC_COLLECTIONS.every(function(type) { return Array.isArray(imported[type]); })) {
        showToast(t('無効なデータファイルです','无效的数据文件'), 'error');
        return;
      }
      if (!confirm(t('現在のデータを上書きします。よろしいですか？','将覆盖当前数据。确定吗？'))) return;
      importAdminData(imported).then(function() {
        addLog(t('JSONデータをインポートしました','已导入JSON数据'));
        showToast(t('インポートしました','已导入'), 'success');
      }).catch(function(err) {
        showToast(t('インポート保存に失敗しました: ','导入保存失败: ') + err.message, 'error');
      });
    } catch(err) {
      showToast(t('ファイルの読み込みに失敗しました','文件读取失败'), 'error');
    }
  };
  reader.readAsText(e.target.files[0]);
  e.target.value = '';
});

function resetData() {
  if (!confirm(t('すべてのデータを初期状態に戻します。\n（サイトの実際のデータに復元されます）\n\nよろしいですか？','将所有数据恢复到初始状态。\n（恢复为网站的实际数据）\n\n确定吗？'))) return;
  localStorage.removeItem(STORAGE_KEY);
  remoteDataReady = false;
  remoteDataSnapshot = null;
  data = emptyAdminData();
  renderDashboard();
  renderKittens();
  renderParents();
  renderReviews();
  return Promise.resolve(syncFromAPI()).then(function(success) {
    if (success) {
      addLog(t('クラウドの最新データを再読込しました','已重新加载云端最新数据'));
      showToast(t('クラウドの最新データを読み込みました','已加载云端最新数据'), 'success');
    } else {
      showToast(t('再読込に失敗しました。保存はロックされています。','重新加载失败，保存仍处于锁定状态。'), 'error');
    }
    return success;
  });
}

function runMigration() {
  if (!remoteDataReady || !remoteDataSnapshot) {
    showToast(t('先にクラウドの最新データを読み込んでください','请先加载云端最新数据'), 'error');
    return Promise.resolve(false);
  }
  if (!confirm(t('ローカルデータをクラウドに移行しますか？\n（クラウドのデータは上書きされます）','将本地数据迁移到云端？\n（云端数据将被覆盖）'))) return;
  var el = document.getElementById('migrateProgress');
  el.textContent = t('移行中...','迁移中...');
  // Historical FuluckMigrate wrote every collection directly and swallowed
  // partial failures. Route this legacy button through the same fail-closed,
  // changed-collection save path used everywhere else.
  return saveData(data).then(function() {
    el.textContent = t('移行完了','迁移完成');
    showToast(t('クラウドに移行しました','已迁移到云端'), 'success');
    addLog(t('データをクラウド(KV)に移行しました','已将数据迁移到云端(KV)'));
    return true;
  }).catch(function(err) {
    el.textContent = t('移行失敗: ','迁移失败: ') + err.message;
    showToast(el.textContent, 'error');
    return false;
  });
}
