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

document.getElementById('importFileInput').addEventListener('change', function(e) {
  if (!e.target.files.length) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var imported = JSON.parse(ev.target.result);
      if (!imported.kittens || !imported.parents || !imported.reviews) {
        showToast(t('無効なデータファイルです','无效的数据文件'), 'error');
        return;
      }
      if (!confirm(t('現在のデータを上書きします。よろしいですか？','将覆盖当前数据。确定吗？'))) return;
      imported = migrateData(imported);
      saveData(imported);
      data = imported;
      addLog(t('JSONデータをインポートしました','已导入JSON数据'));
      renderAll();
      showToast(t('インポートしました','已导入'), 'success');
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
  data = getData();
  addLog(t('データを初期状態にリセットしました','已将数据恢复到初始状态'));
  renderAll();
  showToast(t('データをリセットしました','已重置数据'), 'success');
}

function runMigration() {
  if (!confirm(t('ローカルデータをクラウドに移行しますか？\n（クラウドのデータは上書きされます）','将本地数据迁移到云端？\n（云端数据将被覆盖）'))) return;
  var el = document.getElementById('migrateProgress');
  el.textContent = t('移行中...','迁移中...');
  FuluckMigrate.migrate(function(info) {
    el.textContent = info.msg || '';
    if (info.done) {
      if (!info.error) {
        showToast(t('クラウドに移行しました','已迁移到云端'), 'success');
        addLog(t('データをクラウド(KV)に移行しました','已将数据迁移到云端(KV)'));
      } else {
        showToast(info.error, 'error');
      }
    }
  });
}
