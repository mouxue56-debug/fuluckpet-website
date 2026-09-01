import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as activeMirror from '../tools/lib/koneko-active-mirror.js';

const {
  assertCompleteActiveSource,
  buildActiveMirrorPatch,
} = activeMirror;

const source = () => ({
  breederId: '2608-00001',
  status: 'available',
  breed: 'サイベリアン',
  color: 'ブルー&ホワイト',
  gender: '♀',
  price: 258000,
  birthday: '2026-06-01',
  photos: [
    'https://www.koneko-breeder.com/full/first.webp',
    'https://www.koneko-breeder.com/full/second.webp',
  ],
  video: 'https://www.youtube.com/embed/AbCdEfGhI12',
  papa: '父猫',
  mama: '母猫',
  notes: {
    ja: '人懐こい女の子です。',
    zh: '亲人的小母猫。',
    en: 'An affectionate little girl.',
  },
  descriptions: {
    ja: 'ブリーダーからの子猫紹介文です。',
    zh: '这是繁育者的完整介绍。',
    en: 'This is the breeder’s full introduction.',
  },
});

const current = () => ({
  id: 'fuluck-uuid',
  breederId: '2608-00001',
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z',
  isNew: false,
  promotionTag: 'featured',
  promotionPriority: 99,
  internalMemo: 'Fuluck-only',
  status: 'reserved',
  breed: '旧品種',
  color: '旧毛色',
  gender: '♂',
  price: 100000,
  birthday: '2026-05-01',
  photos: [
    'https://fuluckpet.com/old/second.webp',
    'https://fuluckpet.com/old/first.webp',
  ],
  coverIndex: 1,
  video: 'https://youtu.be/ZyXwVuTsRq0?si=old',
  papa: '旧父',
  mama: '旧母',
  note: '旧い短文',
  noteZh: '旧短文',
  noteEn: 'Old short note',
  description: '旧い紹介文',
  descriptionZh: '旧介绍',
  descriptionEn: 'Old introduction',
});

test('buildActiveMirrorPatch replaces ordered photos, resets cover, and mirrors every source-owned field', () => {
  const before = current();
  const patch = buildActiveMirrorPatch(before, source());

  assert.deepEqual(patch, {
    status: 'available',
    breed: 'サイベリアン',
    color: 'ブルー&ホワイト',
    gender: '♀',
    price: 258000,
    birthday: '2026-06-01',
    photos: [
      'https://www.koneko-breeder.com/full/first.webp',
      'https://www.koneko-breeder.com/full/second.webp',
    ],
    coverIndex: 0,
    video: 'https://www.youtube.com/embed/AbCdEfGhI12',
    papa: '父猫',
    mama: '母猫',
    note: '人懐こい女の子です。',
    noteZh: '亲人的小母猫。',
    noteEn: 'An affectionate little girl.',
    description: 'ブリーダーからの子猫紹介文です。',
    descriptionZh: '这是繁育者的完整介绍。',
    descriptionEn: 'This is the breeder’s full introduction.',
  });
  assert.equal(patch.breederId, undefined);
  assert.equal(patch.id, undefined);
  assert.equal(patch.promotionTag, undefined);
  assert.deepEqual(before, current(), 'the planner never mutates the current Fuluck record');
});

test('buildActiveMirrorPatch compares YouTube by ID and does not write format-only changes', () => {
  const same = { ...source(), video: 'https://youtu.be/AbCdEfGhI12?si=tracking', coverIndex: 0 };
  const record = {
    ...source(),
    id: 'fuluck-uuid',
    video: 'https://www.youtube-nocookie.com/embed/AbCdEfGhI12',
    coverIndex: 0,
    note: source().notes.ja,
    noteZh: source().notes.zh,
    noteEn: source().notes.en,
    description: source().descriptions.ja,
    descriptionZh: source().descriptions.zh,
    descriptionEn: source().descriptions.en,
  };
  delete record.notes;
  delete record.descriptions;

  const patch = buildActiveMirrorPatch(record, same);

  assert.deepEqual(patch, {});
});

test('buildActiveMirrorPatch clears a removed source video while leaving Fuluck-only fields out of the patch', () => {
  const record = { ...current(), video: 'https://www.youtube.com/embed/AbCdEfGhI12' };
  const withoutVideo = { ...source(), video: '' };

  const patch = buildActiveMirrorPatch(record, withoutVideo);

  assert.equal(patch.video, '');
  assert.equal(Object.hasOwn(patch, 'id'), false);
  assert.equal(Object.hasOwn(patch, 'createdAt'), false);
  assert.equal(Object.hasOwn(patch, 'isNew'), false);
  assert.equal(Object.hasOwn(patch, 'promotionPriority'), false);
});

test('assertCompleteActiveSource rejects missing photos, video, and every required localized text field', () => {
  const cases = [
    [{ photos: [] }, /photos/],
    [{ video: '' }, /video/],
    [{ notes: { ...source().notes, zh: '   ' } }, /notes\.zh/],
    [{ descriptions: { ...source().descriptions, en: '' } }, /descriptions\.en/],
  ];

  for (const [override, expected] of cases) {
    const incomplete = { ...source(), ...override };
    assert.throws(() => assertCompleteActiveSource(incomplete), expected);
  }
});

test('assertCompleteActiveSource accepts a complete available or reserved source record', () => {
  assert.doesNotThrow(() => assertCompleteActiveSource(source()));
  assert.doesNotThrow(() => assertCompleteActiveSource({ ...source(), status: 'reserved' }));
});

test('strict YouTube canonicalization accepts a watch URL whose v parameter is not first', () => {
  const watchUrl = 'https://www.youtube.com/watch?feature=share&v=AbCdEfGhI12';
  const active = { ...source(), video: watchUrl };

  assert.doesNotThrow(() => assertCompleteActiveSource(active));
  assert.equal(typeof activeMirror.canonicalizeYouTubeVideo, 'function');
  assert.equal(
    activeMirror.canonicalizeYouTubeVideo(watchUrl),
    'https://www.youtube.com/embed/AbCdEfGhI12',
  );
});

test('strict new-record builder preserves the validated YouTube ID in canonical embed form', () => {
  const active = {
    ...source(),
    video: 'https://www.youtube.com/watch?feature=share&v=AbCdEfGhI12',
  };

  assert.equal(typeof activeMirror.buildActiveMirrorRecord, 'function');
  assert.deepEqual(activeMirror.buildActiveMirrorRecord(active), {
    breederId: '2608-00001',
    status: 'available',
    breed: 'サイベリアン',
    color: 'ブルー&ホワイト',
    gender: '♀',
    price: 258000,
    birthday: '2026-06-01',
    photos: [
      'https://www.koneko-breeder.com/full/first.webp',
      'https://www.koneko-breeder.com/full/second.webp',
    ],
    coverIndex: 0,
    video: 'https://www.youtube.com/embed/AbCdEfGhI12',
    papa: '父猫',
    mama: '母猫',
    note: '人懐こい女の子です。',
    noteZh: '亲人的小母猫。',
    noteEn: 'An affectionate little girl.',
    description: 'ブリーダーからの子猫紹介文です。',
    descriptionZh: '这是繁育者的完整介绍。',
    descriptionEn: 'This is the breeder’s full introduction.',
    isNew: true,
  });
});

test('--mirror-active emit uses strict new-record YouTube canonicalization', (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'fuluck-mirror-emit-'));
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));
  const snapshotPath = join(fixtureDir, 'snapshot.json');
  const emitPath = join(fixtureDir, 'emitted.json');
  const fetchStubPath = join(fixtureDir, 'fetch-stub.mjs');
  writeFileSync(snapshotPath, JSON.stringify({
    capturedAt: new Date().toISOString(),
    accounts: { c995680: 'account one', d696506: 'account two' },
    reservedIds: [],
    kittens: [
      {
        ...source(),
        group: 'c995680',
        video: 'https://www.youtube.com/watch?feature=share&v=AbCdEfGhI12',
      },
      {
        ...source(),
        breederId: '2608-00002',
        group: 'd696506',
      },
    ],
  }), { mode: 0o600 });
  writeFileSync(fetchStubPath, `
globalThis.fetch = async (input) => {
  const pathname = new URL(String(input)).pathname;
  if (pathname === '/api/admin/kittens') {
    return new Response(JSON.stringify([{
      id: 'historical-uuid', breederId: 'historical', status: 'sold', photos: [], coverIndex: 0
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (pathname === '/api/parents') {
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error('unexpected fetch: ' + input);
};
`);

  const syncPath = fileURLToPath(new URL('../tools/sync-koneko.js', import.meta.url));
  const result = spawnSync(process.execPath, [
    '--import', fetchStubPath,
    syncPath,
    '--mirror-active',
    '--snapshot', snapshotPath,
    '--emit', emitPath,
  ], {
    encoding: 'utf8',
    env: { ...process.env, FULUCK_ADMIN_PASS: 'test-only-pass' },
  });

  assert.equal(result.status, 0, result.stderr);
  const emitted = JSON.parse(readFileSync(emitPath, 'utf8'));
  const added = emitted.find((record) => record.breederId === '2608-00001');
  assert.equal(added.video, 'https://www.youtube.com/embed/AbCdEfGhI12');
});

test('--mirror-active validates every active source before credentials or a remote catalogue read', (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'fuluck-mirror-active-'));
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));
  const snapshotPath = join(fixtureDir, 'snapshot.json');
  const broken = { ...source(), group: 'c995680', photos: [] };
  const completeSecondAccount = { ...source(), breederId: '2608-00002', group: 'd696506' };
  writeFileSync(snapshotPath, JSON.stringify({
    capturedAt: new Date().toISOString(),
    accounts: { c995680: 'account one', d696506: 'account two' },
    reservedIds: [],
    kittens: [broken, completeSecondAccount],
  }), { mode: 0o600 });

  const syncPath = fileURLToPath(new URL('../tools/sync-koneko.js', import.meta.url));
  const result = spawnSync(process.execPath, [syncPath, '--mirror-active', '--snapshot', snapshotPath], {
    encoding: 'utf8',
    env: { ...process.env, FULUCK_ADMIN_PASS: '' },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /2608-00001.*photos/);
  assert.doesNotMatch(result.stderr, /FULUCK_ADMIN_PASS/);
  assert.doesNotMatch(result.stderr, /fetch failed|ENOTFOUND|ECONN/);
});

test('--mirror-active requires active coverage from both configured account groups', (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'fuluck-mirror-account-'));
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));
  const snapshotPath = join(fixtureDir, 'snapshot.json');
  writeFileSync(snapshotPath, JSON.stringify({
    capturedAt: new Date().toISOString(),
    accounts: { c995680: 'account one', d696506: 'account two' },
    reservedIds: [],
    kittens: [
      { ...source(), group: 'c995680' },
      { ...source(), breederId: '2608-00003', group: 'd696506', status: 'sold' },
    ],
  }), { mode: 0o600 });

  const syncPath = fileURLToPath(new URL('../tools/sync-koneko.js', import.meta.url));
  const result = spawnSync(process.execPath, [syncPath, '--mirror-active', '--snapshot', snapshotPath], {
    encoding: 'utf8',
    env: { ...process.env, FULUCK_ADMIN_PASS: '' },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /d696506.*販売中または商談中/);
  assert.doesNotMatch(result.stderr, /FULUCK_ADMIN_PASS/);
});
