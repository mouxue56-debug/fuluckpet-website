/* UI for the licensed public boarding estimate. No personal data is collected. */
(function () {
  'use strict';

  var Calc = window.BoardingCalc;
  var Config = (window.BOARDING_CONFIG || {}).CONFIG;
  if (!Calc || !Config) return;

  var labels = {
    cat: '猫',
    rabbit_cage: 'うさぎ・小動物',
    hamster_cage: 'ハムスター等',
  };
  var surchargeLabels = {
    weekend_or_holiday: '土日祝加算',
    school_vacation: '学校休暇加算',
    high_season_core: '繁忙期加算',
  };

  function byId(id) { return document.getElementById(id); }
  function money(value) { return '¥' + Math.round(value).toLocaleString('ja-JP'); }
  function selectedType() {
    var selected = document.querySelector('input[name="petType"]:checked');
    return selected ? selected.value : '';
  }

  var elements = {
    checkIn: byId('checkIn'),
    checkOut: byId('checkOut'),
    discountCard: byId('discountCard'),
    isMember: byId('isMember'),
    graduatedWrap: byId('graduatedWrap'),
    isGraduatedCat: byId('isGraduatedCat'),
    careField: byId('careField'),
    catCare: byId('catCare'),
    resultEmpty: byId('resultEmpty'),
    resultBody: byId('resultBody'),
    resultLines: byId('resultLines'),
    totalValue: byId('totalValue'),
    reviewNote: byId('reviewNote'),
    lineButton: byId('lineButton'),
    copyButton: byId('copyButton'),
    copyMessage: byId('copyMessage'),
  };
  var quoteText = '';

  function setEmpty(message) {
    elements.resultEmpty.textContent = message;
    elements.resultEmpty.hidden = false;
    elements.resultBody.hidden = true;
    elements.lineButton.setAttribute('aria-disabled', 'true');
    elements.copyButton.hidden = true;
    elements.copyMessage.textContent = '';
    quoteText = '';
  }

  function addLine(label, detail, value) {
    var item = document.createElement('li');
    var left = document.createElement('span');
    left.textContent = label;
    if (detail) {
      var small = document.createElement('small');
      small.textContent = detail;
      left.appendChild(small);
    }
    var right = document.createElement('strong');
    right.textContent = value;
    item.appendChild(left);
    item.appendChild(right);
    elements.resultLines.appendChild(item);
  }

  function render(type, checkIn, checkOut, nights, lines, total, needsReview) {
    elements.resultLines.textContent = '';
    lines.forEach(function (line) { addLine(line.label, line.detail, line.value); });
    elements.totalValue.textContent = money(total);
    elements.reviewNote.hidden = !needsReview;
    elements.resultEmpty.hidden = true;
    elements.resultBody.hidden = false;
    elements.lineButton.setAttribute('aria-disabled', 'false');
    elements.copyButton.hidden = false;
    elements.copyMessage.textContent = '';

    var output = ['【お預かり 概算】', '動物：' + labels[type], '期間：' + checkIn + '〜' + checkOut + '（' + nights + '泊）', '――――――'];
    lines.forEach(function (line) { output.push(line.label + (line.detail ? '（' + line.detail + '）' : '') + ' ' + line.value); });
    output.push('――――――', '概算合計（税込）：' + money(total), '※正式料金はご相談後に確定します。');
    quoteText = output.join('\n');
  }

  function compute() {
    var type = selectedType();
    var checkIn = elements.checkIn.value;
    var checkOut = elements.checkOut.value;
    var isCat = type === 'cat';
    var isSmall = Calc.isSmallPetType(type);

    elements.discountCard.hidden = !type || isSmall;
    elements.graduatedWrap.hidden = !isCat;
    elements.careField.hidden = !isCat;
    if (!isCat) {
      elements.isGraduatedCat.checked = false;
      elements.catCare.value = '';
    }
    if (isSmall) elements.isMember.checked = false;

    if (!type || !checkIn || !checkOut) {
      setEmpty('上の1〜2を選ぶと、概算がここに表示されます。');
      return;
    }
    if (checkIn > '2027-01-07' || checkOut > '2027-01-08') {
      setEmpty('2027年1月8日以降の日程はLINEで直接お見積りします。');
      return;
    }

    var nights = Calc.getNights(checkIn, checkOut);
    if (!(nights >= 1)) {
      setEmpty('チェックアウトはチェックイン翌日以降を選んでください。');
      return;
    }

    if (isSmall) {
      var small = Calc.calculateSmallPetBoarding({ animalType: type, checkInDate: checkIn, checkOutDate: checkOut });
      var smallLines = [{ label: '基本料金', detail: money(small.perNight) + ' × ' + nights + '泊', value: money(small.boardingTotal) }];
      render(type, checkIn, checkOut, nights, smallLines, small.boardingTotal, false);
      return;
    }

    var boarding = Calc.calculateBoarding({
      animalType: type,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      isMember: elements.isMember.checked,
      isGraduatedCat: elements.isGraduatedCat.checked,
    });
    var lines = [{ label: 'お預かり', detail: money(boarding.discountedBasePerNight) + ' × ' + nights + '泊', value: money(boarding.discountedBasePerNight * nights) }];
    var groups = {};
    boarding.nightlyBreakdown.forEach(function (night) {
      if (!night.dateSurcharge) return;
      groups[night.dateCategory] = groups[night.dateCategory] || { price: night.dateSurcharge, count: 0 };
      groups[night.dateCategory].count += 1;
    });
    Object.keys(surchargeLabels).forEach(function (category) {
      if (!groups[category]) return;
      var surcharge = groups[category];
      lines.push({ label: surchargeLabels[category], detail: money(surcharge.price) + ' × ' + surcharge.count + '泊', value: '+' + money(surcharge.price * surcharge.count) });
    });

    var total = boarding.boardingTotal;
    if (elements.catCare.value) {
      var care = Calc.calculateCatGrooming(elements.catCare.value, {
        isMember: elements.isMember.checked,
        isGraduatedCat: elements.isGraduatedCat.checked,
        boardingNights: nights,
      });
      lines.push({ label: '猫のシャンプー・基本ケア', detail: elements.catCare.value === 'long' ? '長毛猫' : '短毛猫', value: '+' + money(care.subtotal) });
      total += care.subtotal;
    }
    render(type, checkIn, checkOut, nights, lines, total, boarding.needsReview);
  }

  function copyQuote() {
    if (!quoteText) return Promise.reject(new Error('no quote'));
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(quoteText);
    var area = document.createElement('textarea');
    area.value = quoteText;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    var copied = document.execCommand('copy');
    document.body.removeChild(area);
    return copied ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }

  document.querySelectorAll('input[name="petType"]').forEach(function (input) { input.addEventListener('change', compute); });
  [elements.checkIn, elements.checkOut, elements.isMember, elements.isGraduatedCat, elements.catCare].forEach(function (input) { input.addEventListener('change', compute); });
  elements.copyButton.addEventListener('click', function () {
    copyQuote().then(function () { elements.copyMessage.textContent = '見積もり内容をコピーしました。'; }, function () { elements.copyMessage.textContent = 'コピーできませんでした。画面の内容をLINEでお知らせください。'; });
  });
  elements.lineButton.addEventListener('click', function (event) {
    if (!quoteText) { event.preventDefault(); return; }
    copyQuote().catch(function () {});
  });

  var today = new Date();
  var todayString = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  elements.checkIn.min = todayString;
  elements.checkOut.min = todayString;
  try {
    var queryType = new URLSearchParams(window.location.search).get('type');
    var initial = document.querySelector('input[name="petType"][value="' + queryType + '"]');
    if (initial) initial.checked = true;
  } catch (error) {}
  compute();
})();
