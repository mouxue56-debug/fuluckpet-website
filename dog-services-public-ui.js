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

  function money(value) {
    return '¥' + Math.round(value).toLocaleString('ja-JP');
  }

  function priceCards(projection, field, suffix) {
    return Projection.SIZE_KEYS.map(function (size) {
      var entry = projection.sizes[size];
      return '<article class="service-price-card' + (size === 'small' ? ' is-primary' : '') + '">' +
        '<p class="service-price-label">' + entry.label + '</p>' +
        '<p class="service-price">' + money(entry[field]) + (suffix || '') + '</p>' +
      '</article>';
    }).join('');
  }

  function renderBoarding(projection) {
    return '<section class="service-section dog-service-public" id="dog-services" data-dog-public-rendered="boarding">' +
      '<div class="service-wrap"><div class="service-heading"><p class="service-eyebrow">Dog stay</p>' +
      '<h2>犬のお預かり</h2><p>体型別の税込基本料金です。7泊以上の長期料金と、土日祝・学校休暇・繁忙期の日付加算があります。正式料金は事前相談後に確定します。</p></div>' +
      '<div class="service-price-grid">' + priceCards(projection, 'boardingPerNight', ' <small>/ 1泊</small>') + '</div>' +
      '<div class="service-actions"><a class="service-btn is-primary" href="' + LINE_URL + '" target="_blank" rel="noopener">LINEで予約相談</a>' +
      '<a class="service-btn" href="/boarding/estimate.html">犬の料金を計算する</a>' +
      '<a class="service-btn" href="/grooming/#dog-basic-care">犬の基本ケアを見る</a></div></div></section>';
  }

  function renderCare(projection) {
    return '<section class="service-section dog-service-public" id="dog-basic-care" data-dog-public-rendered="care">' +
      '<div class="service-wrap"><div class="service-heading"><p class="service-eyebrow">Dog basic care</p>' +
      '<h2>犬の基本ケア</h2><p>爪切り・耳掃除・肛門腺の3項目を、体型別の税込料金で承ります。</p></div>' +
      '<div class="service-price-grid">' + priceCards(projection, 'basicCare', '') + '</div>' +
      '<div class="service-actions"><a class="service-btn is-primary" href="' + LINE_URL + '" target="_blank" rel="noopener">LINEで予約相談</a>' +
      '<a class="service-btn" href="/boarding/estimate.html">お預かりと一緒に計算する</a></div></div></section>';
  }

  function renderEstimate(projection) {
    return Projection.SIZE_KEYS.map(function (size) {
      var entry = projection.sizes[size];
      return '<div class="estimate-choice"><input type="radio" name="petType" id="type-dog-' + size + '" value="dog_' + size + '">' +
        '<label for="type-dog-' + size + '">' + entry.label + '<small>' + money(entry.boardingPerNight) + ' / 1泊</small></label></div>';
    }).join('');
  }

  function renderEstimateCare(projection) {
    return '<label class="estimate-check" for="dogBasicCare"><input type="checkbox" id="dogBasicCare">' +
      '<span>犬の基本ケア（爪切り・耳掃除・肛門腺）を追加</span></label>' +
      '<p class="service-note">体型別 ' + Projection.SIZE_KEYS.map(function (size) {
        return projection.sizes[size].label + ' ' + money(projection.sizes[size].basicCare);
      }).join(' ／ ') + '</p>';
  }

  function renderSurface(surface, projection) {
    if (!valid(projection) || projection.public !== true) return '';
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

  function buildSchemaObjects(projection) {
    if (!valid(projection) || projection.public !== true) return [];
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
        offers: offers(projection, 'basicCare', '犬の基本ケア'),
      },
    ];
  }

  function projectionUrl(now) {
    var timestamp = typeof now === 'number' ? now : Date.now();
    return '/dog-services-launch.json?v=' + Math.floor(timestamp / 60000);
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
      return valid(value) ? value : { public: false };
    }, function () {
      return { public: false };
    }).finally(function () { clearTimeout(timer); });
  }

  function calculateEstimate(projection, input) {
    if (!valid(projection) || projection.public !== true || !Calc) return { available: false, error: 'unavailable' };
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
    };
  }

  function removeSchemas(doc) {
    Array.prototype.forEach.call(doc.querySelectorAll('script[data-dog-services-schema]'), function (node) {
      node.remove();
    });
  }

  function mountDocument(doc, projection) {
    var safe = valid(projection) ? projection : FALSE_PROJECTION;
    Array.prototype.forEach.call(doc.querySelectorAll('[data-dog-services-surface]'), function (node) {
      node.innerHTML = renderSurface(node.getAttribute('data-dog-services-surface'), safe);
    });
    removeSchemas(doc);
    Array.prototype.forEach.call(doc.querySelectorAll('[data-dog-private-only]'), function (node) {
      node.hidden = safe.public === true;
    });
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
    if (root.BoardingEstimate && typeof root.BoardingEstimate.enableDogServices === 'function') {
      root.BoardingEstimate.enableDogServices(safe);
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
    renderSurface: renderSurface,
  };
});
