import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeThroughput } from '../core.mjs';

const published = JSON.parse(readFileSync(new URL('../throughput.json', import.meta.url)));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('workbook sample aggregates into exact seven-day periods from 7 January 2025', () => {
  const result = analyzeThroughput(published);
  assert.equal(published.length, 103);
  assert.equal(result.start, '2025-01-07');
  assert.equal(result.through, '2025-04-19');
  assert.deepEqual(result.weeks.map((week) => week.count), [17, 15, 3, 17, 17, 15, 20, 15, 9, 19, 15, 8, 14, 8, 11]);
  assert.deepEqual(result.weeks.map((week) => week.movingRange), [null, 2, 12, 14, 0, 2, 5, 5, 6, 10, 4, 7, 6, 6, 3]);
  assert.ok(result.weeks.slice(0, -1).every((week) => week.observedDays === 7));
  assert.deepEqual(result.weeks.at(-1), {
    start: '2025-04-15', end: '2025-04-21', count: 11, observedDays: 5, movingRange: 3,
  });
  assert.equal(result.total, 203);
  close(result.mean, 203 / 15);
  close(result.meanMR, 82 / 14);
  close(result.xLimits.lower, -2.046666666666667);
  close(result.xLimits.upper, 29.113333333333333);
  close(result.mrLimits.lower, -13.295714285714283);
  close(result.mrLimits.upper, 25.01);
});

test('X uses summed daily counts, MR uses consecutive weekly sums and n-1 denominator', () => {
  const days = [
    { date: '2025-01-21', count: 10 },
    { date: '2025-01-06', count: 999 },
    { date: '2025-01-13', count: 7 },
    { date: '2025-01-07', count: 3 },
    { date: '2025-01-14', count: 20 },
  ];
  const original = structuredClone(days);
  const result = analyzeThroughput(days);
  assert.deepEqual(days, original);
  assert.deepEqual(result.weeks.map((week) => week.count), [10, 20, 10]);
  assert.deepEqual(result.weeks.map((week) => week.movingRange), [null, 10, 10]);
  assert.equal(result.meanMR, 10);
  close(result.xLimits.lower, 40 / 3 - 26.6);
  close(result.xLimits.upper, 40 / 3 + 26.6);
  close(result.mrLimits.lower, -22.7);
  close(result.mrLimits.upper, 42.7);
});

test('empty weeks stay on the time axis and missing days are explicitly counted', () => {
  const result = analyzeThroughput([
    { date: '2025-01-07', count: 5 },
    { date: '2025-01-28', count: 4 },
  ]);
  assert.deepEqual(result.weeks.map((week) => week.count), [5, 0, 0, 4]);
  assert.deepEqual(result.weeks.map((week) => week.observedDays), [1, 0, 0, 1]);
  assert.deepEqual(result.weeks.map((week) => week.movingRange), [null, 5, 0, 4]);
});

test('one week has no MR or corridors; two equal weeks have zero-width corridors', () => {
  const result = analyzeThroughput([{ date: '2024-01-07', count: 0 }]);
  assert.equal(result.mean, 0);
  assert.equal(result.meanMR, null);
  assert.equal(result.xLimits, null);
  assert.equal(result.mrLimits, null);
  const flat = analyzeThroughput([
    { date: '2024-01-07', count: 5 },
    { date: '2024-01-14', count: 5 },
  ]);
  assert.equal(flat.meanMR, 0);
  assert.deepEqual(flat.xLimits, { lower: 5, upper: 5 });
  assert.deepEqual(flat.mrLimits, { lower: 0, upper: 0 });
});

test('weekly boundaries are UTC-based across leap days and year changes', () => {
  const leap = analyzeThroughput([
    { date: '2024-01-07', count: 0 },
    { date: '2024-02-29', count: 2 },
    { date: '2024-03-02', count: 3 },
    { date: '2024-03-03', count: 4 },
  ]);
  assert.equal(leap.weeks[7].start, '2024-02-25');
  assert.equal(leap.weeks[7].count, 5);
  assert.equal(leap.weeks[8].count, 4);
  const year = analyzeThroughput([
    { date: '2025-12-30', count: 2 },
    { date: '2026-01-05', count: 3 },
    { date: '2026-01-06', count: 4 },
  ]);
  assert.deepEqual(year.weeks.at(-2), {
    start: '2025-12-30', end: '2026-01-05', count: 5, observedDays: 2, movingRange: 5,
  });
  assert.equal(year.weeks.at(-1).start, '2026-01-06');
  assert.equal(year.weeks.at(-1).count, 4);
});

test('invalid input, duplicate dates and unsafe totals fail explicitly', () => {
  const day = { date: '2025-01-07', count: 1 };
  for (const invalid of [
    null, {}, [], [null], [day, day], [{ ...day, date: '2025-02-29' }],
    [{ ...day, count: -1 }], [{ ...day, count: 1.5 }], [{ ...day, count: '1' }],
    [{ ...day, count: Infinity }], [{ ...day, count: Number.MAX_SAFE_INTEGER + 1 }],
    [{ date: '2025-01-06', count: 1 }],
    [day, { date: '2025-01-08', count: Number.MAX_SAFE_INTEGER }],
    [{ ...day, count: Number.MAX_SAFE_INTEGER }, { date: '2025-01-14', count: 1 }],
  ]) assert.throws(() => analyzeThroughput(invalid));
});
