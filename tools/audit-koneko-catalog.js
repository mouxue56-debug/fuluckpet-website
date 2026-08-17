import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  lstatSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { compareKonekoToFuluck, renderAuditMarkdown } from './lib/koneko-catalog-audit.js';
import { crawlKonekoAccount, readFuluckPublicTarget } from './lib/koneko-public-crawl.js';

const ACCOUNT_IDS = ['c995680', 'd696506'];
const ACTIVE_STATUSES = new Set(['available', 'reserved']);

function parseArguments(argv) {
  const options = {};
  const errors = [];
  const accepted = new Map([
    ['--json', 'json'],
    ['--markdown', 'markdown'],
    ['--fixture', 'fixture'],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const name = accepted.get(flag);
    if (!name) {
      errors.push('invalid invocation');
      continue;
    }
    const value = argv[index + 1];
    if (typeof value !== 'string' || value === '' || value.startsWith('--')) {
      errors.push('invalid invocation');
      continue;
    }
    index += 1;
    if (options[name] !== undefined) errors.push('invalid invocation');
    else options[name] = value;
  }

  if (!options.json || !options.markdown) errors.push('invalid invocation');
  if (options.json && options.markdown && resolve(options.json) === resolve(options.markdown)) {
    errors.push('invalid invocation');
  }
  if (options.fixture && process.env.NODE_ENV !== 'test') errors.push('invalid invocation');
  return { options, errors };
}

function existingEntry(pathname) {
  try {
    return lstatSync(pathname);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function validateDestination(pathname) {
  const destination = resolve(pathname);
  const parent = existingEntry(dirname(destination));
  if (!parent?.isDirectory() || parent.isSymbolicLink()) throw new Error('report destination is unsafe');
  const entry = existingEntry(destination);
  if (entry && (!entry.isFile() || entry.isSymbolicLink())) throw new Error('report destination is unsafe');
  return destination;
}

function atomicWrite(pathname, content) {
  const temporary = `${dirname(pathname)}/.${basename(pathname)}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(descriptor, content, 'utf8');
    fchmodSync(descriptor, 0o600);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, pathname);
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}

function writeReports(options, result) {
  const jsonPath = validateDestination(options.json);
  const markdownPath = validateDestination(options.markdown);
  if (jsonPath === markdownPath) throw new Error('report destinations must differ');
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const markdown = renderAuditMarkdown(result);
  atomicWrite(jsonPath, json);
  atomicWrite(markdownPath, markdown);
}

function blockedReceipt(message = 'Public catalogue evidence could not be completed.') {
  return {
    timestamp: new Date().toISOString(),
    result: 'BLOCKED',
    exitCode: 3,
    accounts: [],
    fuluck: {
      apiRecordCount: 0,
      renderedPageCounts: { ja: 0, en: 0, zh: 0 },
      checkedUrls: [],
    },
    diffs: [],
    blocks: [message],
    noWritePerformed: true,
  };
}

async function loadFixture(pathname) {
  const fixture = await import(`${pathToFileURL(resolve(pathname)).href}?audit=${randomUUID()}`);
  if (typeof fixture.default !== 'function') throw new Error('test fixture is invalid');
  return fixture.default;
}

async function runAudit(options) {
  const fetchImpl = options.fixture ? await loadFixture(options.fixture) : globalThis.fetch;
  const delayMs = options.fixture ? 0 : 500;
  const accounts = [];
  for (const accountId of ACCOUNT_IDS) {
    accounts.push(await crawlKonekoAccount({ accountId, fetchImpl, delayMs }));
  }
  const activeIds = accounts.flatMap(account => account.kittens
    .filter(kitten => ACTIVE_STATUSES.has(kitten.status))
    .map(kitten => kitten.breederId));
  const target = await readFuluckPublicTarget({ activeIds, fetchImpl });
  const checkedSourceUrls = accounts.flatMap(account => [
    ...account.receipts.map(receipt => receipt.url),
    ...account.activeDetails.map(detail => detail.detailUrl),
  ]);
  return compareKonekoToFuluck({
    timestamp: new Date().toISOString(),
    accounts,
    fuluck: {
      ...target,
      checkedUrls: [...checkedSourceUrls, ...target.checkedUrls],
    },
  });
}

async function main() {
  const { options, errors } = parseArguments(process.argv.slice(2));
  let result;
  if (errors.length) {
    result = blockedReceipt('The audit invocation was invalid.');
  } else {
    try {
      result = await runAudit(options);
    } catch {
      result = blockedReceipt();
    }
  }

  if (!options.json || !options.markdown) {
    process.stderr.write('Koneko audit BLOCKED: valid report paths are required.\n');
    process.exitCode = 3;
    return;
  }
  try {
    writeReports(options, result);
    process.exitCode = result.exitCode;
  } catch {
    process.stderr.write('Koneko audit BLOCKED: reports could not be written safely.\n');
    process.exitCode = 3;
  }
}

await main();
