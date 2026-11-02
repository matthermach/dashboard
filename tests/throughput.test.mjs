import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeThroughput, analyzeControlChart } from '../core.mjs';

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
  assert.equal(result.xLimits.lower, 0);
  close(result.xLimits.upper, 29.113333333333333);
  assert.equal(result.mrLimits.lower, 0);
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
  assert.equal(result.xLimits.lower, 0);
  close(result.xLimits.upper, 40 / 3 + 26.6);
  assert.equal(result.mrLimits.lower, 0);
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

test('lower limits and sigma lines are clamped to zero without changing sigma or upper limits', () => {
  const result = analyzeThroughput(published);
  close(result.xChart.sigma, 2.66 * (82 / 14) / 3);
  close(result.mrChart.sigma, 3.27 * (82 / 14) / 3);
  for (const chart of [result.xChart, result.mrChart]) {
    assert.ok(chart.limits.lower >= 0);
    for (const zone of chart.zones) {
      assert.equal(zone.lower, Math.max(0, chart.mean - zone.multiple * chart.sigma));
      close(zone.upper, chart.mean + zone.multiple * chart.sigma);
    }
  }
  const positive = analyzeControlChart([10, 11, 10], 31 / 3, 2.66);
  close(positive.limits.lower, 31 / 3 - 2.66);
  assert.equal(positive.limits.upper, 31 / 3 + 2.66);
});

const indexes = (model, rule) => model.signals.flatMap((signals, index) => signals.includes(rule) ? [index] : []);
const chart = (values) => analyzeControlChart(values, 10, 3);

test('a single point strictly outside the corridor gets the highest priority signal', () => {
  const result = chart([7, 13, 6.99, 13.01, 0]);
  assert.deepEqual(indexes(result, 'outside'), [2, 3, 4]);
  assert.equal(result.signals[2][0], 'outside');
  assert.equal(result.signals[3][0], 'outside');
});

test('2 of 3 outside 2 sigma detects both sides and marks only qualifying points', () => {
  for (const values of [[12.1, 10, 12.2], [7.9, 10, 7.8]]) {
    const result = chart(values);
    assert.deepEqual(indexes(result, 'two-of-three'), [0, 2]);
    assert.equal(result.signals[0][0], 'two-of-three');
    assert.deepEqual(result.signals[1], []);
  }
  assert.deepEqual(indexes(chart([12.1, 12.2, 12.3]), 'two-of-three'), [0, 1, 2]);
  for (const values of [[12.1, 12.2], [12, 10, 12], [12.1, 10, 7.9]]) {
    assert.deepEqual(indexes(chart(values), 'two-of-three'), []);
  }
});

test('3 of 5 outside 1 sigma detects both sides and requires a full five-value window', () => {
  for (const values of [[11.1, 10, 11.2, 10, 11.3], [8.9, 10, 8.8, 10, 8.7]]) {
    const result = chart(values);
    assert.deepEqual(indexes(result, 'three-of-five'), [0, 2, 4]);
    assert.equal(result.signals[0][0], 'three-of-five');
  }
  assert.deepEqual(indexes(chart([11.1, 11.2, 11.3, 11.4, 10]), 'three-of-five'), [0, 1, 2, 3]);
  for (const values of [[11.1, 11.2, 11.3, 10], [11, 11, 11, 10, 10], [11.1, 11.2, 8.9, 10, 10]]) {
    assert.deepEqual(indexes(chart(values), 'three-of-five'), []);
  }
});

test('eight consecutive values strictly on one side mark the complete run, including longer runs', () => {
  for (const value of [10.1, 9.9]) {
    const result = chart(Array(9).fill(value));
    assert.deepEqual(indexes(result, 'shift'), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.ok(result.signals.every((signals) => signals.length === 1 && signals[0] === 'shift'));
    assert.deepEqual(indexes(chart(Array(7).fill(value)), 'shift'), []);
  }
  for (const values of [
    [...Array(4).fill(10.1), 10, ...Array(4).fill(10.1)],
    [...Array(4).fill(10.1), ...Array(4).fill(9.9)],
  ]) assert.deepEqual(indexes(chart(values), 'shift'), []);
});

test('all overlapping reasons survive in red, orange, yellow, white priority order', () => {
  const result = chart([14, 12.5, 11.5, 11.5, 11.5, 10.5, 10.5, 10.5]);
  assert.deepEqual(result.signals[0], ['outside', 'two-of-three', 'three-of-five', 'shift']);
  assert.deepEqual(result.signals[1], ['two-of-three', 'three-of-five', 'shift']);
  assert.deepEqual(result.signals[2], ['three-of-five', 'shift']);
  assert.deepEqual(result.signals[7], ['shift']);
});

test('weekly X and MR analysis supplies aligned signal models with every X priority', () => {
  const counts = [...Array.from({ length: 100 }, (_, index) => index % 2 ? 110 : 90), 200, 150, 130, 130, 130, ...Array(8).fill(115)];
  const days = counts.map((count, index) => ({
    date: new Date(Date.UTC(2025, 0, 7) + index * 7 * 86400000).toISOString().slice(0, 10), count,
  }));
  const result = analyzeThroughput(days);
  assert.equal(result.xChart.signals.length, result.weeks.length);
  assert.equal(result.mrChart.signals.length, result.weeks.length);
  assert.deepEqual(result.xChart.signals[100], ['outside', 'two-of-three', 'three-of-five', 'shift']);
  assert.deepEqual(result.xChart.signals[101], ['two-of-three', 'three-of-five', 'shift']);
  assert.deepEqual(result.xChart.signals[102], ['three-of-five', 'shift']);
  assert.deepEqual(result.xChart.signals.at(-1), ['shift']);
  assert.deepEqual(result.mrChart.signals[0], []);
  assert.equal(result.mrChart.signals[100][0], 'outside');
  assert.deepEqual(result.mrChart.signals.at(-1), ['shift']);
  assert.deepEqual(result.xLimits, result.xChart.limits);
  assert.deepEqual(result.mrLimits, result.mrChart.limits);
});

test('null MR values break all windows instead of joining non-consecutive observations', () => {
  assert.deepEqual(indexes(chart([12.5, null, 12.5]), 'two-of-three'), []);
  assert.deepEqual(indexes(chart([null, 12.5, 10, 12.5]), 'two-of-three'), [1, 3]);
  assert.deepEqual(indexes(chart([11.5, 11.5, null, 11.5, 11.5]), 'three-of-five'), []);
  assert.deepEqual(indexes(chart([...Array(4).fill(10.5), null, ...Array(4).fill(10.5)]), 'shift'), []);
});

test('zero variability, unavailable ranges and points exactly on fractional boundaries do not create false positives', () => {
  for (const mean of [0, 10]) {
    const result = analyzeControlChart(Array(8).fill(mean), mean, 0);
    assert.ok(result.signals.every((signals) => signals.length === 0));
  }
  const single = analyzeThroughput([{ date: '2025-01-07', count: 10 }]);
  assert.deepEqual(single.xChart.signals, [[]]);
  assert.deepEqual(single.mrChart.signals, [[]]);
  assert.equal(single.xChart.sigma, null);
  assert.equal(single.mrChart.sigma, null);
  const mean = 13.533333333333333;
  const halfWidth = 2.66 * 82 / 14;
  const sigma = halfWidth / 3;
  const onTwo = analyzeControlChart([mean + 2 * sigma, mean, mean + 2 * sigma], mean, halfWidth);
  assert.deepEqual(indexes(onTwo, 'two-of-three'), []);
  const onOne = analyzeControlChart([mean + sigma, mean + sigma, mean + sigma, mean, mean], mean, halfWidth);
  assert.deepEqual(indexes(onOne, 'three-of-five'), []);
});

test('control chart analysis rejects invalid data instead of hiding calculation errors', () => {
  for (const args of [
    [null, 10, 3], [[-1], 10, 3], [[Infinity], 10, 3], [[1], null, 3],
    [[1], 10, -1], [[1], NaN, 3], [[1], 10, Infinity], [[1], 10, undefined],
  ]) assert.throws(() => analyzeControlChart(...args));
});
