// Public, immutable background assets only. Other R2/API routes retain their existing behavior.
function singleRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value || '');
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return false;
  const start = first === null ? Math.max(0, size - last) : first;
  const end = first === null || last === null ? size - 1 : Math.min(last, size - 1);
  if (size === 0 || start >= size || end < start) return false;
  return { offset: start, length: end - start + 1 };
}

function matchesIfRange(value, object) {
  if (!value) return true;
  if (value.startsWith('"')) return value === object.httpEtag;
  if (value.startsWith('W/')) return false;
  const date = Date.parse(value), uploaded = object.uploaded?.getTime();
  return Number.isFinite(date) && Number.isFinite(uploaded) && Math.floor(uploaded / 1000) <= Math.floor(date / 1000);
}

function headersFor(object) {
  const headers = new Headers({
    'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
    'Content-Length': String(object.size),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'ETag': object.httpEtag,
    'X-Img-Cache': 'R2',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
  });
  if (object.uploaded) headers.set('Last-Modified', object.uploaded.toUTCString());
  return headers;
}

function missing(head) {
  return new Response(head ? null : 'Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

export async function serveAmbientMedia(request, bucket, cache, ctx) {
  const url = new URL(request.url), key = url.pathname.slice(4), head = request.method === 'HEAD';
  const cacheKey = new Request(url.origin + url.pathname);
  const rawRange = request.headers.get('Range');
  const rangeHeader = /^bytes=(?:\d+-\d*|-\d+)$/i.test(rawRange || '') ? rawRange : null;
  const ifRange = request.headers.get('If-Range');

  if (!head && !ifRange) {
    const cached = await cache.match(new Request(cacheKey, {
      headers: rangeHeader ? { Range: rangeHeader } : {},
    }));
    if (cached && ((!rangeHeader && cached.status === 200) || (rangeHeader && cached.status === 206))) {
      const headers = new Headers(cached.headers);
      headers.set('Accept-Ranges', 'bytes');
      headers.set('X-Img-Cache', 'EDGE');
      headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, ETag');
      return new Response(cached.body, { status: cached.status, headers });
    }
    // Legacy cached responses without Content-Length cannot satisfy a range.
    if (cached?.body) ctx.waitUntil(cached.body.cancel().catch(() => {}));
  }

  let range = null;
  if (head || rangeHeader) {
    const metadata = await bucket.head(key);
    if (!metadata) return missing(head);
    const headers = headersFor(metadata);
    if (head) return new Response(null, { headers });
    if (matchesIfRange(ifRange, metadata)) range = singleRange(rangeHeader, metadata.size);
    if (range === false) {
      headers.set('Content-Range', `bytes */${metadata.size}`);
      headers.set('Content-Length', '0');
      headers.set('Cache-Control', 'no-store');
      return new Response(null, { status: 416, headers });
    }
  }

  const object = await bucket.get(key, range ? { range } : undefined);
  if (!object) return missing(false);
  const headers = headersFor(object);
  if (range) {
    headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    headers.set('Content-Length', String(range.length));
    return new Response(object.body, { status: 206, headers });
  }
  const response = new Response(object.body, { headers });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
