'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const SITE_ORIGIN = 'https://fuluckpet.com';
const FOREIGN_ORIGIN = 'https://evil.example.test';
const PASSWORD = 'test-only-auth-routing-password';
const SALT = '102030405060708090a0b0c0d0e0f000';
const IP = '203.0.113.44';

let worker;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
});

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function passwordHash(password, salt) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${password}:${salt}`)));
}

async function harness() {
  const store = new Map([
    ['pw:salt', SALT],
    ['pw:hash', await passwordHash(PASSWORD, SALT)],
    ['articles', JSON.stringify([{ slug: 'draft', published: false }])],
  ]);
  const puts = [];
  return {
    puts,
    env: {
      DATA: {
        async get(key, type) {
          const value = store.get(key) ?? null;
          return type === 'json' && value !== null ? JSON.parse(value) : value;
        },
        async put(key, value, options) { puts.push({ key, value, options }); store.set(key, value); },
        async delete(key) { store.delete(key); },
      },
    },
  };
}

function request(path, { method = 'GET', origin, authorization, body } = {}) {
  const headers = { 'CF-Connecting-IP': IP };
  if (origin !== undefined) headers.Origin = origin;
  if (authorization !== undefined) headers.Authorization = authorization;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`https://fuluck-api.example.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function fetchWorker(env, req) {
  return worker.fetch(req, env, { waitUntil() {} });
}

test('unknown public routes and unsupported methods never consume the password failure budget', async () => {
  const { env, puts } = await harness();
  for (let index = 0; index < 12; index += 1) {
    const response = await fetchWorker(env, request(`/unknown-${index}`));
    assert.equal(response.status, 404);
  }
  const unsupported = await fetchWorker(env, request('/api/kittens', { method: 'HEAD' }));
  assert.equal(unsupported.status, 404);
  assert.equal(puts.some((entry) => entry.key.startsWith('authfail:')), false);

  const login = await fetchWorker(env, request('/api/auth', {
    method: 'POST',
    origin: SITE_ORIGIN,
    body: { password: PASSWORD },
  }));
  assert.equal(login.status, 200);
  assert.equal((await login.json()).success, true);
});

test('article preview is private CORS and a missing Bearer never records a password mismatch', async () => {
  const foreign = await harness();
  const blocked = await fetchWorker(foreign.env, request('/api/articles/draft?preview=1', {
    origin: FOREIGN_ORIGIN,
  }));
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(foreign.puts.some((entry) => entry.key.startsWith('authfail:')), false);

  const sameOrigin = await harness();
  const unauthorized = await fetchWorker(sameOrigin.env, request('/api/articles/draft?preview=1', {
    origin: SITE_ORIGIN,
  }));
  assert.equal(unauthorized.status, 401);
  assert.equal(sameOrigin.puts.some((entry) => entry.key.startsWith('authfail:')), false);
});
