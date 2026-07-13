// admin-calendar.js — Calendar page controller for admin/calendar.html
// Depends on: api-client.js (FuluckAPI). Standalone: handles its own login.
// Contract: docs/CALENDAR_SPEC.md — "Worker 端点" section (GET/POST/PUT/DELETE /api/admin/calendar,
// GET/POST /api/admin/calendar/feed-key). Endpoints are implemented by another agent concurrently;
// this file codes strictly to the documented contract.

(function() {
  'use strict';

  var ICS_BASE_URL = 'https://fuluck-api.mouxue56.workers.dev/api/calendar.ics?key=';

  var viewYear, viewMonth; // 0-based month, JS Date convention
  var events = []; // raw events for the currently loaded grid range
  var gridStart = null, gridEnd = null; // YYYY-MM-DD strings covering the visible 6-week grid
  var selectedDate = null; // YYYY-MM-DD currently open in the day panel
  var editingId = null; // event id being edited in the form, or null = create mode
  var typeFilters = { visit: true, boarding: true, care: true, block: true, note: true };
  var statusFilter = 'all';
  var NEW_BOARDING_PET_TYPES = ['cat', 'rabbit', 'hamster', 'other_small_animal'];
  // Historical dog events predate the current 220012B scope. They stay readable
  // and may retain their stored value while another field is edited, but the UI
  // never offers them for a new event and the API rejects new legacy writes.
  var LEGACY_PET_TYPES = {
    small_dog: ['小型犬（履歴・受付対象外）', '小型犬（历史·不再受理）'],
    medium_dog: ['中型犬（履歴・受付対象外）', '中型犬（历史·不再受理）'],
    large_dog: ['大型犬（履歴・受付対象外）', '大型犬（历史·不再受理）']
  };

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
    return sessionStorage.getItem('fuluck-admin-pwd') || '';
  };

  // ---- date helpers (local time, no TZ libs) ----
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function fromISO(s) {
    var parts = String(s || '').split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function todayISO() { return toISO(new Date()); }

  var TYPE_LABELS = {
    visit: ['見学', '参观'],
    boarding: ['お預かり', '寄养'],
    care: ['犬の基本ケア', '犬基础护理'],
    block: ['休業・満室', '休业·满房'],
    note: ['メモ', '备注']
  };
  var STATUS_LABELS = {
    pending: ['未確定', '未确定'],
    confirmed: ['確定', '已确定'],
    done: ['完了', '已完成'],
    cancelled: ['キャンセル', '已取消']
  };
  function typeLabel(t) { var l = TYPE_LABELS[t] || [t, t]; return tt(l[0], l[1]); }
  function statusLabel(s) { var l = STATUS_LABELS[s] || [s, s]; return tt(l[0], l[1]); }

  // ---- login ----
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

  // ---- grid computation (Sunday-start, 6 weeks) ----
  function computeGrid(year, month) {
    var firstOfMonth = new Date(year, month, 1);
    var startOffset = firstOfMonth.getDay(); // 0=Sun
    var start = addDays(firstOfMonth, -startOffset);
    var end = addDays(start, 41); // 42 cells total
    return { start: start, end: end };
  }

  function setMonthTitle() {
    $('calTitle').textContent = viewYear + tt('年', '年') + (viewMonth + 1) + tt('月', '月');
  }

  function loadEvents() {
    if (typeof FuluckAPI === 'undefined') return;
    var grid = computeGrid(viewYear, viewMonth);
    gridStart = toISO(grid.start);
    gridEnd = toISO(grid.end);
    setMonthTitle();
    renderGrid(); // render empty/loading shell immediately
    FuluckAPI.get('/api/admin/calendar?from=' + gridStart + '&to=' + gridEnd).then(function(res) {
      events = (res && res.events) || [];
      renderGrid();
      if (selectedDate) renderDayPanel(selectedDate);
    }).catch(function(err) {
      showToast(tt('読込に失敗：', '加载失败：') + (err.message || ''), 'error');
      events = [];
      renderGrid();
    });
  }

  function eventsForDate(iso) {
    return events.filter(function(e) {
      if (!typeFilters[e.type]) return false;
      if (statusFilter !== 'all' && (e.status || 'pending') !== statusFilter) return false;
      return e.start <= iso && e.end >= iso;
    });
  }

  function renderGrid() {
    var grid = computeGrid(viewYear, viewMonth);
    var todayStr = todayISO();
    var html = '';
    for (var i = 0; i < 42; i++) {
      var d = addDays(grid.start, i);
      var iso = toISO(d);
      var isOtherMonth = d.getMonth() !== viewMonth;
      var isToday = iso === todayStr;
      var dayEvents = eventsForDate(iso);
      var cls = 'cal-cell' + (isOtherMonth ? ' other-month' : '') + (isToday ? ' is-today' : '') + (iso === selectedDate ? ' is-selected' : '');

      var chipsHtml = dayEvents.slice(0, 3).map(function(e) {
        var cancelled = (e.status === 'cancelled') ? ' is-cancelled' : '';
        return '<div class="cal-chip type-' + escAttr(e.type) + cancelled + '" title="' + escAttr(e.title || '') + '">' + escHtml(e.title || '') + '</div>';
      }).join('');
      var moreHtml = dayEvents.length > 3 ? '<div class="cal-more">+' + (dayEvents.length - 3) + '</div>' : '';

      var dotsHtml = dayEvents.slice(0, 6).map(function(e) {
        return '<span class="cal-dot type-' + escAttr(e.type) + '"></span>';
      }).join('');

      var ariaLabel = iso + '、' + dayEvents.length + tt('件の予定', '项日程');

      html += '<div class="' + cls + '" data-date="' + iso + '" role="button" tabindex="0"'
        + ' aria-label="' + escAttr(ariaLabel) + '" aria-selected="' + (iso === selectedDate ? 'true' : 'false') + '"'
        + (isToday ? ' aria-current="date"' : '') + '>'
        + '<div class="cal-date">' + d.getDate() + '</div>'
        + '<div class="cal-chips">' + chipsHtml + moreHtml + '</div>'
        + '<div class="cal-dots">' + dotsHtml + '</div>'
        + '</div>';
    }
    $('calGrid').innerHTML = html;
    $('calGrid').querySelectorAll('.cal-cell').forEach(function(cell) {
      cell.addEventListener('click', function() { openDayPanel(cell.dataset.date); });
      cell.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        openDayPanel(cell.dataset.date);
      });
    });
  }

  // ---- day panel ----
  function openDayPanel(iso) {
    selectedDate = iso;
    resetForm();
    $('evtStart').value = iso;
    $('evtEnd').value = iso;
    renderDayPanel(iso);
    $('dayPanelOverlay').classList.add('active');
    renderGrid(); // refresh selection highlight
  }

  function closeDayPanel() {
    $('dayPanelOverlay').classList.remove('active');
    selectedDate = null;
    renderGrid();
  }

  function renderDayPanel(iso) {
    var d = fromISO(iso);
    var weekdayNames = tt('日,月,火,水,木,金,土', '周日,周一,周二,周三,周四,周五,周六').split(',');
    $('dayPanelTitle').textContent = iso + ' (' + weekdayNames[d.getDay()] + ')';

    var dayEvents = events.filter(function(e) { return e.start <= iso && e.end >= iso; })
      .sort(function(a, b) { return (a.time || '') < (b.time || '') ? -1 : 1; });

    if (dayEvents.length === 0) {
      $('dayEventsList').innerHTML = '<div class="empty-hint">' + tt('この日の予定はありません', '当天没有安排') + '</div>';
    } else {
      $('dayEventsList').innerHTML = dayEvents.map(function(e) {
        var cancelled = (e.status === 'cancelled') ? ' is-cancelled' : '';
        var meta = [];
        if (e.start !== e.end) meta.push(e.start + ' → ' + e.end);
        if (e.time) meta.push('🕐 ' + escHtml(e.time));
        if (e.petType) meta.push(escHtml(petTypeLabel(e.petType)));
        if (e.source) meta.push(tt('元', '来源') + ': ' + escHtml(e.source));
        return '<div class="evt-card">'
          + '<div class="evt-card-head">'
          +   '<div><span class="evt-type-badge type-' + escAttr(e.type) + '">' + escHtml(typeLabel(e.type)) + '</span>'
          +   '<span class="evt-status-badge evt-status-' + escAttr(e.status || 'pending') + '">' + escHtml(statusLabel(e.status || 'pending')) + '</span></div>'
          + '</div>'
          + '<div class="evt-title' + cancelled + '">' + escHtml(e.title || '') + '</div>'
          + (meta.length ? '<div class="evt-meta">' + meta.join(' · ') + '</div>' : '')
          + (e.notes ? '<div class="evt-notes">' + escHtml(e.notes) + '</div>' : '')
          + '<div class="evt-actions">'
          +   '<button class="action-btn" data-act="edit" data-id="' + escAttr(e.id) + '">' + tt('編集', '编辑') + '</button>'
          +   '<button class="action-btn delete" data-act="delete" data-id="' + escAttr(e.id) + '">' + tt('削除', '删除') + '</button>'
          + '</div>'
          + '</div>';
      }).join('');
    }

    $('dayEventsList').querySelectorAll('button[data-act]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.id;
        if (btn.dataset.act === 'delete') return deleteEvent(id);
        return startEdit(id);
      });
    });
  }

  function petTypeLabel(pt) {
    var map = {
      cat: ['猫', '猫'],
      rabbit: ['うさぎ', '兔'],
      hamster: ['ハムスター', '仓鼠'],
      other_small_animal: ['その他の登録対象小動物', '其他已登记小动物'],
      dog_small: ['小型犬（受付停止）', '小型犬（暂停受理）'],
      dog_medium: ['中型犬（受付停止）', '中型犬（暂停受理）'],
      dog_large: ['大型犬（受付停止）', '大型犬（暂停受理）']
    };
    var l = map[pt] || LEGACY_PET_TYPES[pt] || [pt, pt];
    return tt(l[0], l[1]);
  }

  function clearLegacyPetTypeOption() {
    var select = $('evtPetType');
    if (!select) return;
    Array.prototype.slice.call(select.querySelectorAll('option[data-legacy-pet-type]')).forEach(function(option) {
      option.remove();
    });
  }

  function startEdit(id) {
    var e = events.filter(function(x) { return x.id === id; })[0];
    if (!e) return;
    editingId = id;
    $('evtId').value = e.id;
    $('evtType').value = e.type;
    $('evtTitle').value = e.title || '';
    $('evtStart').value = e.start;
    $('evtEnd').value = e.end;
    $('evtTime').value = e.time || '';
    clearLegacyPetTypeOption();
    if (LEGACY_PET_TYPES[e.petType]) {
      var legacyOption = document.createElement('option');
      legacyOption.value = e.petType;
      legacyOption.textContent = petTypeLabel(e.petType);
      legacyOption.disabled = true;
      legacyOption.dataset.legacyPetType = 'true';
      $('evtPetType').appendChild(legacyOption);
    }
    $('evtPetType').value = e.petType || 'cat';
    $('evtStatus').value = e.status || 'pending';
    $('evtNotes').value = e.notes || '';
    updatePetTypeVisibility();
    $('btnSaveEvent').textContent = tt('更新する', '更新');
    $('btnCancelEdit').style.display = 'block';
    $('eventForm').scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function resetForm() {
    editingId = null;
    clearLegacyPetTypeOption();
    $('eventForm').reset();
    $('evtId').value = '';
    $('evtType').value = 'visit';
    $('evtStatus').value = 'pending';
    updatePetTypeVisibility();
    $('btnSaveEvent').textContent = tt('追加する', '添加');
    $('btnCancelEdit').style.display = 'none';
  }

  function updatePetTypeVisibility() {
    $('evtPetTypeGroup').style.display = ($('evtType').value === 'boarding') ? 'block' : 'none';
  }

  function submitForm(ev) {
    ev.preventDefault();
    var start = $('evtStart').value;
    var end = $('evtEnd').value || start;
    var payload = {
      type: $('evtType').value,
      title: $('evtTitle').value.trim(),
      start: start,
      end: end,
      time: $('evtTime').value || undefined,
      status: $('evtStatus').value,
      notes: $('evtNotes').value || undefined
    };
    if (payload.type === 'boarding') {
      var petType = $('evtPetType').value;
      if (NEW_BOARDING_PET_TYPES.indexOf(petType) !== -1) payload.petType = petType;
    }

    var req = editingId
      ? FuluckAPI.put('/api/admin/calendar?id=' + encodeURIComponent(editingId), payload)
      : FuluckAPI.post('/api/admin/calendar', payload);

    req.then(function() {
      showToast(editingId ? tt('更新しました', '已更新') : tt('追加しました', '已添加'), 'success');
      resetForm();
      loadEvents();
    }).catch(function(err) {
      showToast('Error: ' + (err.message || ''), 'error');
    });
  }

  function deleteEvent(id) {
    if (!confirm(tt('この予定を削除しますか？', '确定删除该日程吗？'))) return;
    FuluckAPI.del('/api/admin/calendar?id=' + encodeURIComponent(id)).then(function() {
      showToast(tt('削除しました', '已删除'), 'success');
      if (editingId === id) resetForm();
      loadEvents();
    }).catch(function(err) {
      showToast('Error: ' + (err.message || ''), 'error');
    });
  }

  // ---- iCal feed key ----
  function loadFeedKey() {
    if (typeof FuluckAPI === 'undefined') return;
    FuluckAPI.get('/api/admin/calendar/feed-key').then(function(res) {
      renderFeedKey(res && res.key);
    }).catch(function() {
      renderFeedKey(null);
    });
  }

  function renderFeedKey(key) {
    if (key) {
      $('icalNoKey').style.display = 'none';
      $('icalHasKey').style.display = 'block';
      $('icalUrlInput').value = ICS_BASE_URL + key;
    } else {
      $('icalNoKey').style.display = 'block';
      $('icalHasKey').style.display = 'none';
    }
  }

  function genFeedKey() {
    FuluckAPI.post('/api/admin/calendar/feed-key').then(function(res) {
      renderFeedKey(res && res.key);
      showToast(tt('購読URLを生成しました', '已生成订阅链接'), 'success');
    }).catch(function(err) {
      showToast('Error: ' + (err.message || ''), 'error');
    });
  }

  function regenFeedKey() {
    if (!confirm(tt('再生成すると旧URLは無効になります。よろしいですか？', '重新生成后旧URL将失效，确定继续吗？'))) return;
    genFeedKey();
  }

  function copyIcalUrl() {
    var input = $('icalUrlInput');
    input.select();
    input.setSelectionRange(0, 99999);
    var done = function() { showToast(tt('コピーしました', '已复制'), 'success'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(done).catch(function() {
        try { document.execCommand('copy'); done(); } catch (e) { showToast(tt('コピーに失敗しました', '复制失败'), 'error'); }
      });
    } else {
      try { document.execCommand('copy'); done(); } catch (e) { showToast(tt('コピーに失敗しました', '复制失败'), 'error'); }
    }
  }

  // ---- static label toggle (bilingual) ----
  function applyStaticLabels() {
    var lang = window.admLang === 'zh' ? 'zh' : 'ja';
    document.querySelectorAll('[data-adm-ja]').forEach(function(el) {
      var v = el.getAttribute('data-adm-' + lang);
      if (v != null) {
        if (el.tagName === 'OPTION') el.textContent = v;
        else el.textContent = v;
      }
    });
    var btn = $('btnLangToggle');
    if (btn) btn.textContent = (lang === 'ja') ? '🌐 中文' : '🌐 日本語';
  }

  function init() {
    window.admLang = localStorage.getItem('fuluck-admin-lang') || 'ja';
    applyStaticLabels();

    var now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();

    $('btnPrevMonth').addEventListener('click', function() {
      viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      loadEvents();
    });
    $('btnNextMonth').addEventListener('click', function() {
      viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      loadEvents();
    });
    $('btnToday').addEventListener('click', function() {
      var n = new Date();
      viewYear = n.getFullYear();
      viewMonth = n.getMonth();
      loadEvents();
    });

    $('typeFilterGroup').querySelectorAll('input[data-type]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        typeFilters[cb.dataset.type] = cb.checked;
        renderGrid();
        if (selectedDate) renderDayPanel(selectedDate);
      });
    });
    $('statusFilter').addEventListener('change', function() {
      statusFilter = $('statusFilter').value;
      renderGrid();
      if (selectedDate) renderDayPanel(selectedDate);
    });

    $('dayPanelClose').addEventListener('click', closeDayPanel);
    $('dayPanelOverlay').addEventListener('click', function(e) {
      if (e.target === $('dayPanelOverlay')) closeDayPanel();
    });
    $('evtType').addEventListener('change', updatePetTypeVisibility);
    $('eventForm').addEventListener('submit', submitForm);
    $('btnCancelEdit').addEventListener('click', function() {
      resetForm();
      if (selectedDate) { $('evtStart').value = selectedDate; $('evtEnd').value = selectedDate; }
    });

    $('btnGenKey').addEventListener('click', genFeedKey);
    $('btnRegenKey').addEventListener('click', regenFeedKey);
    $('btnCopyUrl').addEventListener('click', copyIcalUrl);

    $('btnReload').addEventListener('click', function() { loadEvents(); loadFeedKey(); });
    $('btnLangToggle').addEventListener('click', function() {
      window.admLang = (window.admLang === 'zh') ? 'ja' : 'zh';
      localStorage.setItem('fuluck-admin-lang', window.admLang);
      applyStaticLabels();
      renderGrid();
      if (selectedDate) renderDayPanel(selectedDate);
    });
    $('btnLogout').addEventListener('click', function() {
      sessionStorage.removeItem('fuluck-admin-auth');
      sessionStorage.removeItem('fuluck-admin-pwd');
      location.reload();
    });

    loadEvents();
    loadFeedKey();
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
