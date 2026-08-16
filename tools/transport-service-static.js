'use strict';

const fs = require('node:fs');

const TRANSPORT_START = '<!-- BEGIN GENERATED PET TRANSPORT -->';
const TRANSPORT_END = '<!-- END GENERATED PET TRANSPORT -->';
const LINE_URL = 'https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true';

const TIER_CONTRACT = [
  { id: 'within3', status: 'priced', minKmExclusive: undefined, maxKmInclusive: 3 },
  { id: 'over3to5', status: 'priced', minKmExclusive: 3, maxKmInclusive: 5 },
  { id: 'over5to10', status: 'priced', minKmExclusive: 5, maxKmInclusive: 10 },
  { id: 'over10to20', status: 'quote', minKmExclusive: 10, maxKmInclusive: 20 },
  { id: 'over20', status: 'unavailable', minKmExclusive: 20, maxKmInclusive: null },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function yen(value) {
  return `¥${Number(value).toLocaleString('ja-JP')}`;
}

function plainYen(value) {
  return `${Number(value).toLocaleString('ja-JP')}円`;
}

function sameKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function assertTransportConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      !sameKeys(config, ['discountEligible', 'tiers']) || config.discountEligible !== false ||
      !Array.isArray(config.tiers) || config.tiers.length !== TIER_CONTRACT.length) {
    throw new Error('pet transport config is invalid');
  }

  config.tiers.forEach((tier, index) => {
    const contract = TIER_CONTRACT[index];
    const expectedKeys = ['id', 'label', 'maxKmInclusive', 'status', 'oneWayPrice', 'roundTripPrice'];
    if (contract.minKmExclusive !== undefined) expectedKeys.push('minKmExclusive');
    if (!tier || typeof tier !== 'object' || Array.isArray(tier) || !sameKeys(tier, expectedKeys) ||
        tier.id !== contract.id || typeof tier.label !== 'string' || tier.label.length === 0 ||
        tier.status !== contract.status || tier.minKmExclusive !== contract.minKmExclusive ||
        tier.maxKmInclusive !== contract.maxKmInclusive) {
      throw new Error(`pet transport tier ${contract.id} is invalid`);
    }
    if (tier.status === 'priced') {
      if (!Number.isSafeInteger(tier.oneWayPrice) || tier.oneWayPrice <= 0 ||
          !Number.isSafeInteger(tier.roundTripPrice) || tier.roundTripPrice !== tier.oneWayPrice * 2) {
        throw new Error(`pet transport tier ${contract.id} round-trip price arithmetic is invalid`);
      }
    } else if (tier.oneWayPrice !== null || tier.roundTripPrice !== null) {
      throw new Error(`pet transport tier ${contract.id} prices must be null`);
    }
  });
}

function renderTierRow(tier) {
  const label = `<th scope="row">${escapeHtml(tier.label)}</th>`;
  if (tier.status === 'priced') {
    return `<tr>${label}<td>${yen(tier.oneWayPrice)}</td><td>${yen(tier.roundTripPrice)}</td></tr>`;
  }
  if (tier.status === 'quote') {
    return `<tr>${label}<td colspan="2"><a href="${LINE_URL}" target="_blank" rel="noopener">LINEでお見積り</a></td></tr>`;
  }
  return `<tr>${label}<td colspan="2">送迎対応なし</td></tr>`;
}

function renderTransportSection(config) {
  assertTransportConfig(config);
  const rows = config.tiers.map(renderTierRow).join('');
  return '<section class="service-section is-white"><div class="service-wrap">' +
    '<div class="service-heading"><p class="service-eyebrow">Transport</p>' +
    '<h2 id="pet-transport-heading">お預かり・ケア利用時のペット送迎</h2>' +
    '<p>距離は店舗から送迎先までの片道距離です。ご利用前にLINEで住所と日程を確認します。</p></div>' +
    '<div class="service-table-wrap"><table class="service-table" aria-labelledby="pet-transport-heading">' +
    '<thead><tr><th scope="col">片道距離</th><th scope="col">片道1回</th><th scope="col">お迎え＋お送り</th></tr></thead>' +
    `<tbody>${rows}</tbody></table></div>` +
    '<p class="service-note">送迎料金は割引対象外です。子猫のお届けとは別料金です。</p>' +
    '</div></section>';
}

function markerIndex(source, marker) {
  const first = source.indexOf(marker);
  if (first === -1 || source.indexOf(marker, first + marker.length) !== -1) {
    throw new Error(`generated pet transport marker must appear exactly once: ${marker}`);
  }
  return first;
}

function markerLayout(source) {
  const start = markerIndex(source, TRANSPORT_START);
  const end = markerIndex(source, TRANSPORT_END);
  if (start >= end) throw new Error('generated pet transport markers are out of order or overlap');
  return { start, end };
}

function buildTransportPage(source, config) {
  if (typeof source !== 'string') throw new Error('transport page source is required');
  const { start, end } = markerLayout(source);
  const rendered = renderTransportSection(config);
  return source.slice(0, start + TRANSPORT_START.length) + `\n${rendered}\n` + source.slice(end);
}

function writeTransportPage(file, config) {
  const source = fs.readFileSync(file, 'utf8');
  const rendered = buildTransportPage(source, config);
  if (rendered !== source) fs.writeFileSync(file, rendered, 'utf8');
  return rendered !== source;
}

function isTransportPageFresh(source, config) {
  try {
    return buildTransportPage(source, config) === source;
  } catch (_) {
    return false;
  }
}

function formatTransportKnowledge(config) {
  assertTransportConfig(config);
  const tiers = config.tiers.map((tier) => {
    if (tier.status === 'priced') {
      return `${tier.label}は片道1回${plainYen(tier.oneWayPrice)}・お迎え＋お送り${plainYen(tier.roundTripPrice)}`;
    }
    if (tier.status === 'quote') return `${tier.label}はLINEでお見積り`;
    return `${tier.label}は送迎対応なし`;
  });
  return `ペット送迎はお預かり・ケア利用時のサービスで、${tiers.join('、')}。割引対象外で、子猫のお届けとは別料金。`;
}

module.exports = {
  TRANSPORT_START,
  TRANSPORT_END,
  assertTransportConfig,
  renderTransportSection,
  buildTransportPage,
  writeTransportPage,
  isTransportPageFresh,
  formatTransportKnowledge,
};
