// admin-settings.js — Password change + initialization
// Depends on: admin-core.js (PASS_KEY, showToast, addLog), admin-images.js (t, admLang)

document.getElementById('changePasswordBtn').addEventListener('click', function() {
  var np = document.getElementById('newPassword').value;
  var cp = document.getElementById('confirmPassword').value;
  if (!np) { showToast(t('パスワードを入力してください','请输入密码'), 'error'); return; }
  if (np !== cp) { showToast(t('パスワードが一致しません','两次密码不一致'), 'error'); return; }
  localStorage.setItem(PASS_KEY, np);
  showToast(t('パスワードを変更しました','已修改密码'), 'success');
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
  addLog(t('パスワードを変更しました','已修改密码'));
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
