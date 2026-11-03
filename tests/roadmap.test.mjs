import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarMonths, emptyPlan, validatePlan, forecastRoadmap } from '../roadmap-core.mjs';

function fixture() {
  const plan = emptyPlan('2027-01');
  plan.skills = [{ id: 's1', name: 'Backend' }, { id: 's2', name: 'QA' }];
  plan.teams = [{ id: 't1', name: 'Alfa', skillIds: ['s1', 's2'], capacity: {
    s1: Object.fromEntries(calendarMonths(plan.startMonth).map((m) => [m, 21])),
    s2: Object.fromEntries(calendarMonths(plan.startMonth).map((m) => [m, 21])),
  } }];
  plan.initiatives = [1, 2].map((i) => ({
    id: `i${i}`, name: `Inicjatywa ${i}`, teamIds: ['t1'], start: '2027-01-01', fixedDate: '',
    items: [{ id: `e${i}`, name: `Element ${i}`, teamId: 't1', skillId: 's1',
      min: 1, max: 1, start: '', fixedDate: '' }],
  }));
  return plan;
}
const run = (plan, trials = 1) => forecastRoadmap(plan, { trials });

test('12 calendar months span year boundaries and leap years', () => {
  const months = calendarMonths('2027-11');
  assert.equal(months.length, 12);
  assert.equal(months.at(-1), '2028-10');
  assert.throws(() => calendarMonths('2027-13'));
  assert.throws(() => calendarMonths('9999-01'));
  const plan = fixture();
  plan.startMonth = '2028-02';
  plan.initiatives.forEach((i) => { i.start = '2028-02-01'; });
  plan.teams[0].capacity.s1 = { '2028-02': 21 };
  plan.initiatives[0].items[0].min = plan.initiatives[0].items[0].max = 21;
  assert.equal(run(plan).results.get('e1').p85, '2028-02-29');
  assert.equal(run(plan).results.get('e2').p85, null);
});

test('shared resource cannot double-book capacity, including partial days', () => {
  const plan = fixture();
  assert.equal(run(plan).results.get('e1').p85, '2027-01-01');
  assert.equal(run(plan).results.get('e2').p85, '2027-01-04');
  plan.initiatives.forEach((i) => { i.items[0].min = i.items[0].max = .5; });
  assert.equal(run(plan).results.get('e2').p85, '2027-01-01');
});

test('independent skills and teams run concurrently', () => {
  const plan = fixture();
  plan.initiatives[1].items[0].skillId = 's2';
  assert.equal(run(plan).results.get('e2').p85, '2027-01-01');
  const team = structuredClone(plan.teams[0]);
  team.id = 't2';
  plan.teams.push(team);
  plan.initiatives[1].teamIds = ['t2'];
  Object.assign(plan.initiatives[1].items[0], { teamId: 't2', skillId: 's1' });
  assert.equal(run(plan).results.get('e2').p85, '2027-01-01');
});

test('start constraints honor weekends, initiative start and future priority reservations', () => {
  const plan = fixture();
  plan.initiatives[0].items[0].start = '2027-01-09';
  const result = run(plan);
  assert.equal(result.results.get('e1').p85, '2027-01-11');
  assert.equal(result.results.get('e2').p85, '2027-01-01');
  plan.initiatives[0].start = '2027-02-01';
  assert.equal(run(plan).results.get('e1').start, '2027-02-01');
});

test('priority changes which initiative gets shared capacity first', () => {
  const plan = fixture();
  plan.initiatives.reverse();
  assert.equal(run(plan).results.get('e2').p85, '2027-01-01');
  assert.equal(run(plan).results.get('e1').p85, '2027-01-04');
});

test('monthly effort, missing capacity and exhaustion do not fabricate completion', () => {
  const plan = fixture();
  plan.teams[0].capacity.s1 = { '2027-01': 21, '2027-02': 20 };
  plan.initiatives[0].items[0].min = plan.initiatives[0].items[0].max = 22;
  assert.equal(run(plan).results.get('e1').p85, '2027-02-01');
  plan.teams[0].capacity.s1 = {};
  const result = run(plan);
  assert.equal(result.results.get('e1').p85, null);
  assert.equal(result.results.get('e1').start, null);
  assert.equal(result.results.get('i1').completionRate, 0);
});

test('fixed date is inclusive and reports risk, not forced completion', () => {
  const plan = fixture();
  plan.initiatives[0].fixedDate = '2027-01-01';
  plan.initiatives[1].items[0].fixedDate = '2027-01-01';
  const result = run(plan);
  assert.equal(result.results.get('i1').deadlineRate, 1);
  assert.equal(result.results.get('e2').deadlineRate, 0);
  assert.equal(result.results.get('e2').p85, '2027-01-04');
  plan.initiatives[1].items[0].start = '2028-01-01';
  plan.initiatives[1].items[0].fixedDate = '2028-01-02';
  assert.equal(run(plan).results.get('e2').deadlineRate, 0);
});

test('Monte Carlo P85 hits measured 85% and is deterministic', () => {
  const plan = fixture();
  plan.initiatives[0].items[0].min = 1;
  plan.initiatives[0].items[0].max = 20;
  plan.initiatives[0].items[0].fixedDate = '2027-01-26';
  const result = run(plan, 10000);
  const p85 = result.results.get('e1').p85;
  assert.equal(p85, '2027-01-26');
  assert.ok(result.results.get('e1').deadlineRate >= .85);
  plan.initiatives[0].items[0].fixedDate = '2027-01-25';
  assert.ok(run(plan, 10000).results.get('e1').deadlineRate < .85);
  assert.deepEqual(run(plan, 100), run(plan, 100));
});

test('unfinished trials stay in percentile and deadline probability denominators', () => {
  const plan = fixture();
  plan.teams[0].capacity.s1 = { '2027-01': 10 };
  Object.assign(plan.initiatives[0].items[0], { min: 1, max: 20, fixedDate: '2027-12-31' });
  const value = run(plan, 2000).results.get('e1');
  assert.equal(value.p85, null);
  assert.ok(value.completionRate > .4 && value.completionRate < .55);
  assert.equal(value.completionRate, value.deadlineRate);
});

test('initiative P85 uses joint completion, not max of marginal percentiles', () => {
  const plan = fixture();
  const first = plan.initiatives[0];
  Object.assign(first.items[0], { min: 1, max: 20 });
  first.items.push({ ...first.items[0], id: 'e3', skillId: 's2' });
  const result = run(plan, 10000);
  const maxMarginal = [result.results.get('e1').p85, result.results.get('e3').p85].sort().at(-1);
  assert.ok(result.results.get('i1').p85 > maxMarginal);
});

test('validation rejects invalid effort, dates, references, capacity, IDs and limits', () => {
  const cases = [
    (p) => { p.initiatives[0].items[0].min = 0; },
    (p) => { p.initiatives[0].items[0].max = .5; },
    (p) => { p.initiatives[0].items[0].start = '2027-02-30'; },
    (p) => { p.initiatives[0].items[0].fixedDate = '2026-12-31'; },
    (p) => { p.initiatives[0].fixedDate = '2026-12-31'; },
    (p) => { p.initiatives[0].items[0].skillId = 'missing'; },
    (p) => { p.initiatives[0].teamIds = []; },
    (p) => { p.teams[0].capacity.s1['2027-01'] = -1; },
    (p) => { p.teams[0].capacity.s1['2027-01'] = Infinity; },
    (p) => { p.teams[0].capacity.s1['2027-13'] = 10; },
    (p) => { p.skills[1].id = p.skills[0].id; },
    (p) => { p.skills[0].id = '__proto__'; },
    (p) => { p.initiatives[0].items[0].id = p.initiatives[0].id; },
  ];
  for (const mutate of cases) {
    const plan = fixture();
    mutate(plan);
    assert.throws(() => validatePlan(plan));
  }
  assert.doesNotThrow(() => validatePlan(emptyPlan('2027-01')));
  assert.throws(() => run(emptyPlan('2027-01')));
  const plan = fixture();
  plan.initiatives.pop();
  assert.throws(() => run(plan), /co najmniej dwie/);
  assert.throws(() => forecastRoadmap(fixture(), { trials: 0 }));
});

test('forecast does not mutate input or round-trip backup data', () => {
  const plan = fixture();
  const before = JSON.stringify(plan);
  run(plan, 100);
  assert.equal(JSON.stringify(plan), before);
  assert.deepEqual(validatePlan(JSON.parse(before)).plan, plan);
});
