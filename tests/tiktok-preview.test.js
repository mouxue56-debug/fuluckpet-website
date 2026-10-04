'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('TikTok preview remains visible when TikTok embeds are rate limited', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sns = html.slice(html.indexOf('id="sns-media"'), html.indexOf('<!-- ========== FOOTER'));
  const preview = sns.match(/<a\b[^>]*class="tiktok-preview"[^>]*>[\s\S]*?<\/a>/)?.[0];
  assert.ok(preview, 'Preview must be a native link, independent of the third-party player');
  assert.match(preview, /href="https:\/\/www\.tiktok\.com\/@fuluckpet\/video\/7608970454937652496"/);
  assert.match(preview, /target="_blank"/);
  assert.match(preview, /rel="noopener"/);
  const image = preview.match(/src="(images\/tiktok-7608970454937652496\.jpg)"/)?.[1];
  assert.ok(image, 'Use a locally served real cover, not an expiring CDN URL');
  assert.ok(fs.statSync(path.join(root, image)).size > 1000);
  assert.doesNotMatch(sns, /<(?:iframe|script|img)[^>]*src="https:\/\/[^" ]*tiktok/i);
  assert.doesNotMatch(sns, /tiktok\.com\/embed\.js|class="tiktok-embed"/);
});
