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
  const deletes = [];
  return {
    puts,
    deletes,
    env: {
      DATA: {
        async get(key) { return entries.get(key) || null; },
        async put(key, value) { entries.set(key, value); },
      },
      BUCKET: {
        async put(key, value, options) { puts.push({ key, value, options }); },
        async delete(key) { deletes.push(key); },
      },
    },
  };
}

test('admin upload delete is limited to generated upload namespaces', async () => {
  const { env, deletes } = await harness();
  for (const key of [
    'uploads/1700000000000-a1b2c3d4.jpg',
    'small-animals/1700000000001-deadbeef.webp',
  ]) {
    const response = await worker.fetch(new Request(`${API_ORIGIN}/api/admin/upload`, {
      method: 'DELETE',
      headers: {
        Origin: SITE_ORIGIN,
        Authorization: `Bearer ${PASSWORD}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key }),
    }), env, { waitUntil() {} });
    assert.equal(response.status, 200);
  }
  assert.deepEqual(deletes, [
    'uploads/1700000000000-a1b2c3d4.jpg',
    'small-animals/1700000000001-deadbeef.webp',
  ]);

  for (const key of [
    'drive-img/1700000000000-a1b2c3d4.jpg',
    'small-animals/../drive-img/cache.jpg',
    'small-animals/manual-name.jpg',
  ]) {
    const response = await worker.fetch(new Request(`${API_ORIGIN}/api/admin/upload`, {
      method: 'DELETE',
      headers: {
        Origin: SITE_ORIGIN,
        Authorization: `Bearer ${PASSWORD}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key }),
    }), env, { waitUntil() {} });
    assert.equal(response.status, 400);
  }
  assert.equal(deletes.length, 2);
});

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

test('small-animal upload uses only the dedicated small-animals R2 prefix', async () => {
  const { env, puts } = await harness();
  const form = new FormData();
  form.append('prefix', 'small-animals');
  form.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'rabbit.jpg', {
    type: 'image/jpeg',
  }));

  const response = await worker.fetch(new Request(`${API_ORIGIN}/api/admin/upload`, {
    method: 'POST',
    headers: {
      Origin: SITE_ORIGIN,
      Authorization: `Bearer ${PASSWORD}`,
    },
    body: form,
  }), env, { waitUntil() {} });

  assert.equal(response.status, 200);
  assert.equal(puts.length, 1);
  assert.match(puts[0].key, /^small-animals\/[0-9]+-[0-9a-f-]+\.jpg$/);
  assert.equal((await response.json()).url, `${API_ORIGIN}/r2/${puts[0].key}`);
});

test('admin upload rejects arbitrary R2 prefixes without writing', async () => {
  const { env, puts } = await harness();
  const form = new FormData();
  form.append('prefix', '../drive-img');
  form.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'rabbit.jpg', {
    type: 'image/jpeg',
  }));

  const response = await worker.fetch(new Request(`${API_ORIGIN}/api/admin/upload`, {
    method: 'POST',
    headers: {
      Origin: SITE_ORIGIN,
      Authorization: `Bearer ${PASSWORD}`,
    },
    body: form,
  }), env, { waitUntil() {} });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Invalid upload prefix');
  assert.equal(puts.length, 0);
});

test('admin multipart upload rejects declared and streamed oversized bodies before R2 work', async () => {
  const declaredHarness = await harness();
  const declared = await worker.fetch(new Request(`${API_ORIGIN}/api/admin/upload`, {
    method: 'POST',
    headers: {
      Origin: SITE_ORIGIN,
      Authorization: `Bearer ${PASSWORD}`,
      'Content-Type': 'multipart/form-data; boundary=limit-test',
      'Content-Length': String(10 * 1024 * 1024 + 256 * 1024 + 1),
    },
    body: '--limit-test--\r\n',
  }), declaredHarness.env, { waitUntil() {} });
  assert.equal(declared.status, 413);
  assert.equal((await declared.json()).error, 'payload_too_large');
  assert.equal(declaredHarness.puts.length, 0);

  const streamedHarness = await harness();
  const form = new FormData();
  form.append('file', new File([new Uint8Array(11 * 1024 * 1024)], 'oversized.mp4', {
    type: 'video/mp4',
  }));
  const streamed = await worker.fetch(new Request(`${API_ORIGIN}/api/admin/upload`, {
    method: 'POST',
    headers: {
      Origin: SITE_ORIGIN,
      Authorization: `Bearer ${PASSWORD}`,
    },
    body: form,
  }), streamedHarness.env, { waitUntil() {} });
  assert.equal(streamed.status, 413);
  assert.equal((await streamed.json()).error, 'payload_too_large');
  assert.equal(streamedHarness.puts.length, 0);
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
