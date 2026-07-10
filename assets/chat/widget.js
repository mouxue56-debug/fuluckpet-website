/* ============================================================
 * 福楽キャッテリー — AI Chat Widget (Fukunyan)
 *
 * Vanilla JS port of fuluckai/frontend/src/components/ChatPanel.vue
 *
 * Usage:
 *   <link rel="stylesheet" href="/assets/chat/widget.css">
 *   <script defer src="/assets/chat/widget.js"></script>
 *
 *   The widget auto-attaches on DOMContentLoaded. Disable by setting
 *   <body data-no-chat="1"> or window.FULUCK_CHAT_AUTOSTART = false
 *   before this script loads.
 *
 * Public API (window.FuluckChat):
 *   .open()  / .close() / .toggle()
 *   .reset() — clears history + asks server to forget logs
 *   .send(text)
 * ============================================================ */
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────
  var CFG = {
    apiBase:
      (typeof window !== 'undefined' && window.FULUCK_CHAT_API) ||
      // production worker; can be overridden per-page via window.FULUCK_CHAT_API
      'https://fuluck-api.mouxue56.workers.dev',
    chatPath: '/api/chat',
    sessionKey: 'fuluck_chat_session',
    historyKey: 'fuluck_chat_history',
    modeKey: 'fuluck_chat_mode',     // cached "online" | "faq" with TTL
    modeTtlMs: 5 * 60 * 1000,        // 5 minutes
    maxHistory: 50,
    lineUrl: 'https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true',
    bookingUrl: '/booking.html'
  };

  // ── Built-in FAQ corpus (Japanese) — used when worker is offline ──
  // Keywords match user input via includes(); first match wins.
  // Each answer ends by nudging the user to LINE for follow-up.
  var FAQ_CORPUS = [
    {
      keywords: ['価格', 'お値段', '値段', 'いくら', '料金', 'price', '費用', 'コスト'],
      answer:
        'サイベリアンの子猫は ¥160,000〜¥290,000 の価格帯です。毛色・性別・血統・コートの厚さなどで個体ごとに異なります。詳しい個体別のお見積りは LINE にてご案内しております。'
    },
    {
      keywords: ['見学', '予約', '訪問', '会いに', '会える', '内覧', 'visit', 'booking'],
      answer:
        '見学は完全予約制です。LINE またはご予約フォーム（/booking.html）よりご希望日時をお知らせください。週末は混み合いますのでお早めのご相談がおすすめです'
    },
    {
      keywords: ['アレルギー', 'アレルゲン', 'fel d1', 'fel-d1', 'feld1', 'allergy', '低アレルゲン', 'くしゃみ'],
      answer:
        'サイベリアンは Fel d1 タンパク質の分泌が少ない傾向があり、低アレルゲン猫として知られています。ただし個体差があるため、ご心配な方は事前のご見学＋短時間の同室テストをおすすめしております。'
    },
    {
      keywords: ['場所', '大阪', '住所', 'どこ', 'アクセス', '最寄り', '駅', 'location', 'osaka'],
      answer:
        '当キャッテリーは大阪府内にございます。詳細な所在地は予約確定後にお知らせしております（プライバシー保護のため）。最寄り駅からの送迎・地図はLINEにてご案内します。'
    },
    {
      keywords: ['お迎え', '引き渡し', '引渡し', '何ヶ月', '月齢', '生後', 'pickup', '配送'],
      answer:
        '生後 2.5〜3 ヶ月でのお引渡しが目安です。社会化期間を十分に取ることで、新しいご家族との生活にスムーズに馴染めるよう配慮しております。遠方の方には航空便・陸送のご相談も承ります。'
    },
    {
      keywords: ['健康', 'ワクチン', 'マイクロチップ', '検査', '保証', 'health', 'vaccine', '血統書'],
      answer:
        '1回目のワクチン接種済み + マイクロチップ装着 + 健康診断書 + 血統書 (TICA / CFA) 付きでお引渡しいたします。先天性疾患に関する短期保証もございますので、詳細は LINE よりお問い合わせください。'
    }
  ];

  function findFaqAnswer(userText) {
    var t = String(userText || '').toLowerCase();
    if (!t) return null;
    for (var i = 0; i < FAQ_CORPUS.length; i++) {
      var entry = FAQ_CORPUS[i];
      for (var j = 0; j < entry.keywords.length; j++) {
        if (t.indexOf(entry.keywords[j].toLowerCase()) !== -1) {
          return entry.answer;
        }
      }
    }
    return null;
  }

  // FAQ unmatched fallback (also used when worker is reachable but errors)
  var FAQ_UNMATCHED =
    '申し訳ありません、AIアシスタントが現在準備中です。お急ぎの方はLINEからお気軽にご連絡ください';

  // ── i18n keys (Japanese-first; pulls from window.translations if present) ──
  var DEFAULT_STRINGS = {
    'chat.title': 'ふくにゃん',
    'chat.status': 'オンライン',
    'chat.status.online': 'オンライン',
    'chat.status.faq': '簡易モード',
    'chat.greeting':
      'こんにちは！福楽キャッテリーのアシスタント、ふくにゃんです サイベリアンや見学予約についてお気軽にどうぞ。',
    'chat.placeholder': 'メッセージを入力...',
    'chat.send': '送信',
    'chat.close': '閉じる',
    'chat.reset': '会話をリセット',
    'chat.privacy':
      '会話内容はサービス改善のため保存されます。',
    'chat.privacy.lineLink': 'LINE で相談はこちら →',
    'chat.error':
      'すみません、ただいま応答できませんでした。少し時間をおいて再度お試しください。',
    'chat.error.rate':
      'リクエストが多くなっています。しばらくしてからもう一度お試しください。',
    'chat.faq.lineCta': 'より詳しいご相談は LINE までどうぞ →',
    'chat.faq.lineCtaLabel': 'LINE で相談',
    'chat.quick.price': '価格は？',
    'chat.quick.visit': '見学予約',
    'chat.quick.allergy': 'アレルギー対応',
    'chat.quick.line': 'LINE で相談',
    'chat.aria.bubble': 'AI チャットを開く',
    'chat.aria.openPanel': 'チャットパネル'
  };

  function t(key) {
    // Try host site i18n.js (window.translations + getCurrentLang) when present
    try {
      var lang =
        (typeof window.getCurrentLang === 'function' && window.getCurrentLang()) ||
        (window.translations && (window.translations.__current || 'ja')) ||
        'ja';
      if (
        window.translations &&
        window.translations[lang] &&
        window.translations[lang][key]
      ) {
        return window.translations[lang][key];
      }
    } catch (_) {
      /* fall through */
    }
    return DEFAULT_STRINGS[key] != null ? DEFAULT_STRINGS[key] : key;
  }

  // ── Storage helpers (localStorage with safe fallback) ─────────────
  var memStore = {};
  function lsGet(k) {
    try {
      return localStorage.getItem(k);
    } catch (_) {
      return memStore[k] || null;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (_) {
      memStore[k] = v;
    }
  }
  function lsDel(k) {
    try {
      localStorage.removeItem(k);
    } catch (_) {
      delete memStore[k];
    }
  }

  // ── Mode persistence (online vs faq) — TTL 5min ───────────────────
  function readCachedMode() {
    try {
      var raw = lsGet(CFG.modeKey);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.mode || !obj.ts) return null;
      if (Date.now() - obj.ts > CFG.modeTtlMs) return null;
      return obj.mode === 'faq' ? 'faq' : 'online';
    } catch (_) {
      return null;
    }
  }
  function writeCachedMode(mode) {
    try {
      lsSet(CFG.modeKey, JSON.stringify({ mode: mode, ts: Date.now() }));
    } catch (_) {}
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // RFC4122 fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getSessionId() {
    var id = lsGet(CFG.sessionKey);
    if (!id) {
      id = uuid();
      lsSet(CFG.sessionKey, id);
    }
    return id;
  }

  function loadHistory() {
    try {
      var raw = lsGet(CFG.historyKey);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistory(arr) {
    var trimmed = arr.slice(-CFG.maxHistory);
    try {
      lsSet(CFG.historyKey, JSON.stringify(trimmed));
    } catch (_) {
      /* ignore */
    }
  }

  // ── DOM helpers ───────────────────────────────────────────────────
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v == null) continue;
        if (k === 'class') n.className = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k === 'style') n.setAttribute('style', v);
        else if (k.indexOf('on') === 0 && typeof v === 'function')
          n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v);
      }
    }
    if (children != null) {
      var list = Array.isArray(children) ? children : [children];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c == null) continue;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return n;
  }

  // ── SVG snippets ──────────────────────────────────────────────────
  var SVG_CAT =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">' +
    '<defs><radialGradient id="fcF" cx="0.5" cy="0.4" r="0.7"><stop offset="0%" stop-color="#fff7e8"/><stop offset="60%" stop-color="#f6dfc1"/><stop offset="100%" stop-color="#e9c39a"/></radialGradient>' +
    '<linearGradient id="fcE" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#ffc7a8"/><stop offset="100%" stop-color="#f29a78"/></linearGradient></defs>' +
    '<path d="M16 14 L22 4 L28 18 Z" fill="url(#fcE)"/><path d="M48 14 L42 4 L36 18 Z" fill="url(#fcE)"/>' +
    '<path d="M19 14 L22.5 8 L26 17 Z" fill="#ffb494" opacity="0.55"/><path d="M45 14 L41.5 8 L38 17 Z" fill="#ffb494" opacity="0.55"/>' +
    '<ellipse cx="32" cy="34" rx="22" ry="20" fill="url(#fcF)" stroke="#cba07a" stroke-width="0.7"/>' +
    '<ellipse cx="18" cy="38" rx="4" ry="2.5" fill="#ffb6a3" opacity="0.55"/><ellipse cx="46" cy="38" rx="4" ry="2.5" fill="#ffb6a3" opacity="0.55"/>' +
    '<path d="M22 30 q3 -3 6 0" stroke="#3d3122" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<path d="M36 30 q3 -3 6 0" stroke="#3d3122" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<path d="M30 36 L34 36 L32 39 Z" fill="#e88d72"/>' +
    '<path d="M32 39 q-2 3 -4 2" stroke="#3d3122" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
    '<path d="M32 39 q2 3 4 2" stroke="#3d3122" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
    '<path d="M10 36 L18 36" stroke="#cba07a" stroke-width="0.8" stroke-linecap="round"/>' +
    '<path d="M10 39 L18 38" stroke="#cba07a" stroke-width="0.8" stroke-linecap="round"/>' +
    '<path d="M54 36 L46 36" stroke="#cba07a" stroke-width="0.8" stroke-linecap="round"/>' +
    '<path d="M54 39 L46 38" stroke="#cba07a" stroke-width="0.8" stroke-linecap="round"/>' +
    '</svg>';

  var SVG_CLOSE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6 L18 18 M6 18 L18 6"/></svg>';
  var SVG_RESET =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 9 9 9 9 3"/><path d="M3 9a9 9 0 1 1 3 6.7"/></svg>';
  var SVG_SEND =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

  // ── Render helpers ────────────────────────────────────────────────
  function bubbleNode(role, content, opts) {
    opts = opts || {};
    var avatar = el(
      'div',
      { class: 'fuluck-chat-msg-avatar', 'aria-hidden': 'true' },
      null
    );
    avatar.innerHTML = role === 'user'
      ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
      : SVG_CAT.replace('width="48" height="48"', 'width="22" height="22"');

    var bubble = el('div', { class: 'fuluck-chat-msg-bubble' });
    if (opts.html) bubble.innerHTML = content;
    else bubble.textContent = content;

    var row = el('div', { class: 'fuluck-chat-msg ' + role });
    row.appendChild(avatar);
    row.appendChild(bubble);
    return { row: row, bubble: bubble };
  }

  function typingNode() {
    var avatar = el('div', { class: 'fuluck-chat-msg-avatar', 'aria-hidden': 'true' });
    avatar.innerHTML = SVG_CAT.replace('width="48" height="48"', 'width="22" height="22"');
    var dots = el('div', { class: 'fuluck-chat-msg-bubble' }, [
      el('span', { class: 'fuluck-chat-typing' }, [
        el('span'),
        el('span'),
        el('span')
      ])
    ]);
    var row = el('div', { class: 'fuluck-chat-msg assistant' }, [avatar, dots]);
    return row;
  }

  // Convert URL substrings inside a text node to clickable links (basic)
  function linkifyText(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(
        /(https?:\/\/[^\s)]+[^\s).,])/g,
        '<a href="$1" target="_blank" rel="noopener">$1</a>'
      );
  }

  // ── Main widget ──────────────────────────────────────────────────
  function FuluckChat() {
    this.root = null;
    this.bubble = null;
    this.panel = null;
    this.messagesEl = null;
    this.inputEl = null;
    this.sendBtn = null;
    this.statusEl = null;     // header status text + dot
    this.history = [];        // [{role, content, ts}]
    this.busy = false;
    this.opened = false;
    this.sessionId = getSessionId();
    this.mode = readCachedMode() || 'online'; // 'online' | 'faq'
  }

  FuluckChat.prototype._setMode = function (mode, opts) {
    if (mode !== 'online' && mode !== 'faq') return;
    if (this.mode === mode && !(opts && opts.force)) return;
    this.mode = mode;
    writeCachedMode(mode);
    this._renderStatus();
  };

  FuluckChat.prototype._renderStatus = function () {
    if (!this.statusEl) return;
    var label = this.mode === 'faq'
      ? t('chat.status.faq') || '簡易モード'
      : t('chat.status.online') || t('chat.status') || 'オンライン';
    // The leading colored dot is rendered via ::before; toggle a class.
    if (this.mode === 'faq') this.statusEl.classList.add('is-faq');
    else this.statusEl.classList.remove('is-faq');
    this.statusEl.textContent = label;
    this.statusEl.setAttribute(
      'title',
      this.mode === 'faq'
        ? 'AI 接続待機中です。よくあるご質問のみお答えできます。'
        : 'AI アシスタントがオンラインです。'
    );
  };

  FuluckChat.prototype.mount = function () {
    if (document.querySelector('.fuluck-chat-root')) return; // idempotent
    var root = el('div', { class: 'fuluck-chat-root', 'aria-live': 'polite' });

    // Bubble
    var bubble = el(
      'button',
      {
        class: 'fuluck-chat-bubble',
        type: 'button',
        'aria-label': t('chat.aria.bubble')
      },
      [
        (function () {
          var w = el('span', { class: 'fuluck-chat-bubble-avatar', 'aria-hidden': 'true' });
          w.innerHTML = SVG_CAT;
          return w;
        })(),
        el('span', { class: 'fuluck-chat-bubble-pulse', 'aria-hidden': 'true' })
      ]
    );
    bubble.addEventListener('click', this.toggle.bind(this));

    // Panel
    var panel = el('div', {
      class: 'fuluck-chat-panel',
      role: 'dialog',
      'aria-label': t('chat.aria.openPanel'),
      hidden: 'hidden'
    });

    // Header
    var headerAvatar = el('div', { class: 'fuluck-chat-header-avatar', 'aria-hidden': 'true' });
    headerAvatar.innerHTML = SVG_CAT.replace('width="48" height="48"', 'width="28" height="28"');

    var statusEl = el('div', { class: 'fuluck-chat-header-status' }, t('chat.status'));
    this.statusEl = statusEl;

    var header = el('div', { class: 'fuluck-chat-header' }, [
      headerAvatar,
      el('div', { class: 'fuluck-chat-header-meta' }, [
        el('div', { class: 'fuluck-chat-header-name' }, t('chat.title')),
        statusEl
      ]),
      el('div', { class: 'fuluck-chat-header-actions' }, [
        (function (self) {
          var b = el('button', {
            class: 'fuluck-chat-icon-btn',
            type: 'button',
            'aria-label': t('chat.reset'),
            title: t('chat.reset')
          });
          b.innerHTML = SVG_RESET;
          b.addEventListener('click', function () {
            if (confirm(t('chat.reset') + '？')) self.reset();
          });
          return b;
        })(this),
        (function (self) {
          var b = el('button', {
            class: 'fuluck-chat-icon-btn',
            type: 'button',
            'aria-label': t('chat.close'),
            title: t('chat.close')
          });
          b.innerHTML = SVG_CLOSE;
          b.addEventListener('click', self.close.bind(self));
          return b;
        })(this)
      ])
    ]);

    var messages = el('div', { class: 'fuluck-chat-messages' });

    // Quick chips
    var self = this;
    function chip(label, onClick) {
      var b = el('button', { class: 'fuluck-chat-chip', type: 'button' }, label);
      b.addEventListener('click', onClick);
      return b;
    }
    var quick = el('div', { class: 'fuluck-chat-quick' }, [
      chip(t('chat.quick.price'), function () {
        self.send('価格について教えてください。');
      }),
      chip(t('chat.quick.visit'), function () {
        self.send('見学予約をしたいです。');
      }),
      chip(t('chat.quick.allergy'), function () {
        self.send('アレルギー対応について教えてください。');
      }),
      chip(t('chat.quick.line'), function () {
        window.open(CFG.lineUrl, '_blank', 'noopener');
      })
    ]);

    // Input
    var input = el('textarea', {
      class: 'fuluck-chat-input',
      rows: '1',
      maxlength: '1500',
      placeholder: t('chat.placeholder'),
      'aria-label': t('chat.placeholder')
    });

    var sendBtn = el('button', {
      class: 'fuluck-chat-send',
      type: 'button',
      'aria-label': t('chat.send'),
      title: t('chat.send'),
      disabled: 'disabled'
    });
    sendBtn.innerHTML = SVG_SEND;

    function autoResize() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 110) + 'px';
      var has = input.value.trim().length > 0;
      sendBtn.classList.toggle('is-active', has);
      sendBtn.disabled = !has;
    }
    input.addEventListener('input', autoResize);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var v = input.value.trim();
        if (v) self.send(v);
      }
    });
    sendBtn.addEventListener('click', function () {
      var v = input.value.trim();
      if (v) self.send(v);
    });

    var inputWrap = el('div', { class: 'fuluck-chat-input-wrap' }, [input, sendBtn]);

    var privacy = el('div', { class: 'fuluck-chat-privacy' });
    privacy.innerHTML =
      t('chat.privacy') +
      ' <a href="' +
      CFG.lineUrl +
      '" target="_blank" rel="noopener">' +
      t('chat.privacy.lineLink') +
      '</a>';

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(quick);
    panel.appendChild(inputWrap);
    panel.appendChild(privacy);

    root.appendChild(bubble);
    root.appendChild(panel);
    document.body.appendChild(root);

    this.root = root;
    this.bubble = bubble;
    this.panel = panel;
    this.messagesEl = messages;
    this.inputEl = input;
    this.sendBtn = sendBtn;

    // Hydrate history
    this.history = loadHistory();
    if (this.history.length === 0) {
      // Greeting will be rendered live on first open
    } else {
      this._renderAll();
    }

    // Reflect cached mode into header badge.
    this._renderStatus();
  };

  FuluckChat.prototype._renderAll = function () {
    this.messagesEl.innerHTML = '';
    for (var i = 0; i < this.history.length; i++) {
      var m = this.history[i];
      var node = bubbleNode(m.role, '', { html: true });
      node.bubble.innerHTML = linkifyText(m.content);
      this.messagesEl.appendChild(node.row);
    }
    this._scrollToEnd();
  };

  FuluckChat.prototype._scrollToEnd = function () {
    var self = this;
    requestAnimationFrame(function () {
      self.messagesEl.scrollTop = self.messagesEl.scrollHeight;
    });
  };

  FuluckChat.prototype._appendMessage = function (role, content) {
    var node = bubbleNode(role, '', { html: true });
    node.bubble.innerHTML = linkifyText(content);
    this.messagesEl.appendChild(node.row);
    this._scrollToEnd();
    return node.bubble;
  };

  FuluckChat.prototype._pushHistory = function (role, content) {
    this.history.push({ role: role, content: content, ts: Date.now() });
    if (this.history.length > CFG.maxHistory)
      this.history = this.history.slice(-CFG.maxHistory);
    saveHistory(this.history);
  };

  FuluckChat.prototype.open = function () {
    if (!this.root) return;
    this.opened = true;
    this.panel.removeAttribute('hidden');
    this.bubble.setAttribute('hidden', 'hidden');
    if (this.history.length === 0) {
      var greeting = t('chat.greeting');
      this._pushHistory('assistant', greeting);
      this._appendMessage('assistant', greeting);
    } else {
      this._scrollToEnd();
    }
    var input = this.inputEl;
    setTimeout(function () {
      try { input.focus(); } catch (_) {}
    }, 100);
  };

  FuluckChat.prototype.close = function () {
    if (!this.root) return;
    this.opened = false;
    this.panel.setAttribute('hidden', 'hidden');
    this.bubble.removeAttribute('hidden');
  };

  FuluckChat.prototype.toggle = function () {
    if (this.opened) this.close();
    else this.open();
  };

  function forgetServerBatch(sid, attempt, cursor) {
    if (attempt >= 60) return Promise.resolve();
    return fetch(CFG.apiBase + CFG.chatPath + '?forget=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid, action: 'forget', forget_cursor: cursor })
    }).then(function(response) {
      if (!response.ok) throw new Error('forget failed: ' + response.status);
      return response.json();
    }).then(function(body) {
      if (body && body.more && typeof body.cursor === 'string' && body.cursor) {
        return forgetServerBatch(sid, attempt + 1, body.cursor);
      }
    }).catch(function() {
      // Local history is already cleared. A later reset can safely resume from the
      // first remaining server batch, so a transient failure stays non-fatal.
    });
  }

  FuluckChat.prototype.reset = function () {
    var sid = this.sessionId;
    lsDel(CFG.historyKey);
    this.history = [];
    this.messagesEl.innerHTML = '';
    var greeting = t('chat.greeting');
    this._pushHistory('assistant', greeting);
    this._appendMessage('assistant', greeting);

    // Best-effort bounded server forget; continue while the Worker reports more.
    try {
      forgetServerBatch(sid, 0, '');
    } catch (_) {}
  };

  // Build a FAQ reply (HTML) for a user message. If `matched` is null,
  // show the unmatched fallback. Always appends a LINE CTA button.
  FuluckChat.prototype._buildFaqHtml = function (matched) {
    var body = matched || FAQ_UNMATCHED;
    var ctaLabel = t('chat.faq.lineCtaLabel') || 'LINE で相談';
    var ctaPrefix = t('chat.faq.lineCta') || 'より詳しいご相談は LINE までどうぞ →';
    var safe = linkifyText(body);
    return (
      safe +
      '<div class="fuluck-chat-faq-cta">' +
      '<span>' + ctaPrefix + '</span> ' +
      '<a class="fuluck-chat-faq-line" href="' +
      CFG.lineUrl +
      '" target="_blank" rel="noopener">' +
      ctaLabel +
      '</a>' +
      '</div>'
    );
  };

  FuluckChat.prototype._appendFaqAnswer = function (userText) {
    var matched = findFaqAnswer(userText);
    var html = this._buildFaqHtml(matched);
    // Persist plain text to history (HTML CTA is presentational).
    var historyText =
      (matched || FAQ_UNMATCHED) +
      '\n\n' +
      (t('chat.faq.lineCta') || '') +
      ' ' +
      CFG.lineUrl;
    this._pushHistory('assistant', historyText);
    var node = bubbleNode('assistant', '', { html: true });
    node.bubble.innerHTML = html;
    this.messagesEl.appendChild(node.row);
    this._scrollToEnd();
  };

  FuluckChat.prototype.send = function (text) {
    if (this.busy) return;
    var content = String(text || '').trim();
    if (!content) return;

    this._pushHistory('user', content);
    this._appendMessage('user', content);

    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this.sendBtn.classList.remove('is-active');
    this.sendBtn.disabled = true;

    var self = this;

    // Cached FAQ mode? Skip the network round-trip entirely.
    if (this.mode === 'faq') {
      // brief typing flicker for natural feel
      var typingFaq = typingNode();
      this.messagesEl.appendChild(typingFaq);
      this._scrollToEnd();
      this.busy = true;
      setTimeout(function () {
        if (typingFaq.parentNode) typingFaq.parentNode.removeChild(typingFaq);
        self._appendFaqAnswer(content);
        self.busy = false;
      }, 350);
      return;
    }

    var typing = typingNode();
    this.messagesEl.appendChild(typing);
    this._scrollToEnd();

    this.busy = true;
    var payload = {
      session_id: this.sessionId,
      messages: this.history
        .filter(function (m) {
          return m.role === 'user' || m.role === 'assistant';
        })
        .slice(-20)
        .map(function (m) {
          return { role: m.role, content: m.content };
        })
    };

    fetch(CFG.apiBase + CFG.chatPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return { error: 'invalid_json', status: res.status };
          })
          .then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
      })
      .then(function (r) {
        if (typing.parentNode) typing.parentNode.removeChild(typing);
        if (!r.ok) {
          // 401 / 404 / 5xx — worker is up but chat endpoint not deployed
          // (or auth-gated). Switch to FAQ mode and answer locally.
          if (r.status === 429) {
            var rateMsg = t('chat.error.rate');
            self._pushHistory('assistant', rateMsg);
            self._appendMessage('assistant', rateMsg);
            return;
          }
          self._setMode('faq');
          self._appendFaqAnswer(content);
          return;
        }
        // 200 OK — confirm we're online (in case we were cached as faq).
        self._setMode('online');
        var reply =
          (r.data && (r.data.message || r.data.reply || r.data.content)) ||
          t('chat.error');
        self._pushHistory('assistant', reply);
        self._appendMessage('assistant', reply);
      })
      .catch(function () {
        // Network failure / DNS / CORS — degrade to FAQ.
        if (typing.parentNode) typing.parentNode.removeChild(typing);
        self._setMode('faq');
        self._appendFaqAnswer(content);
      })
      .then(function () {
        self.busy = false;
      });
  };

  // ── Bootstrap ─────────────────────────────────────────────────────
  function boot() {
    if (window.FULUCK_CHAT_AUTOSTART === false) return;
    if (document.body && document.body.getAttribute('data-no-chat') === '1')
      return;
    var instance = new FuluckChat();
    instance.mount();
    window.FuluckChat = {
      open: instance.open.bind(instance),
      close: instance.close.bind(instance),
      toggle: instance.toggle.bind(instance),
      reset: instance.reset.bind(instance),
      send: instance.send.bind(instance),
      _instance: instance
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
