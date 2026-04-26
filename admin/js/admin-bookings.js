// admin-bookings.js — Bookings list page controller for admin/bookings.html
// Depends on: api-client.js (FuluckAPI). Standalone: handles its own login.

(function() {
  'use strict';

  var bookings = [];
  var filterStatus = 'all';

  function $(id) { return document.getElementById(id); }
  function tt(ja, zh) { return (window.admLang === 'zh') ? zh : ja; }
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function showToast(msg, type) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast ' + (type || '') + ' show';
    setTimeout(function() { el.classList.remove('show'); }, 3000);
  }

  window.getSessionPass = window.getSessionPass || function() {
    return sessionStorage.getItem('fuluck-admin-pwd') || 'fuluck5632';
  };

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

  function loadBookings() {
    if (typeof FuluckAPI === 'undefined') return;
    $('bookingsTable').innerHTML = '<tr><td colspan="6" class="loading-row">' + tt('読込中...', '加载中...') + '</td></tr>';
    FuluckAPI.get('/api/admin/bookings').then(function(res) {
      bookings = (res && res.items) || [];
      renderBookings();
      $('totalCount').textContent = bookings.length;
      var newCount = bookings.filter(function(b) { return (b.status || 'new') === 'new'; }).length;
      $('newCount').textContent = newCount;
    }).catch(function(err) {
      $('bookingsTable').innerHTML = '<tr><td colspan="6" class="error-row">' + tt('読込に失敗：', '加载失败：') + escHtml(err.message || '') + '</td></tr>';
    });
  }

  function renderBookings() {
    var tbody = $('bookingsTable');
    var q = ($('searchInput').value || '').toLowerCase().trim();
    var rows = bookings.filter(function(b) {
      if (filterStatus !== 'all' && (b.status || 'new') !== filterStatus) return false;
      if (!q) return true;
      var hay = [b.name, b.email, b.phone, b.message, b.kittenId, b.source].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">' + tt('予約がありません', '暂无预约') + '</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function(b) {
      var when = (b.createdAt || '').replace('T', ' ').slice(0, 16);
      var status = b.status || 'new';
      var badge = '<span class="status-badge st-' + escAttr(status) + '">' + escHtml(status) + '</span>';
      var contact = [b.email, b.phone].filter(Boolean).map(escHtml).join('<br>');
      var msg = escHtml((b.message || '').slice(0, 200));
      var meta = [];
      if (b.kittenId) meta.push(tt('子猫', '子猫') + ': ' + escHtml(b.kittenId));
      if (b.preferredDate) meta.push(tt('希望日', '期望日期') + ': ' + escHtml(b.preferredDate));
      if (b.source) meta.push(tt('元', '来源') + ': ' + escHtml(b.source));
      return '<tr>'
        + '<td class="ts-cell">' + escHtml(when) + '</td>'
        + '<td><strong>' + escHtml(b.name || '—') + '</strong>'
        +   (meta.length ? '<div class="row-meta">' + meta.join(' · ') + '</div>' : '')
        + '</td>'
        + '<td>' + (contact || '—') + '</td>'
        + '<td class="msg-cell">' + msg + '</td>'
        + '<td>' + badge + '</td>'
        + '<td><div class="action-btns">'
        +   (status !== 'contacted' ? '<button class="action-btn" data-act="contacted" data-id="' + escAttr(b.id) + '">' + tt('連絡済', '已联系') + '</button>' : '')
        +   (status !== 'archived' ? '<button class="action-btn" data-act="archived" data-id="' + escAttr(b.id) + '">' + tt('完了', '归档') + '</button>' : '')
        +   '<button class="action-btn delete" data-act="delete" data-id="' + escAttr(b.id) + '">' + tt('削除', '删除') + '</button>'
        + '</div></td>'
        + '</tr>';
    }).join('');
    tbody.querySelectorAll('button[data-act]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.id;
        var act = btn.dataset.act;
        if (act === 'delete') return deleteBooking(id);
        return updateStatus(id, act);
      });
    });
  }

  function updateStatus(id, status) {
    FuluckAPI.put('/api/admin/bookings/' + encodeURIComponent(id), { status: status }).then(function() {
      showToast(tt('更新しました', '已更新'), 'success');
      loadBookings();
    }).catch(function(err) { showToast('Error: ' + err.message, 'error'); });
  }

  function deleteBooking(id) {
    if (!confirm(tt('この予約を削除しますか？', '确定删除该预约吗？'))) return;
    FuluckAPI.del('/api/admin/bookings/' + encodeURIComponent(id)).then(function() {
      showToast(tt('削除しました', '已删除'), 'success');
      loadBookings();
    }).catch(function(err) { showToast('Error: ' + err.message, 'error'); });
  }

  function applyStaticLabels() {
    var lang = window.admLang === 'zh' ? 'zh' : 'ja';
    document.querySelectorAll('[data-adm-ja]').forEach(function(el) {
      var v = el.getAttribute('data-adm-' + lang);
      if (v != null) el.textContent = v;
    });
    var btn = $('btnLangToggle');
    if (btn) btn.textContent = (lang === 'ja') ? '🌐 中文' : '🌐 日本語';
  }

  function init() {
    window.admLang = localStorage.getItem('fuluck-admin-lang') || 'ja';
    applyStaticLabels();
    document.querySelectorAll('.filter-pill').forEach(function(p) {
      p.addEventListener('click', function() {
        document.querySelectorAll('.filter-pill').forEach(function(x) { x.classList.remove('active'); });
        p.classList.add('active');
        filterStatus = p.dataset.status;
        renderBookings();
      });
    });
    $('searchInput').addEventListener('input', renderBookings);
    $('btnReload').addEventListener('click', loadBookings);
    $('btnLangToggle').addEventListener('click', function() {
      window.admLang = (window.admLang === 'zh') ? 'ja' : 'zh';
      localStorage.setItem('fuluck-admin-lang', window.admLang);
      applyStaticLabels();
      renderBookings();
    });
    $('btnLogout').addEventListener('click', function() {
      sessionStorage.removeItem('fuluck-admin-auth');
      sessionStorage.removeItem('fuluck-admin-pwd');
      location.reload();
    });
    loadBookings();
    // Auto-refresh every 60s
    setInterval(loadBookings, 60000);
  }

  document.addEventListener('DOMContentLoaded', function() {
    var loginBtn = $('loginBtn');
    if (loginBtn) {
      loginBtn.addEventListener('click', doLogin);
      $('loginPassword').addEventListener('keypress', function(e) { if (e.key === 'Enter') doLogin(); });
    }
    if (sessionStorage.getItem('fuluck-admin-auth') === '1') {
      $('loginScreen').style.display = 'none';
      $('editorLayout').classList.add('active');
      init();
    }
  });
})();
