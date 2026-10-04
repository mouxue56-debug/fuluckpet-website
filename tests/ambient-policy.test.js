import test from 'node:test';
import assert from 'node:assert/strict';
import { ambientPolicy } from '../ambient-policy.mjs';

test('slow or metered connections keep a poster even when reduced motion is off', () => {
  for (const effectiveType of ['slow-2g', '2g', '3g']) {
    assert.equal(ambientPolicy({ effectiveType }).animate, false);
    assert.equal(ambientPolicy({ effectiveType }).preloadNext, false);
  }
  assert.equal(ambientPolicy({ saveData: true, effectiveType: '4g' }).animate, false);
  assert.equal(ambientPolicy({ reduced: true, effectiveType: '4g' }).animate, false);
});

test('small screens keep motion but avoid speculative downloads and cap canvas pixels', () => {
  assert.deepEqual(ambientPolicy({ width: 390, dpr: 3, effectiveType: '4g' }), {
    animate: true, preloadNext: false, pixelRatio: 1,
  });
  assert.deepEqual(ambientPolicy({ width: 1280, dpr: 2, effectiveType: '4g' }), {
    animate: true, preloadNext: true, pixelRatio: 1.5,
  });
  assert.equal(ambientPolicy({ width: 390 }).animate, true, 'unsupported Network Information API does not disable normal phone motion');
});
