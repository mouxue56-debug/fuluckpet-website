'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const PROJECT = path.resolve(__dirname, '..');

function generateDiaryFixture(t) {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-diary-richtext-'));
  const toolsDir = path.join(siteDir, 'tools');
  const blogDir = path.join(siteDir, 'blog');
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.mkdirSync(blogDir, { recursive: true });

  for (const helper of ['generate-diary.js', 'lastmod-store.js', 'safe-json-for-html.js']) {
    fs.copyFileSync(path.join(PROJECT, 'tools', helper), path.join(toolsDir, helper));
  }
  fs.copyFileSync(
    path.join(PROJECT, 'blog/siberian-grooming-basics.html'),
    path.join(blogDir, 'siberian-grooming-basics.html')
  );

  const youtubeId = 'dQw4w9WgXcQ';
  const fixture = {
    diary: [{
      slug: 'richtext-security-probe',
      published: true,
      date: '2026-07-10',
      title: { ja: '安全な成長日記', en: 'Safe diary', zh: '安全成长日记' },
      excerpt: { ja: '本文の安全性テスト' },
      body: {
        ja: [
          '<h2>一週間目</h2>',
          '<p class="intro" onclick="globalThis.diaryPwned=1">元気に育っています。<strong>体重</strong>も増え、<em>よく眠り</em>、<u>よく遊びます</u>。</p>',
          '<h3>今日の様子</h3>',
          '<ul><li>ミルク</li><li>お昼寝</li></ul>',
          '<ol><li>健康確認</li><li>写真撮影</li></ol>',
          '<blockquote>ゆっくり見守っています。</blockquote>',
          '<figure class="blog-figure"><img src="/r2/diary/week-1.webp" alt="一週間目の子猫" width="1200" height="800" onerror="globalThis.diaryPwned=2"><figcaption>一週間目の様子</figcaption></figure>',
          '<a href="https://example.com/care" target="_blank" onclick="globalThis.diaryPwned=3">お手入れ資料</a>',
          '<a href="/booking.html#visit">見学予約</a>',
          '<script>globalThis.diaryPwned=4</script>',
          '<style>body{display:none}</style>',
          '<img src="jav&#x61;script:globalThis.diaryPwned=5" onerror="globalThis.diaryPwned=6">',
          '<img src="data:image/svg+xml,<svg onload=globalThis.diaryPwned=7></svg>">',
          '<object data="data:text/html,<script>globalThis.diaryPwned=8</script>"></object>',
          '<div class="yt-embed" style="position:relative"><iframe src="https://www.youtube.com/embed/' + youtubeId + '" onload="globalThis.diaryPwned=9"></iframe></div>',
          '<iframe src="https://evil.example/embed" srcdoc="<script>globalThis.diaryPwned=10</script>"></iframe>',
        ].join('\n'),
        en: [
          '<p>Safe English paragraph with <b>bold</b> text.</p>',
          '<a href="java&#x0A;script:globalThis.diaryPwned=11">encoded attack</a>',
          '<img src="DATA:text/html,<script>globalThis.diaryPwned=12</script>" onload="globalThis.diaryPwned=13">',
          '<svg onload="globalThis.diaryPwned=14"><a href="javascript:globalThis.diaryPwned=15">bad</a></svg>',
        ].join('\n'),
        zh: [
          '<p>中文正文<br>第二行</p>',
          '<a href="mailto:hello@example.com">邮件咨询</a>',
          '<a href="jAvAsCrIpT&colon;globalThis.diaryPwned=16">entity attack</a>',
          '<img src="https://cdn.example.com/kitten.webp" alt="小猫" loading="eager" style="background:url(javascript:globalThis.diaryPwned=17)">',
        ].join('\n'),
      },
    }],
    kittens: [],
    parents: [],
  };

  const fixturePath = path.join(siteDir, 'fixture.json');
  fs.writeFileSync(fixturePath, JSON.stringify(fixture), 'utf8');
  const result = childProcess.spawnSync(
    process.execPath,
    [path.join(toolsDir, 'generate-diary.js')],
    {
      cwd: siteDir,
      encoding: 'utf8',
      env: { ...process.env, DIARY_FIXTURE: fixturePath },
    }
  );
  assert.equal(result.status, 0, `generator failed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

  const html = fs.readFileSync(path.join(siteDir, 'diary/richtext-security-probe.html'), 'utf8');
  const contentMatch = html.match(/<div class="blog-detail-content diary-content">\s*([\s\S]*?)\s*<\/div>\s*\n\s*<section class="diary-cats">/);
  assert.ok(contentMatch, 'generated Japanese diary body should be extractable');
  const i18nMatch = html.match(/window\._diaryArticleI18n = (\{[\s\S]*?\}); window\._blogArticleI18n/);
  assert.ok(i18nMatch, 'generated localized diary payload should be extractable');

  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return {
    html,
    ja: contentMatch[1],
    i18n: JSON.parse(i18nMatch[1]),
    youtubeId,
  };
}

test('generated diary bodies remove executable elements, event handlers, and active URL schemes in every locale', (t) => {
  const generated = generateDiaryFixture(t);

  for (const [lang, content] of Object.entries({
    ja: generated.ja,
    en: generated.i18n.en.content,
    zh: generated.i18n.zh.content,
  })) {
    // The generator restores one exact, trusted lazy-YouTube facade after sanitizing.
    // Remove that known component before checking whether API-authored markup survived.
    const untrustedSurface = content.replace(/<div class="yt-video-wrap"[\s\S]*?<\/div><\/div>/g, '');
    assert.doesNotMatch(untrustedSurface, /<\/?(?:script|style|iframe|object|embed|template|svg|math)\b/i, `${lang} must not retain active elements`);
    assert.doesNotMatch(untrustedSurface, /\son[a-z]+\s*=/i, `${lang} must not retain event attributes`);
    assert.doesNotMatch(untrustedSurface, /\sstyle\s*=/i, `${lang} must not retain untrusted inline styles`);
    assert.doesNotMatch(untrustedSurface, /(?:href|src)\s*=\s*["']?\s*(?:java\s*script|javascript|data|vbscript)\s*(?::|&colon;)/i, `${lang} must not retain active URL schemes`);
  }
});

test('generated diary bodies preserve the supported editorial rich-text vocabulary with safe attributes', (t) => {
  const { ja, i18n } = generateDiaryFixture(t);

  assert.match(ja, /<h2>一週間目<\/h2>/);
  assert.match(ja, /<p class="intro">元気に育っています。<strong>体重<\/strong>も増え、<em>よく眠り<\/em>、<u>よく遊びます<\/u>。<\/p>/);
  assert.match(ja, /<h3>今日の様子<\/h3>/);
  assert.match(ja, /<ul><li>ミルク<\/li><li>お昼寝<\/li><\/ul>/);
  assert.match(ja, /<ol><li>健康確認<\/li><li>写真撮影<\/li><\/ol>/);
  assert.match(ja, /<blockquote>ゆっくり見守っています。<\/blockquote>/);
  assert.match(ja, /<figure class="blog-figure"><img src="\/r2\/diary\/week-1\.webp" alt="一週間目の子猫" width="1200" height="800" loading="lazy" decoding="async"><figcaption>一週間目の様子<\/figcaption><\/figure>/);
  assert.match(ja, /<a href="https:\/\/example\.com\/care" target="_blank" rel="noopener noreferrer">お手入れ資料<\/a>/);
  assert.match(ja, /<a href="\/booking\.html#visit">見学予約<\/a>/);
  assert.match(i18n.en.content, /<p>Safe English paragraph with <b>bold<\/b> text\.<\/p>/);
  assert.match(i18n.zh.content, /<p>中文正文<br>第二行<\/p>/);
  assert.match(i18n.zh.content, /<a href="mailto:hello@example\.com">邮件咨询<\/a>/);
  assert.match(i18n.zh.content, /<img src="https:\/\/cdn\.example\.com\/kitten\.webp" alt="小猫" loading="lazy" decoding="async">/);
});

test('only a recognized YouTube editor wrapper becomes a trusted lazy facade', (t) => {
  const { ja, youtubeId } = generateDiaryFixture(t);

  assert.match(ja, new RegExp(`<div class="yt-facade" data-yt="${youtubeId}" role="button" tabindex="0" aria-label="動画を再生">`));
  assert.match(ja, new RegExp(`https://i\\.ytimg\\.com/vi/${youtubeId}/hqdefault\\.jpg`));
  assert.doesNotMatch(ja, /<iframe\b/i);
  assert.doesNotMatch(ja, /evil\.example/i);
});
