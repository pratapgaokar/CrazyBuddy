'use strict';
const test = require('node:test');
const assert = require('node:assert');
const history = require('../src/history');

test('record accumulates per-day aggregates', () => {
  let h = history.record({}, '2026-10-16', { water: 1 });
  h = history.record(h, '2026-10-16', { water: 1, breaksYes: 1, screenMs: 90000 });
  assert.strictEqual(h['2026-10-16'].water, 2);
  assert.strictEqual(h['2026-10-16'].breaksYes, 1);
  assert.strictEqual(h['2026-10-16'].screenMs, 90000);
});

test('record prunes entries older than 90 days', () => {
  let h = history.record({}, '2026-01-01', { water: 1 });
  h = history.record(h, '2026-10-16', { water: 1 });
  assert.strictEqual(h['2026-01-01'], undefined);
  assert.ok(h['2026-10-16']);
});

test('summarize: last7 shape and screen minutes', () => {
  const h = history.record({}, '2026-10-16', { water: 8, screenMs: 3660000 });
  const sum = history.summarize(h, '2026-10-16', 8);
  assert.strictEqual(sum.last7.length, 7);
  assert.strictEqual(sum.last7[6].date, '2026-10-16');
  assert.strictEqual(sum.last7[6].goalMet, true);
  assert.strictEqual(sum.today.screenMinutes, 61);
});

test('summarize: streak counts back from today or yesterday', () => {
  let h = {};
  h = history.record(h, '2026-10-13', { water: 8 });
  h = history.record(h, '2026-10-14', { water: 9 });
  h = history.record(h, '2026-10-15', { water: 8 });
  // Today not yet met: streak is the 3 finished days.
  assert.strictEqual(history.summarize(h, '2026-10-16', 8).streak, 3);
  // Today met as well: 4.
  h = history.record(h, '2026-10-16', { water: 8 });
  assert.strictEqual(history.summarize(h, '2026-10-16', 8).streak, 4);
  // A gap day breaks it.
  const h2 = history.record(h, '2026-10-20', { water: 8 });
  assert.strictEqual(history.summarize(h2, '2026-10-20', 8).streak, 1);
});
