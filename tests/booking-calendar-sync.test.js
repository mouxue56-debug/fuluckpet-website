/* tests/booking-calendar-sync.test.js — booking↔calendar status-sync pure-logic
 * unit tests. dev-only.
 * 運行：node --test tests/booking-calendar-sync.test.js
 *
 * SYNC NOTE: bookingStatusToEventStatus / applyBookingCalendarSync below are a
 * byte-for-byte copy of the same functions in ../api/worker.js. This project has no
 * package.json / module toolchain, so importing the ESM worker from plain Node is not
 * set up; duplicating the pure logic here (with this note) is the smallest honest way
 * to unit-test it — same precedent as tests/calendar-lib.test.js. If you change the
 * logic in worker.js, change it here too. The KV-touching wrapper syncCalendarFromBooking
 * stays thin (mutateCalendar + applyBookingCalendarSync) and is NOT copied.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// ---- copy of api/worker.js pure logic (keep in sync) ----

// Map a booking status → the calendar-event status it should drive, or null for
// "no sync". Pure. 'contacted' → 'confirmed' (the visit is on), 'archived' → 'done'
// (visit happened / closed out); every other booking status (including 'new') is a
// no-op so we never clobber an event an admin is still editing. Exported for tests.
function bookingStatusToEventStatus(bookingStatus) {
  switch (bookingStatus) {
    case 'contacted': return 'confirmed';
    case 'archived': return 'done';
    default: return null;
  }
}

// Pure core of the booking→calendar status sync: given an events array, stamp the
// new status onto every event that (a) was spawned from this booking (.bookingId ===
// bookingId) and (b) isn't already cancelled — a cancelled event stays cancelled and
// is never revived by a booking status change. Mutates matched events in place and
// returns how many were touched (0 = no-op). `nowIso` overridable for tests.
function applyBookingCalendarSync(events, bookingId, eventStatus, nowIso) {
  if (!Array.isArray(events) || !bookingId) return 0;
  const stamp = nowIso || new Date().toISOString();
  let touched = 0;
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    if (ev.bookingId !== bookingId) continue;
    if (ev.status === 'cancelled') continue;
    ev.status = eventStatus;
    ev.updatedAt = stamp;
    ev.updatedBy = 'booking-sync';
    touched++;
  }
  return touched;
}
// ---- end copy ----

const STAMP = '2026-07-07T00:00:00.000Z';

// ── bookingStatusToEventStatus: all branches ──
test('bookingStatusToEventStatus — contacted → confirmed', () => {
  assert.equal(bookingStatusToEventStatus('contacted'), 'confirmed');
});

test('bookingStatusToEventStatus — archived → done', () => {
  assert.equal(bookingStatusToEventStatus('archived'), 'done');
});

test('bookingStatusToEventStatus — new / unknown / falsy → null (no sync)', () => {
  assert.equal(bookingStatusToEventStatus('new'), null);
  assert.equal(bookingStatusToEventStatus('bogus'), null);
  assert.equal(bookingStatusToEventStatus(''), null);
  assert.equal(bookingStatusToEventStatus(undefined), null);
  assert.equal(bookingStatusToEventStatus(null), null);
  // guard against a status name colliding with an event status
  assert.equal(bookingStatusToEventStatus('confirmed'), null);
  assert.equal(bookingStatusToEventStatus('done'), null);
});

// ── applyBookingCalendarSync: matching & mutation ──
test('applyBookingCalendarSync — stamps status/updatedAt/updatedBy on the linked event', () => {
  const events = [
    { id: 'evt_1', type: 'visit', status: 'pending', bookingId: 'bk_a', updatedBy: 'booking-form', updatedAt: 'old' },
  ];
  const touched = applyBookingCalendarSync(events, 'bk_a', 'confirmed', STAMP);
  assert.equal(touched, 1);
  assert.equal(events[0].status, 'confirmed');
  assert.equal(events[0].updatedAt, STAMP);
  assert.equal(events[0].updatedBy, 'booking-sync');
});

test('applyBookingCalendarSync — matches every event sharing the bookingId', () => {
  const events = [
    { id: 'evt_1', status: 'pending', bookingId: 'bk_a' },
    { id: 'evt_2', status: 'confirmed', bookingId: 'bk_a' },
    { id: 'evt_3', status: 'pending', bookingId: 'bk_b' }, // different booking
  ];
  const touched = applyBookingCalendarSync(events, 'bk_a', 'done', STAMP);
  assert.equal(touched, 2);
  assert.equal(events[0].status, 'done');
  assert.equal(events[1].status, 'done');
  assert.equal(events[2].status, 'pending'); // untouched
});

test('applyBookingCalendarSync — cancelled events are never revived', () => {
  const events = [
    { id: 'evt_1', status: 'cancelled', bookingId: 'bk_a', updatedBy: 'admin', updatedAt: 'old' },
  ];
  const touched = applyBookingCalendarSync(events, 'bk_a', 'confirmed', STAMP);
  assert.equal(touched, 0);
  assert.equal(events[0].status, 'cancelled'); // unchanged
  assert.equal(events[0].updatedAt, 'old');
  assert.equal(events[0].updatedBy, 'admin');
});

test('applyBookingCalendarSync — cancel path skips an already-cancelled event but hits live ones', () => {
  const events = [
    { id: 'evt_1', status: 'cancelled', bookingId: 'bk_a' },
    { id: 'evt_2', status: 'confirmed', bookingId: 'bk_a' },
  ];
  const touched = applyBookingCalendarSync(events, 'bk_a', 'cancelled', STAMP);
  assert.equal(touched, 1);
  assert.equal(events[0].status, 'cancelled');
  assert.equal(events[1].status, 'cancelled');
});

// ── applyBookingCalendarSync: no-op / guard cases ──
test('applyBookingCalendarSync — no matching bookingId is a no-op returning 0', () => {
  const events = [{ id: 'evt_1', status: 'pending', bookingId: 'bk_x' }];
  const touched = applyBookingCalendarSync(events, 'bk_a', 'confirmed', STAMP);
  assert.equal(touched, 0);
  assert.equal(events[0].status, 'pending');
});

test('applyBookingCalendarSync — events without a bookingId are ignored', () => {
  const events = [
    { id: 'evt_1', status: 'pending' },              // no bookingId
    { id: 'evt_2', status: 'pending', bookingId: '' }, // empty bookingId
  ];
  const touched = applyBookingCalendarSync(events, 'bk_a', 'confirmed', STAMP);
  assert.equal(touched, 0);
});

test('applyBookingCalendarSync — falsy bookingId arg never matches (guards empty-string bug)', () => {
  const events = [{ id: 'evt_1', status: 'pending', bookingId: '' }];
  assert.equal(applyBookingCalendarSync(events, '', 'confirmed', STAMP), 0);
  assert.equal(applyBookingCalendarSync(events, undefined, 'confirmed', STAMP), 0);
});

test('applyBookingCalendarSync — non-array events is a safe no-op', () => {
  assert.equal(applyBookingCalendarSync(null, 'bk_a', 'confirmed', STAMP), 0);
  assert.equal(applyBookingCalendarSync(undefined, 'bk_a', 'confirmed', STAMP), 0);
  assert.equal(applyBookingCalendarSync({}, 'bk_a', 'confirmed', STAMP), 0);
});

test('applyBookingCalendarSync — skips null/non-object array entries', () => {
  const events = [null, 42, { id: 'evt_1', status: 'pending', bookingId: 'bk_a' }];
  const touched = applyBookingCalendarSync(events, 'bk_a', 'confirmed', STAMP);
  assert.equal(touched, 1);
  assert.equal(events[2].status, 'confirmed');
});

// ── integration of the two: mapping drives the sync ──
test('mapping + sync — archived booking maps to done and marks the event', () => {
  const events = [{ id: 'evt_1', status: 'confirmed', bookingId: 'bk_a' }];
  const eventStatus = bookingStatusToEventStatus('archived');
  assert.equal(eventStatus, 'done');
  const touched = applyBookingCalendarSync(events, 'bk_a', eventStatus, STAMP);
  assert.equal(touched, 1);
  assert.equal(events[0].status, 'done');
});
