'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '../booking.html'), 'utf8');

test('booking client reuses one deterministic retry token for unchanged form data', () => {
  assert.match(source, /function createSubmissionId\s*\(/);
  assert.match(source, /function submissionIdForPayload\s*\(/);
  assert.match(source, /pendingSubmission\.fingerprint === fingerprint/);
  assert.match(source, /payload\.submission_id\s*=\s*submissionIdForPayload\(payload\)/);
});

test('booking token carries reverse timestamp ordering and 128 bits of random hex', () => {
  assert.match(source, /Number\.MAX_SAFE_INTEGER\s*-\s*Date\.now\(\)/);
  assert.match(source, /new Uint8Array\(16\)/);
  assert.match(source, /padStart\(16,\s*'0'\)/);
});

test('successful booking clears the pending retry token', () => {
  assert.match(source, /if \(r\.status === 200 && r\.body && r\.body\.ok\)[\s\S]*?pendingSubmission = null;/);
});
