// admin-settings.js — Password change + initialization
// Depends on: admin-core.js (PASS_KEY, showToast, addLog), admin-images.js (t, admLang)

document.getElementById('changePasswordBtn').addEventListener('click', function() {
  var curEl = document.getElementById('currentPassword');
  var cur = curEl ? curEl.value : '';
  var np = document.getElementById('newPassword').value;
  var cp = document.getElementById('confirmPassword').value;
  if (!cur) { showToast(t('現在のパスワードを入力してください','请输入当前密码'), 'error'); return; }
  if (!np) { showToast(t('新しいパスワードを入力してください','请输入新密码'), 'error'); return; }
  if (np.length < 8) { showToast(t('新しいパスワードは8文字以上で入力してください','新密码至少需要8位'), 'error'); return; }
  if (np !== cp) { showToast(t('パスワードが一致しません','两次密码不一致'), 'error'); return; }

  var btn = document.getElementById('changePasswordBtn');
  btn.disabled = true;

  // Offline fallback only — when the API client isn't present, keep the legacy
  // local-only behavior so the owner isn't fully locked out of changing the label.
  if (typeof FuluckAPI === 'undefined') {
    localStorage.setItem(PASS_KEY, np);
    btn.disabled = false;
    showToast(t('オフライン: ローカルのみ変更（サーバー未反映）','离线：仅本地修改（服务器未生效）'), 'error');
    return;
  }

  // Rotate the password on the SERVER (KV pw:salt/pw:hash). Previously this only wrote
  // localStorage, so the owner believed they'd changed the password while the server
  // still accepted the old/default one. /password/reset verifies the current password,
  // so a leaked Bearer token alone can't rotate it.
  FuluckAPI.post('/api/admin/password/reset', { currentPassword: cur, newPassword: np })
    .then(function(res) {
      if (res && res.success) {
        // The Bearer token IS the password — update the live session credential and the
        // offline-login fallback so the new password works on the next API call and login.
        try { sessionStorage.setItem('fuluck-admin-pwd', np); } catch (e) {}
        localStorage.setItem(PASS_KEY, np);
        showToast(t('パスワードを変更しました','已修改密码'), 'success');
        addLog(t('パスワードを変更しました','已修改密码'));
        if (curEl) curEl.value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
      } else {
        showToast(t('変更に失敗しました','修改失败'), 'error');
      }
    })
    .catch(function(err) {
      var msg = String((err && err.message) || '');
      if (msg.indexOf('401') !== -1) {
        showToast(t('現在のパスワードが正しくありません','当前密码不正确'), 'error');
      } else {
        showToast(t('変更に失敗しました: ','修改失败: ') + msg, 'error');
      }
    })
    .finally(function() { btn.disabled = false; });
});

// Initial render (if already logged in via session restore in admin-core.js)
if (sessionStorage.getItem('fuluck-admin-auth') === '1') {
  renderAll();
}

// Apply saved language to login screen on load
(function initLoginLang() {
  if (admLang !== 'zh') return;
  var tt = document.getElementById('loginTitle');
  var ss = document.getElementById('loginSub');
  var bb = document.getElementById('loginBtn');
  var ee = document.getElementById('loginError');
  var pp = document.getElementById('loginPassword');
  if (tt) tt.textContent = '福楽猫舍 管理后台';
  if (ss) ss.textContent = '请输入密码登录';
  if (bb) bb.textContent = '登录';
  if (ee) ee.textContent = '密码不正确';
  if (pp) pp.placeholder = '密码';
})();
