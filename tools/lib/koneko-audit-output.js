import { createHash, randomUUID } from 'node:crypto';
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
import { basename, dirname, join, parse, resolve, sep } from 'node:path';

const KONEKO_ORIGIN = 'https://www.koneko-breeder.com';
const CREDENTIAL_MARKER = /\b(?:authorization|bearer|api[-_ ]?key|token|password|secret|cookie)\b(?:\s*[:=]\s*|\s+)/i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function canonicalEvidenceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function safeUrl(value) {
  const canonical = canonicalEvidenceUrl(value);
  if (!canonical) return '';
  const url = new URL(canonical);
  if (url.origin === KONEKO_ORIGIN && url.pathname === '/breederDetail.php') {
    const breederId = url.searchParams.get('breeder_id');
    const pageNum = url.searchParams.get('pageNum');
    const params = new URLSearchParams();
    if (breederId) params.set('breeder_id', breederId);
    if (pageNum) params.set('pageNum', pageNum);
    return `${url.origin}${url.pathname}${params.size ? `?${params}` : ''}`;
  }
  return `${url.origin}${url.pathname}`;
}

function redactCredentialLike(value) {
  const text = String(value ?? '');
  const match = CREDENTIAL_MARKER.exec(text);
  return match ? `${text.slice(0, match.index)}[redacted]` : text;
}

function jstTimestamp(timestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const value = Object.fromEntries(parts
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second} JST`;
}

function markdownValue(value) {
  if (isObject(value) && nonBlank(value.sha256)) {
    return `sha256:${value.sha256} preview:${redactCredentialLike(value.preview)}`;
  }
  if (Array.isArray(value)) return `sha256:${sha256(JSON.stringify(value))} count:${value.length}`;
  return redactCredentialLike(String(value ?? '').replace(/[\r\n|]/g, ' '));
}

export function renderAuditMarkdown(result) {
  const lines = [
    '# Koneko catalogue audit',
    '',
    `- Schema version: ${result.schemaVersion || '1.0'}`,
    `- Timestamp: ${jstTimestamp(result.timestamp)}`,
    `- Result: ${result.result}`,
    `- Exit code: ${result.exitCode}`,
    '- NO WRITE PERFORMED',
    '',
    '## Koneko account receipts',
    '',
  ];
  for (const account of result.accounts || []) {
    const statusCounts = account.statusCounts || {
      available: 0, reserved: 0, preparing: 0, sold: 0,
    };
    lines.push(`- ${account.accountId}: declared ${account.declaredTotal}, receipts ${account.receiptCount}; unique IDs ${account.uniqueIdCount ?? 0}; available ${statusCounts.available ?? 0}, reserved ${statusCounts.reserved ?? 0}, preparing ${statusCounts.preparing ?? 0}, sold ${statusCounts.sold ?? 0}; ambiguous ${account.ambiguousStatusCount ?? 0}; active ${account.activeCount ?? 0}`);
    for (const receipt of account.receipts || []) {
      lines.push(`  - ${receipt.rangeStart}-${receipt.rangeEnd}/${receipt.declaredTotal}: ${safeUrl(receipt.url)} (HTTP ${markdownValue(receipt.status)}, ${markdownValue(receipt.contentType)}, sha256:${markdownValue(receipt.sha256)})`);
    }
  }
  lines.push('', '## Active status receipts', '');
  if (!(result.activeStatusReceipts || []).length) lines.push('- None.');
  for (const receipt of result.activeStatusReceipts || []) {
    lines.push(`- Status receipt: ${markdownValue(receipt.accountId)} ${markdownValue(receipt.breederId)}; source=${markdownValue(receipt.sourceStatus)}; target=${markdownValue(receipt.targetStatus)}`);
  }
  const counts = result.fuluck?.renderedPageCounts || { ja: 0, en: 0, zh: 0 };
  lines.push(
    '',
    '## Fuluck receipts',
    '',
    `- Fuluck API records: ${result.fuluck?.apiRecordCount ?? 0}`,
    `- Fuluck rendered pages: ${counts.ja + counts.en + counts.zh} (ja: ${counts.ja}, en: ${counts.en}, zh: ${counts.zh})`,
  );
  for (const page of result.fuluck?.renderedPages || []) {
    const receipt = page.state === 'rendered_page_missing'
      ? 'state:rendered_page_missing'
      : `sha256:${markdownValue(page.sha256)}`;
    lines.push(`- Verified rendered page: ${markdownValue(page.breederId)} (${markdownValue(page.locale)}): ${safeUrl(page.url)} (${receipt})`);
  }
  for (const url of result.fuluck?.checkedUrls || []) lines.push(`- Checked URL: ${url}`);
  lines.push('', '## Findings', '');
  if (result.result === 'EXACT') lines.push('- None.');
  for (const block of result.blocks || []) lines.push(`- BLOCKED: ${markdownValue(block)}`);
  for (const item of result.diffs || []) {
    lines.push(`- ${item.type}: ${item.accountId || '-'} ${item.breederId || '-'} ${item.field || '-'}${item.locale ? ` (${item.locale})` : ''}; source=${markdownValue(item.source)}; target=${markdownValue(item.target)}${item.url ? `; url=${item.url}` : ''}`);
  }
  return `${lines.join('\n')}\n`;
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
  const parentPath = dirname(destination);
  const root = parse(parentPath).root;
  let current = root;
  for (const component of parentPath.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, component);
    const ancestor = existingEntry(current);
    if (!ancestor || ancestor.isSymbolicLink()) throw new Error('report destination is unsafe');
  }
  const parent = existingEntry(parentPath);
  if (!parent?.isDirectory()) throw new Error('report destination is unsafe');
  const entry = existingEntry(destination);
  if (entry && (!entry.isFile() || entry.isSymbolicLink())) {
    throw new Error('report destination is unsafe');
  }
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

export function blockedReceipt(message = 'Public catalogue evidence could not be completed.') {
  return {
    schemaVersion: '1.0',
    timestamp: new Date().toISOString(),
    result: 'BLOCKED',
    exitCode: 3,
    accounts: [],
    fuluck: {
      apiRecordCount: 0,
      renderedPageCounts: { ja: 0, en: 0, zh: 0 },
      checkedUrls: [],
    },
    activeStatusReceipts: [],
    diffs: [],
    blocks: [message],
    noWritePerformed: true,
  };
}

export function writeAuditReports({ jsonPath, markdownPath }, result) {
  const jsonDestination = validateDestination(jsonPath);
  const markdownDestination = validateDestination(markdownPath);
  if (jsonDestination === markdownDestination) throw new Error('report destinations must differ');
  atomicWrite(jsonDestination, `${JSON.stringify(result, null, 2)}\n`);
  atomicWrite(markdownDestination, renderAuditMarkdown(result));
}
