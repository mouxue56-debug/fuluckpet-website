'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ORIGIN = 'https://fuluckpet.com';
const PASSWORD = 'test-only-small-animal-password';
const SALT = '00112233445566778899aabbccddeeff';

let worker;
let visibleSmallAnimals;

test.before(async () => {
  ({ default: worker, visibleSmallAnimals } = await import('../api/worker.js'));
});

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function passwordHash(password, salt) {
  const input = new TextEncoder().encode(`${password}:${salt}`);
  return bytesToHex(await crypto.subtle.digest('SHA-256', input));
}

class MemoryKV {
  constructor(entries = {}) {
    this.store = new Map(Object.entries(entries));
    this.reads = [];
    this.puts = [];
    this.deletes = [];
  }

  async get(key, type) {
    this.reads.push(key);
    if (!this.store.has(key)) return null;
    const value = this.store.get(key);
    if (type === 'json') return JSON.parse(value);
    return value;
  }

  async put(key, value, options) {
    this.puts.push({ key, value, options });
    this.store.set(key, value);
  }

  async delete(key) {
    this.deletes.push(key);
    this.store.delete(key);
  }

  json(key) {
    if (!this.store.has(key)) return null;
    return JSON.parse(this.store.get(key));
  }
}

async function makeEnv(smallAnimals) {
  const entries = {
    'pw:salt': SALT,
    'pw:hash': await passwordHash(PASSWORD, SALT),
  };
  if (smallAnimals !== undefined) entries.small_animals = JSON.stringify(smallAnimals);
  const DATA = new MemoryKV(entries);
  return { env: { DATA }, DATA };
}

function request(path, { method = 'GET', origin, auth = false, body, rawBody } = {}) {
  const headers = {};
  if (origin !== undefined) headers.Origin = origin;
  if (auth) headers.Authorization = `Bearer ${PASSWORD}`;
  if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`https://fuluckpet.com${path}`, {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : (body === undefined ? undefined : JSON.stringify(body)),
  });
}

async function fetchWorker(env, req) {
  return worker.fetch(req, env, { waitUntil() {} });
}

function smallAnimalMutationKeys(DATA) {
  return [
    ...DATA.puts.map((entry) => entry.key),
    ...DATA.deletes,
  ].filter((key) => key === 'small_animals' || key === 'small-animals');
}

function assertNoCatCollectionAccess(DATA) {
  const allKeys = [
    ...DATA.reads,
    ...DATA.puts.map((entry) => entry.key),
    ...DATA.deletes,
  ];
  assert.equal(allKeys.includes('kittens'), false, 'must not access kittens');
  assert.equal(allKeys.includes('parents'), false, 'must not access parents');
}

test('dark public GET returns [] without reading the private collection', async () => {
  const { env, DATA } = await makeEnv([
    { breederId: 'PRIVATE-RB', species: 'rabbit', status: 'available' },
  ]);
  const response = await fetchWorker(env, request('/api/small-animals'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(DATA.reads, []);
  assert.deepEqual(DATA.puts, []);
  assertNoCatCollectionAccess(DATA);
});

test('the shared launch gate reveals rows only after the owner public flip', () => {
  const rows = [{ breederId: 'PUBLIC-RB', species: 'rabbit' }];
  assert.deepEqual(visibleSmallAnimals(rows, false), []);
  assert.deepEqual(visibleSmallAnimals(rows, true), rows);
});

test('admin gates reject missing Origin before auth and missing Bearer after valid Origin', async () => {
  const first = await makeEnv([]);
  const noOrigin = await fetchWorker(first.env, request('/api/admin/small-animals'));
  assert.equal(noOrigin.status, 403);
  assert.deepEqual(first.DATA.reads, []);

  const second = await makeEnv([]);
  const noBearer = await fetchWorker(second.env, request('/api/admin/small-animals', { origin: ORIGIN }));
  assert.equal(noBearer.status, 401);
  assert.equal(second.DATA.reads.includes('small_animals'), false);
  assertNoCatCollectionAccess(second.DATA);
});

test('authenticated POST creates and root GET reads back; duplicate POST is 400 with no data put', async () => {
  const { env, DATA } = await makeEnv([]);
  const rabbit = { breederId: 'RB-POST', species: 'rabbit', price: 88000, status: 'available' };

  const created = await fetchWorker(env, request('/api/admin/small-animals', {
    method: 'POST', origin: ORIGIN, auth: true, body: rabbit,
  }));
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), rabbit);
  assert.deepEqual(DATA.json('small_animals'), [rabbit]);
  assert.deepEqual(smallAnimalMutationKeys(DATA), ['small_animals']);

  const readback = await fetchWorker(env, request('/api/admin/small-animals', { origin: ORIGIN, auth: true }));
  assert.equal(readback.status, 200);
  assert.deepEqual(await readback.json(), [rabbit]);

  const beforeDuplicate = DATA.puts.length;
  const duplicate = await fetchWorker(env, request('/api/admin/small-animals', {
    method: 'POST', origin: ORIGIN, auth: true, body: rabbit,
  }));
  assert.equal(duplicate.status, 400);
  const error = await duplicate.json();
  assert.equal(typeof error.error, 'string');
  assert.ok(Array.isArray(error.details));
  assert.equal(DATA.puts.length, beforeDuplicate);
  assertNoCatCollectionAccess(DATA);
});

test('PUT uses decoded breederId, merges stored object, and preserves path identity', async () => {
  const original = { breederId: 'RB / 01', species: 'rabbit', name: 'Before', status: 'available' };
  const { env, DATA } = await makeEnv([original]);
  const encodedId = encodeURIComponent(original.breederId);

  const updated = await fetchWorker(env, request(`/api/admin/small-animals/${encodedId}`, {
    method: 'PUT', origin: ORIGIN, auth: true, body: { name: 'After', price: '99000' },
  }));
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), { ...original, name: 'After', price: '99000' });
  assert.deepEqual(DATA.json('small_animals'), [{ ...original, name: 'After', price: '99000' }]);

  const beforeImmutable = DATA.puts.length;
  const immutable = await fetchWorker(env, request(`/api/admin/small-animals/${encodedId}`, {
    method: 'PUT', origin: ORIGIN, auth: true, body: { breederId: 'RB-CHANGED' },
  }));
  assert.equal(immutable.status, 400);
  assert.equal(DATA.puts.length, beforeImmutable);
  assertNoCatCollectionAccess(DATA);
});

test('PUT validates the merged object and missing PUT returns 404 without a write', async () => {
  const { env, DATA } = await makeEnv([
    { breederId: 'RB-PUT', species: 'rabbit', status: 'available' },
  ]);

  const beforeInvalid = DATA.puts.length;
  const invalid = await fetchWorker(env, request('/api/admin/small-animals/RB-PUT', {
    method: 'PUT', origin: ORIGIN, auth: true, body: { photos: ['ok.webp', 7] },
  }));
  assert.equal(invalid.status, 400);
  assert.equal(DATA.puts.length, beforeInvalid);

  const missing = await fetchWorker(env, request('/api/admin/small-animals/RB-MISSING', {
    method: 'PUT', origin: ORIGIN, auth: true, body: { name: 'No write' },
  }));
  assert.equal(missing.status, 404);
  assert.equal(DATA.puts.length, beforeInvalid);
  assertNoCatCollectionAccess(DATA);
});

test('DELETE removes an existing breederId and missing DELETE returns 404 without a write', async () => {
  const { env, DATA } = await makeEnv([
    { breederId: 'RB-DELETE', species: 'rabbit' },
  ]);

  const removed = await fetchWorker(env, request('/api/admin/small-animals/RB-DELETE', {
    method: 'DELETE', origin: ORIGIN, auth: true,
  }));
  assert.equal(removed.status, 200);
  assert.deepEqual(await removed.json(), { success: true });
  assert.deepEqual(DATA.json('small_animals'), []);

  const beforeMissing = DATA.puts.length;
  const missing = await fetchWorker(env, request('/api/admin/small-animals/RB-DELETE', {
    method: 'DELETE', origin: ORIGIN, auth: true,
  }));
  assert.equal(missing.status, 404);
  assert.equal(DATA.puts.length, beforeMissing);
  assertNoCatCollectionAccess(DATA);
});

test('bulk rejects non-array, bad shapes, and duplicates without writing', async () => {
  const { env, DATA } = await makeEnv([]);
  const badBodies = [
    { breederId: 'RB-NOT-ARRAY', species: 'rabbit' },
    [{ breederId: 'RB-BAD', species: 'rabbit', papa: '' }],
    [
      { breederId: 'RB-DUP', species: 'rabbit' },
      { breederId: 'RB-DUP', species: 'rabbit' },
    ],
    [{ breederId: 'bulk', species: 'rabbit' }],
  ];

  for (const body of badBodies) {
    const before = DATA.puts.length;
    const response = await fetchWorker(env, request('/api/admin/small-animals/bulk', {
      method: 'POST', origin: ORIGIN, auth: true, body,
    }));
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(typeof payload.error, 'string');
    assert.ok(payload.details);
    assert.equal(DATA.puts.length, before);
  }
  assertNoCatCollectionAccess(DATA);
});

test('malformed JSON is a structured 400 on POST, PUT, and bulk without a data put', async () => {
  const { env, DATA } = await makeEnv([
    { breederId: 'RB-JSON', species: 'rabbit' },
  ]);
  const cases = [
    { path: '/api/admin/small-animals', method: 'POST' },
    { path: '/api/admin/small-animals/RB-JSON', method: 'PUT' },
    { path: '/api/admin/small-animals/bulk', method: 'POST' },
  ];

  for (const item of cases) {
    const response = await fetchWorker(env, request(item.path, {
      method: item.method,
      origin: ORIGIN,
      auth: true,
      rawBody: '{"broken":',
    }));
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(typeof payload.error, 'string');
    assert.ok(Array.isArray(payload.details));
  }

  assert.deepEqual(smallAnimalMutationKeys(DATA), []);
  assert.deepEqual(DATA.json('small_animals'), [{ breederId: 'RB-JSON', species: 'rabbit' }]);
  assertNoCatCollectionAccess(DATA);
});

test('valid and empty bulk replace exactly the small_animals key', async () => {
  const { env, DATA } = await makeEnv([{ breederId: 'OLD', species: 'rabbit' }]);
  const next = [{ breederId: 'RB-BULK', species: 'rabbit', photos: [] }];

  const valid = await fetchWorker(env, request('/api/admin/small-animals/bulk', {
    method: 'POST', origin: ORIGIN, auth: true, body: next,
  }));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { success: true, count: 1 });
  assert.deepEqual(DATA.json('small_animals'), next);

  const empty = await fetchWorker(env, request('/api/admin/small-animals/bulk', {
    method: 'POST', origin: ORIGIN, auth: true, body: [],
  }));
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { success: true, count: 0 });
  assert.deepEqual(DATA.json('small_animals'), []);
  assert.deepEqual(smallAnimalMutationKeys(DATA), ['small_animals', 'small_animals']);
  assert.equal(DATA.store.has('small-animals'), false);
  assertNoCatCollectionAccess(DATA);
});

test('/bulk is reserved and non-POST methods cannot address breederId bulk', async () => {
  for (const item of [
    { path: '/api/admin/small-animals/bulk', method: 'PUT', body: { name: 'Must not update' } },
    { path: '/api/admin/small-animals/bulk', method: 'DELETE' },
    { path: '/api/admin/small-animals/%62ulk', method: 'PUT', body: { name: 'Must not update' } },
    { path: '/api/admin/small-animals/%62ulk', method: 'DELETE' },
  ]) {
    const original = [{ breederId: 'bulk', species: 'rabbit', name: 'Reserved path' }];
    const { env, DATA } = await makeEnv(original);
    const response = await fetchWorker(env, request(item.path, {
      method: item.method,
      origin: ORIGIN,
      auth: true,
      body: item.body,
    }));

    assert.equal(response.status, 404);
    assert.deepEqual(smallAnimalMutationKeys(DATA), []);
    assert.deepEqual(DATA.json('small_animals'), original);
    assertNoCatCollectionAccess(DATA);
  }
});

test('extra path segments and /bulk/extra return 404 without mutation', async () => {
  const { env, DATA } = await makeEnv([{ breederId: 'RB-SAFE', species: 'rabbit' }]);
  const paths = [
    '/api/admin/small-animals/bulk/extra',
    '/api/admin/small-animals/RB-SAFE/extra',
  ];

  for (const path of paths) {
    const response = await fetchWorker(env, request(path, {
      method: path.includes('/bulk/') ? 'POST' : 'DELETE',
      origin: ORIGIN,
      auth: true,
      body: path.includes('/bulk/') ? [] : undefined,
    }));
    assert.equal(response.status, 404);
  }

  assert.deepEqual(smallAnimalMutationKeys(DATA), []);
  assert.deepEqual(DATA.json('small_animals'), [{ breederId: 'RB-SAFE', species: 'rabbit' }]);
  assertNoCatCollectionAccess(DATA);
});
