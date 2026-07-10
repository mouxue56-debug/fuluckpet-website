'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const widget = fs.readFileSync(path.join(root, 'assets/chat/widget.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'api/worker.js'), 'utf8');

test('chat client enforces the same per-message limit as the Worker', () => {
  const workerLimit = worker.match(/const CHAT_MAX_INPUT_CHARS = (\d+);/);
  const clientLimit = widget.match(/maxlength:\s*'(\d+)'/);
  assert.ok(workerLimit, 'Worker input limit is missing');
  assert.ok(clientLimit, 'chat textarea maxlength is missing');
  assert.equal(clientLimit[1], workerLimit[1]);
});

test('chat client sends only the bounded conversation window', () => {
  assert.match(widget, /\.slice\(-20\)/);
});

test('chat client continues bounded forget batches until the server reports completion', () => {
  assert.match(widget, /function forgetServerBatch\s*\(/);
  assert.match(widget, /forget_cursor:\s*cursor/);
  assert.match(widget, /body\s*&&\s*body\.more[\s\S]*?forgetServerBatch\(sid,\s*attempt\s*\+\s*1,\s*body\.cursor\)/);
  assert.match(widget, /attempt\s*>=\s*60/);
});
