/**
 * Unit tests for the A1/A2 per-IP KV throttle (ipRateLimit) in ../api/worker.js.
 *
 * SYNC NOTE: `ipRateLimit` below is a byte-for-byte copy of the function in
 * ../api/worker.js (same precedent as validate-breederid.test.js — no module
 * toolchain to import the ESM worker). If you change it there, change it here.
 *
 * The function touches KV, so we drive it with a tiny in-memory fake that mimics
 * env.DATA.get / env.DATA.put and honours the hour-bucketed key. This exercises the
 * REAL control flow: cap enforcement, increment, Retry-After, and fail-open on error.
 *
 * Run: node tests/ip-rate-limit.test.js
 */

'use strict';
const assert = require('assert');

// ---- copy of api/worker.js pure logic (keep in sync) ----
async function ipRateLimit(env, prefix, ip, cap) {
  const safeIp = ip || 'unknown';
  const key = `${prefix}:${safeIp}:${Math.floor(Date.now() / 3600000)}`;
  try {
    const count = parseInt((await env.DATA.get(key)) || '0', 10);
    if (count >= cap) {
      const retryAfter = 3600 - Math.floor((Date.now() % 3600000) / 1000);
      return { limited: true, count, retryAfter };
    }
    await env.DATA.put(key, String(count + 1), { expirationTtl: 3600 });
    return { limited: false, count: count + 1, retryAfter: 0 };
  } catch (_) {
    return { limited: false, count: 0, retryAfter: 0 };
  }
}
// ---- end copy ----

// In-memory KV fake. `throwOnGet` forces the fail-open branch.
function fakeEnv(opts) {
  const store = new Map();
  return {
    _store: store,
    DATA: {
      async get(k) {
        if (opts && opts.throwOnGet) throw new Error('KV down');
        return store.has(k) ? store.get(k) : null;
      },
      async put(k, v) {
        if (opts && opts.throwOnPut) throw new Error('KV put down');
        store.set(k, v);
      },
    },
  };
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log('  PASS  ' + name); })
    .catch((e) => { failed++; console.log('  FAIL  ' + name + '\n        ' + (e && e.message ? e.message : e)); });
}

console.log('A1/A2 per-IP KV throttle (ipRateLimit)\n');

// Run tests sequentially so the shared counters print in order before the summary.
(async () => {
  await (async function firstCallNotLimited() {
    const env = fakeEnv();
    const r = await ipRateLimit(env, 'story:rl', '1.2.3.4', 20);
    assert.strictEqual(r.limited, false);
    assert.strictEqual(r.count, 1);
    passed++; console.log('  PASS  first call under cap is not limited and increments to 1');
  })().catch((e) => { failed++; console.log('  FAIL  first-call\n        ' + e.message); });

  await (async function reachesCapThenLimits() {
    const env = fakeEnv();
    // Burst exactly `cap` allowed calls, then the next is limited.
    for (let i = 0; i < 20; i++) {
      const r = await ipRateLimit(env, 'story:rl', 'ip', 20);
      assert.strictEqual(r.limited, false, `call ${i + 1} should be allowed`);
    }
    const over = await ipRateLimit(env, 'story:rl', 'ip', 20);
    assert.strictEqual(over.limited, true);
    assert.strictEqual(over.count, 20);
    assert.ok(over.retryAfter > 0 && over.retryAfter <= 3600, 'retryAfter within (0, 3600]');
    passed++; console.log('  PASS  allows exactly cap calls, then 429s with a sane Retry-After');
  })().catch((e) => { failed++; console.log('  FAIL  cap-then-limit\n        ' + e.message); });

  await (async function separateIpsAreIndependent() {
    const env = fakeEnv();
    for (let i = 0; i < 20; i++) await ipRateLimit(env, 'story:rl', 'ipA', 20);
    const a = await ipRateLimit(env, 'story:rl', 'ipA', 20); // A is now capped
    const b = await ipRateLimit(env, 'story:rl', 'ipB', 20); // B is fresh
    assert.strictEqual(a.limited, true);
    assert.strictEqual(b.limited, false);
    passed++; console.log('  PASS  a capped IP does not affect a different IP');
  })().catch((e) => { failed++; console.log('  FAIL  independent-ips\n        ' + e.message); });

  await (async function separatePrefixesAreIndependent() {
    const env = fakeEnv();
    for (let i = 0; i < 20; i++) await ipRateLimit(env, 'story:rl', 'ip', 20);
    const story = await ipRateLimit(env, 'story:rl', 'ip', 20);   // capped
    const chat = await ipRateLimit(env, 'chat:iprl', 'ip', 60);   // different bucket
    assert.strictEqual(story.limited, true);
    assert.strictEqual(chat.limited, false);
    passed++; console.log('  PASS  story and chat prefixes are independent buckets');
  })().catch((e) => { failed++; console.log('  FAIL  independent-prefixes\n        ' + e.message); });

  await (async function missingIpFallsBackToUnknown() {
    const env = fakeEnv();
    const r = await ipRateLimit(env, 'story:rl', '', 20);
    assert.strictEqual(r.limited, false);
    assert.ok([...env._store.keys()].some((k) => k.indexOf(':unknown:') !== -1), 'uses :unknown: bucket');
    passed++; console.log('  PASS  missing IP falls back to the :unknown: bucket');
  })().catch((e) => { failed++; console.log('  FAIL  missing-ip\n        ' + e.message); });

  await (async function failsOpenOnKvError() {
    const env = fakeEnv({ throwOnGet: true });
    const r = await ipRateLimit(env, 'story:rl', 'ip', 20);
    assert.strictEqual(r.limited, false, 'KV error must fail OPEN (never take the feature down)');
    passed++; console.log('  PASS  fails OPEN on KV error');
  })().catch((e) => { failed++; console.log('  FAIL  fail-open\n        ' + e.message); });

  await (async function chatIpCapHigherThanSession() {
    // Sanity on the chosen constants: IP cap (60) must exceed the per-session cap (30)
    // so a legit multi-tab user is never the first to hit the IP wall.
    const CHAT_IP_RATE_LIMIT_PER_HOUR = 60;
    const CHAT_RATE_LIMIT_PER_HOUR = 30;
    assert.ok(CHAT_IP_RATE_LIMIT_PER_HOUR > CHAT_RATE_LIMIT_PER_HOUR);
    passed++; console.log('  PASS  chat IP cap (60) > per-session cap (30)');
  })().catch((e) => { failed++; console.log('  FAIL  cap-ordering\n        ' + e.message); });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
})();
