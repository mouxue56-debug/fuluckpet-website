'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'boarding-public-config.js');
const LAUNCH_PATH = path.join(ROOT, 'dog-services-launch.json');
const PROJECTION_PATH = path.join(ROOT, 'dog-services-projection.js');
const {
  buildPreviewProjection,
  createPreviewServer,
} = require('../tools/serve-dog-services-preview.js');

function expectedPreviewProjection() {
  const source = require(CONFIG_PATH);
  return require(PROJECTION_PATH).buildDogServicesProjection({
    CONFIG: {
      ...source.CONFIG,
      dogServices: { ...source.CONFIG.dogServices, public: true },
    },
    HOLIDAYS: source.HOLIDAYS.slice(),
    SPECIAL_DATE_RANGES: source.SPECIAL_DATE_RANGES.map((range) => ({ ...range })),
  });
}

async function startPreview(t, root = ROOT) {
  const server = createPreviewServer({ root, host: '127.0.0.1', port: 0 });
  t.after(async () => {
    if (!server.listening) return;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
  await once(server, 'listening');
  return server;
}

async function createInternalTreeFixture(t) {
  const fixtureRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dog-services-preview-'));
  const siteRoot = path.join(fixtureRoot, 'site');
  await fs.promises.mkdir(path.join(siteRoot, 'docs'), { recursive: true });
  await fs.promises.writeFile(path.join(siteRoot, 'docs', 'internal-plan.md'), 'internal only\n');
  t.after(() => fs.promises.rm(fixtureRoot, { recursive: true, force: true }));
  return { fixtureRoot, siteRoot };
}

function request(server, pathname, method = 'GET') {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      method,
      path: pathname,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('buildPreviewProjection returns the exact strict public projection', () => {
  const preview = buildPreviewProjection();
  const projectionApi = require(PROJECTION_PATH);

  assert.deepEqual(preview, expectedPreviewProjection());
  assert.equal(preview.public, true);
  assert.equal(preview.version, 2);
  assert.ok(preview.calendar.holidays.includes('2027-11-23'));
  assert.equal(projectionApi.validateDogServicesProjection(preview), true);
});

test('buildPreviewProjection leaves both production launch inputs and output disabled', () => {
  const config = require(CONFIG_PATH);
  const launchBefore = fs.readFileSync(LAUNCH_PATH, 'utf8');

  buildPreviewProjection();

  assert.equal(config.CONFIG.dogServices.public, false);
  assert.deepEqual(require(PROJECTION_PATH).buildDogServicesProjection(config), { public: false });
  assert.equal(fs.readFileSync(LAUNCH_PATH, 'utf8'), launchBefore);
  assert.deepEqual(JSON.parse(launchBefore), { public: false });
});

test('createPreviewServer rejects every non-loopback bind host', () => {
  for (const host of ['0.0.0.0', '::', '192.168.1.10', 'example.test', 'localhost']) {
    assert.throws(
      () => createPreviewServer({ root: ROOT, host, port: 0 }),
      /loopback/i,
      host,
    );
  }
});

test('preview overrides dog-services-launch.json for GET and HEAD', async (t) => {
  const server = await startPreview(t);
  const get = await request(server, '/dog-services-launch.json?v=private-preview');

  assert.equal(get.status, 200);
  assert.match(get.headers['content-type'], /^application\/json\b/);
  assert.match(get.headers['cache-control'], /no-store/);
  assert.deepEqual(JSON.parse(get.body), expectedPreviewProjection());

  const head = await request(server, '/dog-services-launch.json?v=private-preview', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(Number(head.headers['content-length']), Buffer.byteLength(get.body));
});

test('preview serves the three dog-service review pages as static HTML', async (t) => {
  const server = await startPreview(t);

  for (const pathname of ['/boarding/', '/grooming/', '/boarding/estimate.html']) {
    const response = await request(server, pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers['content-type'], /^text\/html\b/, pathname);
    assert.match(response.body, /<!doctype html>/i, pathname);
  }
});

test('preview denies internal repository trees', async (t) => {
  const server = await startPreview(t);

  for (const pathname of [
    '/.git/config',
    '/.superpowers/sdd/task-2-brief.md',
    '/tests/dog-services-private-preview.test.js',
    '/tools/serve-dog-services-preview.js',
    '/scripts/deploy-and-smoke-worker.sh',
    '/api/worker.js',
    '/admin/index.html',
  ]) {
    const response = await request(server, pathname);
    assert.equal(response.status, 403, pathname);
  }
});

test('preview denies direct access to the docs tree', async (t) => {
  const { siteRoot } = await createInternalTreeFixture(t);
  const server = await startPreview(t, siteRoot);
  const response = await request(server, '/docs/internal-plan.md');

  assert.equal(response.status, 403);
});

test('preview denies an in-root symlink alias to an internal tree', async (t) => {
  const { siteRoot } = await createInternalTreeFixture(t);
  await fs.promises.symlink('docs', path.join(siteRoot, 'public-alias'), 'dir');
  const server = await startPreview(t, siteRoot);
  const response = await request(server, '/public-alias/internal-plan.md');

  assert.equal(response.status, 403);
});

test('preview denies a symlink escape outside the selected root', async (t) => {
  const { fixtureRoot, siteRoot } = await createInternalTreeFixture(t);
  const outsideFile = path.join(fixtureRoot, 'outside-secret.txt');
  await fs.promises.writeFile(outsideFile, 'outside root\n');
  await fs.promises.symlink(outsideFile, path.join(siteRoot, 'outside-alias.txt'), 'file');
  const server = await startPreview(t, siteRoot);
  const response = await request(server, '/outside-alias.txt');

  assert.equal(response.status, 403);
});

test('preview rejects plain, encoded, and repeatedly encoded traversal', async (t) => {
  const server = await startPreview(t);

  for (const pathname of [
    '/../dog-services-projection.js',
    '/boarding/%2e%2e/%2e%2e/etc/passwd',
    '/..%2f..%2fetc%2fpasswd',
    '/%252e%252e%252fetc%252fpasswd',
    '/boarding%5c..%5cdog-services-launch.json',
  ]) {
    const response = await request(server, pathname);
    assert.equal(response.status, 403, pathname);
  }
});

test('preview allows only GET and HEAD', async (t) => {
  const server = await startPreview(t);
  const response = await request(server, '/boarding/', 'POST');

  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, 'GET, HEAD');
});
