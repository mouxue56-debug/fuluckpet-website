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
  assert.match(seoGeoWorkflow, /workflow_dispatch:/);
  assert.match(seoGeoWorkflow, /cron:\s*['"]17 19 \* \* 0['"]/);
  assert.match(seoGeoWorkflow, /push:/);
  assert.match(seoGeoWorkflow, /pull_request:/);
  assert.match(seoGeoWorkflow, /permissions:\s*\n\s+contents:\s*read/);
  assert.match(seoGeoWorkflow, /timeout-minutes:\s*10/);
  assert.match(seoGeoWorkflow, /node-version-file:\s*['"]?\.node-version['"]?/);
  assert.match(
    seoGeoWorkflow,
    /node tools\/seo-geo-audit\.js[\s\S]*--json[\s\S]*seo-geo-audit\.json[\s\S]*--markdown[\s\S]*seo-geo-audit\.md/,
  );
  assert.match(
    seoGeoWorkflow,
    /if:\s*always\(\)[\s\S]*actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02\s+#\s+v4\.6\.2/,
  );
  assert.doesNotMatch(
    seoGeoWorkflow,
    /contents:\s*write|pages:\s*write|id-token:\s*write|secrets\.|git\s+push|\bdeploy\b|\bwrangler\b|cloudflare|indexnow|search\s+console|\bgsc\b/i,
  );

  assertAppearsInOrder(seoGeoWorkflow, [
    'node --test tests/seo-geo-structured-data.test.js tests/seo-geo-content-contract.test.js tests/seo-geo-audit.test.js tests/workflow-integrity.test.js',
    'node tools/seo-geo-audit.js',
    'node tools/verify-generated.js',
    'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  ]);

  const auditStepIndex = seoGeoWorkflow.indexOf('- name: Generate SEO GEO audit');
  const verifyStepIndex = seoGeoWorkflow.indexOf('- name: Verify generated output');
  assert.notEqual(auditStepIndex, -1);
  assert.notEqual(verifyStepIndex, -1);
  assert.doesNotMatch(
    seoGeoWorkflow.slice(auditStepIndex, verifyStepIndex),
    /if:\s*always\(\)/,
    'the audit must block the workflow rather than being an always-run step',
  );
});

test('manual regeneration cannot run from a non-main ref', () => {
  assert.match(workflow, /if:\s*github\.ref\s*==\s*'refs\/heads\/main'/);
});
