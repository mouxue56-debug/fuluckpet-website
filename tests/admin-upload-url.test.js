'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const SITE_ORIGIN = 'https://fuluckpet.com';
const API_ORIGIN = 'https://fuluck-api.mouxue56.workers.dev';
const PASSWORD = 'test-only-upload-password';
const SALT = '11223344556677889900aabbccddeeff';

let worker;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
});

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function passwordHash(password, salt) {
  const input = new TextEncoder().encode(`${password}:${salt}`);
  return bytesToHex(await crypto.subtle.digest('SHA-256', input));
}

async function harness() {
  const entries = new Map([
    ['pw:salt', SALT],
    ['pw:hash', await passwordHash(PASSWORD, SALT)],
  ]);
  const puts = [];
  return {
    puts,
    env: {
      DATA: {
        async get(key) { return entries.get(key) || null; },
        async put(key, value) { entries.set(key, value); },
      },
      BUCKET: {
        async put(key, value, options) { puts.push({ key, value, options }); },
      },
    },
  };
}

test('admin upload returns the public /r2 URL served by the Worker', async () => {
  const { env, puts } = await harness();
  const form = new FormData();
  form.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'kitten.jpg', {
    type: 'image/jpeg',
  }));
  const request = new Request(`${API_ORIGIN}/api/admin/upload`, {
    method: 'POST',
    headers: {
      Origin: SITE_ORIGIN,
      Authorization: `Bearer ${PASSWORD}`,
    },
    body: form,
  });

  const response = await worker.fetch(request, env, { waitUntil() {} });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(puts.length, 1);
  assert.equal(result.key, puts[0].key);
  assert.equal(result.url, `${API_ORIGIN}/r2/${result.key}`);
  assert.match(result.url, /\/r2\/uploads\/[0-9]+-[0-9a-f-]+\.jpg$/);
  assert.equal(puts[0].options.httpMetadata.contentType, 'image/jpeg');
});

test('admin upload rejects a forged extension before writing R2', async () => {
  const { env, puts } = await harness();
  const form = new FormData();
  form.append('file', new File(['<svg onload=alert(1)>'], 'forged.jpg', {
    type: 'image/jpeg',
  }));
  const request = new Request(`${API_ORIGIN}/api/admin/upload`, {
    method: 'POST',
    headers: {
      Origin: SITE_ORIGIN,
      Authorization: `Bearer ${PASSWORD}`,
    },
    body: form,
  });

  const response = await worker.fetch(request, env, { waitUntil() {} });
  assert.equal(response.status, 415);
  assert.equal(puts.length, 0);
});

test('admin upload validates signature against extension and ignores spoofed MIME', async () => {
  const { env, puts } = await harness();
  const form = new FormData();
  form.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'real.jpg', {
    type: 'text/html',
  }));
  const request = new Request(`${API_ORIGIN}/api/admin/upload`, {
    method: 'POST',
    headers: {
      Origin: SITE_ORIGIN,
      Authorization: `Bearer ${PASSWORD}`,
    },
    body: form,
  });

  const response = await worker.fetch(request, env, { waitUntil() {} });
  assert.equal(response.status, 200);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].options.httpMetadata.contentType, 'image/jpeg');

  const mismatch = await harness();
  const wrongForm = new FormData();
  wrongForm.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'wrong.png', {
    type: 'image/png',
  }));
  const wrongResponse = await worker.fetch(new Request(`${API_ORIGIN}/api/admin/upload`, {
    method: 'POST',
    headers: {
      Origin: SITE_ORIGIN,
      Authorization: `Bearer ${PASSWORD}`,
    },
    body: wrongForm,
  }), mismatch.env, { waitUntil() {} });
  assert.equal(wrongResponse.status, 415);
  assert.equal(mismatch.puts.length, 0);
});
