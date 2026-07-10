// admin-core.js — Constants, fail-closed data management, auth, navigation, modal/toast
// Depends on: admin-images.js (admLang, t())

// Constants
var STORAGE_KEY = 'fuluck-admin-data';
var PASS_KEY = 'fuluck-admin-pass';
var LOG_KEY = 'fuluck-admin-log';
var IMAGE_KEY = 'fuluck-admin-images';
var DEFAULT_PASS = '';
var DRIVE_API = 'https://fuluck-api.mouxue56.workers.dev';

// Pagination state
var kittenPage = 1;
var parentPage = 1;
var PAGE_SIZE = 10;

// Remote KV is the only authoritative catalogue source. Local storage is a
// recoverable working copy, never proof that it is safe to overwrite KV.
var SYNC_COLLECTIONS = ['kittens', 'parents', 'reviews'];
var remoteDataReady = false;
var remoteDataSnapshot = null;
var remoteSyncPending = false;
var remoteSyncPromise = null;

function emptyAdminData() {
  return { kittens: [], parents: [], reviews: [] };
}

function cloneAdminCollections(d) {
  var copy = emptyAdminData();
  SYNC_COLLECTIONS.forEach(function(type) {
    copy[type] = JSON.parse(JSON.stringify(Array.isArray(d && d[type]) ? d[type] : []));
  });
  return copy;
}

// Data helpers
function getCoverPhoto(item) {
  if (!item.photos || item.photos.length === 0) return '';
  var idx = item.coverIndex || 0;
  return item.photos[Math.min(idx, item.photos.length - 1)] || '';
}

function migrateData(d) {
  if (d.kittens) d.kittens.forEach(function(k) {
    if (k.coverPhoto !== undefined && k.photos === undefined) {
      k.photos = k.coverPhoto ? [k.coverPhoto] : [];
      k.coverIndex = 0;
      delete k.coverPhoto;
    }
    if (!k.photos) { k.photos = []; k.coverIndex = 0; }
  });
  if (d.parents) d.parents.forEach(function(p) {
    if (p.coverPhoto !== undefined && p.photos === undefined) {
      p.photos = p.coverPhoto ? [p.coverPhoto] : [];
      p.coverIndex = 0;
      delete p.coverPhoto;
    }
    if (!p.photos) { p.photos = []; p.coverIndex = 0; }
  });
  return d;
}

function loadData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return null;
}

// Track last failed payload so the manual retry button can re-attempt the same sync.
var lastFailedSyncPayload = null;
var saveQueue = Promise.resolve();
var saveRequestSequence = 0;
var latestSaveRequest = 0;

// bulkImport one type with exponential backoff: 1s, 2s, 4s (3 retries on top of the initial try).
function bulkImportWithRetry(type, items) {
  var delays = [1000, 2000, 4000];
  function attempt(idx) {
    return FuluckAPI.bulkImport(type, items).catch(function(err) {
      if (idx >= delays.length) throw err;
      return new Promise(function(resolve) {
        setTimeout(resolve, delays[idx]);
      }).then(function() { return attempt(idx + 1); });
    });
  }
  return attempt(0);
}

// Render / hide the manual retry button next to the sync indicator.
function showRetrySyncButton() {
  var btn = document.getElementById('retrySyncBtn');
  if (!btn) return;
  btn.style.display = 'inline-flex';
  btn.textContent = t('🔄 再試行','🔄 重试');
}
function hideRetrySyncButton() {
  var btn = document.getElementById('retrySyncBtn');
  if (btn) btn.style.display = 'none';
}

// Manual retry — re-runs saveData against the last-known data snapshot.
function retrySync() {
  if (!lastFailedSyncPayload) {
    // Fallback: if for some reason we lost the payload, retry the live `data` global.
    lastFailedSyncPayload = (typeof data !== 'undefined') ? data : null;
  }
  if (!lastFailedSyncPayload) return;
  var retryPayload = cloneAdminCollections(lastFailedSyncPayload);
  var btn = document.getElementById('retrySyncBtn');
  if (btn) { btn.disabled = true; btn.textContent = t('🔄 再試行中...','🔄 重试中...'); }
  return saveData(retryPayload).then(function() {
    if (btn) btn.disabled = false;
    return true;
  }).catch(function() {
    // saveData itself surfaces the error UI; just unlock the button.
    if (btn) {
      btn.disabled = false;
      btn.textContent = t('🔄 再試行','🔄 重试');
    }
    return false;
  });
}

function saveData(d) {
  if (remoteSyncPending || !remoteDataReady || !remoteDataSnapshot) {
    var notReadyError = new Error('Remote data is not ready; sync all collections before saving.');
    var lockedIndicator = document.getElementById('syncStatus');
    if (lockedIndicator) {
      lockedIndicator.textContent = t('⚠️ クラウド読込完了まで保存できません','⚠️ 云端数据加载完成前无法保存');
      lockedIndicator.className = 'sync-status sync-error';
    }
    showToast(t('クラウドデータを読み込めなかったため、保存と発行を停止しました。','云端数据未完整加载，已阻止保存和发布。'), 'error');
    return Promise.reject(notReadyError);
  }
  if (typeof FuluckAPI === 'undefined' || typeof FuluckAPI.bulkImport !== 'function') {
    return Promise.reject(new Error('Remote sync API is unavailable.'));
  }

  var invalidType = SYNC_COLLECTIONS.find(function(type) {
    return !d || !Array.isArray(d[type]);
  });
  if (invalidType) {
    return Promise.reject(new Error('Invalid admin data: ' + invalidType + ' must be an array.'));
  }

  var payload = cloneAdminCollections(d);
  var requestId = ++saveRequestSequence;
  latestSaveRequest = requestId;
  lastFailedSyncPayload = null;

  // Capture the newest user intent locally immediately. Remote writes themselves
  // are serialized below, so an older request can never finish after a newer one.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

  // Show sync status to user
  var syncIndicator = document.getElementById('syncStatus');
  if (syncIndicator) {
    syncIndicator.textContent = t('☁️ 同期中...','☁️ 同步中...');
    syncIndicator.className = 'sync-status syncing';
  }
  // Retry button is hidden during an active attempt; re-shown on failure.
  hideRetrySyncButton();

  var operation = saveQueue.then(function() {
    if (!remoteDataReady || !remoteDataSnapshot) {
      throw new Error('Remote data became unavailable while the save was queued.');
    }
    var changedTypes = SYNC_COLLECTIONS.filter(function(type) {
      return JSON.stringify(payload[type]) !== JSON.stringify(remoteDataSnapshot[type]);
    });
    // Replace collections in a deterministic sequence and advance each snapshot
    // immediately after its KV write. If a later collection fails, the next queued
    // save still knows exactly which earlier collections reached remote storage.
    var collectionWrites = Promise.resolve();
    changedTypes.forEach(function(type) {
      collectionWrites = collectionWrites
        .then(function() { return bulkImportWithRetry(type, payload[type]); })
        .then(function() {
          remoteDataSnapshot[type] = JSON.parse(JSON.stringify(payload[type]));
        });
    });
    return collectionWrites;
  })
  .then(function() {
    remoteDataSnapshot = cloneAdminCollections(payload);
    if (requestId === latestSaveRequest) {
      lastFailedSyncPayload = null;
      if (syncIndicator) {
        syncIndicator.textContent = t('☁️ 同期済み','☁️ 已同步');
        syncIndicator.className = 'sync-status synced';
        setTimeout(function() { syncIndicator.className = 'sync-status'; }, 3000);
      }
    }
  })
  .catch(function(err) {
    console.error('API sync failed:', err);
    // A superseded failure must never replace a newer payload in the retry slot.
    if (requestId === latestSaveRequest) {
      lastFailedSyncPayload = cloneAdminCollections(payload);
      if (syncIndicator) {
        syncIndicator.textContent = t('⚠️ 同期失敗（ローカル保存済み）','⚠️ 同步失败（已本地保存）');
        syncIndicator.className = 'sync-status sync-error';
      }
      showRetrySyncButton();
      showToast(t('クラウド同期に失敗しました。データはローカルに保存されています。','云端同步失败，数据已保存到本地。'), 'error');
    }
    throw err;
  });

  // Keep the internal queue alive after a rejected operation while preserving
  // the rejection for this caller.
  saveQueue = operation.catch(function() {});
  return operation;
}

// Save data + auto-publish (regenerate static site)
function saveAndPublish(d) {
  return saveData(d).then(function() {
    if (typeof FuluckAPI === 'undefined' || typeof FuluckAPI.publish !== 'function') return;
    return FuluckAPI.publish().then(function(res) {
      if (res && res.success) {
        showToast(t('✅ 保存＆発行完了！約2分後にサイトが更新されます','✅ 保存并发布成功！约2分钟后网站更新'), 'success');
        addLog(t('保存＆発行しました','保存并发布了'));
      }
    }).catch(function(err) {
      // Sync succeeded but publish failed — not critical, data is saved
      console.warn('Auto-publish failed:', err);
      showToast(t('保存済み。自動発行に失敗しました。手動で「発行する」をお試しください','已保存。自动发布失败，请手动点击"发布"按钮'), 'error');
    });
  });
}

// Browser event handlers are fire-and-forget. Convert a surfaced rejection to
// a boolean so they do not produce unhandled rejections or claim success after
// a failed KV write. Tests and composed workflows still use saveAndPublish()
// directly when they need rejection semantics.
function saveAndPublishFromUI(d, onSaved) {
  return saveAndPublish(d).then(function() {
    if (typeof onSaved === 'function') onSaved();
    return true;
  }).catch(function() {
    return false;
  });
}

function getData() {
  var d = loadData();
  if (!d) {
    d = emptyAdminData();
  }
  SYNC_COLLECTIONS.forEach(function(type) {
    if (!Array.isArray(d[type])) d[type] = [];
  });
  d = migrateData(d);
  // Persist to localStorage ONLY — never call saveData() here.
  // saveData() can push a full collection replacement to KV; page load must never
  // turn an empty or stale browser cache into a remote write. KV writes happen only
  // after a complete syncFromAPI() read and an explicit user save action.
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch (e) {}
  return d;
}

function addLog(msg) {
  try {
    var logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    logs.unshift({ time: new Date().toLocaleString('ja-JP'), msg: msg });
    if (logs.length > 30) logs.length = 30;
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  } catch(e) {}
}

var data = getData();

// Auth
function getPass() { return localStorage.getItem(PASS_KEY) || DEFAULT_PASS; }

document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('loginPassword').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });

function doLogin() {
  var pwd = document.getElementById('loginPassword').value;
  var btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = '...';

  fetch(DRIVE_API + '/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pwd })
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.success) {
        loginSuccess(pwd);
      } else if (pwd === getPass()) {
        loginSuccess(pwd);
      } else {
        loginFail();
      }
    })
    .catch(function() {
      if (pwd === getPass()) {
        loginSuccess(pwd);
      } else {
        loginFail();
      }
    })
    .finally(function() {
      btn.disabled = false;
      btn.textContent = admLang === 'zh' ? '登录' : 'ログイン';
    });
}

function loginSuccess(pwd) {
  sessionStorage.setItem('fuluck-admin-auth', '1');
  sessionStorage.setItem('fuluck-admin-pwd', pwd);
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminLayout').classList.add('active');
  renderAll();
  syncFromAPI();
}

function loginFail() {
  document.getElementById('loginError').style.display = 'block';
  document.getElementById('loginPassword').style.borderColor = '#FC8181';
}

function getSessionPass() {
  return sessionStorage.getItem('fuluck-admin-pwd') || getPass();
}

if (sessionStorage.getItem('fuluck-admin-auth') === '1') {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminLayout').classList.add('active');
  renderAll();
  syncFromAPI();
}

document.getElementById('logoutBtn').addEventListener('click', function() {
  sessionStorage.removeItem('fuluck-admin-auth');
  sessionStorage.removeItem('fuluck-admin-pwd');
  location.reload();
});

// Navigation
var pageTitles = {
  dashboard:'ダッシュボード', kittens:'子猫管理', parents:'親猫管理',
  reviews:'お客様の声', faq:'FAQ管理', articles:'知識ライブラリ',
  images:'画像管理', export:'HTML出力', data:'データ管理',
  guide:'操作ガイド', settings:'パスワード変更'
};

document.querySelectorAll('.nav-item').forEach(function(item) {
  item.addEventListener('click', function() {
    var page = item.dataset.page;
    // External-link nav items (<a href="...">) have no data-page — let the
    // browser handle navigation, don't try to switch SPA panels.
    if (!page) return;
    document.querySelectorAll('.nav-item').forEach(function(n) {
      n.classList.remove('active');
      n.removeAttribute('aria-current');
    });
    item.classList.add('active');
    item.setAttribute('aria-current', 'page');
    document.querySelectorAll('.panel-page').forEach(function(p) { p.classList.remove('active'); });
    var panel = document.getElementById('page-' + page);
    if (panel) panel.classList.add('active');
    document.getElementById('pageTitle').textContent = (admLang === 'zh' ? pageTitlesZh[page] : pageTitles[page]) || '';
    document.getElementById('addNewBtn').style.display = ['kittens','parents','reviews'].indexOf(page) >= 0 ? 'inline-flex' : 'none';
    // Load FAQ/articles data on navigation
    if (page === 'faq' && typeof loadFaqData === 'function') loadFaqData();
    if (page === 'articles' && typeof loadArticlesData === 'function') loadArticlesData();
  });
});

document.getElementById('addNewBtn').addEventListener('click', function() {
  var active = document.querySelector('.nav-item.active');
  var page = active ? active.dataset.page : '';
  if (page === 'kittens') openKittenForm();
  else if (page === 'parents') openParentForm();
  else if (page === 'reviews') openReviewForm();
});

// Modal & Toast
var modalReturnFocus = Object.create(null);
var MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function getModalFocusableElements(modal) {
  return Array.prototype.slice.call(modal.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)).filter(function(el) {
    if (el.disabled || el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    return typeof el.getClientRects !== 'function' || el.getClientRects().length > 0;
  });
}

function getActiveModal() {
  var active = document.querySelectorAll('.modal-overlay.active');
  return active.length ? active[active.length - 1] : null;
}

function openModal(id) {
  var modal = document.getElementById(id);
  if (!modal) return;
  if (!modal.classList.contains('active')) {
    var trigger = document.activeElement;
    if (trigger && trigger !== document.body && typeof trigger.focus === 'function') {
      modalReturnFocus[id] = trigger;
    }
  }
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  var focusable = getModalFocusableElements(modal);
  var initialFocus = modal.querySelector('[autofocus]') || focusable[0] || modal;
  if (initialFocus === modal && !modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
  if (typeof initialFocus.focus === 'function') initialFocus.focus();
}

function closeModal(id) {
  var modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  var trigger = modalReturnFocus[id];
  delete modalReturnFocus[id];
  if (trigger && trigger.isConnected !== false && typeof trigger.focus === 'function') trigger.focus();
}

function handleModalKeydown(e) {
  var modal = getActiveModal();
  if (!modal) return;
  if (e.key === 'Escape' || e.key === 'Esc') {
    e.preventDefault();
    closeModal(modal.id);
    return;
  }
  if (e.key !== 'Tab') return;
  var focusable = getModalFocusableElements(modal);
  if (focusable.length === 0) {
    e.preventDefault();
    modal.focus();
    return;
  }
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  var focusIsInside = modal.contains(document.activeElement);
  if (e.shiftKey && (!focusIsInside || document.activeElement === first)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!focusIsInside || document.activeElement === last)) {
    e.preventDefault();
    first.focus();
  }
}

if (typeof document.addEventListener === 'function') {
  document.addEventListener('keydown', handleModalKeydown);
}

function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type||'') + ' show';
  setTimeout(function() { t.classList.remove('show'); }, 3000);
}

// Pagination helper
function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  container.innerHTML =
    '<button class="page-prev" ' + (currentPage <= 1 ? 'disabled' : '') + '>« ' + t('前へ','上一页') + '</button>' +
    '<span class="page-info">' + currentPage + ' / ' + totalPages + ' ' + t('ページ','页') + '</span>' +
    '<button class="page-next" ' + (currentPage >= totalPages ? 'disabled' : '') + '>' + t('次へ','下一页') + ' »</button>';
  var prev = container.querySelector('.page-prev');
  var next = container.querySelector('.page-next');
  if (prev) prev.addEventListener('click', function() { if (currentPage > 1) onPageChange(currentPage - 1); });
  if (next) next.addEventListener('click', function() { if (currentPage < totalPages) onPageChange(currentPage + 1); });
}
