'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../.github/workflows/regenerate-site.yml'),
  'utf8',
);
const qualityWorkflow = fs.readFileSync(
  path.resolve(__dirname, '../.github/workflows/quality.yml'),
  'utf8',
);
const seoGeoWorkflowPath = path.resolve(
  __dirname,
  '../.github/workflows/seo-geo-quality.yml',
);
const seoGeoWorkflow = fs.existsSync(seoGeoWorkflowPath)
  ? fs.readFileSync(seoGeoWorkflowPath, 'utf8')
  : '';
const nodeVersion = fs.readFileSync(
  path.resolve(__dirname, '../.node-version'),
  'utf8',
).trim();

const CHECKOUT = 'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5';
const SETUP_NODE = 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020';
const UPLOAD = 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02';

function assertAppearsInOrder(source, needles) {
  let previousIndex = -1;

  for (const needle of needles) {
    const index = source.indexOf(needle, previousIndex + 1);
    assert.notEqual(index, -1, `missing workflow command: ${needle}`);
    assert.ok(index > previousIndex, `${needle} must follow the previous workflow gate`);
    previousIndex = index;
  }
}

function assertAuditReportsUseRunnerTemp(source) {
  assert.match(
    source,
    /node tools\/seo-geo-audit\.js\s*\\\s*\n\s+--json\s+"\$RUNNER_TEMP\/seo-geo-audit\/seo-geo-audit\.json"\s*\\\s*\n\s+--markdown\s+"\$RUNNER_TEMP\/seo-geo-audit\/seo-geo-audit\.md"/,
  );
}

function getIndent(line) {
  return line.length - line.trimStart().length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function yamlKeyPattern(name) {
  const escapedName = escapeRegExp(name);
  return `(?:${escapedName}|'${escapedName}'|"${escapedName}")`;
}

function getYamlMappingName(line) {
  const match = line.match(/^\s*(?:'([A-Za-z0-9_-]+)'|"([A-Za-z0-9_-]+)"|([A-Za-z0-9_-]+))\s*:/);
  return match ? (match[1] || match[2] || match[3]) : null;
}

function getYamlMappingValue(line, name) {
  const match = line.match(new RegExp(`^\\s*${yamlKeyPattern(name)}\\s*:\\s*(.*?)\\s*$`));
  assert.ok(match, `expected a ${name} mapping entry`);
  return match[1].replace(/\s+#.*$/, '').trim();
}

function getNamedStepBlock(source, stepName) {
  const lines = source.split('\n');
  const marker = `- name: ${stepName}`;
  const starts = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === marker) starts.push(index);
  }

  assert.equal(starts.length, 1, `expected exactly one ${stepName} step`);
  const start = starts[0];
  const stepIndent = getIndent(lines[start]);
  let end = start + 1;

  while (end < lines.length) {
    if (lines[end].trim() && getIndent(lines[end]) <= stepIndent) break;
    end += 1;
  }

  return lines.slice(start, end).join('\n').trimEnd();
}

function getStepMappingValues(stepBlock, name) {
  const lines = stepBlock.split('\n');
  const propertyIndent = getIndent(lines[0]) + 2;

  return lines
    .filter((line) => getIndent(line) === propertyIndent && getYamlMappingName(line) === name)
    .map((line) => getYamlMappingValue(line, name));
}

function getLiteralRunScript(stepBlock) {
  const lines = stepBlock.split('\n');
  const runIndexes = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s+run:\s*\|\s*$/.test(lines[index])) runIndexes.push(index);
  }

  assert.equal(runIndexes.length, 1, 'step must contain exactly one literal run block');
  const runIndex = runIndexes[0];
  const runIndent = getIndent(lines[runIndex]);
  const scriptLines = [];

  for (let index = runIndex + 1; index < lines.length; index += 1) {
    if (lines[index].trim() && getIndent(lines[index]) <= runIndent) break;
    scriptLines.push(lines[index]);
  }

  const contentIndents = scriptLines
    .filter((line) => line.trim())
    .map((line) => getIndent(line));
  assert.ok(contentIndents.length > 0, 'literal run block must not be empty');
  const contentIndent = Math.min(...contentIndents);
  assert.ok(contentIndent > runIndent, 'literal run block must be nested under run');

  return scriptLines
    .map((line) => (line.trim() ? line.slice(contentIndent) : ''))
    .join('\n')
    .trimEnd();
}

function getPermissionBlocks(source) {
  const lines = source.split('\n');
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (getYamlMappingName(lines[index]) !== 'permissions') continue;

    const indent = getIndent(lines[index]);
    const inline = getYamlMappingValue(lines[index], 'permissions');
    const entries = [];

    if (!inline) {
      for (let entryIndex = index + 1; entryIndex < lines.length; entryIndex += 1) {
        const line = lines[entryIndex];
        if (!line.trim()) continue;
        if (getIndent(line) <= indent) break;
        const name = getYamlMappingName(line);
        if (!name) continue;
        const value = getYamlMappingValue(line, name).replace(/^['"]|['"]$/g, '').toLowerCase();
        entries.push({ name, value });
      }
    }

    blocks.push({ indent, inline: inline.toLowerCase(), entries });
  }

  return blocks;
}

function assertReadOnlyPermissions(source) {
  const permissionBlocks = getPermissionBlocks(source);
  const globalPermissions = permissionBlocks.filter((block) => block.indent === 0);

  assert.equal(globalPermissions.length, 1, 'workflow must declare one global permissions block');
  assert.equal(globalPermissions[0].inline, '', 'global permissions must be an explicit map');
  assert.deepEqual(
    globalPermissions[0].entries,
    [{ name: 'contents', value: 'read' }],
    'global permissions must grant only contents: read',
  );

  for (const block of permissionBlocks) {
    assert.doesNotMatch(
      block.inline,
      /[&*]/,
      'inline permissions cannot use YAML anchors or aliases',
    );
    assert.doesNotMatch(block.inline, /\bwrite(?:-all)?\b/, 'inline permissions cannot write');
    for (const entry of block.entries) {
      assert.doesNotMatch(
        entry.value,
        /[&*]/,
        `${entry.name} permission cannot use YAML anchors or aliases`,
      );
      assert.notEqual(entry.value, 'write', `${entry.name} permission cannot write`);
      assert.notEqual(entry.value, 'write-all', `${entry.name} permission cannot write-all`);
    }
  }
}

function assertBlockingAuditStep(source) {
  const auditStep = getNamedStepBlock(source, 'Generate SEO GEO audit');
  assert.deepEqual(getStepMappingValues(auditStep, 'if'), [], 'the audit step cannot be conditional');
  assert.deepEqual(
    getStepMappingValues(auditStep, 'continue-on-error'),
    [],
    'the audit step cannot ignore its own failure',
  );

  const continuation = String.fromCharCode(92);
  assert.deepEqual(
    getLiteralRunScript(auditStep).split('\n'),
    [
      'mkdir -p "$RUNNER_TEMP/seo-geo-audit"',
      `node tools/seo-geo-audit.js ${continuation}`,
      `  --json "$RUNNER_TEMP/seo-geo-audit/seo-geo-audit.json" ${continuation}`,
      '  --markdown "$RUNNER_TEMP/seo-geo-audit/seo-geo-audit.md"',
    ],
    'the unmasked audit command must terminate the audit step',
  );
}

function assertAlwaysRunSteps(source) {
  const verifyStep = getNamedStepBlock(source, 'Verify generated output');
  assert.deepEqual(
    getStepMappingValues(verifyStep, 'if'),
    ['always()'],
    'generated verification must use exactly if: always()',
  );
  assert.deepEqual(
    getStepMappingValues(verifyStep, 'run'),
    ['node tools/verify-generated.js'],
  );

  const uploadStep = getNamedStepBlock(source, 'Upload SEO GEO audit');
  assert.deepEqual(
    getStepMappingValues(uploadStep, 'if'),
    ['always()'],
    'artifact upload must use exactly if: always()',
  );
  assert.deepEqual(getStepMappingValues(uploadStep, 'uses'), [UPLOAD]);
}

function assertSeoGeoWorkflowPolicy(source) {
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /cron:\s*['"]17 19 \* \* 0['"]/);
  assert.match(source, /push:/);
  assert.match(source, /pull_request:/);
  assertReadOnlyPermissions(source);
  assert.match(source, /timeout-minutes:\s*10/);
  assert.match(source, /node-version-file:\s*['"]?\.node-version['"]?/);
  assertBlockingAuditStep(source);
  assertAlwaysRunSteps(source);
  assert.doesNotMatch(
    source,
    /\bsecrets\b/i,
    'workflow cannot reference the secrets context',
  );
  assert.doesNotMatch(
    source,
    /git\s+push|\bdeploy\b|\bwrangler\b|cloudflare|indexnow|search\s+console|\bgsc\b/i,
  );

  assertAppearsInOrder(source, [
    'node --test tests/seo-geo-structured-data.test.js tests/seo-geo-content-contract.test.js tests/seo-geo-audit.test.js tests/workflow-integrity.test.js',
    'node tools/seo-geo-audit.js',
    'node tools/verify-generated.js',
    'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  ]);
}

function replaceExactlyOnce(source, before, after) {
  assert.equal(
    source.split(before).length - 1,
    1,
    `mutation target must occur exactly once: ${before}`,
  );
  return source.replace(before, after);
}

function assertPolicyRejectsMutation(label, mutatedSource) {
  assert.notEqual(mutatedSource, seoGeoWorkflow, `${label} must change the workflow source`);
  assert.throws(
    () => assertSeoGeoWorkflowPolicy(mutatedSource),
    assert.AssertionError,
    `${label} must be rejected by the SEO GEO workflow validator`,
  );
}

test('regeneration workflow runs the complete Node test suite before committing', () => {
  assert.equal(nodeVersion, '24');
  assert.match(workflow, /node-version-file:\s*['"]?\.node-version['"]?/);
  assert.match(workflow, /timeout-minutes:\s*\d+/);
  const testIndex = workflow.indexOf('node --test tests/*.test.js');
  const commitIndex = workflow.indexOf('Commit and push with retry');
  assert.notEqual(testIndex, -1, 'workflow must run Node tests');
  assert.ok(testIndex < commitIndex, 'tests must run before generated output is committed');
});

test('push and pull requests have a read-only quality gate on Node 24', () => {
  assert.match(qualityWorkflow, /push:/);
  assert.match(qualityWorkflow, /pull_request:/);
  assert.match(qualityWorkflow, /permissions:\s*\n\s+contents:\s*read/);
  assert.match(qualityWorkflow, /timeout-minutes:\s*\d+/);
  assert.match(qualityWorkflow, /node-version-file:\s*['"]?\.node-version['"]?/);
  assert.match(qualityWorkflow, /node --test tests\/\*\.test\.js/);
  assert.match(qualityWorkflow, /node tools\/verify-generated\.js/);
  assert.doesNotMatch(qualityWorkflow, /contents:\s*write/);
});

test('GitHub-maintained actions use the exact reviewed immutable SHAs', () => {
  const approvedActions = new Map([
    ['actions/checkout', CHECKOUT],
    ['actions/setup-node', SETUP_NODE],
    ['actions/upload-artifact', UPLOAD],
  ]);

  for (const source of [workflow, qualityWorkflow, seoGeoWorkflow]) {
    for (const match of source.matchAll(/actions\/(?:checkout|setup-node|upload-artifact)@[^\s]+/g)) {
      const action = match[0].slice(0, match[0].indexOf('@'));
      assert.equal(match[0], approvedActions.get(action));
    }

    assert.match(source, new RegExp(`${CHECKOUT.replace('/', '\\/')}\\s+#\\s+v4`));
    assert.match(source, new RegExp(`${SETUP_NODE.replace('/', '\\/')}\\s+#\\s+v4`));
  }
});

test('regeneration workflow keeps both generators and integrity verification before commit', () => {
  const siteIndex = workflow.indexOf('node tools/generate-site.js');
  const diaryIndex = workflow.indexOf('node tools/generate-diary.js');
  const verifyIndex = workflow.indexOf('node tools/verify-generated.js');
  const commitIndex = workflow.indexOf('Commit and push with retry');
  assert.ok(siteIndex >= 0 && diaryIndex > siteIndex);
  assert.ok(verifyIndex > diaryIndex && commitIndex > verifyIndex);
});

test('IndexNow submission uses the shared noindex-aware URL filter', () => {
  assert.match(workflow, /node tools\/indexnow-urls\.js/);
});

test('push-retry rebase reruns generators and every gate before retrying', () => {
  const rebaseIndex = workflow.indexOf('git pull --rebase origin main');
  assert.notEqual(rebaseIndex, -1);
  const retryTail = workflow.slice(rebaseIndex);
  assert.match(retryTail, /node tools\/generate-site\.js/);
  assert.match(retryTail, /node tools\/generate-diary\.js/);
  assert.match(retryTail, /node --test tests\/\*\.test\.js/);
  assert.match(retryTail, /node tools\/verify-generated\.js/);
  assert.match(retryTail, /git commit --amend --no-edit/);
});

test('quality workflow runs the SEO GEO audit after tests and before generated verification', () => {
  assertAppearsInOrder(qualityWorkflow, [
    'node --test tests/*.test.js',
    'node tools/seo-geo-audit.js',
    'node tools/verify-generated.js',
  ]);
});

test('regeneration workflow keeps audit reports outside git staging at both release gates', () => {
  const commitStepIndex = workflow.indexOf('- name: Commit and push with retry');
  assert.notEqual(commitStepIndex, -1);
  const firstGate = workflow.slice(0, commitStepIndex);
  assertAppearsInOrder(firstGate, [
    'node --test tests/*.test.js',
    'node tools/seo-geo-audit.js',
    'node tools/verify-generated.js',
  ]);
  assertAuditReportsUseRunnerTemp(firstGate);

  const rebaseIndex = workflow.indexOf('git pull --rebase origin main');
  const retryStageIndex = workflow.indexOf('git add -A', rebaseIndex);
  assert.notEqual(rebaseIndex, -1);
  assert.notEqual(retryStageIndex, -1);
  const retryGate = workflow.slice(rebaseIndex, retryStageIndex);
  assertAppearsInOrder(retryGate, [
    'node tools/generate-site.js',
    'node tools/generate-diary.js',
    'node --test tests/*.test.js',
    'node tools/seo-geo-audit.js',
    'node tools/verify-generated.js',
  ]);
  assertAuditReportsUseRunnerTemp(retryGate);

  assert.equal(
    workflow.match(/node tools\/seo-geo-audit\.js/g)?.length,
    2,
    'regeneration must audit exactly once before the first commit and once after each rebase',
  );
});

test('SEO GEO quality workflow is read-only, scheduled and produces an always-uploaded audit', () => {
  assertSeoGeoWorkflowPolicy(seoGeoWorkflow);
});

test('SEO GEO validator binds exact always() semantics to the upload step itself', async (t) => {
  const withoutUploadAlways = replaceExactlyOnce(
    seoGeoWorkflow,
    '      - name: Upload SEO GEO audit\n        if: always()\n',
    '      - name: Upload SEO GEO audit\n',
  );
  const withCompoundUploadIf = replaceExactlyOnce(
    seoGeoWorkflow,
    '      - name: Upload SEO GEO audit\n        if: always()\n',
    '      - name: Upload SEO GEO audit\n        if: always() && false\n',
  );

  for (const [label, mutatedSource] of [
    ['upload without its own always()', withoutUploadAlways],
    ['upload with always() && false', withCompoundUploadIf],
  ]) {
    await t.test(label, () => assertPolicyRejectsMutation(label, mutatedSource));
  }
});

test('SEO GEO validator rejects every audit failure bypass', async (t) => {
  const withContinueOnError = replaceExactlyOnce(
    seoGeoWorkflow,
    '      - name: Generate SEO GEO audit\n        run: |',
    '      - name: Generate SEO GEO audit\n        continue-on-error: true\n        run: |',
  );
  const withMaskedCommand = replaceExactlyOnce(
    seoGeoWorkflow,
    '            --markdown "$RUNNER_TEMP/seo-geo-audit/seo-geo-audit.md"',
    '            --markdown "$RUNNER_TEMP/seo-geo-audit/seo-geo-audit.md" || true',
  );
  const withAlways = replaceExactlyOnce(
    seoGeoWorkflow,
    '      - name: Generate SEO GEO audit\n        run: |',
    '      - name: Generate SEO GEO audit\n        if: always()\n        run: |',
  );
  const withSingleQuotedContinueOnError = replaceExactlyOnce(
    seoGeoWorkflow,
    '      - name: Generate SEO GEO audit\n        run: |',
    "      - name: Generate SEO GEO audit\n        'continue-on-error': true\n        run: |",
  );
  const withDoubleQuotedContinueOnError = replaceExactlyOnce(
    seoGeoWorkflow,
    '      - name: Generate SEO GEO audit\n        run: |',
    '      - name: Generate SEO GEO audit\n        "continue-on-error": true\n        run: |',
  );
  const withSingleQuotedIf = replaceExactlyOnce(
    seoGeoWorkflow,
    '      - name: Generate SEO GEO audit\n        run: |',
    "      - name: Generate SEO GEO audit\n        'if': always()\n        run: |",
  );
  const withDoubleQuotedIf = replaceExactlyOnce(
    seoGeoWorkflow,
    '      - name: Generate SEO GEO audit\n        run: |',
    '      - name: Generate SEO GEO audit\n        "if": always()\n        run: |',
  );

  for (const [label, mutatedSource] of [
    ['audit with continue-on-error', withContinueOnError],
    ['audit command with a masked exit status', withMaskedCommand],
    ['audit scheduled with always()', withAlways],
    ['audit with single-quoted continue-on-error', withSingleQuotedContinueOnError],
    ['audit with double-quoted continue-on-error', withDoubleQuotedContinueOnError],
    ['audit with single-quoted if', withSingleQuotedIf],
    ['audit with double-quoted if', withDoubleQuotedIf],
  ]) {
    await t.test(label, () => assertPolicyRejectsMutation(label, mutatedSource));
  }
});

test('SEO GEO validator rejects unsafe permissions and secrets context references', async (t) => {
  const withGlobalWriteAll = replaceExactlyOnce(
    seoGeoWorkflow,
    'permissions:\n  contents: read',
    'permissions: write-all',
  );
  const withJobWriteAll = replaceExactlyOnce(
    seoGeoWorkflow,
    '  audit:\n    runs-on: ubuntu-latest',
    '  audit:\n    permissions: write-all\n    runs-on: ubuntu-latest',
  );
  const withWriteValuedPermission = replaceExactlyOnce(
    seoGeoWorkflow,
    'permissions:\n  contents: read',
    'permissions:\n  contents: read\n  actions: write',
  );
  const withSingleQuotedJobPermissions = replaceExactlyOnce(
    seoGeoWorkflow,
    '  audit:\n    runs-on: ubuntu-latest',
    "  audit:\n    'permissions': write-all\n    runs-on: ubuntu-latest",
  );
  const withDoubleQuotedJobPermissions = replaceExactlyOnce(
    seoGeoWorkflow,
    '  audit:\n    runs-on: ubuntu-latest',
    '  audit:\n    "permissions": write-all\n    runs-on: ubuntu-latest',
  );
  const withPermissionAlias = replaceExactlyOnce(
    replaceExactlyOnce(
      seoGeoWorkflow,
      'permissions:\n  contents: read',
      'x-writer: &writer write-all\n\npermissions:\n  contents: read',
    ),
    '  audit:\n    runs-on: ubuntu-latest',
    '  audit:\n    permissions: *writer\n    runs-on: ubuntu-latest',
  );
  const withBareSecretsContext = replaceExactlyOnce(
    seoGeoWorkflow,
    '    runs-on: ubuntu-latest',
    '    runs-on: ubuntu-latest\n    env:\n      SECRETS_JSON: ${{ toJSON(secrets) }}',
  );
  const secretExpressions = [
    "${{ secrets['TOKEN'] }}",
    '${{ secrets["TOKEN"] }}',
  ];

  const mutations = [
    ['global permissions write-all', withGlobalWriteAll],
    ['job permissions write-all', withJobWriteAll],
    ['write-valued permission', withWriteValuedPermission],
    ['single-quoted job permissions write-all', withSingleQuotedJobPermissions],
    ['double-quoted job permissions write-all', withDoubleQuotedJobPermissions],
    ['job permissions alias to write-all anchor', withPermissionAlias],
    ['bare secrets context reference', withBareSecretsContext],
    ...secretExpressions.map((expression) => [
      `secret reference ${expression}`,
      replaceExactlyOnce(
        seoGeoWorkflow,
        '    runs-on: ubuntu-latest',
        `    runs-on: ubuntu-latest\n    env:\n      TOKEN: ${expression}`,
      ),
    ]),
  ];

  for (const [label, mutatedSource] of mutations) {
    await t.test(label, () => assertPolicyRejectsMutation(label, mutatedSource));
  }
});

test('manual regeneration cannot run from a non-main ref', () => {
  assert.match(workflow, /if:\s*github\.ref\s*==\s*'refs\/heads\/main'/);
});
