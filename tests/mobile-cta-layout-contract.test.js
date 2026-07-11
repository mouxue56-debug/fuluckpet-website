'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('mobile fixed UI shares one CTA height and reserves content space', () => {
  const style = read('style.css');
  const chat = read('assets/chat/widget.css');

  assert.match(style, /--mobile-cta-height\s*:\s*\d+px\s*;/);
  assert.match(style, /body\.has-mobile-cta\s*\{[^}]*padding-bottom\s*:\s*calc\(var\(--mobile-cta-height\)\s*\+\s*env\(safe-area-inset-bottom(?:,\s*0px)?\)\)/s);
  assert.match(chat, /bottom\s*:\s*calc\(var\(--mobile-cta-height\)\s*\+\s*env\(safe-area-inset-bottom(?:,\s*0px)?\)\s*\+\s*\d+px\)/);
  assert.match(style, /\.fuluck-chat-bubble,\s*\.fuluck-chat-panel\s*\{[^}]*bottom\s*:\s*calc\(var\(--mobile-cta-height\)\s*\+\s*env\(safe-area-inset-bottom(?:,\s*0px)?\)\s*\+\s*\d+px\)\s*!important/s);
  assert.doesNotMatch(style, /body\.has-mobile-cta\s*\{[^}]*padding-bottom\s*:\s*76px/s);
  assert.doesNotMatch(style, /\.fuluck-chat-bubble,\s*\.fuluck-chat-panel\s*\{[^}]*bottom\s*:\s*calc\(\d+px\s*\+\s*env\(safe-area-inset-bottom/s);
});

test('mobile chat launcher and panel remain above the CTA at supported widths', () => {
  const chat = read('assets/chat/widget.css');
  const viewports = [[320, 568], [375, 812], [430, 932]];
  const media = chat.match(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(media, 'mobile chat media query exists');
  const maxWidth = Number(media[1]);
  for (const [width, height] of viewports) {
    assert.ok(width <= maxWidth, `${width}x${height} is covered by the mobile positioning contract`);
  }
  assert.match(chat, /\.fuluck-chat-bubble\s*\{[^}]*bottom\s*:\s*calc\(var\(--mobile-cta-height\)[^}]+\}/s);
  assert.match(chat, /\.fuluck-chat-panel\s*\{[^}]*bottom\s*:\s*calc\(var\(--mobile-cta-height\)[^}]+\}/s);
  assert.match(chat, /\.fuluck-chat-panel\s*\{[^}]*max-height\s*:\s*calc\([^;]*var\(--mobile-cta-height\)[^;]*\)/s);
});

test('mobile homepage hero keeps only kittens and booking actions', () => {
  const html = read('index.html');
  const hero = html.match(/<div class="hero-buttons">([\s\S]*?)<\/div>/);
  assert.ok(hero, 'hero action group exists');
  const links = [...hero[1].matchAll(/<a\s+[^>]*href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(links, ['#kittens', '/booking.html']);
  assert.doesNotMatch(hero[1], /btn-line|page\.line\.me|LINE/i);
});

test('mobile CTA script exposes the shared height contract to widget styles', () => {
  const source = read('mobile-cta.js');
  assert.match(source, /--mobile-cta-height/);
  assert.match(source, /getBoundingClientRect\(\)\.height/);
  assert.match(source, /style\.setProperty\(\s*['"]--mobile-cta-height['"]/);
});
