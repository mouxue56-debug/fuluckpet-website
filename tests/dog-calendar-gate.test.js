'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');

test('dog calendar policy rejects dog boarding and care by default and allows only the explicit true gate', async () => {
  const policy = await import(pathToFileURL(path.join(ROOT, 'api/calendar-dog-policy.mjs')).href);
  for (const event of [
    { type: 'boarding', petType: 'dog_small' },
    { type: 'boarding', petType: 'dog_medium' },
    { type: 'boarding', petType: 'dog_large' },
    { type: 'care', petType: 'dog_small' },
  ]) {
    assert.equal(policy.isDogCalendarEvent(event), true);
    assert.equal(policy.canWriteDogCalendarEvent(event, {}), false);
    assert.equal(policy.canWriteDogCalendarEvent(event, { DOG_SERVICES_PUBLIC: 'false' }), false);
    assert.equal(policy.canWriteDogCalendarEvent(event, { DOG_SERVICES_PUBLIC: 'true' }), true);
  }
  assert.equal(policy.canWriteDogCalendarEvent({ type: 'boarding', petType: 'cat' }, {}), true);
});

test('worker and admin expose prepared dog types but keep the production write gate false', () => {
  const worker = fs.readFileSync(path.join(ROOT, 'api/worker.js'), 'utf8');
  const wrangler = fs.readFileSync(path.join(ROOT, 'api/wrangler.toml'), 'utf8');
  const admin = fs.readFileSync(path.join(ROOT, 'admin/calendar.html'), 'utf8');
  assert.match(worker, /CAL_EVENT_TYPES\s*=\s*\[[^\]]*'care'/);
  for (const type of ['dog_small', 'dog_medium', 'dog_large']) {
    assert.match(worker, new RegExp(`CAL_PET_TYPES\\s*=\\s*\\[[^\\]]*'${type}'`));
    assert.match(admin, new RegExp(`option value="${type}"[^>]*disabled`));
  }
  assert.match(admin, /犬は現在受付停止/);
  assert.match(wrangler, /DOG_SERVICES_PUBLIC\s*=\s*"false"/);
  assert.match(worker, /canWriteDogCalendarEvent/);
});
