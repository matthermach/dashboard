import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { percentile, analyze, validatePoints, validateBackup, validateDateRange, validDate } from '../core.mjs';

const points = JSON.parse(readFileSync(new URL('../data.json', import.meta.url)));

test('published XLSX records have valid dates, sizes and durations', () => {
  assert.ok(points.length > 0);
  assert.equal(validatePoints(points).length, points.length);
  assert.ok(points.every((point) => point.source === 'xlsx'));
});
test('PERCENTILE.INC uses linear interpolation without changing input', () => {
  const values = [40, 10, 30, 20];
  assert.equal(percentile(values, .5), 25);
  assert.equal(percentile(values, .85), 35.5);
  assert.equal(percentile(values, .95), 38.5);
  assert.deepEqual(values, [40, 10, 30, 20]);
  assert.equal(percentile([], .85), null);
  assert.equal(percentile([42], .95), 42);
  assert.equal(percentile([10, 20], 1), 20);
});
test('original 36-observation sample matches independently calculated percentiles', () => {
  const values = [49, 48, 87, 57, 148, 53, 45, 145, 105, 5, 163, 43, 415, 123, 103, 104, 302, 158, 98, 52, 95, 70, 95, 101, 57, 57, 53, 137, 73, 60, 126, 57, 124, 75, 89, 44];
  assert.equal(percentile(values, .5), 88);
  assert.equal(percentile(values, .85), 143);
  assert.equal(percentile(values, .95), 197.75);
});
test('filters and exclusion affect forecasts and restoration is reversible', () => {
  const sample = [
    { id: 'one', size: 'S', days: 10 },
    { id: 'two', size: 'M', days: 20 },
    { id: 'outlier', size: 'M', days: 415 },
    { id: 'four', size: 'L', days: 60 },
  ];
  const sizes = new Set(['M']);
  const original = analyze(sample, sizes, new Set());
  const outlier = sample.find((point) => point.days === 415);
  const excluded = new Set([outlier.id]);
  const result = analyze(sample, sizes, excluded);
  assert.equal(result.visible.length, 2);
  assert.equal(result.active.length, 1);
  assert.ok(result.p95 < original.p95);
  excluded.delete(outlier.id);
  assert.deepEqual(analyze(sample, sizes, excluded), original);
  assert.equal(analyze(sample, new Set(), excluded).p50, null);
  assert.equal(analyze(sample, sizes, new Set(sample.map((point) => point.id))).p95, null);
});
test('backups round-trip additions and exclusions; invalid files are rejected', () => {
  const local = { id: 'local-test', date: '2026-11-02', size: 'S', days: .25, source: 'local' };
  const backup = { version: 1, points: [...points, local], excluded: [points[0].id, local.id] };
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(backup))), backup);
  for (const invalid of [
    { ...backup, version: 2 },
    { ...backup, excluded: ['missing'] },
    { ...backup, excluded: [local.id, local.id] },
    { ...backup, points: [local, local] },
    { ...backup, points: [{ ...local, days: -2 }] },
    { ...backup, points: [{ ...local, days: Infinity }] },
    { ...backup, points: [{ ...local, size: 'XL' }] },
    { ...backup, points: [{ ...local, date: '2025-02-29' }] },
    { ...backup, points: [{ ...local, id: '<script>' }] },
  ]) assert.throws(() => validateBackup(invalid));
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2025-02-29'), false);
  assert.equal(validDate('1899-12-31'), false);
});

test('date filters include both boundaries and support open or single-day ranges', () => {
  const sample = [
    { id: 'before', size: 'S', date: '2024-12-31', days: 100 },
    { id: 'start', size: 'S', date: '2025-01-01', days: 10 },
    { id: 'end', size: 'M', date: '2025-01-31', days: 30 },
    { id: 'after', size: 'L', date: '2025-02-01', days: 200 },
  ];
  const all = new Set(['S', 'M', 'L']);
  const excluded = new Set();
  const range = { from: '2025-01-01', to: '2025-01-31' };
  const result = analyze(sample, all, excluded, range);
  assert.deepEqual(result.visible.map((point) => point.id), ['start', 'end']);
  assert.equal(result.p50, 20);
  assert.equal(result.p85, 27);
  assert.equal(result.p95, 29);
  assert.equal(analyze(sample, all, excluded, { from: range.from }).visible.length, 3);
  assert.equal(analyze(sample, all, excluded, { to: range.to }).visible.length, 3);
  assert.deepEqual(analyze(sample, all, excluded, { from: range.to, to: range.to }).visible.map((point) => point.id), ['end']);
  assert.deepEqual(analyze(sample, all, excluded, { from: '', to: '' }), analyze(sample, all, excluded));
  assert.equal(analyze(sample, new Set(['S']), excluded, range).p95, 10);
  const withExclusion = analyze(sample, all, new Set(['end']), range);
  assert.equal(withExclusion.visible.length, 2);
  assert.equal(withExclusion.active.length, 1);
  assert.equal(withExclusion.p85, 10);
  const empty = analyze(sample, all, excluded, { from: '2026-01-01' });
  assert.equal(empty.visible.length, 0);
  assert.equal(empty.p50, null);
  assert.equal(empty.p85, null);
  assert.equal(empty.p95, null);
});

test('invalid or reversed date ranges are rejected before filtering', () => {
  for (const range of [
    { from: '2025-02-01', to: '2025-01-01' },
    { from: '2025-02-29' },
    { to: 'not-a-date' },
    { from: '1899-12-31' },
    { to: '10000-01-01' },
  ]) {
    assert.throws(() => validateDateRange(range));
    assert.throws(() => analyze(points, new Set(['S']), new Set(), range));
  }
  assert.doesNotThrow(() => validateDateRange({ from: '2024-02-29', to: '2024-02-29' }));
});
