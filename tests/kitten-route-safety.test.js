'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const ORIGIN = 'https://fuluckpet.com';
const PASSWORD = 'test-only-kitten-route-password';
const SALT = 'ffeeddccbbaa00998877665544332211';

let worker;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
});

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function passwordHash(password, salt) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${password}:${salt}`)));
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
    store,
    env: {
      DATA: {
        async get(key, type) {
          const value = store.get(key) ?? null;
          return type === 'json' && value !== null ? JSON.parse(value) : value;
        },
        async put(key, value) { puts.push({ key, value }); store.set(key, value); },
      },
    },
  };
}

function request(path, method, body) {
  return new Request(`https://fuluck-api.example.test${path}`, {
    method,
    headers: {
      Origin: ORIGIN,
      Authorization: `Bearer ${PASSWORD}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function malformedJsonRequest(path, method) {
  return new Request(`https://fuluck-api.example.test${path}`, {
    method,
    headers: {
      Origin: ORIGIN,
      Authorization: `Bearer ${PASSWORD}`,
      'Content-Type': 'application/json',
    },
    body: '{"broken":',
  });
}

async function fetchWorker(env, req) {
  return worker.fetch(req, env, { waitUntil() {} });
}

test('every kitten write route rejects unsafe public identities without a catalogue put', async () => {
  const original = [{
    id: 'safe-row-id',
    breederId: '2607-00594',
    status: 'available',
    photos: ['https://images.example.test/cat.jpg'],
  }];
  const cases = [
    request('/api/admin/kittens', 'POST', {
      breederId: '../index', status: 'available', photos: ['https://images.example.test/cat.jpg'],
    }),
    request('/api/admin/kittens/safe-row-id', 'PUT', { breederId: '../../outside' }),
    request('/api/admin/kittens/bulk', 'POST', [{
      id: 'safe-row-id', breederId: 'has/slash', status: 'available', photos: [],
    }]),
  ];

  for (const req of cases) {
    const { env, puts, store } = await makeEnv(original);
    const response = await fetchWorker(env, req);
    assert.equal(response.status, 400, req.url);
    assert.equal(puts.some((entry) => entry.key === 'kittens'), false, req.url);
    assert.deepEqual(JSON.parse(store.get('kittens')), original, req.url);
  }
});

test('valid production-style POST and PUT identities remain supported', async () => {
  const initial = [{ id: 'safe-row-id', breederId: '2607-00594', status: 'sold', photos: [] }];
  const first = await makeEnv(initial);
  const created = await fetchWorker(first.env, request('/api/admin/kittens', 'POST', {
    breederId: '2607-00600', status: 'available', photos: [],
  }));
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.match(createdBody.id, /^[A-Za-z0-9-]+$/);

  const second = await makeEnv(initial);
  const updated = await fetchWorker(second.env, request('/api/admin/kittens/safe-row-id', 'PUT', {
    breederId: '2607-00595',
  }));
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).breederId, '2607-00595');
});

test('kitten write routes reject coercible non-scalar and non-positive prices', async () => {
  const original = [{ id: 'safe-row-id', breederId: '2607-00594', price: 180000, status: 'available', photos: [] }];
  const badPrices = [true, [250000], [], {}, 0, 1.5];
  for (const price of badPrices) {
    const { env, puts, store } = await makeEnv(original);
    const response = await fetchWorker(env, request('/api/admin/kittens/safe-row-id', 'PUT', { price }));
    assert.equal(response.status, 400, `price=${JSON.stringify(price)}`);
    assert.equal(puts.some((entry) => entry.key === 'kittens'), false);
    assert.deepEqual(JSON.parse(store.get('kittens')), original);
  }
});

async function assertMalformedJsonRejected(path, method) {
  const original = [{
    id: 'safe-row-id',
    breederId: '2607-00594',
    status: 'available',
    photos: [],
  }];
  const { env, puts, store } = await makeEnv(original);

  const response = await fetchWorker(env, malformedJsonRequest(path, method));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Invalid JSON body',
    details: [{ breederId: '#request', field: '(body)', reason: 'malformed JSON' }],
  });
  assert.deepEqual(puts, []);
  assert.deepEqual(JSON.parse(store.get('kittens')), original);
}

test('kitten bulk rejects malformed JSON with a structured 400 and no catalogue put', async () => {
  await assertMalformedJsonRejected('/api/admin/kittens/bulk', 'POST');
});

test('kitten POST rejects malformed JSON with a structured 400 and no catalogue put', async () => {
  await assertMalformedJsonRejected('/api/admin/kittens', 'POST');
});

test('kitten PUT rejects malformed JSON with a structured 400 and no catalogue put', async () => {
  await assertMalformedJsonRejected('/api/admin/kittens/safe-row-id', 'PUT');
});
