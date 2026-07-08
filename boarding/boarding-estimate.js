/* boarding-estimate.js — 估价器 UI 编排（DESIGN_SPEC ②）。
 * 只做：读输入 → 调 window.BoardingCalc 纯算 → 渲染 breakdown → 复制报价+开 LINE。
 * 零价格字面量（价格全来自 window.BOARDING_CONFIG / BoardingCalc），零个人信息收集。 */
(function () {
  'use strict';
  var Calc = window.BoardingCalc;
  var CFG = (window.BOARDING_CONFIG || {}).CONFIG || {};
  if (!Calc || !CFG.boardingBasePrice) { return; }

  var LINE_URL = 'https://page.line.me/915hnnlk';
  var TYPE_LABEL = { cat: '猫', small_dog: '小型犬', medium_dog: '中型犬', large_dog: '大型犬', rabbit_cage: 'うさぎ・小動物', hamster_cage: 'ハムスター等' };
  var CAT_GROOMING_LABEL = { short: '短毛 洗護セット', long: '長毛 洗護セット' };
  var DOG_CARE_LABEL = { care: '基本ケアセット（爪切り・耳掃除・肛門腺絞り）' };
  var SUR_LABEL = { weekend_or_holiday: '土日祝加算', school_vacation: '学校休暇加算', high_season_core: '繁忙期加算' };

  var $ = function (id) { return document.getElementById(id); };
  function fmtYen(n) { return '¥' + Math.round(n).toLocaleString('ja-JP'); }
  function off(rate) { return Math.round((1 - rate) * 100) + '%OFF'; }

  var els = {
    types: document.querySelectorAll('input[name="petType"]'),
    checkIn: $('checkIn'), checkOut: $('checkOut'),
    nightsLabel: $('nightsLabel'), nightsVal: $('nightsVal'), surHint: $('surHint'),
    discountCard: $('discountCard'),
    isMember: $('isMember'), isGraduatedCat: $('isGraduatedCat'), gradWrap: $('gradWrap'),
    optCat: $('optCatGrooming'), catGrooming: $('catGrooming'),
    optDog: $('optDogCare'), dogCare: $('dogCare'),
    transport: $('transport'), transportRound: $('transportRound'),
    resultEmpty: $('resultEmpty'), resultBody: $('resultBody'), resultLines: $('resultLines'),
    totalVal: $('totalVal'), reviewNote: $('reviewNote'),
    ctaLine: $('ctaLine'), ctaCopy: $('ctaCopy'), copiedMsg: $('copiedMsg'),
    sticky: $('sticky'), stickyVal: $('stickyVal'),
  };

  var lastQuoteText = '';

  function selectedType() {
    for (var i = 0; i < els.types.length; i++) if (els.types[i].checked) return els.types[i].value;
    return '';
  }

  // 折扣标签（显示哪一档命中了 min 率）
  function discountLabel(type, nights, isMember, isGrad, rate) {
    if (rate >= 1) return null;
    var ls = Calc.getLongStayRate(type, nights);
    if (ls !== null && rate === ls) {
      if (type === 'cat' && nights >= 30) return '長期割引（月お預かり価）';
      return '長期割引（' + nights + '泊・' + off(rate) + '）';
    }
    if (type === 'cat' && isGrad && rate === CFG.customerDiscount.graduatedCat) return '卒業猫割引（' + off(rate) + '）';
    if (isMember && rate === CFG.customerDiscount.member) return '会員割引（' + off(rate) + '）';
    return '割引（' + off(rate) + '）';
  }

  function lineHtml(lbl, sub, val, cls) {
    var li = document.createElement('li');
    if (cls) li.className = cls;
    var l = document.createElement('span'); l.className = 'lbl';
    l.textContent = lbl;
    if (sub) { var s = document.createElement('small'); s.textContent = sub; l.appendChild(s); }
    var v = document.createElement('span'); v.className = 'val'; v.textContent = val;
    li.appendChild(l); li.appendChild(v);
    return li;
  }

  // 送迎行を lines に追加（猫/犬/小動物 共通）。戻り値 {total, hasNote}
  function addTransportLine(lines) {
    if (els.transport.value === 'custom') {
      lines.push({ lbl: '送迎（エリア外）', sub: '別途お見積り', val: '要相談' });
      return { total: 0, hasNote: true };
    }
    if (els.transport.value) {
      var mins = parseInt(els.transport.value, 10);
      var tf = Calc.calculateTransportFee(els.transportRound.checked ? { pickupMinutes: mins, dropoffMinutes: mins } : { pickupMinutes: mins });
      if (typeof tf === 'number') {
        lines.push({ lbl: '送迎', sub: els.transportRound.checked ? '往復（片道×2の10%OFF）' : '片道', val: '+' + fmtYen(tf) });
        return { total: tf, hasNote: false };
      }
    }
    return { total: 0, hasNote: false };
  }

  function compute() {
    var type = selectedType();
    var checkIn = els.checkIn.value, checkOut = els.checkOut.value;

    // 小動物：泊数別1泊料金のみ（日付加算・会員/長期割引・猫シャンプー/わんちゃんケアなし。送迎は共通で利用可）
    var isSmall = Calc.isSmallPetType && Calc.isSmallPetType(type);

    // 选项显隐随类型
    var isCat = type === 'cat';
    els.optCat.hidden = isSmall || !isCat;
    els.optDog.hidden = isSmall || !(type && !isCat);
    els.discountCard.hidden = isSmall;
    if (isSmall) {
      els.catGrooming.value = ''; els.dogCare.value = '';
      els.isMember.checked = false; els.isGraduatedCat.checked = false;
    } else if (!isCat) {
      els.catGrooming.value = ''; els.isGraduatedCat.checked = false; els.isGraduatedCat.disabled = true; els.gradWrap.style.opacity = '.5';
    } else {
      els.isGraduatedCat.disabled = false; els.gradWrap.style.opacity = '';
    }
    if (isCat) els.dogCare.value = '';

    var nights = (checkIn && checkOut) ? Calc.getNights(checkIn, checkOut) : 0;
    if (checkIn && checkOut && nights >= 1) { els.nightsLabel.hidden = false; els.nightsVal.textContent = nights; }
    else els.nightsLabel.hidden = true;

    // 空态 / 无效态
    if (!type || !checkIn || !checkOut) { showEmpty('上の①②を選ぶと、概算がここに表示されます。'); return; }
    if (nights < 1) { showEmpty('チェックアウトはチェックイン翌日以降の日付を選んでください。'); return; }
    // 料金カレンダー整備済み範囲（boarding-config.js は 2026 年度分）を超える日程は
    // 加算が算定できず過少見積りになるため、計算せず LINE へ誘導する。
    if (checkIn > '2027-01-07' || checkOut > '2027-01-08') {
      showEmpty('2027年1月8日以降の日程は、恐れ入りますがLINEで直接お見積りいたします。');
      return;
    }

    // 小動物：泊数別の1泊料金のみ（日付加算・割引なし・¥100丸めなし）＋送迎（任意）
    if (isSmall) {
      var sp = Calc.calculateSmallPetBoarding({ animalType: type, checkInDate: checkIn, checkOutDate: checkOut });
      if (!sp || sp.error) { showEmpty('チェックアウトはチェックイン翌日以降の日付を選んでください。'); return; }
      var spLines = [];
      spLines.push({ lbl: '基本料金', sub: TYPE_LABEL[type] + ' ' + fmtYen(sp.perNight) + ' × ' + nights + '泊', val: fmtYen(sp.boardingTotal) });
      var spTotal = sp.boardingTotal;
      var spQuoteNote = addTransportLine(spLines);
      if (spQuoteNote.total) spTotal += spQuoteNote.total;
      render(spLines, spTotal, false);
      lastQuoteText = buildQuoteText(type, checkIn, checkOut, nights, spLines, spTotal, spQuoteNote.hasNote);
      els.ctaLine.setAttribute('aria-disabled','false'); els.ctaCopy.hidden = false;
      return;
    }

    var isMember = els.isMember.checked, isGrad = isCat && els.isGraduatedCat.checked;
    var b = Calc.calculateBoarding({ animalType: type, checkInDate: checkIn, checkOutDate: checkOut, isMember: isMember, isGraduatedCat: isGrad });

    var lines = [];
    var base = CFG.boardingBasePrice[type];
    // 基本料金（折前 gross）
    lines.push({ lbl: '基本料金', sub: TYPE_LABEL[type] + ' ' + fmtYen(base) + ' × ' + nights + '泊', val: fmtYen(base * nights) });
    // 割引
    var dl = discountLabel(type, nights, isMember, isGrad, b.rate);
    if (dl) {
      var discAmt = base * nights - b.discountedBasePerNight * nights;
      lines.push({ lbl: dl, val: '−' + fmtYen(discAmt), cls: 'disc' });
    }
    // 日期加算（按类别归组）
    var groups = {};
    b.nightlyBreakdown.forEach(function (n) {
      if (n.dateSurcharge > 0) { groups[n.dateCategory] = groups[n.dateCategory] || { per: n.dateSurcharge, count: 0 }; groups[n.dateCategory].count++; }
    });
    ['weekend_or_holiday', 'school_vacation', 'high_season_core'].forEach(function (cat) {
      if (groups[cat]) lines.push({ lbl: SUR_LABEL[cat], sub: fmtYen(groups[cat].per) + ' × ' + groups[cat].count + '泊', val: '+' + fmtYen(groups[cat].per * groups[cat].count) });
    });

    var total = b.boardingTotal;
    var hasQuoteNote = false;

    // 选项：猫シャンプー
    if (isCat && els.catGrooming.value) {
      var g = Calc.calculateCatGrooming(els.catGrooming.value, { isMember: isMember, isGraduatedCat: isGrad, boardingNights: nights });
      if (g) { lines.push({ lbl: '猫シャンプー', sub: CAT_GROOMING_LABEL[els.catGrooming.value], val: '+' + fmtYen(g.subtotal) }); total += g.subtotal; }
    }
    // 选项：わんちゃん基本ケア
    if (!isCat && type && els.dogCare.value === 'care') {
      var dc = Calc.calculateDogCare(type);
      if (dc) { lines.push({ lbl: 'わんちゃんの基本ケア', sub: DOG_CARE_LABEL['care'], val: '+' + fmtYen(dc.subtotal) }); total += dc.subtotal; }
    }
    // 选项：送迎
    var tResult = addTransportLine(lines);
    if (tResult.total) total += tResult.total;
    if (tResult.hasNote) hasQuoteNote = true;

    render(lines, total, b.needsReview);
    lastQuoteText = buildQuoteText(type, checkIn, checkOut, nights, lines, total, hasQuoteNote);
    els.ctaLine.setAttribute('aria-disabled','false'); els.ctaCopy.hidden = false;
  }

  function showEmpty(msg) {
    els.resultEmpty.hidden = false; els.resultEmpty.textContent = msg;
    els.resultBody.hidden = true;
    els.ctaLine.setAttribute('aria-disabled','true'); els.ctaCopy.hidden = true;
    els.sticky.classList.remove('show'); lastQuoteText = '';
    els.copiedMsg.textContent = '';
  }

  function render(lines, total, needsReview) {
    els.resultEmpty.hidden = true; els.resultBody.hidden = false;
    els.resultLines.innerHTML = '';
    lines.forEach(function (l) { els.resultLines.appendChild(lineHtml(l.lbl, l.sub, l.val, l.cls)); });
    els.totalVal.textContent = fmtYen(total);
    els.stickyVal.textContent = fmtYen(total);
    els.reviewNote.hidden = !needsReview;
    els.sticky.classList.add('show');
    els.copiedMsg.textContent = '';
  }

  function buildQuoteText(type, checkIn, checkOut, nights, lines, total, hasQuoteNote) {
    var out = [];
    out.push('【お預かり 概算お見積もり】');
    out.push('ペット：' + TYPE_LABEL[type]);
    out.push('期間：' + checkIn + ' 〜 ' + checkOut + '（' + nights + '泊）');
    out.push('――――――――――');
    lines.forEach(function (l) { out.push((l.sub ? l.lbl + '（' + l.sub + '）' : l.lbl) + '　' + l.val); });
    out.push('――――――――――');
    out.push('概算合計（税込）：' + fmtYen(total));
    if (hasQuoteNote) out.push('※「要相談」の項目は合計に含まれていません。');
    out.push('※こちらは概算です。正式な料金はご相談後にご案内いたします。');
    return out.join('\n');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
        ta.style.position = 'absolute'; ta.style.left = '-9999px'; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy'); document.body.removeChild(ta); resolve();
      } catch (e) { reject(e); }
    });
  }

  function onCta(openLine) {
    if (!lastQuoteText) return;
    copyText(lastQuoteText).then(function () {
      els.copiedMsg.textContent = openLine
        ? '見積もり内容をコピーしました。LINEに貼り付けてお送りください。'
        : '見積もり内容をコピーしました。';
      if (openLine) window.open(LINE_URL, '_blank', 'noopener');
    }).catch(function () {
      els.copiedMsg.textContent = 'コピーできませんでした。お手数ですが手動でお伝えください。';
      if (openLine) window.open(LINE_URL, '_blank', 'noopener');
    });
  }

  // ── bind ──
  els.types.forEach && els.types.forEach(function (r) { r.addEventListener('change', compute); });
  if (!els.types.forEach) for (var i = 0; i < els.types.length; i++) els.types[i].addEventListener('change', compute);
  ['checkIn', 'checkOut', 'isMember', 'isGraduatedCat', 'catGrooming', 'dogCare', 'transport', 'transportRound'].forEach(function (k) {
    if (els[k]) els[k].addEventListener('change', compute);
  });
  // 加算提示随日期显示（小動物は日付加算なしのため非表示）
  function toggleSurHint() {
    var smallSel = Calc.isSmallPetType && Calc.isSmallPetType(selectedType());
    els.surHint.classList.toggle('show', !smallSel && !!(els.checkIn.value && els.checkOut.value));
  }
  els.checkIn.addEventListener('change', toggleSurHint); els.checkOut.addEventListener('change', toggleSurHint);
  els.types.forEach && els.types.forEach(function (r) { r.addEventListener('change', toggleSurHint); });
  if (!els.types.forEach) for (var j = 0; j < els.types.length; j++) els.types[j].addEventListener('change', toggleSurHint);

  // ctaLine is a real <a>: let it navigate natively (in-gesture, iOS-safe). Copy is best-effort, NOT awaited.
  els.ctaLine.addEventListener('click', function (e) {
    if (els.ctaLine.getAttribute('aria-disabled') === 'true' || !lastQuoteText) { e.preventDefault(); return; }
    try { copyText(lastQuoteText); } catch (err) {}
    els.copiedMsg.textContent = '見積もり内容をコピーしました。LINEに貼り付けてお送りください。';
  });
  els.ctaCopy.addEventListener('click', function () { onCta(false); });

  function scrollToResult() { $('result').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  els.sticky.addEventListener('click', scrollToResult);
  els.sticky.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollToResult(); } });

  // ?type= 预选（料金页价格卡导入）
  try {
    var qp = new URLSearchParams(window.location.search).get('type');
    if (qp && TYPE_LABEL[qp]) { var r = document.getElementById('t-' + ({ cat: 'cat', small_dog: 'small', medium_dog: 'medium', large_dog: 'large', rabbit_cage: 'rabbit', hamster_cage: 'hamster' })[qp]); if (r) r.checked = true; }
  } catch (e) {}

  // min date = 今日（防倒填）——用 input 的 min 属性，避免脚本内取当前时间做计算
  compute();
})();
