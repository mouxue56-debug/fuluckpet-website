import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { compareKonekoToFuluck } from './lib/koneko-catalog-audit.js';
import {
  blockedReceipt,
  writeAuditReports,
} from './lib/koneko-audit-output.js';

const BOOTSTRAP_BLOCKS = new Map([
  [
    'focused_tests_failed',
    'Public catalogue audit blocked: stage=bootstrap; reason=focused_tests_failed',
  ],
]);

const ACCOUNT_IDS = ['c995680', 'd696506'];
const ACTIVE_STATUSES = new Set(['available', 'reserved']);

function parseArguments(argv) {
  const options = {};
  const errors = [];
  const accepted = new Map([
    ['--json', 'json'],
    ['--markdown', 'markdown'],
    ['--fixture', 'fixture'],
    ['--blocked', 'blocked'],
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
  if (options.fixture && options.blocked) errors.push('invalid invocation');
  if (options.blocked && !BOOTSTRAP_BLOCKS.has(options.blocked)) errors.push('invalid invocation');
  return { options, errors };
}

async function loadFixture(pathname) {
  const fixture = await import(`${pathToFileURL(resolve(pathname)).href}?audit=${randomUUID()}`);
  if (typeof fixture.default !== 'function') throw new Error('test fixture is invalid');
  return fixture.default;
}

async function runAudit(options, publicCrawl) {
  const { crawlKonekoAccount, readFuluckPublicTarget } = publicCrawl;
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
  } else if (options.blocked) {
    result = blockedReceipt(BOOTSTRAP_BLOCKS.get(options.blocked));
  } else {
    let publicCrawl;
    try {
      publicCrawl = await import('./lib/koneko-public-crawl.js');
      result = await runAudit(options, publicCrawl);
    } catch (error) {
      result = blockedReceipt(
        publicCrawl?.formatPublicAuditFailure(error)
          ?? 'Public catalogue evidence could not be completed.',
      );
    }
  }

  if (!options.json || !options.markdown) {
    process.stderr.write('Koneko audit BLOCKED: valid report paths are required.\n');
    process.exitCode = 3;
    return;
  }
  try {
    writeAuditReports({ jsonPath: options.json, markdownPath: options.markdown }, result);
    process.exitCode = result.exitCode;
  } catch {
    process.stderr.write('Koneko audit BLOCKED: reports could not be written safely.\n');
    process.exitCode = 3;
  }
}

await main();
