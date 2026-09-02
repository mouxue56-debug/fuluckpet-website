#!/usr/bin/env node
/**
 * Read-only release preflight for a static-site checkout.
 *
 * It intentionally validates checkout hygiene only. Catalogue snapshot
 * freshness remains an external runtime guard of the sync command itself.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const REQUIRED_PATHS = Object.freeze([
  '.github/workflows/quality.yml',
  '.github/workflows/seo-geo-quality.yml',
  '.github/workflows/regenerate-site.yml',
  '.github/workflows/koneko-nightly-audit.yml',
  'tools/sync-koneko.js',
  'tools/lib/koneko-snapshot-freshness.js',
  'tools/lib/koneko-active-mirror.js',
  'scripts/deploy-and-smoke-worker.sh',
]);

export function classifyReleaseState({ branch, originAvailable, behind, ahead, dirty }) {
  if (!originAvailable) return { status: 'RED', detail: 'origin/main ref is unavailable' };
  if (!branch || branch === 'HEAD') return { status: 'RED', detail: 'checkout is detached' };
  if (!Number.isSafeInteger(behind) || behind < 0 || !Number.isSafeInteger(ahead) || ahead < 0) {
    return { status: 'RED', detail: 'cannot determine branch distance from origin/main' };
  }
  if (dirty) return { status: 'RED', detail: 'working tree has uncommitted changes' };
  if (behind > 0) return { status: 'RED', detail: `on ${branch}; behind origin/main ${behind}, ahead ${ahead}` };
  if (branch === 'main' && ahead !== 0) {
    return { status: 'RED', detail: 'local main differs from origin/main' };
  }
  return { status: 'GREEN', detail: `on ${branch}; behind origin/main 0, ahead ${ahead}` };
}

export function classifyNode(expected, actual) {
  const wanted = String(expected).trim().match(/^v?(\d+)$/)?.[1];
  const running = String(actual).trim().match(/^v?(\d+)(?:\.\d+){0,2}$/)?.[1];
  if (!wanted) return { status: 'RED', detail: '.node-version must contain one Node major' };
  if (!running) return { status: 'RED', detail: 'running Node version is invalid' };
  if (wanted !== running) return { status: 'RED', detail: `.node-version wants ${wanted}, running ${running}` };
  return { status: 'GREEN', detail: `Node major ${running} matches .node-version` };
}

export function missingRequiredPaths(requiredPaths, presentPaths) {
  return requiredPaths.filter((path) => !presentPaths.has(path));
}

export function classifyBackupsIgnored(ignored) {
  return ignored
    ? { status: 'GREEN', detail: '_backups/probe.json is ignored' }
    : { status: 'RED', detail: '_backups/probe.json is not ignored' };
}

function tryGit(args) {
  try {
    return { ok: true, out: execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim() };
  } catch {
    return { ok: false, out: '' };
  }
}

function result(name, status, detail) {
  return { name, status, detail };
}

function checkReleaseState() {
  const branch = tryGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  const origin = tryGit(['rev-parse', '--verify', 'origin/main^{commit}']);
  const dirty = tryGit(['status', '--porcelain']);
  const behind = origin.ok ? tryGit(['rev-list', '--count', 'HEAD..origin/main']) : { ok: false };
  const ahead = origin.ok ? tryGit(['rev-list', '--count', 'origin/main..HEAD']) : { ok: false };
  const verdict = classifyReleaseState({
    branch: branch.ok ? branch.out : '',
    originAvailable: origin.ok,
    behind: behind.ok ? Number(behind.out) : Number.NaN,
    ahead: ahead.ok ? Number(ahead.out) : Number.NaN,
    dirty: dirty.ok ? Boolean(dirty.out) : true,
  });
  return result('release-state', verdict.status, verdict.detail);
}

function checkNode() {
  const pin = resolve(ROOT, '.node-version');
  const expected = existsSync(pin) ? readFileSync(pin, 'utf8') : '';
  const verdict = classifyNode(expected, process.versions.node);
  return result('node', verdict.status, verdict.detail);
}

function checkRequiredPaths() {
  const present = new Set(REQUIRED_PATHS.filter((path) => existsSync(resolve(ROOT, path))));
  const missing = missingRequiredPaths(REQUIRED_PATHS, present);
  return result(
    'required-files',
    missing.length === 0 ? 'GREEN' : 'RED',
    missing.length === 0 ? 'required workflows and safety modules are present' : `missing: ${missing.join(', ')}`,
  );
}

function checkBackupsIgnored() {
  const ignored = tryGit(['check-ignore', '--no-index', '--quiet', '_backups/probe.json']);
  const verdict = classifyBackupsIgnored(ignored.ok);
  return result('backups-ignored', verdict.status, verdict.detail);
}

export function runPreflight() {
  return [checkReleaseState(), checkNode(), checkRequiredPaths(), checkBackupsIgnored()];
}

export function main() {
  const results = runPreflight();
  console.log(`preflight (read-only) — ${ROOT}`);
  for (const entry of results) console.log(`  ${entry.status.padEnd(5)} ${entry.name.padEnd(16)} ${entry.detail}`);
  const reds = results.filter((entry) => entry.status === 'RED');
  console.log(reds.length === 0
    ? 'preflight: all static release checks passed'
    : `preflight: ${reds.length} blocking static release check(s) failed`);
  return reds.length === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
