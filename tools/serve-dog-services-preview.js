'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const SITE_ROOT = path.resolve(__dirname, '..');
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1']);
const INTERNAL_TREES = new Set([
  '.git',
  '.github',
  '.superpowers',
  'admin',
  'api',
  'node_modules',
  'scripts',
  'tests',
  'tools',
]);
const CONTENT_TYPES = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

function buildPreviewProjection() {
  const source = require('../boarding-public-config.js');
  const projectionApi = require('../dog-services-projection.js');
  return projectionApi.buildDogServicesProjection({
    CONFIG: {
      ...source.CONFIG,
      dogServices: { ...source.CONFIG.dogServices, public: true },
    },
    HOLIDAYS_2026: source.HOLIDAYS_2026.slice(),
    SPECIAL_DATE_RANGES: source.SPECIAL_DATE_RANGES.map((range) => ({ ...range })),
  });
}

function responseBody(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
}

function sendResponse(req, res, status, value, headers = {}) {
  const body = responseBody(value);
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function decodeRequestPath(requestUrl) {
  const rawUrl = typeof requestUrl === 'string' ? requestUrl : '';
  const queryIndex = rawUrl.indexOf('?');
  const rawPath = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
  if (!rawPath.startsWith('/')) return { status: 400 };

  let decoded = rawPath;
  let stable = false;
  try {
    for (let depth = 0; depth < 8; depth += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        stable = true;
        break;
      }
      decoded = next;
    }
  } catch (_error) {
    return { status: 400 };
  }
  if (!stable) return { status: 400 };
  if (decoded.includes('\0') || decoded.includes('\\')) return { status: 403 };

  const segments = decoded.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) return { status: 403 };
  if (segments.some((segment) => {
    const lower = segment.toLowerCase();
    return lower.startsWith('.') || INTERNAL_TREES.has(lower);
  })) return { status: 403 };

  return {
    pathname: `/${segments.join('/')}${decoded.endsWith('/') && segments.length ? '/' : ''}`,
    status: 200,
  };
}

function insideRoot(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function readStaticFile(root, pathname) {
  let candidate = path.resolve(root, `.${pathname}`);
  if (!insideRoot(root, candidate)) {
    const error = new Error('path escapes preview root');
    error.status = 403;
    throw error;
  }

  let stat = await fs.promises.stat(candidate);
  if (stat.isDirectory()) {
    candidate = path.join(candidate, 'index.html');
  }

  const realCandidate = await fs.promises.realpath(candidate);
  if (!insideRoot(root, realCandidate)) {
    const error = new Error('symlink escapes preview root');
    error.status = 403;
    throw error;
  }
  stat = await fs.promises.stat(realCandidate);
  if (!stat.isFile()) {
    const error = new Error('not a static file');
    error.code = 'ENOENT';
    throw error;
  }

  return {
    body: await fs.promises.readFile(realCandidate),
    contentType: CONTENT_TYPES[path.extname(realCandidate).toLowerCase()] || 'application/octet-stream',
  };
}

function createPreviewServer(options = {}) {
  const host = options.host === undefined ? '127.0.0.1' : options.host;
  const port = options.port === undefined ? 4173 : options.port;
  const requestedRoot = options.root === undefined ? SITE_ROOT : options.root;

  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error('dog-services preview host must be an explicit loopback address');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError('dog-services preview port must be an integer from 0 to 65535');
  }
  if (typeof requestedRoot !== 'string') {
    throw new TypeError('dog-services preview root must be a directory path');
  }
  const root = fs.realpathSync(requestedRoot);
  if (!fs.statSync(root).isDirectory()) {
    throw new TypeError('dog-services preview root must be a directory');
  }

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendResponse(req, res, 405, 'Method Not Allowed\n', { Allow: 'GET, HEAD' });
      return;
    }

    const requestPath = decodeRequestPath(req.url);
    if (requestPath.status !== 200) {
      sendResponse(req, res, requestPath.status, requestPath.status === 403 ? 'Forbidden\n' : 'Bad Request\n');
      return;
    }

    if (requestPath.pathname === '/dog-services-launch.json') {
      const body = `${JSON.stringify(buildPreviewProjection())}\n`;
      sendResponse(req, res, 200, body, { 'Content-Type': 'application/json; charset=utf-8' });
      return;
    }

    try {
      const file = await readStaticFile(root, requestPath.pathname);
      sendResponse(req, res, 200, file.body, { 'Content-Type': file.contentType });
    } catch (error) {
      if (error && error.status === 403) {
        sendResponse(req, res, 403, 'Forbidden\n');
        return;
      }
      if (error && ['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) {
        sendResponse(req, res, 404, 'Not Found\n');
        return;
      }
      sendResponse(req, res, 500, 'Internal Server Error\n');
    }
  });

  server.listen(port, host);
  return server;
}

if (require.main === module) {
  const server = createPreviewServer({ root: SITE_ROOT, host: '127.0.0.1', port: 4173 });
  server.once('listening', () => {
    const address = server.address();
    process.stdout.write(`Dog-services preview: http://127.0.0.1:${address.port}/boarding/\n`);
  });
  server.once('error', (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildPreviewProjection,
  createPreviewServer,
};
