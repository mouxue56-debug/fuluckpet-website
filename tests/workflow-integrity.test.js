'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../.github/workflows/regenerate-site.yml'),
  'utf8',
);

test('regeneration workflow runs the complete Node test suite before committing', () => {
  assert.match(workflow, /node-version:\s*['"]25['"]/);
  const testIndex = workflow.indexOf('node --test tests/*.test.js');
  const commitIndex = workflow.indexOf('Commit and push with retry');
  assert.notEqual(testIndex, -1, 'workflow must run Node tests');
  assert.ok(testIndex < commitIndex, 'tests must run before generated output is committed');
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

test('manual regeneration cannot run from a non-main ref', () => {
  assert.match(workflow, /if:\s*github\.ref\s*==\s*'refs\/heads\/main'/);
});
