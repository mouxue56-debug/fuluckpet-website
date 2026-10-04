'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('homepage TikTok preview works without embed.js and retains a direct video fallback', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const sns = html.slice(html.indexOf('id="sns-media"'), html.indexOf('<!-- ========== FOOTER'));
  const iframe = sns.match(/<iframe\b[^>]*src="https:\/\/www\.tiktok\.com\/player\/v1\/7608970454937652496[^>]*>/)?.[0];
  assert.ok(iframe, 'A native player must be present without waiting for the failing embed.js service');
  assert.match(iframe, /loading="lazy"/);
  assert.match(iframe, /title="[^"]+"/);
  assert.match(iframe, /autoplay=0/);
  assert.match(sns, /<a\b[^>]*href="https:\/\/www\.tiktok\.com\/@fuluckpet\/video\/7608970454937652496"[^>]*>/);
  assert.doesNotMatch(sns, /tiktok\.com\/embed\.js|class="tiktok-embed"/);
});
