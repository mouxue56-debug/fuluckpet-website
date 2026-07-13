/* tests/calendar-lib.test.js — booking-calendar pure-logic unit tests. dev-only.
 * 運行：node --test tests/calendar-lib.test.js
 *
 * SYNC NOTE: the pure functions below (validateCalendarEvent / rangeOverlap /
 * icsEscape / buildIcs, plus the small helpers & constants they depend on) are a
 * byte-for-byte copy of the same functions in ../api/worker.js. This project has no
 * package.json / module toolchain, so importing the ESM worker from plain Node is not
 * set up; duplicating the pure logic here (with this note) is the smallest honest way
 * to unit-test it — same precedent as tests/validate-breederid.test.js. If you change
 * the logic in worker.js, change it here too.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// ---- copy of api/worker.js pure logic (keep in sync) ----
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// SYNC NOTE: byte-for-byte copy of isRealDate in ../api/worker.js — change both together.
function isRealDate(s) {
  if (!DATE_RE.test(s)) return false;
  const p = s.split('-'), y = +p[0], m = +p[1], d = +p[2];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const CAL_EVENT_TYPES = ['visit', 'boarding', 'care', 'block', 'note'];
const CAL_STATUSES = ['pending', 'confirmed', 'done', 'cancelled'];
const CAL_PET_TYPES = ['cat', 'rabbit', 'hamster', 'other_small_animal', 'dog_small', 'dog_medium', 'dog_large'];
const CAL_SOURCES = ['booking-form', 'admin', 'ai'];
const CAL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateCalendarEvent(body, { partial = false } = {}) {
  const errors = [];
  const data = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Invalid JSON body'], data };
  }
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  // type — required on create; enum-checked whenever present.
  if (has('type') || !partial) {
    const type = typeof body.type === 'string' ? body.type.trim() : '';
    if (!CAL_EVENT_TYPES.includes(type)) {
      errors.push(`type must be one of [${CAL_EVENT_TYPES.join(', ')}]`);
    }
    data.type = type;
  }

  // title — required on create; ≤120 chars.
  if (has('title') || !partial) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 120) errors.push('title (1-120 chars) required');
    data.title = title;
  }

  // start / end — YYYY-MM-DD; end≥start (end inclusive). On create both required;
  // in partial mode each is validated only when present, but if either is present we
  // still enforce end≥start against whichever we have (caller merges the other).
  if (has('start') || !partial) {
    const start = typeof body.start === 'string' ? body.start.trim() : '';
    if (!isRealDate(start)) errors.push('start (YYYY-MM-DD) required');
    data.start = start;
  }
  if (has('end') || !partial) {
    const end = typeof body.end === 'string' ? body.end.trim() : '';
    if (!isRealDate(end)) errors.push('end (YYYY-MM-DD) required');
    data.end = end;
  }
  // end≥start check when both are valid dates in this payload.
  if (
    typeof data.start === 'string' && isRealDate(data.start) &&
    typeof data.end === 'string' && isRealDate(data.end) &&
    data.end < data.start
  ) {
    errors.push('end must be >= start');
  }

  // time — optional HH:MM.
  if (has('time')) {
    const time = typeof body.time === 'string' ? body.time.trim() : '';
    if (time && !CAL_TIME_RE.test(time)) errors.push('time must be HH:MM');
    data.time = time;
  }

  // petType — optional enum.
  if (has('petType')) {
    const petType = typeof body.petType === 'string' ? body.petType.trim() : '';
    if (petType && !CAL_PET_TYPES.includes(petType)) {
      errors.push(`petType must be one of [${CAL_PET_TYPES.join(', ')}]`);
    }
    data.petType = petType;
  }

  // status — optional enum; default pending (block/note default confirmed) on create.
  if (has('status')) {
    const status = typeof body.status === 'string' ? body.status.trim() : '';
    if (status && !CAL_STATUSES.includes(status)) {
      errors.push(`status must be one of [${CAL_STATUSES.join(', ')}]`);
    }
    data.status = status;
  } else if (!partial) {
    data.status = (data.type === 'block' || data.type === 'note') ? 'confirmed' : 'pending';
  }

  // notes — optional, ≤2000 chars.
  if (has('notes')) {
    const notes = typeof body.notes === 'string' ? body.notes : '';
    if (notes.length > 2000) errors.push('notes exceeds 2000 chars');
    data.notes = notes.trim();
  }

  // source — optional enum.
  if (has('source')) {
    const source = typeof body.source === 'string' ? body.source.trim() : '';
    if (source && !CAL_SOURCES.includes(source)) {
      errors.push(`source must be one of [${CAL_SOURCES.join(', ')}]`);
    }
    data.source = source;
  }

  // updatedBy — optional, ≤40 chars; default 'admin' handled by caller.
  if (has('updatedBy')) {
    const updatedBy = typeof body.updatedBy === 'string' ? body.updatedBy.trim().slice(0, 40) : '';
    data.updatedBy = updatedBy;
  }

  return { errors, data };
}

// Inclusive date-range overlap: does [evStart, evEnd] intersect [from, to]?
// All args are YYYY-MM-DD strings (lexical compare == chronological). Endpoints
// count as overlap: an event ending exactly on `from`, or starting exactly on `to`,
// still overlaps. `from`/`to` may be falsy (open-ended) — a missing bound never excludes.
function rangeOverlap(evStart, evEnd, from, to) {
  if (from && evEnd < from) return false;
  if (to && evStart > to) return false;
  return true;
}

// Escape a text value for an iCal (RFC 5545) property. Order matters: backslash
// first, then the structural chars, then newlines → literal \n.
function icsEscape(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// Zero-pad a number to `len` digits.
function calPad(n, len = 2) {
  return String(n).padStart(len, '0');
}

// YYYYMMDD from a YYYY-MM-DD string (drop the hyphens).
function calDateCompact(ymd) {
  return String(ymd).replace(/-/g, '');
}

// end+1 day (iCal all-day DTEND is exclusive). Input/return YYYY-MM-DD → YYYYMMDD.
function calDatePlusOneCompact(ymd) {
  const [y, m, d] = String(ymd).split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}${calPad(dt.getUTCMonth() + 1)}${calPad(dt.getUTCDate())}`;
}

// A timed JST visit → UTC basic-format timestamp (YYYYMMDDTHHMMSSZ), shifting -9h.
// Handles day/month rollback (e.g. 08:00 JST → previous-day 23:00:00Z).
function calJstToUtcStamp(ymd, hhmm) {
  const [y, m, d] = String(ymd).split('-').map((x) => parseInt(x, 10));
  const [hh, mm] = String(hhmm).split(':').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, hh - 9, mm, 0));
  return (
    `${dt.getUTCFullYear()}${calPad(dt.getUTCMonth() + 1)}${calPad(dt.getUTCDate())}` +
    `T${calPad(dt.getUTCHours())}${calPad(dt.getUTCMinutes())}${calPad(dt.getUTCSeconds())}Z`
  );
}

// SUMMARY type prefix per spec.
const CAL_TYPE_PREFIX = {
  visit: '【見学】',
  boarding: '【お預かり】',
  care: '【基本ケア】',
  block: '【休業】',
  note: '【メモ】',
};

// Build a full iCalendar (VCALENDAR) document string from events. CRLF line endings
// (RFC 5545). All-day events (boarding/block/note, and visits without a time) use
// DATE values with an exclusive DTEND = end+1day. Timed visits become 1h UTC events
// (JST−9h). Cancelled events carry STATUS:CANCELLED. `nowStamp` overridable for tests.
function buildIcs(events, nowStamp) {
  const dtstamp = nowStamp || (() => {
    const n = new Date();
    return (
      `${n.getUTCFullYear()}${calPad(n.getUTCMonth() + 1)}${calPad(n.getUTCDate())}` +
      `T${calPad(n.getUTCHours())}${calPad(n.getUTCMinutes())}${calPad(n.getUTCSeconds())}Z`
    );
  })();

  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//fuluckpet//calendar//JA',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
  ];

  for (const ev of (Array.isArray(events) ? events : [])) {
    if (!ev || typeof ev !== 'object') continue;
    const prefix = CAL_TYPE_PREFIX[ev.type] || '';
    const summary = icsEscape(prefix + (ev.title || ''));
    const uid = `${ev.id}@fuluckpet`;
    const isTimedVisit = ev.type === 'visit' && typeof ev.time === 'string' && CAL_TIME_RE.test(ev.time);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (isTimedVisit) {
      const startStamp = calJstToUtcStamp(ev.start, ev.time);
      // 1h duration.
      const [y, m, d] = String(ev.start).split('-').map((x) => parseInt(x, 10));
      const [hh, mm] = String(ev.time).split(':').map((x) => parseInt(x, 10));
      const endDt = new Date(Date.UTC(y, m - 1, d, hh - 9 + 1, mm, 0));
      const endStamp =
        `${endDt.getUTCFullYear()}${calPad(endDt.getUTCMonth() + 1)}${calPad(endDt.getUTCDate())}` +
        `T${calPad(endDt.getUTCHours())}${calPad(endDt.getUTCMinutes())}${calPad(endDt.getUTCSeconds())}Z`;
      lines.push(`DTSTART:${startStamp}`);
      lines.push(`DTEND:${endStamp}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${calDateCompact(ev.start)}`);
      lines.push(`DTEND;VALUE=DATE:${calDatePlusOneCompact(ev.end || ev.start)}`);
    }
    lines.push(`SUMMARY:${summary}`);
    if (ev.notes) lines.push(`DESCRIPTION:${icsEscape(ev.notes)}`);
    if (ev.status === 'cancelled') lines.push('STATUS:CANCELLED');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
// ---- end copy ----

// ── validateCalendarEvent: valid create ──
test('valid create — full event passes, unknown fields absent from data', () => {
  const { errors, data } = validateCalendarEvent({
    type: 'boarding',
    title: 'うさぎ お預かり',
    start: '2026-08-10',
    end: '2026-08-12',
    petType: 'rabbit',
    status: 'confirmed',
    notes: 'ワクチン済',
    source: 'admin',
    updatedBy: 'laura',
  }, { partial: false });
  assert.deepEqual(errors, []);
  assert.equal(data.type, 'boarding');
  assert.equal(data.title, 'うさぎ お預かり');
  assert.equal(data.start, '2026-08-10');
  assert.equal(data.end, '2026-08-12');
  assert.equal(data.petType, 'rabbit');
  assert.equal(data.status, 'confirmed');
});

test('valid create — block/note default status = confirmed; visit defaults pending', () => {
  const block = validateCalendarEvent({ type: 'block', title: '休業', start: '2026-01-01', end: '2026-01-03' });
  assert.deepEqual(block.errors, []);
  assert.equal(block.data.status, 'confirmed');
  const note = validateCalendarEvent({ type: 'note', title: 'メモ', start: '2026-01-01', end: '2026-01-01' });
  assert.equal(note.data.status, 'confirmed');
  const visit = validateCalendarEvent({ type: 'visit', title: '見学', start: '2026-01-01', end: '2026-01-01' });
  assert.equal(visit.data.status, 'pending');
});

// ── enum rejections ──
test('rejects bad type enum', () => {
  const { errors } = validateCalendarEvent({ type: 'party', title: 'x', start: '2026-01-01', end: '2026-01-01' });
  assert.ok(errors.some((e) => e.startsWith('type must be one of')));
});

test('rejects bad status enum', () => {
  const { errors } = validateCalendarEvent({ type: 'visit', title: 'x', start: '2026-01-01', end: '2026-01-01', status: 'maybe' });
  assert.ok(errors.some((e) => e.startsWith('status must be one of')));
});

test('calendar accepts licensed boarding types and rejects legacy dog writes', () => {
  for (const petType of ['cat', 'rabbit', 'hamster', 'other_small_animal']) {
    const { errors } = validateCalendarEvent({ type: 'boarding', title: 'x', start: '2026-01-01', end: '2026-01-01', petType });
    assert.deepEqual(errors, [], petType);
  }
  for (const petType of ['small_dog', 'medium_dog', 'large_dog']) {
    const { errors } = validateCalendarEvent({ type: 'boarding', title: 'x', start: '2026-01-01', end: '2026-01-01', petType });
    assert.ok(errors.some((e) => e.startsWith('petType must be one of')), petType);
  }
});

test('rejects bad source enum', () => {
  const { errors } = validateCalendarEvent({ type: 'visit', title: 'x', start: '2026-01-01', end: '2026-01-01', source: 'sms' });
  assert.ok(errors.some((e) => e.startsWith('source must be one of')));
});

test('rejects bad time format', () => {
  const { errors } = validateCalendarEvent({ type: 'visit', title: 'x', start: '2026-01-01', end: '2026-01-01', time: '2pm' });
  assert.ok(errors.some((e) => e === 'time must be HH:MM'));
});

test('rejects invalid start/end date format', () => {
  const { errors } = validateCalendarEvent({ type: 'visit', title: 'x', start: '2026/01/01', end: 'nope' });
  assert.ok(errors.some((e) => e.startsWith('start')));
  assert.ok(errors.some((e) => e.startsWith('end')));
});

// ── isRealDate: format passes but the day/month is impossible ──
test('isRealDate — rejects impossible dates, accepts real ones', () => {
  assert.equal(isRealDate('2026-02-30'), false); // Feb 30 → rolls to March
  assert.equal(isRealDate('2026-13-01'), false); // month 13
  assert.equal(isRealDate('2026-00-15'), false); // month 0
  assert.equal(isRealDate('2026-02-28'), true);
  assert.equal(isRealDate('2026-12-31'), true);
});

test('validateCalendarEvent — rejects impossible start/end dates', () => {
  const bad = validateCalendarEvent({ type: 'visit', title: 'x', start: '2026-02-30', end: '2026-13-01' });
  assert.ok(bad.errors.some((e) => e.startsWith('start')));
  assert.ok(bad.errors.some((e) => e.startsWith('end')));
  const good = validateCalendarEvent({ type: 'visit', title: 'x', start: '2026-02-28', end: '2026-12-31' });
  assert.deepEqual(good.errors, []);
});

// ── CAL_TIME_RE: real clock times only ──
test('time — rejects out-of-range clock values, accepts valid HH:MM', () => {
  for (const t of ['29:99', '24:00', '12:60']) {
    const { errors } = validateCalendarEvent({ type: 'visit', title: 'x', start: '2026-01-01', end: '2026-01-01', time: t });
    assert.ok(errors.some((e) => e === 'time must be HH:MM'), `expected reject for ${t}`);
  }
  for (const t of ['00:00', '23:59', '09:30']) {
    const { errors } = validateCalendarEvent({ type: 'visit', title: 'x', start: '2026-01-01', end: '2026-01-01', time: t });
    assert.deepEqual(errors, [], `expected accept for ${t}`);
  }
});

test('rejects missing/too-long title', () => {
  const missing = validateCalendarEvent({ type: 'visit', title: '', start: '2026-01-01', end: '2026-01-01' });
  assert.ok(missing.errors.some((e) => e.startsWith('title')));
  const long = validateCalendarEvent({ type: 'visit', title: 'x'.repeat(121), start: '2026-01-01', end: '2026-01-01' });
  assert.ok(long.errors.some((e) => e.startsWith('title')));
});

test('rejects notes over 2000 chars', () => {
  const { errors } = validateCalendarEvent({ type: 'note', title: 'x', start: '2026-01-01', end: '2026-01-01', notes: 'a'.repeat(2001) });
  assert.ok(errors.some((e) => e === 'notes exceeds 2000 chars'));
});

// ── end < start ──
test('rejects end before start', () => {
  const { errors } = validateCalendarEvent({ type: 'boarding', title: 'x', start: '2026-08-10', end: '2026-08-09' });
  assert.ok(errors.some((e) => e === 'end must be >= start'));
});

test('accepts end == start (single day)', () => {
  const { errors } = validateCalendarEvent({ type: 'visit', title: 'x', start: '2026-08-10', end: '2026-08-10' });
  assert.deepEqual(errors, []);
});

// ── unknown-field stripping ──
test('strips unknown fields from data', () => {
  const { errors, data } = validateCalendarEvent({
    type: 'visit', title: 'x', start: '2026-01-01', end: '2026-01-01',
    evil: 'DROP TABLE', id: 'evt_hacked', createdAt: '1999', rev: 42, __proto__polluted: true,
  });
  assert.deepEqual(errors, []);
  assert.equal(data.evil, undefined);
  assert.equal(data.id, undefined);
  assert.equal(data.createdAt, undefined);
  assert.equal(data.rev, undefined);
  // Only modelled keys survive.
  const allowed = new Set(['type', 'title', 'start', 'end', 'time', 'petType', 'status', 'notes', 'source', 'updatedBy']);
  for (const k of Object.keys(data)) assert.ok(allowed.has(k), `unexpected key leaked: ${k}`);
});

// ── partial update mode ──
test('partial mode — only supplied fields validated & copied', () => {
  const { errors, data } = validateCalendarEvent({ status: 'done' }, { partial: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(data, { status: 'done' });
  // No type/title/start/end required in partial mode.
  assert.equal(data.type, undefined);
  assert.equal(data.title, undefined);
});

test('partial mode — still enforces enums on supplied fields', () => {
  const { errors } = validateCalendarEvent({ status: 'bogus' }, { partial: true });
  assert.ok(errors.some((e) => e.startsWith('status must be one of')));
});

test('partial mode — still enforces end>=start when both supplied', () => {
  const { errors } = validateCalendarEvent({ start: '2026-08-10', end: '2026-08-01' }, { partial: true });
  assert.ok(errors.some((e) => e === 'end must be >= start'));
});

// ── rangeOverlap edge cases ──
test('rangeOverlap — event ending exactly on `from` counts as overlap', () => {
  assert.equal(rangeOverlap('2026-08-01', '2026-08-10', '2026-08-10', '2026-08-20'), true);
});

test('rangeOverlap — event starting exactly on `to` counts as overlap', () => {
  assert.equal(rangeOverlap('2026-08-20', '2026-08-25', '2026-08-10', '2026-08-20'), true);
});

test('rangeOverlap — event entirely before window does not overlap', () => {
  assert.equal(rangeOverlap('2026-07-01', '2026-07-05', '2026-08-10', '2026-08-20'), false);
});

test('rangeOverlap — event entirely after window does not overlap', () => {
  assert.equal(rangeOverlap('2026-09-01', '2026-09-05', '2026-08-10', '2026-08-20'), false);
});

test('rangeOverlap — open-ended bounds never exclude', () => {
  assert.equal(rangeOverlap('2026-01-01', '2026-01-01', '', ''), true);
  assert.equal(rangeOverlap('2026-01-01', '2026-01-01', '', '2026-08-01'), true);
  assert.equal(rangeOverlap('2026-12-01', '2026-12-01', '2026-08-01', ''), true);
});

// ── icsEscape ──
test('icsEscape — comma, semicolon, newline, backslash', () => {
  assert.equal(icsEscape('a,b'), 'a\\,b');
  assert.equal(icsEscape('a;b'), 'a\\;b');
  assert.equal(icsEscape('a\nb'), 'a\\nb');
  assert.equal(icsEscape('a\r\nb'), 'a\\nb');
  assert.equal(icsEscape('a\\b'), 'a\\\\b');
  // combined + order: backslash escaped before structural chars.
  assert.equal(icsEscape('x, y; z\nw'), 'x\\, y\\; z\\nw');
});

// ── buildIcs ──
const STAMP = '20260101T000000Z';

test('buildIcs — VCALENDAR header per spec', () => {
  const ics = buildIcs([], STAMP);
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.ok(ics.includes('PRODID:-//fuluckpet//calendar//JA'));
  assert.ok(ics.includes('VERSION:2.0'));
  assert.ok(ics.includes('CALSCALE:GREGORIAN'));
  assert.ok(ics.includes('END:VCALENDAR'));
});

test('buildIcs — all-day event DTEND = end+1 (exclusive)', () => {
  const ics = buildIcs([{ id: 'evt_a', type: 'boarding', title: 'ポチ', start: '2026-08-10', end: '2026-08-12', status: 'confirmed' }], STAMP);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260810'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20260813')); // 12 + 1
  assert.ok(ics.includes('SUMMARY:【お預かり】ポチ'));
  assert.ok(ics.includes('UID:evt_a@fuluckpet'));
  assert.ok(ics.includes('DTSTAMP:' + STAMP));
});

test('buildIcs — single-day all-day (end omitted) DTEND = start+1', () => {
  const ics = buildIcs([{ id: 'evt_b', type: 'block', title: '休業', start: '2026-12-31' }], STAMP);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261231'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20270101')); // month+year rollover
});

test('buildIcs — timed 14:00 JST visit → 050000Z, 1h duration', () => {
  const ics = buildIcs([{ id: 'evt_c', type: 'visit', title: '見学', start: '2026-08-10', end: '2026-08-10', time: '14:00', status: 'pending' }], STAMP);
  assert.ok(ics.includes('DTSTART:20260810T050000Z'), ics); // 14 - 9 = 05
  assert.ok(ics.includes('DTEND:20260810T060000Z'), ics);   // +1h
  assert.ok(ics.includes('SUMMARY:【見学】見学'));
});

test('buildIcs — early JST time rolls back to previous UTC day', () => {
  const ics = buildIcs([{ id: 'evt_d', type: 'visit', title: '朝', start: '2026-08-10', end: '2026-08-10', time: '08:00' }], STAMP);
  assert.ok(ics.includes('DTSTART:20260809T230000Z'), ics); // 08:00 JST → 23:00Z prev day
});

test('buildIcs — cancelled event emits STATUS:CANCELLED', () => {
  const ics = buildIcs([{ id: 'evt_e', type: 'visit', title: 'x', start: '2026-08-10', end: '2026-08-10', status: 'cancelled' }], STAMP);
  assert.ok(ics.includes('STATUS:CANCELLED'));
});

test('buildIcs — non-cancelled event has no STATUS line', () => {
  const ics = buildIcs([{ id: 'evt_f', type: 'visit', title: 'x', start: '2026-08-10', end: '2026-08-10', status: 'confirmed' }], STAMP);
  assert.ok(!ics.includes('STATUS:'));
});

test('buildIcs — CRLF line endings throughout', () => {
  const ics = buildIcs([{ id: 'evt_g', type: 'note', title: 'メモ', start: '2026-08-10', end: '2026-08-10' }], STAMP);
  // Every logical line boundary is CRLF; no bare LF.
  assert.ok(ics.includes('\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'found a bare LF not preceded by CR');
  assert.ok(ics.endsWith('\r\n'));
});

test('buildIcs — DESCRIPTION carries escaped notes', () => {
  const ics = buildIcs([{ id: 'evt_h', type: 'visit', title: 'x', start: '2026-08-10', end: '2026-08-10', notes: 'a,b;c' }], STAMP);
  assert.ok(ics.includes('DESCRIPTION:a\\,b\\;c'));
});
