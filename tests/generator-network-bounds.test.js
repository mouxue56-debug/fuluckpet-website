'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const test = require('node:test');

const diaryGenerator = require('../tools/generate-diary');

test('diary generator aborts a stalled API request instead of hanging the release job', async (t) => {
  const originalGet = https.get;
  t.after(() => { https.get = originalGet; });
  https.get = function () {
    const request = new EventEmitter();
    request.setTimeout = function (_milliseconds, onTimeout) {
      process.nextTick(onTimeout);
      return request;
    };
    request.destroy = function (error) {
      process.nextTick(() => request.emit('error', error || new Error('destroyed')));
      return request;
    };
    return request;
  };

  await assert.rejects(
    diaryGenerator.fetchJSON('/api/diary'),
    /timed out.*diary|diary.*timed out/i,
  );
});

test('diary generator has a wall-clock deadline even when the socket timeout never fires', async (t) => {
  const originalGet = https.get;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  t.after(() => {
    https.get = originalGet;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });

  https.get = function () {
    const request = new EventEmitter();
    request.setTimeout = function () { return request; };
    request.destroy = function (error) {
      process.nextTick(() => request.emit('error', error || new Error('destroyed')));
      return request;
    };
    return request;
  };
  global.setTimeout = function (callback, milliseconds) {
    if (milliseconds === 15000) {
      process.nextTick(callback);
      return { testDeadline: true };
    }
    return originalSetTimeout(callback, milliseconds);
  };
  global.clearTimeout = function (timer) {
    if (!timer || !timer.testDeadline) originalClearTimeout(timer);
  };

  const harnessDeadline = new Promise((_, reject) => {
    originalSetTimeout(() => reject(new Error('test harness deadline: generator remained pending')), 100);
  });
  await assert.rejects(
    Promise.race([diaryGenerator.fetchJSON('/api/diary'), harnessDeadline]),
    /timed out.*diary|diary.*timed out/i,
  );
});

test('diary generator rejects oversized JSON before buffering it into a release', async (t) => {
  const originalGet = https.get;
  t.after(() => { https.get = originalGet; });
  https.get = function (_url, callback) {
    const request = new EventEmitter();
    request.destroy = function () { return request; };
    const response = new EventEmitter();
    response.statusCode = 200;
    response.headers = {};
    response.setEncoding = function () {};
    process.nextTick(() => {
      callback(response);
      response.emit('data', 'x'.repeat(6 * 1024 * 1024));
      response.emit('end');
    });
    return request;
  };

  await assert.rejects(
    diaryGenerator.fetchJSON('/api/diary'),
    /response.*(?:large|bytes|limit)/i,
  );
});
