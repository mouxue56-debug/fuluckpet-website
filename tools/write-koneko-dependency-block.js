import {
  blockedReceipt,
  writeAuditReports,
} from './lib/koneko-audit-output.js';

const MESSAGE = 'Public catalogue audit blocked: stage=bootstrap; reason=dependency_install_failed';

function parseArguments(argv) {
  const options = {};
  const accepted = new Map([
    ['--json', 'jsonPath'],
    ['--markdown', 'markdownPath'],
  ]);
  let valid = true;
  for (let index = 0; index < argv.length; index += 1) {
    const name = accepted.get(argv[index]);
    const value = argv[index + 1];
    if (!name || typeof value !== 'string' || value === '' || value.startsWith('--')) {
      valid = false;
      continue;
    }
    index += 1;
    if (options[name] !== undefined) valid = false;
    else options[name] = value;
  }
  if (!options.jsonPath || !options.markdownPath) valid = false;
  return { options, valid };
}

function main() {
  const { options, valid } = parseArguments(process.argv.slice(2));
  if (!valid) {
    process.stderr.write('Koneko audit BLOCKED: valid report paths are required.\n');
    process.exitCode = 3;
    return;
  }
  try {
    writeAuditReports(options, blockedReceipt(MESSAGE));
  } catch {
    process.stderr.write('Koneko audit BLOCKED: reports could not be written safely.\n');
    process.exitCode = 3;
  }
}

main();
