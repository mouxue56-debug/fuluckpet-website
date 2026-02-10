/**
 * Data Migration: localStorage → Worker KV
 * One-time migration tool. Shows progress in the Admin data management panel.
 */

var FuluckMigrate = (function() {

  function getLocalData() {
    try {
      var raw = localStorage.getItem('fuluck-admin-data');
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return null;
  }

  function migrate(onProgress) {
    var local = getLocalData();
    if (!local) {
      onProgress({ done: true, error: 'localStorage にデータがありません' });
      return Promise.resolve(false);
    }

    var types = ['kittens', 'parents', 'reviews'];
    var total = types.reduce(function(sum, t) { return sum + (local[t] ? local[t].length : 0); }, 0);

    if (total === 0) {
      onProgress({ done: true, error: 'データが空です' });
      return Promise.resolve(false);
    }

    onProgress({ step: 0, total: types.length, msg: '移行開始... / 开始迁移...' });

    var chain = Promise.resolve();
    var success = 0;
    var fail = 0;

    types.forEach(function(type, i) {
      chain = chain.then(function() {
        var items = local[type] || [];
        if (items.length === 0) return;

        onProgress({
          step: i + 1,
          total: types.length,
          msg: type + ': ' + items.length + ' 件を移行中... / 迁移中...'
        });

        return FuluckAPI.bulkImport(type, items)
          .then(function(res) {
            success += items.length;
            onProgress({
              step: i + 1,
              total: types.length,
              msg: type + ': ✅ ' + items.length + ' 件完了 / 完成'
            });
          })
          .catch(function(err) {
            fail += items.length;
            onProgress({
              step: i + 1,
              total: types.length,
              msg: type + ': ❌ ' + err.message
            });
          });
      });
    });

    return chain.then(function() {
      onProgress({
        done: true,
        msg: '完了: ' + success + ' 件成功, ' + fail + ' 件失敗 / 完成: ' + success + ' 成功, ' + fail + ' 失败'
      });
      return fail === 0;
    });
  }

  return { migrate: migrate, getLocalData: getLocalData };
})();
