/* UI for the licensed public boarding estimate. No personal data is collected. */
(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.document) {
    var runtime = api.init(root);
    Object.keys(runtime).forEach(function (key) { api[key] = runtime[key]; });
    root.BoardingEstimate = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CHECK_IN_MAX = '2027-12-31';
  var CHECK_OUT_MAX = '2028-01-01';

  function stateFor(type) {
    var isDog = /^dog_(small|medium|large)$/.test(type);
    return {
      catCareHidden: type !== 'cat',
      dogCareHidden: !isDog,
    };
  }

  function actionStateFor(type, mode) {
    var isDog = /^dog_(small|medium|large)$/.test(type);
    var isResult = mode === 'result';
    var isDateLimit = mode === 'date-limit';
    return {
      lineHidden: isDog || (!isResult && !isDateLimit),
      lineDisabled: isDog || (!isResult && !isDateLimit),
      copyHidden: !isResult,
    };
  }

  function priceSemanticsFor(type, dogAccepting) {
    var isDog = /^dog_(small|medium|large)$/.test(type);
    var planned = isDog && dogAccepting !== true;
    return {
      planned: planned,
      boardingLabel: isDog ? (planned ? '犬のお預かり（予定価格）' : '犬のお預かり') : 'お預かり',
      totalLabel: planned ? '概算合計（税込予定価格）' : '概算合計（税込）',
    };
  }

  function quoteMoney(value) {
    return '¥' + Math.round(value).toLocaleString('ja-JP');
  }

  function buildQuoteText(input) {
    var pricing = priceSemanticsFor(input.type, input.dogAccepting);
    var output = [
      pricing.planned ? '【犬のお預かり 予定価格概算】' : '【お預かり 概算】',
      '動物：' + input.animalLabel,
      '期間：' + input.checkIn + '〜' + input.checkOut + '（' + input.nights + '泊）',
      '――――――',
    ];
    input.lines.forEach(function (line) {
      output.push(line.label + (line.detail ? '（' + line.detail + '）' : '') + ' ' + line.value);
    });
    output.push(
      '――――――',
      (pricing.planned ? '予定価格合計（税込）：' : '概算合計（税込）：') + quoteMoney(input.total),
      pricing.planned
        ? '※犬は現在受付停止です。表示額は税込予定価格です。概算のみ確認できます。'
        : '※正式料金はご相談後に確定します。',
    );
    return output.join('\n');
  }

  function findById(entries, id) {
    for (var index = 0; index < entries.length; index += 1) {
      if (entries[index].id === id) return entries[index];
    }
    return null;
  }

  function applyCatPackageSelection(packageId, catalog, controls) {
    var selectedPackage = findById(catalog.packages, packageId);
    var includedIds = selectedPackage ? selectedPackage.includedItemIds : [];
    catalog.items.forEach(function (item) {
      var control = controls[item.id];
      if (!control) return;
      var included = includedIds.indexOf(item.id) !== -1;
      if (included) {
        if (control.type === 'checkbox') control.checked = false;
        else control.value = '0';
      }
      control.disabled = included;
    });
  }

  function init(root) {
    var document = root.document;
    var navigator = root.navigator || {};
    var Calc = root.BoardingCalc;
    var Config = (root.BOARDING_CONFIG || {}).CONFIG;
    var DogProjection = root.DogServicesProjection;
    if (!Calc || !Config) return { enableDogServices: function () { return false; } };

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
    var catCatalog = Config.careCatalog.cat;
    var catItemControls = {};
    var dogProjection = null;
    var quoteText = '';
    var lineDirect = false;
    var requestedType = '';

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
      catCareField: byId('catCareField'),
      catCarePackage: byId('catCarePackage'),
      catCareItems: byId('catCareItems'),
      dogCareField: null,
      resultEmpty: byId('resultEmpty'),
      resultBody: byId('resultBody'),
      resultLines: byId('resultLines'),
      totalRow: byId('totalRow'),
      totalLabel: byId('totalLabel'),
      totalValue: byId('totalValue'),
      reviewNote: byId('reviewNote'),
      dogStopNote: byId('dogStopNote'),
      dateNote: byId('dateNote'),
      dateError: byId('dateError'),
      resultActions: byId('resultActions'),
      lineButton: byId('lineButton'),
      copyButton: byId('copyButton'),
      copyMessage: byId('copyMessage'),
    };
    var defaultLineText = elements.lineButton.textContent;

    function makeOption(value, label) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      return option;
    }

    function itemPriceText(item) {
      if (item.quoteOnly) return '要相談';
      var suffix = item.unit ? ' / ' + item.unit : '';
      if (item.id === 'matting15') suffix += '（時間制・割引対象外）';
      return money(item.price) + suffix;
    }

    function buildCatCareControls() {
      elements.catCarePackage.textContent = '';
      elements.catCarePackage.appendChild(makeOption('', '追加しない'));
      catCatalog.packages.forEach(function (carePackage) {
        elements.catCarePackage.appendChild(makeOption(carePackage.id, carePackage.label + ' ' + money(carePackage.price)));
      });

      elements.catCareItems.textContent = '';
      catCatalog.items.forEach(function (item) {
        var row = document.createElement('li');
        row.className = 'estimate-care-item';
        var label = document.createElement('label');
        var title = document.createElement('span');
        var price = document.createElement('small');
        var control;
        var controlId = 'cat-care-item-' + item.id;

        label.className = 'estimate-care-item-label';
        label.htmlFor = controlId;
        title.textContent = item.label;
        price.textContent = itemPriceText(item);
        label.appendChild(title);
        label.appendChild(price);

        if (item.maxQuantity === 1) {
          control = document.createElement('input');
          control.type = 'checkbox';
        } else {
          control = document.createElement('select');
          for (var quantity = 0; quantity <= item.maxQuantity; quantity += 1) {
            var quantityLabel = quantity === 0 ? '追加しない' : quantity + ' × ' + item.unit;
            control.appendChild(makeOption(String(quantity), quantityLabel));
          }
        }
        control.id = controlId;
        control.className = 'estimate-care-control';
        control.setAttribute('data-care-item-id', item.id);
        control.addEventListener('change', compute);
        catItemControls[item.id] = control;
        row.appendChild(label);
        row.appendChild(control);
        elements.catCareItems.appendChild(row);
      });

      elements.catCarePackage.addEventListener('change', function () {
        applyCatPackageSelection(elements.catCarePackage.value, catCatalog, catItemControls);
        compute();
      });
    }

    function resetCatCare() {
      elements.catCarePackage.value = '';
      catCatalog.items.forEach(function (item) {
        var control = catItemControls[item.id];
        if (control.type === 'checkbox') control.checked = false;
        else control.value = '0';
        control.disabled = false;
      });
    }

    function catCareSelection() {
      var quantities = {};
      catCatalog.items.forEach(function (item) {
        var control = catItemControls[item.id];
        quantities[item.id] = control.type === 'checkbox' ? (control.checked ? 1 : 0) : Number(control.value);
      });
      return { packageId: elements.catCarePackage.value, quantities: quantities };
    }

    function resetDogCareOffer() {
      document.querySelectorAll('input[name="dogCareOffer"]').forEach(function (input) {
        input.checked = input.value === '';
      });
    }

    function selectedDogCareOffer() {
      var selected = document.querySelector('input[name="dogCareOffer"]:checked');
      return selected ? selected.value : '';
    }

    function applyActionState(type, mode) {
      var action = actionStateFor(type, mode);
      elements.lineButton.hidden = action.lineHidden;
      elements.lineButton.setAttribute('aria-disabled', action.lineDisabled ? 'true' : 'false');
      elements.copyButton.hidden = action.copyHidden;
      elements.resultActions.hidden = action.lineHidden && action.copyHidden;
    }

    function setDateValidity(message, invalidIds) {
      invalidIds = invalidIds || [];
      [elements.checkIn, elements.checkOut].forEach(function (input) {
        if (invalidIds.indexOf(input.id) !== -1) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      });
      elements.dateError.textContent = message || '';
      elements.dateError.hidden = !message;
    }

    function setEmpty(message, type, mode) {
      mode = mode || 'empty';
      elements.resultEmpty.textContent = message;
      elements.resultEmpty.hidden = false;
      elements.resultBody.hidden = true;
      elements.reviewNote.hidden = true;
      elements.dogStopNote.hidden = true;
      elements.copyMessage.textContent = '';
      quoteText = '';
      lineDirect = mode === 'date-limit' && !/^dog_/.test(type);
      elements.lineButton.textContent = lineDirect ? 'LINEで直接見積もりを相談' : defaultLineText;
      applyActionState(type, mode);
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

    function render(type, checkIn, checkOut, nights, lines, total, reviewMessage) {
      var isDog = /^dog_/.test(type);
      var dogAccepting = !!(isDog && dogProjection && dogProjection.public === true);
      var pricing = priceSemanticsFor(type, dogAccepting);
      elements.resultLines.textContent = '';
      lines.forEach(function (line) { addLine(line.label, line.detail, line.value); });
      elements.resultLines.hidden = false;
      elements.totalRow.hidden = false;
      elements.totalLabel.textContent = pricing.totalLabel;
      elements.totalValue.textContent = money(total);
      elements.reviewNote.textContent = reviewMessage || '';
      elements.reviewNote.hidden = !reviewMessage;
      elements.resultEmpty.hidden = true;
      elements.resultBody.hidden = false;
      elements.lineButton.hidden = isDog;
      elements.dogStopNote.hidden = !pricing.planned;
      elements.copyMessage.textContent = '';
      elements.lineButton.textContent = defaultLineText;
      lineDirect = false;
      applyActionState(type, 'result');

      quoteText = buildQuoteText({
        type: type,
        dogAccepting: dogAccepting,
        animalLabel: labels[type],
        checkIn: checkIn,
        checkOut: checkOut,
        nights: nights,
        lines: lines,
        total: total,
      });
    }

    function boardingDiscountLabel(type, nights, rate, isMember, isGraduatedCat) {
      if (!(rate < 1)) return '';
      if (nights >= 7 && rate < 0.9) {
        var minimum = nights >= 30 ? 30 : (nights >= 14 ? 14 : 7);
        var label = minimum + '泊以上 ' + Math.round((1 - rate) * 100) + '%OFF';
        if (minimum === 7 && rate === 0.8 && isMember) return '7泊以上 20%OFF（会員10%よりお得）';
        if (isMember) label += '（会員10%よりお得）';
        return label;
      }
      if (type === 'cat' && isGraduatedCat && rate === Config.customerDiscount.graduatedCat) return '福楽卒業猫 15%OFF';
      if (isMember && rate === Config.customerDiscount.member) return '会員 10%OFF';
      return Math.round((1 - rate) * 100) + '%OFF';
    }

    function addBoardingDiscountLine(lines, type, result, nights, isMember, isGraduatedCat) {
      var label = boardingDiscountLabel(type, nights, result.rate, isMember, isGraduatedCat);
      if (label) lines.push({ label: 'お預かり割引', detail: 'いちばんお得な割引を1つ適用', value: label });
    }

    function addSurchargeLines(lines, boarding) {
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
    }

    function catCareDiscountLabel(care, nights) {
      var discount = Config.careCatalog.cat.discounts;
      if (care.appliedDiscountRate === 1) return '';
      if (elements.isGraduatedCat.checked && care.appliedDiscountRate === discount.graduatedCat) return '福楽卒業猫 30%OFF';
      if (nights >= 14 && care.appliedDiscountRate === discount.afterBoarding14Nights) return '14泊以上 20%OFF';
      if (nights >= 7 && care.appliedDiscountRate === discount.afterBoarding7Nights) return '7泊以上 15%OFF';
      if (nights >= 3 && care.appliedDiscountRate === discount.afterBoarding3Nights) return '3泊以上 10%OFF';
      if (elements.isMember.checked && care.appliedDiscountRate === discount.member) return '会員 15%OFF';
      return Math.round((1 - care.appliedDiscountRate) * 100) + '%OFF';
    }

    function catCareLine(line, discountLabel) {
      var detail = discountLabel;
      if (line.id === 'matting15') detail = line.quantity + ' × 15分・毛玉・ブラッシングは時間制（割引対象外）';
      else if (line.type === 'item' && line.quantity > 1) detail = line.quantity + ' × ' + line.unit + (discountLabel ? '・' + discountLabel : '');
      else if (line.displayPrice === '要相談') detail = '内容を確認後にご案内';
      return {
        label: '猫のケア：' + line.label,
        detail: detail,
        value: line.displayPrice === '要相談' ? '要相談' : '+' + line.displayPrice,
      };
    }

    function dogCareLabel(offerId) {
      var offers = dogProjection.care.items.concat(dogProjection.care.bundles);
      var offer = findById(offers, offerId);
      return offer ? offer.label : '犬のケア';
    }

    function compute() {
      var type = selectedType();
      var checkIn = elements.checkIn.value;
      var checkOut = elements.checkOut.value;
      var isCat = type === 'cat';
      var isSmall = Calc.isSmallPetType(type);
      var dogMatch = /^dog_(small|medium|large)$/.exec(type);
      var isDog = !!dogMatch;
      var speciesState = stateFor(type);

      elements.dateNote.textContent = isDog
        ? '犬は現在受付停止です。受付開始後に対象日程を更新します。'
        : '2028年1月2日以降はLINEで直接お見積りします。';
      elements.discountCard.hidden = !type || isSmall;
      elements.graduatedWrap.hidden = !isCat;
      elements.catCareField.hidden = speciesState.catCareHidden;
      if (elements.dogCareField) elements.dogCareField.hidden = !isDog;
      if (!isCat) {
        elements.isGraduatedCat.checked = false;
        resetCatCare();
      }
      if (isSmall) elements.isMember.checked = false;
      if (!isDog) resetDogCareOffer();

      if (!type || !checkIn || !checkOut) {
        setDateValidity('', []);
        setEmpty('上の1〜2を選ぶと、概算がここに表示されます。', type, 'empty');
        return;
      }

      if (checkIn > CHECK_IN_MAX || checkOut > CHECK_OUT_MAX) {
        var invalidDates = [];
        if (checkIn > CHECK_IN_MAX) invalidDates.push('checkIn');
        if (checkOut > CHECK_OUT_MAX) invalidDates.push('checkOut');
        var dateLimitMessage = isDog
          ? '犬は現在受付停止です。受付開始後に対象日程を更新します。'
          : '2028年1月2日以降の日程はLINEで直接お見積りします。';
        setDateValidity(dateLimitMessage, invalidDates);
        setEmpty(dateLimitMessage, type, 'date-limit');
        return;
      }

      var nights = Calc.getNights(checkIn, checkOut);
      if (!(nights >= 1)) {
        var orderMessage = 'チェックアウトはチェックイン翌日以降を選んでください。';
        setDateValidity(orderMessage, ['checkOut']);
        setEmpty(orderMessage, type, 'error');
        return;
      }
      setDateValidity('', []);

      if (isSmall) {
        var small = Calc.calculateSmallPetBoarding({ animalType: type, checkInDate: checkIn, checkOutDate: checkOut });
        var smallLines = [{ label: '基本料金', detail: money(small.perNight) + ' × ' + nights + '泊', value: money(small.boardingTotal) }];
        render(type, checkIn, checkOut, nights, smallLines, small.boardingTotal, '');
        return;
      }

      if (isDog) {
        var dogSize = dogMatch[1];
        var dogPricing = priceSemanticsFor(type, dogProjection && dogProjection.public === true);
        var dogBoarding = Calc.calculateDogBoarding({
          size: dogSize,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          isMember: elements.isMember.checked,
        }, dogProjection);
        if (!dogBoarding || dogBoarding.available !== true || dogBoarding.error) {
          setEmpty('犬の料金情報を確認できませんでした。受付開始前のためお申し込みはできません。', type, 'error');
          return;
        }
        var dogLines = [{
          label: dogPricing.boardingLabel,
          detail: money(dogBoarding.discountedBasePerNight) + ' × ' + nights + '泊',
          value: money(dogBoarding.discountedBasePerNight * nights),
        }];
        addBoardingDiscountLine(dogLines, type, dogBoarding, nights, elements.isMember.checked, false);
        addSurchargeLines(dogLines, dogBoarding);
        var dogTotal = dogBoarding.boardingTotal;
        var dogCareOffer = selectedDogCareOffer();
        if (dogCareOffer) {
          var dogCare = Calc.calculateDogCare({ size: dogSize, offerId: dogCareOffer }, dogProjection);
          if (!dogCare || dogCare.available !== true || dogCare.error) {
            setEmpty('犬のケア料金を確認できませんでした。受付開始前のためお申し込みはできません。', type, 'error');
            return;
          }
          dogLines.push({ label: '犬のケア：' + dogCareLabel(dogCareOffer), detail: '予定価格', value: '+' + money(dogCare.subtotal) });
          dogTotal += dogCare.subtotal;
        }
        render(
          type,
          checkIn,
          checkOut,
          nights,
          dogLines,
          dogTotal,
          dogBoarding.needsReview ? '30泊以上は日程とお世話内容を確認後に正式料金をご案内します。' : '',
        );
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
      addBoardingDiscountLine(lines, type, boarding, nights, elements.isMember.checked, elements.isGraduatedCat.checked);
      addSurchargeLines(lines, boarding);

      var total = boarding.boardingTotal;
      var care = Calc.calculateCatCare(catCareSelection(), {
        isMember: elements.isMember.checked,
        isGraduatedCat: elements.isGraduatedCat.checked,
        boardingNights: nights,
      });
      if (care.error) {
        setEmpty('猫のケア料金を確認できませんでした。選択内容をご確認ください。', type, 'error');
        return;
      }
      var careDiscount = catCareDiscountLabel(care, nights);
      care.lineItems.forEach(function (line) { lines.push(catCareLine(line, line.appliedDiscountRate < 1 ? careDiscount : '')); });
      total += care.subtotal;
      var reviewMessages = [];
      if (boarding.needsReview) reviewMessages.push('30泊以上は日程とお世話内容を確認後に正式料金をご案内します。');
      if (care.needsQuote) reviewMessages.push('「要相談」のケアは内容確認後に正式料金をご案内します。');
      render(type, checkIn, checkOut, nights, lines, total, reviewMessages.join(' '));
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

    function bindPetTypeInputs() {
      document.querySelectorAll('input[name="petType"]').forEach(function (input) {
        if (input.__fuluckEstimateBound) return;
        input.__fuluckEstimateBound = true;
        input.addEventListener('change', compute);
      });
    }

    function bindDogCareInputs() {
      document.querySelectorAll('input[name="dogCareOffer"]').forEach(function (input) {
        if (input.__fuluckEstimateBound) return;
        input.__fuluckEstimateBound = true;
        input.addEventListener('change', compute);
      });
    }

    buildCatCareControls();
    bindPetTypeInputs();
    [elements.checkIn, elements.checkOut, elements.isMember, elements.isGraduatedCat].forEach(function (input) {
      input.addEventListener('change', compute);
    });
    elements.copyButton.addEventListener('click', function () {
      copyQuote().then(function () { elements.copyMessage.textContent = '見積もり内容をコピーしました。'; }, function () { elements.copyMessage.textContent = 'コピーできませんでした。画面の内容をご確認ください。'; });
    });
    elements.lineButton.addEventListener('click', function (event) {
      if (lineDirect) return;
      if (!quoteText) { event.preventDefault(); return; }
      copyQuote().catch(function () {});
    });

    var today = new Date();
    var todayString = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    elements.checkIn.min = todayString;
    elements.checkOut.min = todayString;
    try {
      requestedType = new root.URLSearchParams(root.location.search).get('type') || '';
      var initial = document.querySelector('input[name="petType"][value="' + requestedType + '"]');
      if (initial) initial.checked = true;
    } catch (error) {}

    function enableDogServices(projection) {
      if (!DogProjection) return false;
      var validPublic = DogProjection.validateDogServicesProjection(projection) && projection.public === true;
      var validPreparing = typeof DogProjection.validateDogServicesPreparingProjection === 'function' &&
        DogProjection.validateDogServicesPreparingProjection(projection) && projection.preparing === true;
      if (!validPublic && !validPreparing) return false;
      dogProjection = projection;
      DogProjection.SIZE_KEYS.forEach(function (size) {
        labels['dog_' + size] = projection.sizes[size].label;
      });
      elements.dogCareField = byId('dogCareField');
      bindPetTypeInputs();
      bindDogCareInputs();
      if (requestedType) {
        var initialDog = document.querySelector('input[name="petType"][value="' + requestedType + '"]');
        if (initialDog) initialDog.checked = true;
      }
      compute();
      return true;
    }

    compute();
    return { enableDogServices: enableDogServices };
  }

  return {
    actionStateFor: actionStateFor,
    applyCatPackageSelection: applyCatPackageSelection,
    buildQuoteText: buildQuoteText,
    init: init,
    priceSemanticsFor: priceSemanticsFor,
    stateFor: stateFor,
  };
});
