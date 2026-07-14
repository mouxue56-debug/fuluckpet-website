/* Shared fail-closed UI for projected public dog services. */
(function (root, factory) {
  'use strict';
  var projectionApi = (typeof module !== 'undefined' && module.exports && typeof require !== 'undefined')
    ? require('./dog-services-projection.js')
    : root.DogServicesProjection;
  var calcApi = (typeof module !== 'undefined' && module.exports && typeof require !== 'undefined')
    ? require('./boarding-public-calc.js')
    : root.BoardingCalc;
  var api = factory(root, projectionApi, calcApi);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DogServicesPublicUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Projection, Calc) {
  'use strict';

  var FALSE_PROJECTION = { public: false };
  var LINE_URL = 'https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true';

  function valid(value) {
    return !!(Projection && typeof Projection.validateDogServicesProjection === 'function' &&
      Projection.validateDogServicesProjection(value));
  }

  function validPreparing(value) {
    return !!(Projection && typeof Projection.validateDogServicesPreparingProjection === 'function' &&
      Projection.validateDogServicesPreparingProjection(value));
  }

  function validDisplay(value) { return valid(value) || validPreparing(value); }
  function accepting(value) { return valid(value) && value.public === true; }

  function money(value) {
    return '¥' + Math.round(value).toLocaleString('ja-JP');
  }

  function weightBandLabel(band) {
    if (!band) return '';
    if (band.minKg === 0) return band.maxKgExclusive + 'kg未満';
    if (band.maxKgExclusive === null) return band.minKg + 'kg以上';
    return band.minKg + 'kg以上' + band.maxKgExclusive + 'kg未満';
  }

  function priceCards(projection, field, suffix) {
    return Projection.SIZE_KEYS.map(function (size) {
      var entry = projection.sizes[size];
      return '<article class="service-price-card' + (size === 'small' ? ' is-primary' : '') + '">' +
        '<p class="service-price-label">' + entry.label + '<small>' + weightBandLabel(projection.weightBands[size]) + '</small></p>' +
        '<p class="service-price">' + money(entry[field]) + (suffix || '') + '</p>' +
      '</article>';
    }).join('');
  }

  function careOffers(projection) {
    return projection.care.items.concat(projection.care.bundles);
  }

  function carePriceTable(projection) {
    var head = Projection.SIZE_KEYS.map(function (size) {
      return '<th scope="col">' + projection.sizes[size].label + '<small>' + weightBandLabel(projection.weightBands[size]) + '</small></th>';
    }).join('');
    var rows = careOffers(projection).map(function (offer) {
      return '<tr><th scope="row">' + offer.label + '</th>' + Projection.SIZE_KEYS.map(function (size) {
        return '<td>' + money(offer.priceBySize[size]) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div class="service-table-wrap"><table class="service-table"><thead><tr><th scope="col">ケア内容</th>' +
      head + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderBoarding(projection) {
    var stopped = !accepting(projection);
    var priceSuffix = stopped
      ? ' <small>/ 1泊・税込予定価格</small>'
      : ' <small>/ 1泊</small>';
    return '<section class="service-section dog-service-public" id="dog-services" data-dog-public-rendered="boarding">' +
      '<div class="service-wrap"><div class="service-heading"><p class="service-eyebrow">Dog stay</p>' +
      '<h2>犬のお預かり' + (stopped ? '｜準備中' : '') + '</h2>' +
      (stopped ? '<p class="service-status" role="status"><strong>現在受付停止</strong></p><p>' + projection.locationNotice + '</p>' : '') +
      '<p>' + (stopped
        ? '体重別の税込予定価格です。長期料金は7泊以上5%OFF、14泊以上10%OFF、21泊以上15%OFF、30泊以上20%OFFです。土日祝・繁忙期の加算はありません。受付開始時の内容は開始前にあらためてお知らせします。'
        : '体重別の税込基本料金です。長期料金は7泊以上5%OFF、14泊以上10%OFF、21泊以上15%OFF、30泊以上20%OFFです。土日祝・繁忙期の加算はありません。正式料金は事前相談後に確定します。') +
      '</p></div>' +
      '<div class="service-price-grid">' + priceCards(projection, 'boardingPerNight', priceSuffix) + '</div>' +
      '<div class="service-actions">' + (stopped ? '' : '<a class="service-btn is-primary" href="' + LINE_URL + '" target="_blank" rel="noopener">LINEで予約相談</a>') +
      '<a class="service-btn" href="/boarding/estimate.html">犬の料金を計算する</a>' +
      '<a class="service-btn" href="/grooming/#dog-basic-care">犬の基本ケアを見る</a></div></div></section>';
  }

  function renderCare(projection) {
    var stopped = !accepting(projection);
    return '<section class="service-section dog-service-public" id="dog-basic-care" data-dog-public-rendered="care">' +
      '<div class="service-wrap">' +
      (stopped ? '<p class="service-status" role="status"><strong>現在受付停止</strong></p><p>' + projection.locationNotice + '</p>' : '') +
      '<div class="service-heading"><p class="service-eyebrow">Dog basic care</p>' +
      '<h2>犬の基本ケア' + (stopped ? '｜準備中' : '') + '</h2>' +
      '<p>' + (stopped
        ? '以下は受付開始後を想定した税込の予定価格です。現在はご予約いただけません。'
        : '爪切り・耳掃除・肛門腺を、体型別の税込料金でご案内します。') + '</p></div>' +
      '<details class="service-care-details"><summary>' + (stopped ? '予定価格を見る' : '料金表を見る') + '</summary>' +
      carePriceTable(projection) + '</details>' +
      (stopped ? '' : '<div class="service-actions"><a class="service-btn is-primary" href="' + LINE_URL +
        '" target="_blank" rel="noopener">LINEで予約相談</a><a class="service-btn" href="/boarding/estimate.html">お預かりと一緒に計算する</a></div>') +
      '</div></section>';
  }

  function renderEstimate(projection) {
    var stopped = !accepting(projection);
    return (stopped ? '<p class="service-note dog-estimate-stop"><strong>犬は現在受付停止</strong>（税込予定価格の概算のみ確認できます）</p>' : '') + Projection.SIZE_KEYS.map(function (size) {
      var entry = projection.sizes[size];
      return '<div class="estimate-choice"><input type="radio" name="petType" id="type-dog-' + size + '" value="dog_' + size + '">' +
        '<label for="type-dog-' + size + '">' + entry.label + '<small>' + weightBandLabel(projection.weightBands[size]) + '・' + money(entry.boardingPerNight) + ' / 1泊' +
        (stopped ? '・税込予定価格' : '') + '</small></label></div>';
    }).join('');
  }

  function renderEstimateCare(projection) {
    var stopped = !accepting(projection);
    var choices = '<div class="estimate-choice"><input type="radio" name="dogCareOffer" id="dog-care-none" value="" checked>' +
      '<label for="dog-care-none">ケアを追加しない</label></div>' + careOffers(projection).map(function (offer) {
        return '<div class="estimate-choice"><input type="radio" name="dogCareOffer" id="dog-care-' + offer.id + '" value="' +
          offer.id + '"><label for="dog-care-' + offer.id + '">' + offer.label + '<small>' + Projection.SIZE_KEYS.map(function (size) {
            return projection.sizes[size].label + ' ' + money(offer.priceBySize[size]);
          }).join(' ／ ') + '</small></label></div>';
      }).join('');
    return '<div class="estimate-field dog-care-field" id="dogCareField" hidden><fieldset><legend>犬のケア' +
      (stopped ? '（予定価格）' : '') + '</legend>' +
      (stopped ? '<p class="service-note"><strong>現在受付停止</strong>。予定価格の概算のみ確認できます。</p>' : '') +
      '<div class="estimate-types">' + choices + '</div></fieldset></div>';
  }

  function renderSurface(surface, projection) {
    if (!validDisplay(projection) || (projection.public !== true && projection.preparing !== true)) return '';
    if (surface === 'boarding') return renderBoarding(projection);
    if (surface === 'care') return renderCare(projection);
    if (surface === 'estimate') return renderEstimate(projection);
    if (surface === 'estimate-care') return renderEstimateCare(projection);
    return '';
  }

  function offers(projection, field, prefix) {
    return Projection.SIZE_KEYS.map(function (size) {
      var entry = projection.sizes[size];
      return {
        '@type': 'Offer',
        name: prefix + ' ' + entry.label,
        price: String(entry[field]),
        priceCurrency: projection.currency,
      };
    });
  }

  function careSchemaOffers(projection) {
    return careOffers(projection).reduce(function (result, offer) {
      return result.concat(Projection.SIZE_KEYS.map(function (size) {
        return {
          '@type': 'Offer',
          name: '犬の基本ケア ' + offer.label + ' ' + projection.sizes[size].label,
          price: String(offer.priceBySize[size]),
          priceCurrency: projection.currency,
        };
      }));
    }, []);
  }

  function buildSchemaObjects(projection) {
    if (!accepting(projection)) return [];
    var provider = { '@type': 'LocalBusiness', name: '福楽ペット', legalName: '福楽株式会社' };
    return [
      {
        '@context': 'https://schema.org', '@type': 'Service', name: '犬のお預かり',
        url: 'https://fuluckpet.com/boarding/#dog-services', provider: provider,
        offers: offers(projection, 'boardingPerNight', '犬のお預かり'),
      },
      {
        '@context': 'https://schema.org', '@type': 'Service', name: '犬の基本ケア（爪切り・耳掃除・肛門腺）',
        url: 'https://fuluckpet.com/grooming/#dog-basic-care', provider: provider,
        offers: careSchemaOffers(projection),
      },
    ];
  }

  function projectionUrl(now) {
    var timestamp = typeof now === 'number' ? now : Date.now();
    return '/dog-services-launch.json?v=' + Math.floor(timestamp / 60000);
  }

  function preparingProjectionUrl(now) {
    var timestamp = typeof now === 'number' ? now : Date.now();
    return '/dog-services-preparing.json?v=' + Math.floor(timestamp / 60000);
  }

  function loadProjection(options) {
    options = options || {};
    var fetchImpl = options.fetch || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    if (!fetchImpl) return Promise.resolve({ public: false });
    var timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 5000;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer;
    var request;
    try {
      request = Promise.resolve(fetchImpl(projectionUrl(options.now), {
        credentials: 'same-origin', cache: 'default', signal: controller ? controller.signal : undefined,
      })).then(function (response) {
        if (!response || !response.ok || typeof response.json !== 'function') throw new Error('projection unavailable');
        return response.json();
      });
    } catch (_error) {
      return Promise.resolve({ public: false });
    }
    var deadline = new Promise(function (_resolve, reject) {
      timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('projection timeout'));
      }, timeoutMs);
    });
    return Promise.race([request, deadline]).then(function (value) {
      if (valid(value) && value.public === true) return value;
      return Promise.resolve(fetchImpl(preparingProjectionUrl(options.now), {
        credentials: 'same-origin', cache: 'default', signal: controller ? controller.signal : undefined,
      })).then(function (response) {
        if (!response || !response.ok || typeof response.json !== 'function') return { public: false };
        return response.json().then(function (prepared) { return validPreparing(prepared) ? prepared : { public: false }; });
      }, function () { return { public: false }; });
    }, function () {
      return { public: false };
    }).finally(function () { clearTimeout(timer); });
  }

  function calculateEstimate(projection, input) {
    if (!validDisplay(projection) || !Calc) return { available: false, error: 'unavailable' };
    var boarding = Calc.calculateDogBoarding(input, projection);
    if (!boarding || boarding.available !== true || boarding.error) return boarding;
    var basicCare = input && input.basicCare ? Calc.calculateDogBasicCare({ size: input.size }, projection) : null;
    var basicCareTotal = basicCare && basicCare.available === true ? basicCare.subtotal : 0;
    return {
      available: true,
      boarding: boarding,
      boardingTotal: boarding.boardingTotal,
      basicCare: basicCare,
      basicCareTotal: basicCareTotal,
      total: boarding.boardingTotal + basicCareTotal,
      accepting: accepting(projection),
    };
  }

  function removeSchemas(doc) {
    Array.prototype.forEach.call(doc.querySelectorAll('script[data-dog-services-schema]'), function (node) {
      node.remove();
    });
  }

  function mountDocument(doc, projection) {
    var safe = validDisplay(projection) ? projection : FALSE_PROJECTION;
    Array.prototype.forEach.call(doc.querySelectorAll('[data-dog-services-surface]'), function (node) {
      node.innerHTML = renderSurface(node.getAttribute('data-dog-services-surface'), safe);
    });
    removeSchemas(doc);
    Array.prototype.forEach.call(doc.querySelectorAll('[data-dog-private-only]'), function (node) {
      node.hidden = safe.public === true;
    });
    if (root.BoardingEstimate && typeof root.BoardingEstimate.enableDogServices === 'function') {
      root.BoardingEstimate.enableDogServices(safe);
    }
    if (safe.public !== true) return safe;

    var schemaIndex = doc.querySelector('[data-dog-services-surface="boarding"]') ? 0 :
      (doc.querySelector('[data-dog-services-surface="care"]') ? 1 : -1);
    if (schemaIndex !== -1 && doc.head) {
      var script = doc.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-dog-services-schema', schemaIndex === 0 ? 'boarding' : 'care');
      script.textContent = JSON.stringify(buildSchemaObjects(safe)[schemaIndex]);
      doc.head.appendChild(script);
    }
    return safe;
  }

  function init() {
    if (typeof document === 'undefined' || !document.querySelector('[data-dog-services-surface]')) return;
    loadProjection().then(function (projection) { mountDocument(document, projection); });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return {
    buildSchemaObjects: buildSchemaObjects,
    calculateEstimate: calculateEstimate,
    loadProjection: loadProjection,
    mountDocument: mountDocument,
    projectionUrl: projectionUrl,
    preparingProjectionUrl: preparingProjectionUrl,
    renderSurface: renderSurface,
  };
});
