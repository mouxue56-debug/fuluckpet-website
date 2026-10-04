const test = require('node:test');
const assert = require('node:assert/strict');

let worker;
test.before(async () => { ({ default: worker } = await import('../api/worker.js')); });

// Small, synthetic bytes exercise the real public route; no production objects or credentials.
function harness({ missing = false, cached } = {}) {
  const bytes = new TextEncoder().encode('0123456789');
  const reads = [], pending = [], cachedWrites = [];
  const metadata = { size: bytes.length, etag: 'fixture-v1', httpEtag: '"fixture-v1"',
    uploaded: new Date('2026-10-01T00:00:00Z'), httpMetadata: { contentType: 'video/mp4' } };
  const bucket = {
    async head() { return missing ? null : { ...metadata }; },
    async get(key, options = {}) {
      reads.push(options);
      if (missing) return null;
      const offset = options.range?.offset ?? 0, length = options.range?.length ?? bytes.length;
      return { ...metadata, range: options.range, body: new Blob([bytes.slice(offset, offset + length)]).stream() };
    },
  };
  global.caches = { default: {
    async match(request) { return cached?.(request); },
    async put(request, response) { cachedWrites.push({ url: request.url, status: response.status, body: await response.text() }); },
  } };
  return { reads, cachedWrites,
    async request({ method = 'GET', headers = {}, path = '/r2/ambient/test/clip.mp4' } = {}) {
      const response = await worker.fetch(new Request('https://media.example' + path, { method, headers }),
        { BUCKET: bucket, DATA: { async get() { return null; } } }, { waitUntil(p) { pending.push(p); } });
      await Promise.all(pending);
      return response;
    },
  };
}

test('ambient video returns only requested bytes, including a correct total length and CORS', async () => {
  const h = harness();
  const r = await h.request({ headers: { Range: 'bytes=2-4', Origin: 'https://fuluckpet.com' } });
  assert.equal(r.status, 206);
  assert.equal(await r.text(), '234');
  assert.equal(r.headers.get('Content-Range'), 'bytes 2-4/10');
  assert.equal(r.headers.get('Content-Length'), '3');
  assert.equal(r.headers.get('Content-Type'), 'video/mp4');
  assert.equal(r.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(h.reads.map(x => x.range), [{ offset: 2, length: 3 }]);
  assert.equal(h.cachedWrites.length, 0, 'a partial response must never replace the full-file cache');
});

test('open-ended, suffix and oversized-end ranges return the right bytes', async () => {
  for (const [range, body, header] of [
    ['bytes=7-', '789', 'bytes 7-9/10'], ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=8-99', '89', 'bytes 8-9/10'], ['bytes=-99', '0123456789', 'bytes 0-9/10'],
  ]) {
    const r = await harness().request({ headers: { Range: range } });
    assert.equal(r.status, 206, range);
    assert.equal(await r.text(), body, range);
    assert.equal(r.headers.get('Content-Range'), header, range);
  }
});

test('unsatisfiable byte ranges avoid reading video bytes', async () => {
  for (const range of ['bytes=10-', 'bytes=5-3', 'bytes=-0', 'bytes=99999999999999999999-']) {
    const h = harness(), r = await h.request({ headers: { Range: range } });
    assert.equal(r.status, 416, range);
    assert.equal(r.headers.get('Content-Range'), 'bytes */10');
    assert.equal(h.reads.length, 0);
    assert.equal(h.cachedWrites.length, 0);
  }
});

test('HEAD gives video metadata without downloading the body', async () => {
  const h = harness(), r = await h.request({ method: 'HEAD', headers: { Range: 'bytes=0-1' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Length'), '10');
  assert.equal(r.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(await r.text(), '');
  assert.equal(h.reads.length, 0);
});

test('full video reads retain immutable caching and declare length for future cached ranges', async () => {
  const h = harness(), r = await h.request();
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '0123456789');
  assert.equal(r.headers.get('Content-Length'), '10');
  assert.match(r.headers.get('Cache-Control'), /immutable/);
  assert.deepEqual(h.cachedWrites.map(x => [x.status, x.body]), [[200, '0123456789']]);
});

test('a cached range is requested with Range preserved rather than returning the entire cached video', async () => {
  const h = harness({ cached(request) {
    if (request.headers.get('Range') === 'bytes=2-4') return new Response('234', {
      status: 206, headers: { 'Content-Range': 'bytes 2-4/10', 'Content-Length': '3', 'Content-Type': 'video/mp4' },
    });
    return new Response('0123456789', { headers: { 'Content-Length': '10' } });
  } });
  const r = await h.request({ headers: { Range: 'bytes=2-4' } });
  assert.equal(r.status, 206);
  assert.equal(await r.text(), '234');
  assert.equal(h.reads.length, 0);
});

test('If-Range matches use ranges; changed or weak validators return the full current object', async () => {
  for (const [validator, status, body] of [
    ['"fixture-v1"', 206, '23'], ['"old"', 200, '0123456789'],
    ['W/"fixture-v1"', 200, '0123456789'], ['Thu, 01 Oct 2026 00:00:00 GMT', 206, '23'],
  ]) {
    const r = await harness().request({ headers: { Range: 'bytes=2-3', 'If-Range': validator } });
    assert.equal(r.status, status, validator);
    assert.equal(await r.text(), body, validator);
  }
});

test('unsupported range syntax is safely ignored, and missing videos are never cached', async () => {
  for (const range of ['items=1-3', 'bytes=0-1,4-5', 'bytes=abc']) {
    const r = await harness().request({ headers: { Range: range } });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), '0123456789');
  }
  for (const method of ['HEAD', 'GET']) {
    const h = harness({ missing: true }), r = await h.request({ method });
    assert.equal(r.status, 404);
    assert.equal(h.cachedWrites.length, 0);
  }
});

test('non-ambient image requests keep the existing full image route', async () => {
  const r = await harness().request({ path: '/r2/uploads/fixture.jpg' });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '0123456789');
});
