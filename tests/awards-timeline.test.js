import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'parse5';

const aboutSource = readFileSync(new URL('../about.html', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../i18n.js', import.meta.url), 'utf8');
const awardsCssUrl = new URL('../awards.css', import.meta.url);
const awardsCssSource = existsSync(awardsCssUrl) ? readFileSync(awardsCssUrl, 'utf8') : '';
const about = parse(aboutSource);
const index = parse(indexSource);
const verifiedAwards = [
  { id: '21451', period: '2023-h1', scope: 'awards.timeline.scope.osaka', rank: 'awards.timeline.rank.1', jsonLdText: '2023年上半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 大阪府1位' },
  { id: '22853', period: '2023-h2', scope: 'awards.timeline.scope.osaka', rank: 'awards.timeline.rank.3', jsonLdText: '2023年下半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 大阪府3位' },
  { id: '24331', period: '2024-h1', scope: 'awards.timeline.scope.osaka', rank: 'awards.timeline.rank.2', jsonLdText: '2024年上半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 大阪府2位' },
  { id: '25811', period: '2024-h2', scope: 'awards.timeline.scope.osaka', rank: 'awards.timeline.rank.1', jsonLdText: '2024年下半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 大阪府1位' },
  { id: '26387', period: '2024-h2', scope: 'awards.timeline.scope.kansai', rank: 'awards.timeline.rank.1', jsonLdText: '2024年下半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 関西・近畿地域1位' },
  { id: '26084', period: '2024-h2', scope: 'awards.timeline.scope.national', rank: 'awards.timeline.rank.2', jsonLdText: '2024年下半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 全国2位' },
  { id: '27240', period: '2025-h1', scope: 'awards.timeline.scope.osaka', rank: 'awards.timeline.rank.1', jsonLdText: '2025年上半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 大阪府1位' },
  { id: '27837', period: '2025-h1', scope: 'awards.timeline.scope.kansai', rank: 'awards.timeline.rank.1', jsonLdText: '2025年上半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 関西・近畿地域1位' },
  { id: '27519', period: '2025-h1', scope: 'awards.timeline.scope.national', rank: 'awards.timeline.rank.1', jsonLdText: '2025年上半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 全国1位' },
  { id: '28727', period: '2025-h2', scope: 'awards.timeline.scope.osaka', rank: 'awards.timeline.rank.1', jsonLdText: '2025年下半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 大阪府1位' },
  { id: '29332', period: '2025-h2', scope: 'awards.timeline.scope.kansai', rank: 'awards.timeline.rank.1', jsonLdText: '2025年下半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 関西・近畿地域1位' },
  { id: '29003', period: '2025-h2', scope: 'awards.timeline.scope.national', rank: 'awards.timeline.rank.2', jsonLdText: '2025年下半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 全国2位' },
  { id: '30144', period: '2026-h1', scope: 'awards.timeline.scope.osaka', rank: 'awards.timeline.rank.1', jsonLdText: '2026年上半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 大阪府1位' },
  { id: '30753', period: '2026-h1', scope: 'awards.timeline.scope.kansai', rank: 'awards.timeline.rank.2', jsonLdText: '2026年上半期 みんなの子猫ブリーダー サイベリアンブリーダー お客様評価 関西・近畿地域2位' },
];
const periods = ['2023-h1','2023-h2','2024-h1','2024-h2','2025-h1','2025-h2','2026-h1'];
const homepageFirstPlaceIds = ['30144', '21451', '25811', '27240', '27519', '28727'];
const periodAltText = {
  '2023-h1': '2023年上半期', '2023-h2': '2023年下半期',
  '2024-h1': '2024年上半期', '2024-h2': '2024年下半期',
  '2025-h1': '2025年上半期', '2025-h2': '2025年下半期',
  '2026-h1': '2026年上半期',
};
const requiredKeys = [
  'awards.timeline.title','awards.timeline.summary','awards.timeline.method','awards.timeline.category',
  'awards.timeline.scope.osaka','awards.timeline.scope.kansai','awards.timeline.scope.national',
  'awards.timeline.rank.1','awards.timeline.rank.2','awards.timeline.rank.3',
  'awards.timeline.2023.h1','awards.timeline.2023.h2','awards.timeline.2024.h1','awards.timeline.2024.h2',
  'awards.timeline.2025.h1','awards.timeline.2025.h2','awards.timeline.2026.h1'
];
const heroAwardKeys = [
  'hero.awardProof.current', 'hero.awardProof.title', 'hero.awardProof.national',
  'hero.awardProof.osaka', 'hero.awardProof.detail', 'hero.awardProof.cta'
];

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit);
}

function attr(node, name) {
  return (node.attrs || []).find(item => item.name === name)?.value;
}

function hasClass(node, className) {
  return (attr(node, 'class') || '').split(/\s+/).includes(className);
}

function descendants(node, predicate) {
  const matches = [];
  walk(node, child => {
    if (predicate(child)) matches.push(child);
  });
  return matches;
}

function text(node) {
  let value = '';
  walk(node, child => {
    if (child.nodeName === '#text') value += child.value;
  });
  return value.replace(/\s+/g, ' ').trim();
}

function closestAttr(node, name) {
  for (let current = node; current; current = current.parentNode) {
    const value = attr(current, name);
    if (value !== undefined) return value;
  }
  return undefined;
}

test('publishes every verified Koneko plate once in chronological period groups', () => {
  const images = [];
  const periodNodes = [];
  walk(about, node => {
    if (node.tagName === 'img' && /\/certificate\/(\d+)-L\.png$/.test(attr(node, 'src') || '')) images.push(node);
    if ((attr(node, 'data-award-period') || '').length) periodNodes.push(attr(node, 'data-award-period'));
  });
  assert.deepEqual(images.map(node => /\/(\d+)-L\.png$/.exec(attr(node, 'src'))[1]), verifiedAwards.map(award => award.id));
  assert.deepEqual(periodNodes, periods);
  assert.equal(new Set(images.map(node => attr(node, 'src'))).size, 14);
});

test('each award card and LocalBusiness JSON-LD match the complete verified inventory', () => {
  const cards = descendants(about, node => node.tagName === 'article' && hasClass(node, 'award-evidence-card'));
  const visibleFacts = cards.map(card => {
    const image = descendants(card, node => node.tagName === 'img' && /\/certificate\/(\d+)-L\.png$/.test(attr(node, 'src') || ''))[0];
    const scope = descendants(card, node => node.tagName === 'p' && hasClass(node, 'award-scope'))[0];
    const rank = descendants(card, node => node.tagName === 'h5')[0];
    return {
      id: /\/(\d+)-L\.png$/.exec(attr(image, 'src'))[1],
      period: closestAttr(card, 'data-award-period'),
      scope: attr(scope, 'data-i18n'),
      rank: attr(rank, 'data-i18n'),
    };
  });
  assert.deepEqual(visibleFacts, verifiedAwards.map(({ id, period, scope, rank }) => ({ id, period, scope, rank })));

  const documents = Array.from(
    aboutSource.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>\s*([\s\S]*?)\s*<\/script>/g),
    match => JSON.parse(match[1]),
  );
  const localBusiness = documents.find(document => document['@type'] === 'LocalBusiness');
  assert.ok(localBusiness, 'about page keeps its LocalBusiness JSON-LD');
  assert.deepEqual(localBusiness.award, verifiedAwards.map(award => award.jsonLdText));
});

test('official embeds keep the platform link, dimensions, border, and supplied Japanese alt contract', () => {
  const images = [];
  walk(about, node => {
    if (node.tagName === 'img' && /\/certificate\/\d+-L\.png$/.test(attr(node, 'src') || '')) images.push(node);
  });
  for (const image of images) {
    assert.equal(attr(image.parentNode, 'href'), 'https://www.koneko-breeder.com/');
    assert.equal(attr(image, 'border'), '0');
    assert.equal(attr(image, 'style'), 'width:162px; height:256px;');
    assert.match(attr(image, 'alt'), /^みんなの子猫ブリーダー サイベリアン部門 20(23|24|25|26)年(上|下)半期$/);
    assert.equal(attr(image, 'target'), undefined);
    assert.equal(attr(image, 'loading'), undefined);
  }
});

test('keeps every platform-supplied link tag byte-for-byte unchanged', () => {
  for (const { id, period } of verifiedAwards) {
    const officialEmbed = `<a href="https://www.koneko-breeder.com/"><img src="https://www.koneko-breeder.com/breeder/images/certificate/${id}-L.png" border="0" alt="みんなの子猫ブリーダー サイベリアン部門 ${periodAltText[period]}" style="width:162px; height:256px;"></a>`;
    assert.equal(aboutSource.split(officialEmbed).length - 1, 1, id);
  }
});

test('the page exposes semantic year, period, and award-card structure', () => {
  const tags = [];
  walk(about, node => {
    if (node.tagName) tags.push({ tag: node.tagName, id: attr(node, 'id'), className: attr(node, 'class') || '' });
  });
  assert.ok(tags.some(node => node.tag === 'section' && node.id === 'awards-timeline'));
  assert.ok(tags.some(node => node.tag === 'ol' && node.className.split(/\s+/).includes('awards-timeline')));
  assert.equal(tags.filter(node => node.tag === 'article' && node.className.split(/\s+/).includes('award-evidence-card')).length, 14);
});

test('timeline copy exists in all three locale dictionaries', () => {
  for (const key of requiredKeys) {
    assert.equal((i18nSource.match(new RegExp(`['"]${key.replaceAll('.', '\\.')}['"]\\s*:`, 'g')) || []).length, 3, key);
  }
});

test('homepage award impact copy exists in all three locale dictionaries', () => {
  for (const key of heroAwardKeys) {
    assert.equal((i18nSource.match(new RegExp(`['"]${key.replaceAll('.', '\\.')}['"]\\s*:`, 'g')) || []).length, 3, key);
  }
});

test('timeline has desktop and mobile trunk layouts without required motion', () => {
  assert.match(awardsCssSource, /\.awards-timeline\s*\{[\s\S]*position:\s*relative/);
  assert.match(awardsCssSource, /\.awards-timeline::before/);
  assert.match(awardsCssSource, /@media\s*\(max-width:\s*767px\)[\s\S]*\.awards-timeline::before/);
  assert.match(awardsCssSource, /prefers-reduced-motion/);
});

test('desktop timeline keeps every year on one trunk with compact period branches', () => {
  const desktopCss = awardsCssSource.split('@media (max-width: 980px)')[0];
  assert.match(desktopCss, /\.award-year\s*\{[\s\S]*grid-template-columns:\s*86px minmax\(0,\s*1fr\)/);
  assert.match(desktopCss, /\.award-year-branches\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(desktopCss, /\.award-year-branches > \.award-period:only-child\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(desktopCss, /\.award-year-branches > \.award-period:only-child \.award-period-cards\s*\{[\s\S]*justify-content:\s*center/);
  assert.doesNotMatch(desktopCss, /grid-column:\s*3/);
});

test('legacy settings code cannot replace official award plates', () => {
  assert.doesNotMatch(aboutSource, /querySelectorAll\(['"]\.award-badge-img img/);
  assert.doesNotMatch(aboutSource, /images\[['"]award-[123]['"]\]/);
});

test('homepage presents all six Osaka and national No. 1 plates without replacing the family hero', () => {
  const proofAnchors = descendants(index, node => node.tagName === 'a' && hasClass(node, 'hero-award-proof'));
  assert.equal(proofAnchors.length, 1);
  assert.equal(attr(proofAnchors[0], 'href'), '/about.html#awards-timeline');
  assert.equal(attr(proofAnchors[0], 'aria-labelledby'), 'hero-award-current hero-award-streak hero-award-national hero-award-osaka');
  assert.equal(attr(proofAnchors[0], 'aria-describedby'), 'hero-award-detail');
  const plateImages = descendants(proofAnchors[0], node => node.tagName === 'img');
  assert.deepEqual(
    plateImages.map(image => /\/(\d+)-L\.png$/.exec(attr(image, 'src'))?.[1]),
    homepageFirstPlaceIds,
  );
  for (const image of plateImages) {
    assert.equal(attr(image, 'width'), '162');
    assert.equal(attr(image, 'height'), '256');
    assert.match(attr(image, 'alt'), /みんなの子猫ブリーダー.*サイベリアン.*第1位/);
  }

  const current = descendants(proofAnchors[0], node => attr(node, 'data-i18n') === 'hero.awardProof.current')[0];
  const title = descendants(proofAnchors[0], node => attr(node, 'data-i18n') === 'hero.awardProof.title')[0];
  const national = descendants(proofAnchors[0], node => attr(node, 'data-i18n') === 'hero.awardProof.national')[0];
  const osaka = descendants(proofAnchors[0], node => attr(node, 'data-i18n') === 'hero.awardProof.osaka')[0];
  const detail = descendants(proofAnchors[0], node => attr(node, 'data-i18n') === 'hero.awardProof.detail')[0];
  assert.equal(text(current), '2026年上半期 大阪府 第1位');
  assert.equal(text(title), '7期連続受賞');
  assert.equal(text(national), '全国 第1位 1期');
  assert.equal(text(osaka), '大阪府 第1位 5期');
  assert.equal(text(detail), '公式プレート14件｜サイベリアンブリーダー・お客様評価');
  assert.ok(descendants(proofAnchors[0], node => attr(node, 'data-i18n') === 'hero.awardProof.cta').length);

  const hero = descendants(index, node => node.tagName === 'section' && hasClass(node, 'hero'))[0];
  const heroImages = descendants(hero, node => node.tagName === 'img');
  assert.ok(heroImages.some(image => attr(image, 'src') === 'images/hero-main.webp'));
  assert.equal(heroImages.some(image => /images\/ai\//.test(attr(image, 'src') || '')), false);
});

test('award visuals use one isolated, cache-busted stylesheet on only the two award surfaces', () => {
  const awardStylesheet = '/awards.css?v=20260903c';
  const trackedHtml = execFileSync('git', ['ls-files', '*.html'], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
  const consumers = trackedHtml.filter(relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').includes(awardStylesheet));

  assert.deepEqual(consumers.sort(), ['about.html', 'index.html']);
  assert.match(awardsCssSource, /\.hero-award-proof-plate/);
  assert.match(awardsCssSource, /\.awards-timeline::before/);
  assert.match(awardsCssSource, /@media\s*\(max-width:\s*767px\)/);
  assert.match(awardsCssSource, /var\(--mint/);
  assert.match(awardsCssSource, /var\(--bg-cream\)/);
  assert.match(awardsCssSource, /var\(--text-heading\)/);
  assert.doesNotMatch(awardsCssSource, /font-family|#[0-9a-f]{3,8}/i);

  const proofRule = awardsCssSource.match(/\.hero-award-proof\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(proofRule, /display:\s*grid/);
  assert.match(proofRule, /align-items:\s*center/);
  assert.match(proofRule, /width:\s*min\(100%,\s*640px\)/);
  assert.match(proofRule, /min-height:\s*260px/);
  assert.match(awardsCssSource, /\.hero-award-proof-plates\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
});

test('award pages use fresh translation and favicon cache keys', () => {
  for (const source of [indexSource, aboutSource]) {
    assert.match(source, /i18n\.js\?v=20260903a/);
    assert.match(source, /href=["']\/favicon\.ico\?v=20260903a["']/);
  }
});

test('the latest timeline branch and Osaka plate are explicitly identifiable', () => {
  const currentPeriod = descendants(about, node => attr(node, 'data-award-current') === 'true');
  const featured = descendants(about, node => attr(node, 'data-award-featured') === 'osaka-2026-h1');
  assert.equal(currentPeriod.length, 1);
  assert.equal(attr(currentPeriod[0], 'data-award-period'), '2026-h1');
  assert.equal(featured.length, 1);
  const image = descendants(featured[0], node => node.tagName === 'img')[0];
  assert.equal(attr(image, 'src'), 'https://www.koneko-breeder.com/breeder/images/certificate/30144-L.png');
});
