'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const SITE_ORIGIN = 'https://fuluckpet.com';
const PASSWORD = 'test-only-admin-limit-password';
const SALT = 'abcdef0123456789abcdef0123456789';

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
  const DATA = {
    async get(key, type) {
      if (!entries.has(key)) return null;
      const value = entries.get(key);
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value, options) {
      puts.push({ key, value, options });
      entries.set(key, value);
    },
  };
  return { env: { DATA }, puts };
}

function adminRequest(path, body, extraHeaders = {}) {
  return new Request(`https://fuluckpet.com${path}`, {
    method: 'PUT',
    headers: {
      Origin: SITE_ORIGIN,
      Authorization: `Bearer ${PASSWORD}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body,
  });
}

test('the shared admin JSON gate rejects false-small Content-Length bodies over 1 MiB', async () => {
  const { env, puts } = await harness();
  const body = JSON.stringify({ value: 'x'.repeat(1024 * 1024) });
  const request = adminRequest('/api/admin/settings', body, { 'Content-Length': '2' });
  const response = await worker.fetch(request, env, { waitUntil() {} });

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'payload_too_large');
  assert.deepEqual(puts, []);
});

test('the shared admin JSON gate rejects a declared oversized body before route parsing', async () => {
  const { env, puts } = await harness();
  const request = adminRequest('/api/admin/settings', '{}', {
    'Content-Length': String(1024 * 1024 + 1),
  });
  const response = await worker.fetch(request, env, { waitUntil() {} });

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'payload_too_large');
  assert.deepEqual(puts, []);
});

test('the shared admin JSON gate preserves ordinary settings writes', async () => {
  const { env, puts } = await harness();
  const response = await worker.fetch(
    adminRequest('/api/admin/settings', JSON.stringify({ line: 'https://line.example.test' })),
    env,
    { waitUntil() {} },
  );

  assert.equal(response.status, 200);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].key, 'settings');
});
