'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const ORIGIN = 'https://fuluckpet.com';
const PASSWORD = 'test-only-public-kitten-password';
const SALT = 'abcdef0123456789abcdef0123456789';

let worker;
let visibleKittens;

test.before(async () => {
  ({ default: worker, visibleKittens } = await import('../api/worker.js'));
});

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function passwordHash(password, salt) {
  const input = new TextEncoder().encode(`${password}:${salt}`);
  return bytesToHex(await crypto.subtle.digest('SHA-256', input));
}

async function makeEnv(kittens) {
  const store = new Map([
    ['pw:salt', SALT],
    ['pw:hash', await passwordHash(PASSWORD, SALT)],
    ['kittens', JSON.stringify(kittens)],
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
        async put(key, value, options) {
          puts.push({ key, value, options });
          store.set(key, value);
        },
      },
    },
  };
}

function request(path, { method = 'GET', auth = false, body } = {}) {
  const headers = {};
  if (auth) {
    headers.Origin = ORIGIN;
    headers.Authorization = `Bearer ${PASSWORD}`;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`https://fuluckpet.com${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function fetchWorker(env, req) {
  return worker.fetch(req, env, { waitUntil() {} });
}

function privateKitten() {
  return {
    id: 'row-1',
    breederId: '2607-00594',
    breed: 'サイベリアン',
    color: 'ブルー',
    gender: '♀',
    price: 280000,
    status: 'available',
    birthday: '2026-07',
    photos: ['https://images.example.test/row-1.webp'],
    coverIndex: 0,
    video: 'https://youtu.be/example',
    isNew: true,
    papa: 'Leo',
    mama: 'Luna',
    note: '公開カード用メモ',
    promotionTag: 'featured',
    promotionPriority: 999,
    internalOnly: 'cost=120000',
    adminDraft: true,
    unknownNested: { secret: true },
  };
}

function publicKitten() {
  const row = privateKitten();
  delete row.internalOnly;
  delete row.adminDraft;
  delete row.unknownNested;
  return row;
}

test('visibleKittens keeps exactly the public kitten card fields', () => {
  assert.equal(typeof visibleKittens, 'function');

  const privateRows = [privateKitten()];

  assert.deepEqual(visibleKittens(privateRows), [publicKitten()]);
  assert.equal(privateRows[0].unknownNested.secret, true, 'projection must not mutate the private row');
});

test('public route projects rows while authenticated Admin reads the complete collection', async () => {
  const privateRow = privateKitten();
  const { env, puts } = await makeEnv([privateRow]);

  const publicResponse = await fetchWorker(env, request('/api/kittens'));
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await publicResponse.json(), [publicKitten()]);

  const adminResponse = await fetchWorker(env, request('/api/admin/kittens', { auth: true }));
  assert.equal(adminResponse.status, 200);
  assert.deepEqual(await adminResponse.json(), [privateRow]);
  assert.deepEqual(puts, []);
});

test('invalid promotion bulk requests return 400 before any KV put', async () => {
  const invalidPromotions = [
    { promotionTag: 'sale' },
    { promotionTag: null },
    { promotionTag: 'featured', promotionPriority: -1 },
    { promotionTag: 'featured', promotionPriority: 1.5 },
    { promotionTag: 'featured', promotionPriority: 1000 },
    { promotionTag: 'featured', promotionPriority: '1' },
    { promotionTag: 'featured', promotionPriority: null },
    { promotionTag: '', promotionPriority: 1 },
    { promotionPriority: 1 },
  ];

  for (const promotion of invalidPromotions) {
    const { env, puts } = await makeEnv([]);
    const response = await fetchWorker(env, request('/api/admin/kittens/bulk', {
      method: 'POST',
      auth: true,
      body: [{ breederId: 'A', ...promotion }],
    }));

    assert.equal(response.status, 400, JSON.stringify(promotion));
    assert.deepEqual(puts, [], JSON.stringify(promotion));
  }
});
