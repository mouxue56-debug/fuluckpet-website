'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const syncKoneko = import('../tools/sync-koneko.js');

test('normalizeVideo canonicalizes supported YouTube URLs', async () => {
  const { normalizeVideo } = await syncKoneko;
  const cases = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=Ab_9-xYz012', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ', ''],
    ['', ''],
    ['not a url', ''],
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeVideo(input), expected, input);
  }
});

test('isThumb detects koneko thumbnail URLs', async () => {
  const { isThumb } = await syncKoneko;
  const cases = [
    ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_thumb_pc_abc.jpg', true],
    ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_thumb_mob_abc.jpg', true],
    ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_abc.jpg.webp', false],
  ];

  for (const [input, expected] of cases) {
    assert.equal(isThumb(input), expected, input);
  }
});
